import { parseManifestSchema } from "./parsers";
import {
	THEME_ASSET_NAME_PATTERN,
	THEME_PACKAGE_SCHEMA,
} from "./schema/schemas";
import { validate } from "./schema/validator";
import { validateThemeCss } from "./theme-css";
import { validateThemeTokens } from "./theme-tokens";
import type { ParseIssue, ParseResult, ThemePackageV0 } from "./types";

const prefixIssues = (issues: ParseIssue[], prefix: string): ParseIssue[] =>
	issues.map((issue) => ({ ...issue, path: `${prefix}${issue.path}` }));

/**
 * Full trust-boundary validation for a self-contained theme package:
 * structural schema, theme manifest, token safety, per-file CSS contract
 * (scoped selectors, no remote URLs) and asset naming. Returns the package
 * with comment-stripped CSS ready for host injection.
 */
export function parseThemePackage(input: unknown): ParseResult<ThemePackageV0> {
	const parsed = validate<ThemePackageV0>(THEME_PACKAGE_SCHEMA, input);
	if (!parsed.ok) return parsed;
	const issues: ParseIssue[] = [];

	const manifest = parseManifestSchema(parsed.value.manifest);
	if (!manifest.ok) issues.push(...prefixIssues(manifest.issues, "/manifest"));
	else if (manifest.value.kind !== "theme")
		issues.push({
			path: "/manifest/kind",
			message: "theme packages must use a theme manifest",
		});

	const tokens = validateThemeTokens(parsed.value.tokens);
	if (!tokens.ok) issues.push(...prefixIssues(tokens.issues, "/tokens"));

	const assets = parsed.value.assets ?? {};
	for (const name of Object.keys(assets)) {
		if (name.length > 64 || !THEME_ASSET_NAME_PATTERN.test(name))
			issues.push({
				path: `/assets/${name}`,
				message: "invalid asset name",
			});
	}
	const assetNames = Object.keys(assets);

	const styles = parsed.value.styles ?? {};
	const declaredStyles =
		manifest.ok && manifest.value.kind === "theme"
			? (manifest.value.styles ?? [])
			: [];
	if (manifest.ok && manifest.value.kind === "theme") {
		for (const path of declaredStyles) {
			if (!(path in styles))
				issues.push({
					path: `/styles/${path}`,
					message: "manifest declares a style file the package does not carry",
				});
		}
		for (const path of Object.keys(styles)) {
			if (!declaredStyles.includes(path))
				issues.push({
					path: `/styles/${path}`,
					message: "package carries a style file the manifest does not declare",
				});
		}
	}
	const validatedStyles: Record<string, string> = {};
	for (const [path, css] of Object.entries(styles)) {
		const result = validateThemeCss(css, { assetNames });
		if (!result.ok)
			issues.push(...prefixIssues(result.issues, `/styles/${path}`));
		else validatedStyles[path] = result.value;
	}

	if (issues.length > 0) return { ok: false, issues };
	return {
		ok: true,
		value: {
			...parsed.value,
			styles: parsed.value.styles === undefined ? undefined : validatedStyles,
		},
	};
}
