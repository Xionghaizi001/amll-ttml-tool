import type { RemotePluginCatalogEntryV0 } from "@amll-ttml-tool/plugin-api";
import { parseTrustedJsPackage } from "@amll-ttml-tool/plugin-api";
import semverGt from "semver/functions/gt";
import semverValid from "semver/functions/valid";
import type { ThemeServiceState, ThemeSummary } from "$/kernel/theme/types";
import type { StoredTrustedJsRecord } from "$/platform/storage/IndexedDbTrustedJsStorage";
import {
	TRUSTED_JS_CRASH_AUTO_DISABLE_THRESHOLD,
	type TrustedJsPluginEntry,
	type TrustedJsPluginStateRecord,
	type TrustedJsPluginSummary,
} from "../trusted/trusted-js-service";
import {
	type PluginContainerKind,
	unpackPluginContainer,
} from "./package-container";

/**
 * Store artifact install pipeline: fetch → content-hash verification →
 * container stripping → the existing semantic install gate of the matching
 * tier. Trusted-js source is handed — unevaluated — to the injected `installTrustedJsPackage`
 * port, which must run `parseTrustedJsPackage`, consent and persistence
 * before the single `TrustedJsPluginService.load()` gate. Same-origin
 * catalog entries that point at a bare ES module keep using the loader's
 * import path (`applyTrustedJsUpdate`), not this pipeline.
 */

export type StoreInstallOutcome =
	| { ok: true }
	| { ok: false; cancelled?: boolean; message?: string };

export interface StoreArtifactInstallPorts {
	/** Fetches a same-origin catalog-relative artifact path. */
	fetchArtifact(path: string): Promise<Uint8Array>;
	digestSha256(bytes: Uint8Array): Promise<string>;
	/** The single theme package install gate (themeService.importThemePackage). */
	installThemePackage(pkg: unknown): Promise<StoreInstallOutcome>;
	/**
	 * Persists and activates a trusted-js package through the same loader
	 * gate. Optional until the host wires local trusted-js execution
	 * (goal.md milestone-4 prerequisite 3); without it trusted-js artifacts
	 * are refused before any download.
	 */
	installTrustedJsPackage?(pkg: unknown): Promise<StoreInstallOutcome>;
}

const CHANNEL_CONTAINER_KIND: Record<
	RemotePluginCatalogEntryV0["channel"],
	PluginContainerKind
> = {
	theme: "theme",
	"trusted-js": "trusted-js",
};

export const installStoreArtifact = async (
	entry: RemotePluginCatalogEntryV0,
	ports: StoreArtifactInstallPorts,
): Promise<StoreInstallOutcome> => {
	const expectedKind = CHANNEL_CONTAINER_KIND[entry.channel];
	if (expectedKind === undefined)
		return {
			ok: false,
			message: `channel ${entry.channel} is not installed through artifacts`,
		};
	const installTrustedJs = ports.installTrustedJsPackage;
	if (expectedKind === "trusted-js" && installTrustedJs === undefined)
		return {
			ok: false,
			message: "trusted-js installation is unavailable on this host",
		};
	let bytes: Uint8Array;
	try {
		bytes = await ports.fetchArtifact(entry.entry);
	} catch (error) {
		return {
			ok: false,
			message: `artifact download failed: ${String(
				error instanceof Error ? error.message : error,
			)}`,
		};
	}
	if (entry.sha256 !== undefined) {
		// Content-addressing red line: the catalog names the exact bytes it
		// distributes; anything else is rejected before any parsing runs.
		const digest = (await ports.digestSha256(bytes)).toLowerCase();
		if (digest !== entry.sha256)
			return {
				ok: false,
				message: `artifact content hash mismatch for ${entry.id}`,
			};
	}
	const unpacked = unpackPluginContainer(bytes);
	if (!unpacked.ok) return { ok: false, message: unpacked.message };
	if (unpacked.kind !== expectedKind)
		return {
			ok: false,
			message: `artifact is a ${unpacked.kind} package but the catalog entry is ${entry.channel}`,
		};
	switch (unpacked.kind) {
		case "trusted-js":
			{
				const parsed = parseTrustedJsPackage(unpacked.pkg);
				if (!parsed.ok)
					return { ok: false, message: "invalid trusted-js package" };
				if (
					parsed.value.manifest.id !== entry.id ||
					parsed.value.manifest.version !== entry.version ||
					parsed.value.manifest.apiVersion !== entry.apiVersion
				)
					return {
						ok: false,
						message:
							"trusted-js manifest does not match catalog identity/version",
					};
			}
			return (installTrustedJs as NonNullable<typeof installTrustedJs>)(
				unpacked.pkg,
			);
		default:
			return ports.installThemePackage(unpacked.pkg);
	}
};

