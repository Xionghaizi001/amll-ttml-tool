import type { RemotePluginCatalogEntryV0 } from "@amll-ttml-tool/plugin-api";
import semverGt from "semver/functions/gt";
import semverValid from "semver/functions/valid";
import type { TrustedJsPluginEntry } from "./trusted-js-service";

/**
 * Pure resolution of which trusted-js modules to load: factory (bundled)
 * copies vs. remote catalog entries. Implements the factory-copy principle —
 * a catalog entry with the same id and a strictly newer semver shadows the
 * factory copy; a user pin ("uninstall the update") keeps the factory copy
 * regardless. Remote candidates are dropped entirely on desktop while the
 * desktop trusted-js gate is off, so the executor never tears down a working
 * factory instance for a load that is guaranteed to be rejected.
 */

export interface TrustedJsLoadPlanItem {
	entry: TrustedJsPluginEntry;
	origin: "factory" | "remote";
	/** Factory copy to reload if a shadowing remote load fails. */
	fallback?: TrustedJsPluginEntry;
}

export interface TrustedJsFactoryUpdateState {
	id: string;
	factoryVersion: string;
	/** Platform-eligible catalog counterpart, when one exists. */
	remote?: TrustedJsPluginEntry;
	/** Remote version is strictly newer than the factory copy. */
	updateAvailable: boolean;
	pinnedToFactory: boolean;
}

export interface TrustedJsLoadPlanInput {
	factory: readonly TrustedJsPluginEntry[];
	catalog: readonly RemotePluginCatalogEntryV0[];
	platform: "web" | "desktop";
	/** On desktop: the runtime consent gate for remote trusted-js modules. */
	desktopRemoteAllowed: boolean;
	isPinnedToFactory(pluginId: string): boolean;
}

export interface TrustedJsLoadResolution {
	plan: TrustedJsLoadPlanItem[];
	updates: TrustedJsFactoryUpdateState[];
}

const toPluginEntry = (
	entry: RemotePluginCatalogEntryV0,
): TrustedJsPluginEntry => ({
	id: entry.id,
	name: entry.name,
	version: entry.version,
	description: entry.description,
	author: entry.author,
	homepage: entry.homepage,
	apiVersion: entry.apiVersion,
	entry: entry.entry,
	firstParty: entry.firstParty,
});

const isNewerVersion = (candidate: string, baseline: string): boolean =>
	semverValid(candidate) !== null &&
	semverValid(baseline) !== null &&
	semverGt(candidate, baseline);

export const resolveTrustedJsLoadPlan = (
	input: TrustedJsLoadPlanInput,
): TrustedJsLoadResolution => {
	const remoteAllowed =
		input.platform !== "desktop" || input.desktopRemoteAllowed;
	const remoteById = new Map<string, TrustedJsPluginEntry>();
	for (const entry of input.catalog) {
		if (entry.channel !== "trusted-js") continue;
		if (
			entry.platforms !== undefined &&
			!entry.platforms.includes(input.platform)
		)
			continue;
		// Duplicate ids are rejected by parseRemotePluginCatalog; first wins.
		if (!remoteById.has(entry.id))
			remoteById.set(entry.id, toPluginEntry(entry));
	}

	const plan: TrustedJsLoadPlanItem[] = [];
	const updates: TrustedJsFactoryUpdateState[] = [];
	const factoryIds = new Set<string>();
	for (const factory of input.factory) {
		factoryIds.add(factory.id);
		const remote = remoteById.get(factory.id);
		const pinned = input.isPinnedToFactory(factory.id);
		const updateAvailable =
			remote !== undefined && isNewerVersion(remote.version, factory.version);
		updates.push({
			id: factory.id,
			factoryVersion: factory.version,
			remote,
			updateAvailable,
			pinnedToFactory: pinned,
		});
		if (remote !== undefined && updateAvailable && !pinned && remoteAllowed)
			plan.push({ entry: remote, origin: "remote", fallback: factory });
		else plan.push({ entry: factory, origin: "factory" });
	}

	if (remoteAllowed) {
		for (const [id, remote] of remoteById) {
			if (factoryIds.has(id)) continue;
			plan.push({ entry: remote, origin: "remote" });
		}
	}

	return { plan, updates };
};
