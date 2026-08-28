import { REMOTE_PLUGIN_CATALOG_SCHEMA } from "./schema/schemas";
import { validate } from "./schema/validator";
import type {
	ParseIssue,
	ParseResult,
	RemotePluginCatalogV0,
} from "./types";

/**
 * Trust-boundary validation for a remote plugin catalog document. Both
 * distribution channels (trusted-js modules and packaged plugins/themes)
 * share this one schema; the store client and the same-origin static slice
 * parse through this single entry.
 *
 * Beyond the schema, this rejects duplicate plugin ids and dot segments in
 * entry paths. The path is later resolved against the application origin and
 * re-checked for same-origin by the loader — this parser only guarantees the
 * catalog cannot even express a cross-origin or scheme-carrying URL.
 */
export function parseRemotePluginCatalog(
	input: unknown,
): ParseResult<RemotePluginCatalogV0> {
	const parsed = validate<RemotePluginCatalogV0>(
		REMOTE_PLUGIN_CATALOG_SCHEMA,
		input,
	);
	if (!parsed.ok) return parsed;
	const issues: ParseIssue[] = [];
	const seen = new Set<string>();
	parsed.value.plugins.forEach((entry, index) => {
		if (seen.has(entry.id))
			issues.push({
				path: `/plugins/${index}/id`,
				message: `duplicate plugin id ${entry.id}`,
			});
		seen.add(entry.id);
		if (
			entry.entry
				.split("/")
				.some((segment) => segment === "." || segment === "..")
		)
			issues.push({
				path: `/plugins/${index}/entry`,
				message: "entry path cannot contain dot segments",
			});
	});
	if (issues.length > 0) return { ok: false, issues };
	return parsed;
}