/** True when the catalog version is strictly newer than the installed one. */
export const isStoreUpdateAvailable = (
	catalogVersion: string,
	installedVersion: string | null,
): boolean =>
	installedVersion !== null &&
	semverValid(catalogVersion) !== null &&
	semverValid(installedVersion) !== null &&
	semverGt(catalogVersion, installedVersion);

export type PluginSource = "builtin" | "user" | "store" | "dev" | "unknown";
export interface ArtifactIdentity {
	sha256: string;
}
/** Host management projection. Runtime payloads remain owned by their services. */
export interface PluginInstallation {
	id: string;
	kind: "function" | "theme";
	runtime: "builtin" | "trusted-js" | "none";
	name: string;
	description?: string;
	version: string;
	source: PluginSource;
	artifact?: ArtifactIdentity;
	enabled: boolean;
	installedAt?: number;
	trustedJs?: {
		loaded: boolean;
		bundled: boolean;
		firstParty: boolean;
		status: "active" | "installed" | "disabled" | "crash-disabled";
		state: TrustedJsPluginStateRecord | null;
		hasInstalledPackage: boolean;
		hasFactory: boolean;
		pinnedToFactory: boolean;
		installedPackage?: {
			version: string;
			source: PluginSource;
			artifact: ArtifactIdentity;
			installedAt: number;
		};
	};
	theme?: {
		active: boolean;
		preview: boolean;
		safeMode: boolean;
		appearance: ThemeSummary["appearance"];
	};
}
export interface InstallationPorts {
	factory(): readonly TrustedJsPluginEntry[];
	installed(): readonly StoredTrustedJsRecord[];
	loaded(): readonly TrustedJsPluginSummary[];
	/** Loaded payload identity distinguishes equal-version sources. */
	entry?(id: string): TrustedJsPluginEntry | undefined;
	/** Only catalog modules with an existing loader state belong in the directory. */
	catalog?(): readonly RemotePluginCatalogEntryV0[];
	state(id: string): TrustedJsPluginStateRecord | null;
	pinned(id: string): boolean;
	themes(): readonly ThemeSummary[];
	themeState(): ThemeServiceState;
	subscribe(listener: () => void): () => void;
	setEnabled(
		kind: PluginInstallation["kind"],
		id: string,
		enabled: boolean,
	): Promise<void>;
	uninstall(kind: PluginInstallation["kind"], id: string): Promise<void>;
	revertToFactory(id: string): Promise<void>;
	reauthorize(id: string): Promise<void>;
}
/** Single directory and subscription, with separate runtime and theme semantics. */
export class PluginInstallationService {
	private readonly knownLoaded = new Map<string, TrustedJsPluginSummary>();
	constructor(private readonly ports: InstallationPorts) {}
	list = (): PluginInstallation[] => {
		const factory = new Map(
			this.ports.factory().map((entry) => [entry.id, entry]),
		);
		const installed = new Map(
			this.ports.installed().map((record) => [record.id, record]),
		);
		const loaded = new Map(
			this.ports.loaded().map((entry) => [entry.id, entry]),
		);
		for (const entry of loaded.values()) this.knownLoaded.set(entry.id, entry);
		const remote = new Map(
			(this.ports.catalog?.() ?? [])
				.filter(
					(entry) =>
						entry.channel === "trusted-js" &&
						!/\.(zip|json)$/i.test(entry.entry) &&
						this.ports.state(entry.id) !== null,
				)
				.map((entry) => [entry.id, entry]),
		);
		// Disabled catalog modules have no persisted package, but remain manageable.
		for (const id of this.knownLoaded.keys()) {
			if (!loaded.has(id) && this.ports.state(id) === null)
				this.knownLoaded.delete(id);
		}
		const ids = new Set([
			...factory.keys(),
			...installed.keys(),
			...loaded.keys(),
			...remote.keys(),
			...this.knownLoaded.keys(),
		]);
		const functions: PluginInstallation[] = [...ids].map((id) => {
			const bundledEntry = factory.get(id);
			const record = installed.get(id);
			const live = loaded.get(id);
			const liveEntry = this.ports.entry?.(id);
			const pinned = this.ports.pinned(id);
			const bundled =
				live?.bundled ?? Boolean(bundledEntry && (pinned || !record));
			const entry =
				live ??
				(bundled ? bundledEntry : record?.manifest) ??
				bundledEntry ??
				record?.manifest ??
				remote.get(id) ??
				this.knownLoaded.get(id);
			if (!entry) throw new Error(`Missing installation metadata: ${id}`);
			const selectedRecord =
				!bundled &&
				record &&
				(!live ||
					(live.version === record.manifest.version &&
						(!this.ports.entry || liveEntry?.moduleBlob === record.code)))
					? record
					: undefined;
			const state = this.ports.state(id);
			const crashDisabled =
				(state?.crashes ?? 0) >= TRUSTED_JS_CRASH_AUTO_DISABLE_THRESHOLD;
			return {
				id,
				kind: "function",
				runtime: "trusted-js",
				name: entry.name,
				description:
					liveEntry?.description ??
					(bundled
						? bundledEntry?.description
						: selectedRecord?.manifest.description) ??
					remote.get(id)?.description,
				version: entry.version,
				source: bundled ? "builtin" : (selectedRecord?.source ?? "store"),
				artifact: selectedRecord
					? { sha256: selectedRecord.sha256 }
					: undefined,
				installedAt: selectedRecord?.installedAt,
				enabled: !state?.disabled && !crashDisabled,
				trustedJs: {
					loaded: Boolean(live),
					bundled,
					firstParty:
						live?.firstParty ??
						(bundled
							? bundledEntry?.firstParty === true
							: remote.get(id)?.firstParty === true),
					status: live
						? "active"
						: crashDisabled
							? "crash-disabled"
							: state?.disabled
								? "disabled"
								: "installed",
					state,
					hasInstalledPackage: Boolean(record),
					hasFactory: Boolean(bundledEntry),
					pinnedToFactory: pinned,
					installedPackage: record
						? {
								version: record.manifest.version,
								source: record.source,
								artifact: { sha256: record.sha256 },
								installedAt: record.installedAt,
							}
						: undefined,
				},
			};
		});
		const state = this.ports.themeState();
		return [
			...functions,
			...this.ports.themes().map(
				(theme): PluginInstallation => ({
					id: theme.id,
					kind: "theme",
					runtime: "none",
					name: theme.name,
					description: theme.description,
					version: theme.version,
					source: theme.source === "builtin" ? "builtin" : "unknown",
					enabled: state.activeThemeId === theme.id && !state.safeMode,
					theme: {
						active: state.activeThemeId === theme.id,
						preview: state.previewThemeId === theme.id,
						safeMode: state.safeMode,
						appearance: theme.appearance,
					},
				}),
			),
		];
	};
	subscribe = (listener: () => void) => this.ports.subscribe(listener);
	setEnabled = (
		kind: PluginInstallation["kind"],
		id: string,
		enabled: boolean,
	) => this.ports.setEnabled(kind, id, enabled);
	uninstall = (kind: PluginInstallation["kind"], id: string) =>
		this.ports.uninstall(kind, id);
	revertToFactory = (id: string) => this.ports.revertToFactory(id);
	reauthorize = (id: string) => this.ports.reauthorize(id);
}
