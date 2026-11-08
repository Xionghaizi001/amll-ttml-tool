import { describe, expect, it } from "vitest";
import { compareSortKeys } from "$/modules/plugin-store/sort";

const items = [
	{ name: "B", installedAt: 2, updatedAt: 5 },
	{ name: "A", installedAt: 3, updatedAt: 4 },
	{ name: "C" },
];
const order = (field: "name" | "installedAt" | "updatedAt", desc: boolean) =>
	[...items]
		.sort((a, b) => compareSortKeys(a, b, field, desc, "en"))
		.map((item) => item.name);

describe("compareSortKeys", () => {
	it("sorts by name", () => {
		expect(order("name", false)).toEqual(["A", "B", "C"]);
		expect(order("name", true)).toEqual(["C", "B", "A"]);
	});
	it("sorts by timestamps and keeps missing ones last in both directions", () => {
		expect(order("installedAt", false)).toEqual(["B", "A", "C"]);
		expect(order("installedAt", true)).toEqual(["A", "B", "C"]);
		expect(order("updatedAt", false)).toEqual(["A", "B", "C"]);
		expect(order("updatedAt", true)).toEqual(["B", "A", "C"]);
	});
	it("breaks timestamp ties by name", () => {
		expect(
			compareSortKeys({ name: "B" }, { name: "A" }, "installedAt", true, "en"),
		).toBeGreaterThan(0);
	});
});
