import { dependencyOrder, missingDependencies, type DependencyNode } from "./dependencies";

export interface InstalledDependencyNode extends DependencyNode {
	enabled: boolean;
	/** Runtime readiness is stricter than the persisted enabled switch. */
	ready: boolean;
}

const sources = new Map<string, () => InstalledDependencyNode[]>();
export function registerDependencySource(name: string, source: () => InstalledDependencyNode[]) {
	sources.set(name, source);
}
export function installedDependencyNodes(): InstalledDependencyNode[] {
	return [...sources.values()].flatMap((source) => source());
}
export function checkDependencyGraph(node: DependencyNode): void {
	const nodes = installedDependencyNodes().filter((entry) => entry.id !== node.id);
	dependencyOrder([...nodes, { ...node, enabled: true, ready: false }], (id) => id === node.id || nodes.some((entry) => entry.id === id && entry.enabled));
}
export function checkDependencyActivation(node: DependencyNode): string | null {
	try {
		checkDependencyGraph(node);
		const nodes = installedDependencyNodes();
		const missing = missingDependencies(node, nodes, (id) => nodes.some((entry) => entry.id === id && entry.enabled && entry.ready));
		return missing.length ? `缺少依赖：${missing.map((entry) => `${entry.id} (${entry.version}; ${entry.reason})`).join(", ")}` : null;
	} catch (error) {
		return String(error instanceof Error ? error.message : error);
	}
}
