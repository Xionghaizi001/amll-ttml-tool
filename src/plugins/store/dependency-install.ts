import type { ThemePackageV0, TrustedJsPluginPackageV0 } from "@amll-ttml-tool/plugin-api";
import satisfies from "semver/functions/satisfies";
import rcompare from "semver/functions/rcompare";
import { dependencyOrder, type DependencyNode } from "../trusted/dependencies";
import type { InstalledDependencyNode } from "../trusted/dependency-context";
import { installStoreArtifact, type StoreArtifactInstallPorts, type StoreInstallOutcome } from "./store-install";
import type { ProviderCatalogEntry } from "./store-providers";

export interface PreparedStorePackage extends DependencyNode {
	entry: ProviderCatalogEntry;
	pkg: ThemePackageV0 | TrustedJsPluginPackageV0;
}

/** Uses exactly the same byte, container, identity and semantic gates as a single install. */
export async function prepareStorePackage(entry: ProviderCatalogEntry, ports: Pick<StoreArtifactInstallPorts, "fetchArtifact" | "digestSha256">): Promise<PreparedStorePackage> {
	let pkg: PreparedStorePackage["pkg"] | undefined;
	const capture = async (input: unknown): Promise<StoreInstallOutcome> => {
		pkg = input as PreparedStorePackage["pkg"];
		return { ok: true };
	};
	const result = await installStoreArtifact(entry, { ...ports, installTrustedJsPackage: capture, installThemePackage: capture });
	if (!result.ok || !pkg) throw new Error(!result.ok ? result.message : "Empty package");
	return { ...pkg.manifest, entry, pkg };
}

/** Manifest-based closure: catalogs need not duplicate package dependency metadata. */
export async function resolveStoreDependencies(
	root: ProviderCatalogEntry,
	catalog: readonly ProviderCatalogEntry[],
	installed: readonly InstalledDependencyNode[],
	prepare: (entry: ProviderCatalogEntry) => Promise<PreparedStorePackage>,
): Promise<PreparedStorePackage[]> {
	const cache = new Map<ProviderCatalogEntry, Promise<PreparedStorePackage>>();
	const read = (entry: ProviderCatalogEntry) => {
		if (entry.blockedReason) throw new Error(entry.blockedReason);
		if (!cache.has(entry)) {
			if (cache.size >= 128) throw new Error("Dependency package limit exceeded (128)");
			cache.set(entry, prepare(entry));
		}
		return cache.get(entry)!;
	};
	type Selection = DependencyNode & { prepared?: PreparedStorePackage };
	let attempts = 0;
	const solve = async (selected: Map<string, Selection>): Promise<Map<string, Selection>> => {
		if (++attempts > 1024) throw new Error("Dependency resolution limit exceeded");
		const requirements = new Map<string, string[]>();
		for (const node of selected.values()) {
			for (const dep of node.dependencies ?? []) {
				if (dep.optional) continue;
				requirements.set(dep.id, [...(requirements.get(dep.id) ?? []), dep.version]);
			}
		}
		for (const [id, ranges] of requirements) {
			const node = selected.get(id);
			if (node && !ranges.every((range) => satisfies(node.version, range))) throw new Error(`依赖版本冲突：${id} (${ranges.join(" & ")})`);
		}
		const unresolved = [...requirements].find(([id]) => !selected.has(id));
		if (!unresolved) {
			const graph = new Map(installed.map((node) => [node.id, node as DependencyNode]));
			for (const node of selected.values()) graph.set(node.id, node);
			dependencyOrder([...graph.values()], (id) => selected.has(id) || installed.some((node) => node.id === id && node.enabled));
			return selected;
		}
		const [id, ranges] = unresolved;
		const matches = (node: DependencyNode) => node.id === id && ranges.every((range) => satisfies(node.version, range));
		const local = installed.find(matches);
		// Respect an explicit local disable; a store install must not silently undo it.
		if (local && !local.enabled) throw new Error(`依赖 ${id} 已禁用，请先启用后重试`);
		const choices: (() => Promise<Selection>)[] = [];
		if (local?.ready) choices.push(async () => local);
		for (const entry of catalog.filter((entry) => !entry.blockedReason && !entry.mirrorOf && matches(entry)).sort((a, b) => rcompare(a.version, b.version))) {
			choices.push(async () => { const prepared = await read(entry); return { ...prepared, prepared }; });
		}
		let failure: unknown = new Error(`商店中缺少依赖：${id} (${ranges.join(" & ")})`);
		for (const choose of choices) {
			try {
				const node = await choose();
				return await solve(new Map([...selected, [id, node]]));
			} catch (error) { failure = error; }
		}
		throw failure;
	};
	const prepared = await read(root);
	const selected = await solve(new Map([[root.id, { ...prepared, prepared }]]));
	// Include local nodes in sorting so paths through an installed intermediary count.
	return dependencyOrder([...selected.values()]).flatMap((node) => node.prepared ? [node.prepared] : []);
}

export interface StoreBatchPorts {
	confirm(plan: readonly PreparedStorePackage[]): Promise<boolean>;
	/** Revalidate source and local state after the dialog, before any mutation. */
	validate(): void;
	checkpoint(item: PreparedStorePackage): () => Promise<void>;
	install(item: PreparedStorePackage): Promise<StoreInstallOutcome>;
}

export async function installStoreBatch(plan: readonly PreparedStorePackage[], ports: StoreBatchPorts): Promise<StoreInstallOutcome> {
	const rollback: (() => Promise<void>)[] = [];
	try {
		if (!await ports.confirm(plan)) return { ok: false, cancelled: true };
		ports.validate();
		for (const item of plan) {
			// Include the failing item: its persistence or activation may have started.
			rollback.push(ports.checkpoint(item));
			const result = await ports.install(item);
			if (!result.ok) throw new Error(result.message ?? `安装失败：${item.id}`);
		}
		return { ok: true };
	} catch (error) {
		const failures: string[] = [];
		for (const restore of rollback.reverse()) {
			try { await restore(); } catch (error) { failures.push(String(error)); }
		}
		return { ok: false, message: `${String(error instanceof Error ? error.message : error)}${failures.length ? `；回滚失败：${failures.join("; ")}` : ""}` };
	}
}
