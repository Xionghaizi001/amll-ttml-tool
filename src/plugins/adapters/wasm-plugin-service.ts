import type {
	Capability,
	ConvertFormatParamsV0,
	FormatConversionResultV0,
	FormResultV0,
	FormSchemaV0,
	FunctionPluginManifest,
	JsonValue,
	NotifyParams,
	PluginCommandOutcomeV0,
	PluginEventV0,
	PluginSelectionV0,
} from "@amll-ttml-tool/plugin-api";
import {
	FORM_ROUNDS_PER_INVOCATION_LIMIT_V0,
	FORMAT_CONVERSION_TEXT_LIMIT_V0,
	negotiateCapabilities,
	parseCommandOutcome,
	parseFormatConversionResult,
	parsePluginReturn,
	PLUGIN_API_VERSION,
	PLUGIN_EXPORTS,
} from "@amll-ttml-tool/plugin-api";
import type { ExtensionScope } from "$/kernel/extensions";
import {
	PluginRuntimeError,
	detectWasiImports,
	type WasmGuestExport,
	type WasmTurnContext,
	type WasmTurnLimits,
	type WasmTurnResult,
	type WasmTurnStorageChanges,
} from "$/plugins/runtime";
import type { TTMLLyric } from "$/types/ttml";
import {
	createDocumentFromPluginLines,
	createSeededIdAllocator,
	type PluginDocumentGateway,
	toPluginDocument,
} from "./plugin-document";

/** Consecutive failed invocations before a plugin is auto-disabled. */
export const PLUGIN_CRASH_AUTO_DISABLE_THRESHOLD = 3;

/** Bounded per-plugin diagnostic ring buffer size. */
export const PLUGIN_DIAGNOSTIC_LIMIT = 200;

export interface WasmPluginRuntimePort {
	load(wasm: Uint8Array, useWasi?: boolean): Promise<void>;
	runTurn(
		exportName: WasmGuestExport,
		payloadJson: string,
		context: WasmTurnContext,
		options?: { limits?: WasmTurnLimits; timeoutMs?: number },
	): Promise<WasmTurnResult>;
	cancelAll(reason?: string): void;
	close(): Promise<void>;
}

export type WasmPluginRuntimeFactory = (
	pluginId: string,
) => WasmPluginRuntimePort;

export interface InstalledPluginData {
	manifest: FunctionPluginManifest;
	wasm: Uint8Array;
	grantedCapabilities: Capability[];
	enabled: boolean;
	source: "user" | "sample" | "dev" | "store";
	installedAt: number;
}

export interface PluginKvPort {
	read(pluginId: string): Promise<Record<string, JsonValue>>;
	apply(pluginId: string, changes: WasmTurnStorageChanges): Promise<void>;
	clear(pluginId: string): Promise<void>;
}

export interface PluginPackagePersistencePort {
	loadAll(): Promise<InstalledPluginData[]>;
	save(data: InstalledPluginData): Promise<void>;
	remove(pluginId: string): Promise<void>;
}

export interface WasmPluginServicePorts {
	createRuntime: WasmPluginRuntimeFactory;
	documents: PluginDocumentGateway;
	getSelection(): PluginSelectionV0;
	showForm(schema: FormSchemaV0): Promise<FormResultV0>;
	notify(params: NotifyParams, meta: { pluginId: string }): void;
	kv: PluginKvPort;
	packages: PluginPackagePersistencePort;
	createScope(pluginId: string): ExtensionScope;
	registerContributions(
		scope: ExtensionScope,
		manifest: FunctionPluginManifest,
		executeCommand: (commandId: string, args?: JsonValue) => Promise<unknown>,
	): void;
	subscribeDocumentEvents?(
		listener: (
			event: PluginEventV0,
			meta: { sourcePluginId?: string },
		) => void,
	): () => void;
	locale?: string;
	hostVersion?: string;
	/** Unique per-turn seed; injectable for deterministic tests. */
	createTurnSeed?(pluginId: string): string;
	turnTimeoutMs?: number;
	limits?: WasmTurnLimits;
	warn?(message: string): void;
}

export type WasmPluginStatus =
	| "inactive"
	| "activating"
	| "active"
	| "failed"
	| "disabled"
	| "crash-disabled";

