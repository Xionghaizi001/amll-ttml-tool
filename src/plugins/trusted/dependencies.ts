import type { PluginDependencyV0 } from "@amll-ttml-tool/plugin-api";
import satisfies from "semver/functions/satisfies";

export interface DependencyNode {
	id: string;
	version: string;
	dependencies?: readonly PluginDependencyV0[];
}

export interface MissingDependency {
	id: string;
	version: string;
	reason: "missing" | "disabled" | "version";
}

/** Only active, compatible optional edges participate in ordering. */
export function dependencyOrder<T extends DependencyNode>(nodes: readonly T[]): T[] {
	const byId = new Map(nodes.map((node) => [node.id, node]));
	const visiting = new Set<string>();
	const visited = new Set<string>();
	const ordered: T[] = [];
	const visit = (node: T) => {
		if (visiting.has(node.id)) throw new Error(`Dependency cycle: ${[...visiting, node.id].join(" → ")}`);
		if (visited.has(node.id)) return;
		visiting.add(node.id);
		for (const dependency of node.dependencies ?? []) {
			const target = byId.get(dependency.id);
			if (target && (!dependency.optional || satisfies(target.version, dependency.version))) visit(target);
		}
		visiting.delete(node.id);
		visited.add(node.id);
		ordered.push(node);
	};
	for (const node of nodes) visit(node);
	return ordered;
}

export function missingDependencies(
	node: DependencyNode,
	installed: readonly DependencyNode[],
	isEnabled: (id: string) => boolean,
): MissingDependency[] {
	const byId = new Map(installed.map((entry) => [entry.id, entry]));
	return (node.dependencies ?? []).flatMap((dependency): MissingDependency[] => {
		if (dependency.optional) return [];
		const target = byId.get(dependency.id);
		const reason = !target ? "missing" : !satisfies(target.version, dependency.version) ? "version" : !isEnabled(target.id) ? "disabled" : null;
		return reason ? [{ id: dependency.id, version: dependency.version, reason }] : [];
	});
}
