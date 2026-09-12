import { PLUGIN_API_VERSION } from "@amll-ttml-tool/plugin-api";
import type { ExtensionScope } from "$/kernel/extensions";

/** Consecutive failed loads/activations before a plugin stays disabled. */
export const TRUSTED_JS_CRASH_AUTO_DISABLE_THRESHOLD = 3;

/**
 * Catalog-shaped input for one trusted-js module load. Deliberately a plain
 * subset of RemotePluginCatalogEntryV0 so bundled (factory) plugins and the
 * remote catalog feed the same gate.
 */
export interface TrustedJsPluginEntry {
	id: string;
	name: string;
	version: string;
	description?: string;
	author?: string;
	homepage?: string;
	apiVersion: number;
	/** Module URL, resolved against and required to stay on the app origin. */
	entry: string;
	/** First-party (published by the app's own CI): skips the consent prompt. */
	firstParty?: boolean;
	/**
	 * Bundled (factory) module loader. When present the module is compiled
	 * into the application bundle and shares its trust root, so same-origin
	 * resolution and the desktop consent gate do not apply — a desktop build
	 * must not lose its factory plugins. Crash accounting still applies.
	 */
	loadModule?: () => Promise<unknown>;
}

/**
 * Activation contract handed to a module's activate(). The SDK's public
 * `TrustedJsActivationContextV0` is this shape with THost = TrustedJsHostV0;
 * the loader stays generic so the gate itself never depends on the SDK.
 */
export interface TrustedJsActivationContext<THost> {
	pluginId: string;
	host: THost;
	/** Aborted on unload, disable and crash-disable; in-flight async work must stop. */
	signal: AbortSignal;
}

type TrustedJsCleanup = () => void | Promise<void>;

// biome-ignore lint/suspicious/noConfusingVoidType: plain `activate(): void` plugins are valid
type TrustedJsActivateResult = TrustedJsCleanup | undefined | void;

type TrustedJsActivateReturn =
	| TrustedJsActivateResult
	| Promise<TrustedJsActivateResult>;

export interface TrustedJsPluginModule<THost> {
	activate(context: TrustedJsActivationContext<THost>): TrustedJsActivateReturn;
}

/** Persisted per-plugin loader state (consent, crash accounting). */
export interface TrustedJsPluginStateRecord {
	consented?: boolean;
	crashes: number;
	/**
	 * Crash marker (theme-system pattern): set before plugin code runs,
	 * cleared once the host confirms a stable startup. A marker still present
	 * at the next load means the previous session died with this plugin live.
	 */
	pending: boolean;
	disabled?: boolean;
}

export interface TrustedJsStatePort {
	get(pluginId: string): TrustedJsPluginStateRecord | null;
	set(pluginId: string, record: TrustedJsPluginStateRecord): void;
	remove(pluginId: string): void;
}

export interface TrustedJsConsentRequest {
	pluginId: string;
	name: string;
	version: string;
	description?: string;
	author?: string;
	homepage?: string;
	/** Drives the honest wording: desktop consent must mention system risk. */
	tier: "browser" | "desktop";
}

/** Per-plugin host surface plus the disposal of whatever the host itself owns. */
export interface TrustedJsHostHandle<THost> {
	host: THost;
	dispose(): void;
}

export interface TrustedJsLoaderPorts<THost> {
	/** The application origin; modules resolving anywhere else are refused. */
	origin: string;
	importModule(url: string): Promise<unknown>;
	createScope(pluginId: string): ExtensionScope;
	/** Builds the plugin's host API over its scope; called once per successful gate pass. */
	createHost(context: {
		pluginId: string;
		scope: ExtensionScope;
		signal: AbortSignal;
	}): TrustedJsHostHandle<THost>;
	requestConsent(request: TrustedJsConsentRequest): Promise<boolean>;
	state: TrustedJsStatePort;
	isDesktop(): boolean;
	/** Desktop trusted-js runtime consent gate; default off per trust model. */
	isDesktopTrustEnabled(): boolean;
	warn?(message: string): void;
}

export type TrustedJsLoadRejection =
	| "already-loaded"
	| "api-version"
	| "cross-origin"
	| "desktop-disabled"
	| "user-disabled"
	| "crash-disabled"
	| "consent-declined"
	| "invalid-module"
	| "activation-failed";

export type TrustedJsLoadResult =
	| { ok: true }
	| { ok: false; reason: TrustedJsLoadRejection; message: string };

export type TrustedJsPluginStatus = "active" | "crash-disabled" | "disabled";

export interface TrustedJsPluginSummary {
	id: string;
	name: string;
	version: string;
	author?: string;
	homepage?: string;
	firstParty: boolean;
	/** True when the live instance came from the bundled (factory) module. */
	bundled: boolean;
}

