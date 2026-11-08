export type SortField = "name" | "installedAt" | "updatedAt";
export interface SortKey {
	name: string;
	installedAt?: number;
	updatedAt?: number;
}

/** Items without the chosen timestamp (e.g. factory plugins) always sort last; ties fall back to name. */
export const compareSortKeys = (
	a: SortKey,
	b: SortKey,
	field: SortField,
	descending: boolean,
	locale?: string,
): number => {
	const byName = a.name.localeCompare(b.name, locale);
	if (field === "name") return descending ? -byName : byName;
	const x = a[field];
	const y = b[field];
	if (x === y) return byName;
	if (x === undefined) return 1;
	if (y === undefined) return -1;
	return descending ? y - x : x - y;
};
