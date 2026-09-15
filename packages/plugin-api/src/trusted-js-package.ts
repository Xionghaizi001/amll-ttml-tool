import { parseManifestSchema } from "./parsers";
import { TRUSTED_JS_PLUGIN_PACKAGE_SCHEMA } from "./schema/schemas";
import { validate } from "./schema/validator";
import type { ParseIssue, ParseResult, TrustedJsPluginPackageV0 } from "./types";

/** The sole semantic trust gate for installed trusted-js packages. */
export function parseTrustedJsPackage(input: unknown): ParseResult<TrustedJsPluginPackageV0> {
	const parsed = validate<TrustedJsPluginPackageV0>(TRUSTED_JS_PLUGIN_PACKAGE_SCHEMA, input);
	if (!parsed.ok) return parsed;
	const manifest = parseManifestSchema(parsed.value.manifest);
	const issues: ParseIssue[] = [];
	if (!manifest.ok) issues.push(...manifest.issues.map((i) => ({ ...i, path: `/manifest${i.path}` })));
	else if (manifest.value.kind !== "function" || manifest.value.runtime !== "trusted-js")
		issues.push({ path: "/manifest/runtime", message: "trusted-js packages require a function manifest with runtime trusted-js" });
	return issues.length ? { ok: false, issues } : parsed;
}