interface LoadedInstance<THost> {
	entry: TrustedJsPluginEntry;
	scope: ExtensionScope;
	hostHandle: TrustedJsHostHandle<THost>;
	abort: AbortController;
	cleanup: TrustedJsCleanup | null;
}

const rejected = (
	reason: TrustedJsLoadRejection,
	message: string,
): TrustedJsLoadResult => ({ ok: false, reason, message });

const resolveModule = <THost>(
	moduleExports: unknown,
): TrustedJsPluginModule<THost> | null => {
	const candidates = [
		moduleExports,
		(moduleExports as { default?: unknown } | null)?.default,
	];
	for (const candidate of candidates) {
		if (
			typeof candidate === "object" &&
			candidate !== null &&
			typeof (candidate as { activate?: unknown }).activate === "function"
		)
			return candidate as TrustedJsPluginModule<THost>;
	}
	return null;
};

/**
 * The single trusted-js load gate. Every path that turns remote or bundled
 * JavaScript into a trusted extension scope goes through load(): same-origin
 * resolution, API version negotiation, the desktop consent gate, honest
 * consent, then the crash-marker guarded import/activate. There is no second
 * loader; nothing else may create trusted plugin scopes for remote code.
 *
 * Everything here protects the moment BEFORE code runs — once imported, a
 * trusted-js module has application-level power by definition (that is the
 * tier's contract), so failures afterwards are availability concerns
 * (crash accounting, scope disposal), not containment.
 */
export class TrustedJsPluginService<THost> {
	private readonly instances = new Map<string, LoadedInstance<THost>>();
	private readonly listeners = new Set<() => void>();
	private startupStable = false;

	constructor(private readonly ports: TrustedJsLoaderPorts<THost>) {}

	getLoaded(): TrustedJsPluginSummary[] {
		return [...this.instances.values()].map(({ entry }) => ({
			id: entry.id,
			name: entry.name,
			version: entry.version,
			author: entry.author,
			homepage: entry.homepage,
			firstParty: entry.firstParty === true,
			bundled: typeof entry.loadModule === "function",
		}));
	}

