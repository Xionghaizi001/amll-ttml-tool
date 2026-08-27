import { parseManifestSchema } from "./parsers";
import { FUNCTION_PLUGIN_PACKAGE_SCHEMA } from "./schema/schemas";
import { validate } from "./schema/validator";
import type {
	FunctionPluginPackageV0,
	ParseIssue,
	ParseResult,
} from "./types";

const prefixIssues = (issues: ParseIssue[], prefix: string): ParseIssue[] =>
	issues.map((issue) => ({ ...issue, path: `${prefix}${issue.path}` }));

/**
 * Full trust-boundary validation for an importable WASM function plugin
 * package. Every install path (file import, dev directory load, bundled
 * sample) must go through this single entry; there is no second loader.
 */
export function parseFunctionPluginPackage(
	input: unknown,
): ParseResult<FunctionPluginPackageV0> {
	const parsed = validate<FunctionPluginPackageV0>(
		FUNCTION_PLUGIN_PACKAGE_SCHEMA,
		input,
	);
	if (!parsed.ok) return parsed;
	const issues: ParseIssue[] = [];

	const manifest = parseManifestSchema(parsed.value.manifest);
	if (!manifest.ok) issues.push(...prefixIssues(manifest.issues, "/manifest"));
	else if (manifest.value.kind !== "function")
		issues.push({
			path: "/manifest/kind",
			message: "function plugin packages must use a function manifest",
		});
	else if (manifest.value.runtime !== "extism-wasm")
		issues.push({
			path: "/manifest/runtime",
			message: "importable plugin packages must declare the extism-wasm runtime",
		});

	if (issues.length > 0) return { ok: false, issues };
	return parsed;
}

/**
 * Decodes the package's base64 wasm field without DOM dependencies (usable in
 * Node tests and the browser alike).
 */
export function decodeFunctionPluginWasm(
	pkg: FunctionPluginPackageV0,
): Uint8Array {
	const base64 = pkg.wasm;
	const scope = globalThis as unknown as {
		atob?: (data: string) => string;
		Buffer?: { from(data: string, encoding: string): Uint8Array };
	};
	if (typeof scope.atob === "function") {
		const binary = scope.atob(base64);
		const bytes = new Uint8Array(binary.length);
		for (let index = 0; index < binary.length; index += 1)
			bytes[index] = binary.charCodeAt(index);
		return bytes;
	}
	// Node fallback; Buffer exists whenever atob does not in our targets.
	if (!scope.Buffer) throw new Error("No base64 decoder available");
	return Uint8Array.from(scope.Buffer.from(base64, "base64"));
}
