import { parseManifestSchema } from "./parsers";
import type {
	FunctionPluginManifest,
	ParseIssue,
	PluginError,
	PluginManifest,
	ThemePluginManifest,
} from "./types";

export type { FunctionPluginManifest, PluginManifest, ThemePluginManifest };

export type ManifestParseResult =
	| { ok: true; value: PluginManifest }
	| { ok: false; issues: ParseIssue[]; error: PluginError };

export function parseManifest(input: unknown): ManifestParseResult {
	const result = parseManifestSchema(input);
	if (result.ok) return result;
	return {
		...result,
		error: {
			code: "invalid-params",
			message: result.issues
				.map((issue) => `${issue.path || "/"}: ${issue.message}`)
				.join("; "),
		},
	};
}