	isLoaded(pluginId: string): boolean {
		return this.instances.has(pluginId);
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	async load(entry: TrustedJsPluginEntry): Promise<TrustedJsLoadResult> {
		if (this.instances.has(entry.id))
			return rejected(
				"already-loaded",
				`Plugin ${entry.id} is already loaded; unload it before reloading`,
			);
		if (entry.apiVersion !== PLUGIN_API_VERSION)
			return rejected(
				"api-version",
				`Plugin ${entry.id} targets api version ${entry.apiVersion}, host supports ${PLUGIN_API_VERSION}`,
			);
		const bundled = typeof entry.loadModule === "function";
		let url: string | null = null;
		if (!bundled) {
			url = this.resolveSameOriginUrl(entry.entry);
			if (url === null)
				return rejected(
					"cross-origin",
					`Plugin ${entry.id} entry does not resolve inside the application origin`,
				);
			if (this.ports.isDesktop() && !this.ports.isDesktopTrustEnabled())
				return rejected(
					"desktop-disabled",
					"Trusted JS plugins are disabled on the desktop app until explicitly enabled",
				);
		}

		const state = this.ports.state.get(entry.id) ?? {
			crashes: 0,
			pending: false,
		};
		if (state.pending) {
			// The previous session died while this plugin was live.
			state.pending = false;
			state.crashes += 1;
			this.ports.state.set(entry.id, state);
			this.ports.warn?.(
				`[trusted-js] ${entry.id}: previous session ended abnormally (${state.crashes} consecutive failures)`,
			);
		}
		if (state.disabled)
			return rejected("user-disabled", `Plugin ${entry.id} is disabled`);
		if (state.crashes >= TRUSTED_JS_CRASH_AUTO_DISABLE_THRESHOLD)
			return rejected(
				"crash-disabled",
				`Plugin ${entry.id} was disabled after ${state.crashes} consecutive failures`,
			);

		if (entry.firstParty !== true && state.consented !== true) {
			const approved = await this.ports.requestConsent({
				pluginId: entry.id,
				name: entry.name,
				version: entry.version,
				description: entry.description,
				author: entry.author,
				homepage: entry.homepage,
				tier: this.ports.isDesktop() ? "desktop" : "browser",
			});
			if (!approved)
				return rejected(
					"consent-declined",
					`Consent for plugin ${entry.id} was declined`,
				);
			state.consented = true;
			this.ports.state.set(entry.id, state);
		}

		// Marker down before any plugin code runs; a session-killing crash
		// during import/activate is charged to this plugin on the next boot.
		state.pending = true;
		this.ports.state.set(entry.id, state);
		let scope: ExtensionScope | null = null;
		let hostHandle: TrustedJsHostHandle<THost> | null = null;
		const abort = new AbortController();
		try {
			const moduleExports = bundled
				? await entry.loadModule?.()
				: await this.ports.importModule(url as string);
			const module = resolveModule<THost>(moduleExports);
			if (module === null)
				throw new TrustedJsInvalidModuleError(
					`Plugin ${entry.id} module does not export an activate() function`,
				);
			scope = this.ports.createScope(entry.id);
			hostHandle = this.ports.createHost({
				pluginId: entry.id,
				scope,
				signal: abort.signal,
			});
			const cleanup = await module.activate({
				pluginId: entry.id,
				host: hostHandle.host,
				signal: abort.signal,
			});
			this.instances.set(entry.id, {
				entry,
				scope,
				hostHandle,
				abort,
				cleanup: typeof cleanup === "function" ? cleanup : null,
			});
			state.crashes = 0;
			// Before the host declares startup stable, the marker stays down so
			// a plugin that activates fine but wedges the session still gets
			// charged; afterwards a successful activation is proof enough.
			state.pending = !this.startupStable;
			this.ports.state.set(entry.id, state);
			this.emitChange();
			return { ok: true };
		} catch (error) {
			// A failed activation is a disable: in-flight async work stops, then
			// host subscriptions and registry contributions go.
			abort.abort();
			hostHandle?.dispose();
			scope?.dispose();
			state.pending = false;
			state.crashes += 1;
			this.ports.state.set(entry.id, state);
			const message = String(error instanceof Error ? error.message : error);
			this.ports.warn?.(`[trusted-js] ${entry.id} failed to load: ${message}`);
			if (state.crashes >= TRUSTED_JS_CRASH_AUTO_DISABLE_THRESHOLD)
				this.ports.warn?.(
					`[trusted-js] ${entry.id} auto-disabled after ${state.crashes} consecutive failures`,
				);
			return rejected(
				error instanceof TrustedJsInvalidModuleError
					? "invalid-module"
					: "activation-failed",
				message,
			);
		}
	}

	/**
	 * Host mount reached a stable point: clear every live plugin's crash
	 * marker and reset its failure count. Loads after this point clear their
	 * marker immediately on successful activation.
	 */
	confirmStartupStable(): void {
		this.startupStable = true;
		for (const pluginId of this.instances.keys()) {
			const state = this.ports.state.get(pluginId);
			if (!state || (!state.pending && state.crashes === 0)) continue;
			this.ports.state.set(pluginId, {
				...state,
				pending: false,
				crashes: 0,
			});
		}
	}

	async unload(pluginId: string): Promise<void> {
		const instance = this.instances.get(pluginId);
		if (!instance) return;
		this.instances.delete(pluginId);
		// Order: abort (async handlers observe cancellation) -> plugin cleanup ->
		// host-owned subscriptions -> registry scope (commands, menus, views).
		instance.abort.abort();
		try {
			await instance.cleanup?.();
		} catch (error) {
			this.ports.warn?.(
				`[trusted-js] ${pluginId} cleanup threw: ${String(error)}`,
			);
		}
		instance.hostHandle.dispose();
		instance.scope.dispose();
		const state = this.ports.state.get(pluginId);
		if (state?.pending)
			this.ports.state.set(pluginId, { ...state, pending: false });
		this.emitChange();
	}

	async unloadAll(): Promise<void> {
		for (const pluginId of [...this.instances.keys()])
			await this.unload(pluginId);
	}

	/** User toggle; disabling also unloads a live instance. */
	async setEnabled(pluginId: string, enabled: boolean): Promise<void> {
		const state = this.ports.state.get(pluginId) ?? {
			crashes: 0,
			pending: false,
		};
		this.ports.state.set(pluginId, {
			...state,
			disabled: !enabled,
			...(enabled ? { crashes: 0 } : {}),
		});
		if (!enabled) await this.unload(pluginId);
	}

	/** Clears crash-disable so the next load may try again. */
	resetFailures(pluginId: string): void {
		const state = this.ports.state.get(pluginId);
		if (!state) return;
		this.ports.state.set(pluginId, { ...state, crashes: 0, pending: false });
	}

	/** Forgets consent and failure history (uninstall semantics). */
	forget(pluginId: string): void {
		this.ports.state.remove(pluginId);
	}

	private resolveSameOriginUrl(entry: string): string | null {
		let base: URL;
		try {
			base = new URL(this.ports.origin);
		} catch {
			return null;
		}
		let resolved: URL;
		try {
			resolved = new URL(entry, base);
		} catch {
			return null;
		}
		if (resolved.origin !== base.origin) return null;
		return resolved.href;
	}

	private emitChange(): void {
		for (const listener of [...this.listeners]) listener();
	}
}

class TrustedJsInvalidModuleError extends Error {}
