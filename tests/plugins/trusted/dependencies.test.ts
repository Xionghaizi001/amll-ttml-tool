import { describe, expect, it } from "vitest";
import { dependencyOrder, missingDependencies } from "$/plugins/trusted/dependencies";

describe("plugin dependency resolution", () => {
	it("orders required dependencies before dependents and reports missing versions", () => {
		const nodes = [
			{ id: "app.child", version: "1.0.0", dependencies: [{ id: "app.base", version: "^2.0.0" }] },
			{ id: "app.base", version: "2.1.0" },
		];
		expect(dependencyOrder(nodes).map((node) => node.id)).toEqual(["app.base", "app.child"]);
		expect(missingDependencies(nodes[0], [{ id: "app.base", version: "1.0.0" }], () => true)).toEqual([
			{ id: "app.base", version: "^2.0.0", reason: "version" },
		]);
	});

	it("rejects cycles and ignores unavailable optional dependencies", () => {
		expect(() =>
			dependencyOrder([
				{ id: "a", version: "1.0.0", dependencies: [{ id: "b", version: "*" }] },
				{ id: "b", version: "1.0.0", dependencies: [{ id: "a", version: "*" }] },
			]),
		).toThrow(/Dependency cycle/);
		expect(missingDependencies({ id: "a", version: "1.0.0", dependencies: [{ id: "optional", version: "^1", optional: true }] }, [], () => false)).toEqual([]);
	});
});