export interface WasmPluginDiagnosticEntry {
	/** Monotonic per-session sequence, unique across all plugins. */
	seq: number;
	at: number;
	level: "info" | "warn" | "error";
	message: string;
}

export interface WasmPluginSummary {
	id: string;
	name: string;
	version: string;
	description?: string;
	source: InstalledPluginData["source"];
	status: WasmPluginStatus;
	enabled: boolean;
	grantedCapabilities: Capability[];
	requestedCapabilities: Capability[];
	consecutiveCrashes: number;
	lastError?: string;
}

interface PluginInstance {
	data: InstalledPluginData;
	status: WasmPluginStatus;
	runtime: WasmPluginRuntimePort | null;
	scope: ExtensionScope | null;
	unsubscribeEvents: (() => void) | null;
	consecutiveCrashes: number;
	lastError?: string;
	queue: Promise<unknown>;
	pendingDocumentEvent: PluginEventV0 | null;
	documentEventScheduled: boolean;
	diagnostics: WasmPluginDiagnosticEntry[];
	turnSequence: number;
	generation: number;
}

class PluginInvocationAborted extends Error {}

let seedSequence = 0;
const defaultTurnSeed = (pluginId: string): string => {
	seedSequence += 1;
	const compact = pluginId.replace(/[^a-zA-Z0-9]+/g, "").slice(0, 12);
	return `pg-${compact}-${Date.now().toString(36)}-${seedSequence}`;
};

/**
 * Main-thread lifecycle host for WASM plugins. One worker per plugin, one
 * serialized turn queue per plugin, capability-gated turn contexts, one
 * document transaction per turn, crash counting with auto-disable and a
 * bounded diagnostic log. Uninstall/disable disposes the owner scope, which
 * removes every command, menu and listener the plugin registered.
 */
export class WasmPluginService {
	private readonly instances = new Map<string, PluginInstance>();
	private readonly listeners = new Set<() => void>();
	private diagnosticSequence = 0;
	private disposed = false;

	constructor(private readonly ports: WasmPluginServicePorts) {}

	/** Loads persisted plugins and activates the enabled ones. */
	async initialize(): Promise<void> {
		const records = await this.ports.packages.loadAll();
		for (const data of records) {
			if (this.disposed) return;
			if (this.instances.has(data.manifest.id)) continue;
			const instance = this.createInstance(data);
			this.instances.set(data.manifest.id, instance);
			if (data.enabled) await this.activate(instance);
		}
		this.emitChange();
	}

	getPlugins(): WasmPluginSummary[] {
		return [...this.instances.values()].map((instance) => ({
			id: instance.data.manifest.id,
			name: instance.data.manifest.name,
			version: instance.data.manifest.version,
			description: instance.data.manifest.description,
			source: instance.data.source,
			status: instance.status,
			enabled: instance.data.enabled,
			grantedCapabilities: [...instance.data.grantedCapabilities],
			requestedCapabilities: [...instance.data.manifest.capabilities],
			consecutiveCrashes: instance.consecutiveCrashes,
			lastError: instance.lastError,
		}));
	}

	getDiagnostics(pluginId: string): readonly WasmPluginDiagnosticEntry[] {
		return this.instances.get(pluginId)?.diagnostics ?? [];
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/**
	 * Installs (or replaces) a validated plugin package. The caller has
	 * already run parseFunctionPluginPackage and collected the user's
	 * capability grant; unknown capabilities were rejected by negotiation.
	 */
	async install(
		manifest: FunctionPluginManifest,
		wasm: Uint8Array,
		options: { source?: InstalledPluginData["source"] } = {},
	): Promise<void> {
		if (manifest.apiVersion !== PLUGIN_API_VERSION)
			throw new Error(
				`Plugin ${manifest.id} requires api version ${manifest.apiVersion}, host supports ${PLUGIN_API_VERSION}`,
			);
		const negotiation = negotiateCapabilities(manifest.capabilities);
		const existing = this.instances.get(manifest.id);
		if (existing) await this.deactivate(existing);
		const data: InstalledPluginData = {
			manifest,
			wasm: wasm.slice(),
			grantedCapabilities: negotiation.granted,
			enabled: true,
			source: options.source ?? "user",
			installedAt: Date.now(),
		};
		const instance = this.createInstance(data);
		this.instances.set(manifest.id, instance);
		if (data.source !== "dev") await this.ports.packages.save(data);
		await this.activate(instance);
		this.emitChange();
	}

	async setEnabled(pluginId: string, enabled: boolean): Promise<void> {
		const instance = this.instances.get(pluginId);
		if (!instance) return;
		instance.data.enabled = enabled;
		if (enabled) {
			instance.consecutiveCrashes = 0;
			instance.lastError = undefined;
		}
		if (instance.data.source !== "dev")
			await this.ports.packages.save(instance.data);
		if (enabled) await this.activate(instance);
		else {
			await this.deactivate(instance);
			instance.status = "disabled";
		}
		this.emitChange();
	}

	async uninstall(pluginId: string): Promise<void> {
		const instance = this.instances.get(pluginId);
		if (!instance) return;
		await this.deactivate(instance);
		this.instances.delete(pluginId);
		if (instance.data.source !== "dev")
			await this.ports.packages.remove(pluginId);
		await this.ports.kv.clear(pluginId);
		this.emitChange();
	}

	/** Dev-mode (hot) reload: replace the module without touching KV/grants. */
	async reload(
		pluginId: string,
		manifest: FunctionPluginManifest,
		wasm: Uint8Array,
	): Promise<void> {
		const instance = this.instances.get(pluginId);
		if (!instance) throw new Error(`Plugin ${pluginId} is not installed`);
		if (manifest.id !== pluginId)
			throw new Error("Reload cannot change the plugin id");
		await this.deactivate(instance);
		instance.data.manifest = manifest;
		instance.data.wasm = wasm.slice();
		instance.data.grantedCapabilities = negotiateCapabilities(
			manifest.capabilities,
		).granted;
		instance.consecutiveCrashes = 0;
		instance.lastError = undefined;
		if (instance.data.source !== "dev")
			await this.ports.packages.save(instance.data);
		if (instance.data.enabled) await this.activate(instance);
		this.emitChange();
	}

	async executeCommand(
		pluginId: string,
		commandId: string,
		args?: JsonValue,
	): Promise<JsonValue | undefined> {
		const instance = this.instances.get(pluginId);
		if (instance?.status !== "active" || !instance.runtime)
			throw new Error(`Plugin ${pluginId} is not active`);
		return this.enqueue(instance, () =>
			this.runCommandInvocation(instance, commandId, args),
		);
	}

	/**
	 * Runs one pure format conversion turn (`plugin_convert_format`). Errors
	 * propagate to the host file flow, which owns the user-facing message;
	 * crash accounting and auto-disable still apply.
	 */
	async convertFormat(
		pluginId: string,
		params: ConvertFormatParamsV0,
	): Promise<FormatConversionResultV0> {
		const instance = this.instances.get(pluginId);
		if (instance?.status !== "active" || !instance.runtime)
			throw new Error(`Plugin ${pluginId} is not active`);
		if (
			params.direction === "import" &&
			params.text.length > FORMAT_CONVERSION_TEXT_LIMIT_V0
		)
			throw new PluginRuntimeError(
				"payload-too-large",
				`import text exceeds ${FORMAT_CONVERSION_TEXT_LIMIT_V0} characters`,
			);
		return this.enqueue(instance, () =>
			this.runFormatConversion(instance, params),
		);
	}

	async dispose(): Promise<void> {
		this.disposed = true;
		for (const instance of this.instances.values())
			await this.deactivate(instance);
		this.instances.clear();
		this.listeners.clear();
	}

	private createInstance(data: InstalledPluginData): PluginInstance {
		return {
			data,
			status: data.enabled ? "inactive" : "disabled",
			runtime: null,
			scope: null,
			unsubscribeEvents: null,
			consecutiveCrashes: 0,
			queue: Promise.resolve(),
			pendingDocumentEvent: null,
			documentEventScheduled: false,
			diagnostics: [],
			turnSequence: 0,
			generation: 0,
		};
	}

	private async activate(instance: PluginInstance): Promise<void> {
		if (instance.status === "active" || instance.status === "activating")
			return;
		const pluginId = instance.data.manifest.id;
		instance.status = "activating";
		instance.generation += 1;
		const generation = instance.generation;
		this.emitChange();
		try {
			const runtime = this.ports.createRuntime(pluginId);
			instance.runtime = runtime;
			let useWasi = false;
			try {
				useWasi = detectWasiImports(instance.data.wasm);
			} catch {
				// An uncompilable module fails properly in load() below.
			}
			await runtime.load(instance.data.wasm, useWasi);
			const context = await this.buildContext(instance);
			const activation = await runtime.runTurn(
				PLUGIN_EXPORTS.activate,
				JSON.stringify({
					pluginId,
					apiVersion: PLUGIN_API_VERSION,
					grantedCapabilities: instance.data.grantedCapabilities,
					locale: this.ports.locale ?? "en",
					hostVersion: this.ports.hostVersion ?? "unknown",
				}),
				context,
				{ limits: this.ports.limits, timeoutMs: this.ports.turnTimeoutMs },
			);
			if (instance.generation !== generation) return;
			const parsed = parsePluginReturn(JSON.parse(activation.returnJson));
			if (!parsed.ok)
				throw new PluginRuntimeError(
					"invalid-params",
					"plugin_activate returned an invalid PluginReturn",
				);
			if (!parsed.value.ok)
				throw new PluginRuntimeError(
					"internal",
					`plugin_activate failed: ${parsed.value.error.message}`,
				);
			await this.commitEffects(instance, context, activation.effects);

			const scope = this.ports.createScope(pluginId);
			this.ports.registerContributions(
				scope,
				instance.data.manifest,
				(commandId, args) =>
					this.executeCommand(pluginId, commandId, args) as Promise<unknown>,
			);
			this.registerFormatProviders(instance, scope);
			instance.scope = scope;
			if (
				this.ports.subscribeDocumentEvents &&
				instance.data.manifest.activationEvents?.includes("onDocumentChanged")
			)
				instance.unsubscribeEvents = this.ports.subscribeDocumentEvents(
					(event, meta) => this.onDocumentEvent(instance, event, meta),
				);
			instance.status = "active";
			instance.consecutiveCrashes = 0;
			instance.lastError = undefined;
			this.log(instance, "info", "activated");
		} catch (error) {
			if (instance.generation !== generation) return;
			instance.lastError = String(
				error instanceof Error ? error.message : error,
			);
			instance.status = "failed";
			this.log(instance, "error", `activation failed: ${instance.lastError}`);
			instance.runtime?.cancelAll("activation failed");
			await instance.runtime?.close().catch(() => undefined);
			instance.runtime = null;
		} finally {
			this.emitChange();
		}
	}

	private async deactivate(instance: PluginInstance): Promise<void> {
		instance.generation += 1;
		instance.unsubscribeEvents?.();
		instance.unsubscribeEvents = null;
		instance.pendingDocumentEvent = null;
		const runtime = instance.runtime;
		if (runtime && instance.status === "active") {
			try {
				const context = await this.buildContext(instance);
				await runtime.runTurn(
					PLUGIN_EXPORTS.deactivate,
					JSON.stringify({ pluginId: instance.data.manifest.id }),
					context,
					{ limits: this.ports.limits, timeoutMs: 2000 },
				);
			} catch {
				// Best-effort; the worker is torn down below either way.
			}
		}
		// Disposing the scope removes every contribution and listener; killing
		// the runtime rejects in-flight turns (async handler cancellation).
		instance.scope?.dispose();
		instance.scope = null;
		if (runtime) {
			runtime.cancelAll("plugin deactivated");
			await runtime.close().catch(() => undefined);
		}
		instance.runtime = null;
		if (instance.status !== "crash-disabled")
			instance.status = instance.data.enabled ? "inactive" : "disabled";
		this.log(instance, "info", "deactivated");
	}

	/**
	 * Registers the manifest's declared format providers into the plugin's
	 * scope. Conversion goes through `plugin_convert_format`; the returned
	 * structures feed the host file flow, which commits the one import
	 * transaction — a format plugin can never bypass the document service.
	 */
	private registerFormatProviders(
		instance: PluginInstance,
		scope: ExtensionScope,
	): void {
		const formats = instance.data.manifest.contributes?.formats ?? [];
		if (formats.length === 0) return;
		const pluginId = instance.data.manifest.id;
		if (!instance.data.grantedCapabilities.includes("lyrics.format")) {
			this.log(
				instance,
				"warn",
				"format contributions skipped: lyrics.format capability not granted",
			);
			return;
		}
		for (const format of formats) {
			scope.registerFormatProvider({
				formatId: format.id,
				title: format.title,
				extensions: format.extensions,
				importer: format.import
					? ({ text }) => this.importViaFormatPlugin(pluginId, format.id, text)
					: undefined,
				exporter: format.export
					? ({ lyric }) =>
							this.exportViaFormatPlugin(pluginId, format.id, lyric)
					: undefined,
			});
		}
	}

	private async importViaFormatPlugin(
		pluginId: string,
		formatId: string,
		text: string,
	): Promise<TTMLLyric> {
		const result = await this.convertFormat(pluginId, {
			formatId,
			direction: "import",
			text,
		});
		if (result.kind !== "imported")
			throw new PluginRuntimeError(
				"invalid-params",
				"guest returned an export result for an import conversion",
			);
		const seed = (this.ports.createTurnSeed ?? defaultTurnSeed)(pluginId);
		return createDocumentFromPluginLines(
			result.lines,
			result.metadata,
			createSeededIdAllocator(seed),
		);
	}

	private async exportViaFormatPlugin(
		pluginId: string,
		formatId: string,
		lyric: TTMLLyric,
	): Promise<string> {
		const instance = this.instances.get(pluginId);
		const includeRuby =
			instance?.data.grantedCapabilities.includes("lyrics.ruby") ?? false;
		const projection = toPluginDocument(
			lyric,
			this.ports.documents.getRevision(),
			{ includeRuby },
		);
		const result = await this.convertFormat(pluginId, {
			formatId,
			direction: "export",
			document: { lines: projection.lines, metadata: projection.metadata },
		});
		if (result.kind !== "exported")
			throw new PluginRuntimeError(
				"invalid-params",
				"guest returned an import result for an export conversion",
			);
		return result.text;
	}

	private async runFormatConversion(
		instance: PluginInstance,
		params: ConvertFormatParamsV0,
	): Promise<FormatConversionResultV0> {
		const runtime = instance.runtime;
		if (!runtime || instance.status !== "active")
			throw new Error(`Plugin ${instance.data.manifest.id} is not active`);
		this.log(
			instance,
			"info",
			`format ${params.formatId} ${params.direction} invoked`,
		);
		try {
			const context: WasmTurnContext = {
				...(await this.buildContext(instance)),
				editsAllowed: false,
			};
			const turn = await runtime.runTurn(
				PLUGIN_EXPORTS.convertFormat,
				JSON.stringify(params),
				context,
				{ limits: this.ports.limits, timeoutMs: this.ports.turnTimeoutMs },
			);
			await this.commitEffects(instance, context, turn.effects);
			const parsed = parseFormatConversionResult(
				this.parseReturnValue(turn),
				params.direction,
			);
			if (!parsed.ok)
				throw new PluginRuntimeError(
					"invalid-params",
					`guest returned an invalid format conversion result: ${parsed.issues
						.map((issue) => `${issue.path}: ${issue.message}`)
						.join("; ")}`,
				);
			instance.consecutiveCrashes = 0;
			return parsed.value;
		} catch (error) {
			await this.handleInvocationError(
				instance,
				`format ${params.formatId} (${params.direction})`,
				error,
				{ notifyUser: false },
			);
			throw error;
		}
	}

	private async runCommandInvocation(
		instance: PluginInstance,
		commandId: string,
		args: JsonValue | undefined,
	): Promise<JsonValue | undefined> {
		const runtime = instance.runtime;
		if (!runtime || instance.status !== "active")
			throw new Error(`Plugin ${instance.data.manifest.id} is not active`);
		this.log(instance, "info", `command ${commandId} invoked`);
		try {
			let context = await this.buildContext(instance);
			let turn = await runtime.runTurn(
				PLUGIN_EXPORTS.executeCommand,
				JSON.stringify(args === undefined ? { commandId } : { commandId, args }),
				context,
				{ limits: this.ports.limits, timeoutMs: this.ports.turnTimeoutMs },
			);
			for (let round = 0; ; round += 1) {
				await this.commitEffects(instance, context, turn.effects);
				const outcome = this.parseOutcome(instance, turn);
				if (outcome.kind === "done") {
					instance.consecutiveCrashes = 0;
					return outcome.value;
				}
				if (round >= FORM_ROUNDS_PER_INVOCATION_LIMIT_V0)
					throw new PluginRuntimeError(
						"limit-exceeded",
						`form round limit exceeded (${FORM_ROUNDS_PER_INVOCATION_LIMIT_V0})`,
					);
				const result = await this.ports.showForm(outcome.schema);
				context = await this.buildContext(instance);
				turn = await runtime.runTurn(
					PLUGIN_EXPORTS.resumeForm,
					JSON.stringify({
						commandId,
						...(outcome.state === undefined ? {} : { state: outcome.state }),
						result,
					}),
					context,
					{ limits: this.ports.limits, timeoutMs: this.ports.turnTimeoutMs },
				);
			}
		} catch (error) {
			await this.handleInvocationError(instance, commandId, error);
			return undefined;
		}
	}

	/** Unwraps a turn's PluginReturnV0 envelope into the guest's value. */
	private parseReturnValue(turn: WasmTurnResult): JsonValue {
		let raw: unknown;
		try {
			raw = JSON.parse(turn.returnJson);
		} catch {
			throw new PluginRuntimeError(
				"invalid-params",
				"guest returned non-JSON output",
			);
		}
		const wrapped = parsePluginReturn(raw);
		if (!wrapped.ok)
			throw new PluginRuntimeError(
				"invalid-params",
				"guest returned an invalid PluginReturn",
			);
		if (!wrapped.value.ok)
			throw new PluginRuntimeError(
				"internal",
				`plugin reported: ${wrapped.value.error.message}`,
			);
		return wrapped.value.value;
	}

	private parseOutcome(
		instance: PluginInstance,
		turn: WasmTurnResult,
	): PluginCommandOutcomeV0 {
		const outcome = parseCommandOutcome(this.parseReturnValue(turn));
		if (!outcome.ok)
			throw new PluginRuntimeError(
				"invalid-params",
				`guest returned an invalid command outcome: ${outcome.issues
					.map((issue) => `${issue.path}: ${issue.message}`)
					.join("; ")}`,
			);
		void instance;
		return outcome.value;
	}

	private async handleInvocationError(
		instance: PluginInstance,
		commandId: string,
		error: unknown,
		options: { notifyUser?: boolean } = {},
	): Promise<void> {
		if (error instanceof PluginInvocationAborted) return;
		const notifyUser = options.notifyUser ?? true;
		const pluginId = instance.data.manifest.id;
		const message = String(error instanceof Error ? error.message : error);
		instance.lastError = message;
		this.log(instance, "error", `command ${commandId} failed: ${message}`);
		const code = error instanceof PluginRuntimeError ? error.code : "internal";
		if (code === "cancelled") return;
		const crashLike =
			code === "plugin-crashed" || code === "timeout" || code === "internal";
		if (crashLike) {
			instance.consecutiveCrashes += 1;
			if (instance.consecutiveCrashes >= PLUGIN_CRASH_AUTO_DISABLE_THRESHOLD) {
				this.ports.notify(
					{
						level: "error",
						message: `Plugin ${instance.data.manifest.name} was disabled after repeated failures`,
						detail: message,
					},
					{ pluginId },
				);
				this.log(
					instance,
					"error",
					`auto-disabled after ${instance.consecutiveCrashes} consecutive failures`,
				);
				instance.data.enabled = false;
				if (instance.data.source !== "dev")
					await this.ports.packages.save(instance.data);
				await this.deactivate(instance);
				instance.status = "crash-disabled";
				this.emitChange();
				return;
			}
		}
		if (notifyUser)
			this.ports.notify(
				{
					level: "error",
					message: `Plugin command failed: ${commandId}`,
					detail: message,
				},
				{ pluginId },
			);
		this.emitChange();
	}

	private async commitEffects(
		instance: PluginInstance,
		context: WasmTurnContext,
		effects: WasmTurnResult["effects"],
	): Promise<void> {
		const pluginId = instance.data.manifest.id;
		if (effects.edits) {
			const label =
				effects.edits.labels.length === 1
					? effects.edits.labels[0]
					: effects.edits.labels.join("; ");
			const result = this.ports.documents.applyEdit({
				pluginId,
				label,
				expectedRevision: effects.edits.baseRevision,
				ops: effects.edits.ops,
				idSeed: context.editIdSeed,
			});
			if (!result.ok) {
				this.log(
					instance,
					"warn",
					`edit rejected (${result.error.code}): ${result.error.message}`,
				);
				this.ports.notify(
					{
						level: "warning",
						message: "Plugin edit was rejected",
						detail:
							result.error.code === "revision-conflict"
								? "The document changed while the plugin was running."
								: result.error.message,
					},
					{ pluginId },
				);
				throw new PluginInvocationAborted(result.error.message);
			}
		}
		if (effects.storage)
			await this.ports.kv.apply(pluginId, effects.storage);
		for (const notification of effects.notifications)
			this.ports.notify(notification, { pluginId });
	}

	private async buildContext(
		instance: PluginInstance,
	): Promise<WasmTurnContext> {
		const pluginId = instance.data.manifest.id;
		const granted = instance.data.grantedCapabilities;
		instance.turnSequence += 1;
		const seed = (this.ports.createTurnSeed ?? defaultTurnSeed)(pluginId);
		return {
			pluginId,
			grantedCapabilities: granted,
			document: granted.includes("lyrics.core")
				? this.ports.documents.getDocument({
						includeRuby: granted.includes("lyrics.ruby"),
					})
				: null,
			selection: this.ports.getSelection(),
			storage: granted.includes("storage.kv")
				? await this.ports.kv.read(pluginId)
				: {},
			editIdSeed: seed,
		};
	}

	private onDocumentEvent(
		instance: PluginInstance,
		event: PluginEventV0,
		meta: { sourcePluginId?: string },
	): void {
		if (instance.status !== "active" || !instance.runtime) return;
		if (event.type !== "document.changed") return;
		// A plugin's own committed edits do not echo back into it.
		if (meta.sourcePluginId === instance.data.manifest.id) return;
		// Coalesce: only the latest pending event is delivered.
		instance.pendingDocumentEvent = event;
		if (instance.documentEventScheduled) return;
		instance.documentEventScheduled = true;
		void this.enqueue(instance, async () => {
			instance.documentEventScheduled = false;
			const pending = instance.pendingDocumentEvent;
			instance.pendingDocumentEvent = null;
			if (!pending || instance.status !== "active" || !instance.runtime)
				return;
			try {
				const context = await this.buildContext(instance);
				const turn = await instance.runtime.runTurn(
					PLUGIN_EXPORTS.handleEvent,
					JSON.stringify({ event: pending }),
					context,
					{ limits: this.ports.limits, timeoutMs: this.ports.turnTimeoutMs },
				);
				await this.commitEffects(instance, context, turn.effects);
				instance.consecutiveCrashes = 0;
			} catch (error) {
				await this.handleInvocationError(instance, "handleEvent", error);
			}
		});
	}

	private enqueue<T>(
		instance: PluginInstance,
		task: () => Promise<T>,
	): Promise<T> {
		const next = instance.queue.then(task, task);
		instance.queue = next.then(
			() => undefined,
			() => undefined,
		);
		return next;
	}

	private log(
		instance: PluginInstance,
		level: WasmPluginDiagnosticEntry["level"],
		message: string,
	): void {
		this.diagnosticSequence += 1;
		instance.diagnostics.push({
			seq: this.diagnosticSequence,
			at: Date.now(),
			level,
			message,
		});
		if (instance.diagnostics.length > PLUGIN_DIAGNOSTIC_LIMIT)
			instance.diagnostics.splice(
				0,
				instance.diagnostics.length - PLUGIN_DIAGNOSTIC_LIMIT,
			);
		if (level !== "info")
			this.ports.warn?.(`[plugin ${instance.data.manifest.id}] ${message}`);
	}

	private emitChange(): void {
		for (const listener of [...this.listeners]) listener();
	}
}
