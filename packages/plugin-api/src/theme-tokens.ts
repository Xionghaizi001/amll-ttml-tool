import { THEME_TOKENS_SCHEMA } from "./schema/schemas";
import { validate } from "./schema/validator";
import type {
	ParseIssue,
	ParseResult,
	ThemeTokenModeOverridesV0,
	ThemeTokensV0,
} from "./types";

const unsafeCss =
	/(?:url\s*\(|var\s*\(|expression\s*\(|@import|https?:|data:|\\|[;{}])/i;
const safeColor =
	/^(?:#[0-9a-f]{3}(?:[0-9a-f]{3})?(?:[0-9a-f]{2})?|(?:rgb|rgba|hsl|hsla|oklch|color-mix)\([^;{}]+\)|[a-z]+)$/i;
const safeLength = /^(?:0|(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:px|rem|em|%))$/;
const safeFontFamily = /^[\p{L}\p{N}\s"',_-]+$/u;

const checkGroups = (
	groups: ThemeTokenModeOverridesV0 & Pick<ThemeTokensV0, "color">,
	prefix: string,
	issues: ParseIssue[],
): void => {
	for (const [name, value] of Object.entries<string | undefined>(
		groups.color ?? {},
	)) {
		if (
			value !== undefined &&
			(unsafeCss.test(value) || !safeColor.test(value))
		)
			issues.push({
				path: `${prefix}/color/${name}`,
				message: "unsafe color token",
			});
	}
	for (const [groupName, group] of [
		["lyrics", groups.lyrics],
		["spectrogram", groups.spectrogram],
	] as const) {
		for (const [name, value] of Object.entries<string | undefined>(
			group ?? {},
		)) {
			if (value !== undefined && unsafeCss.test(value))
				issues.push({
					path: `${prefix}/${groupName}/${name}`,
					message: "unsafe token value",
				});
		}
	}
	const background = groups.background;
	if (background?.value !== undefined && unsafeCss.test(background.value))
		issues.push({
			path: `${prefix}/background/value`,
			message: "unsafe token value",
		});
	if (background?.kind !== "none" && background?.value === undefined) {
		if (background !== undefined)
			issues.push({
				path: `${prefix}/background/value`,
				message: "solid and gradient backgrounds require a value",
			});
	}
};

export function validateThemeTokens(
	input: unknown,
): ParseResult<ThemeTokensV0> {
	const parsed = validate<ThemeTokensV0>(THEME_TOKENS_SCHEMA, input);
	if (!parsed.ok) return parsed;
	const issues: ParseIssue[] = [];
	const tokens = parsed.value;
	checkGroups(tokens, "", issues);
	if (tokens.light) checkGroups(tokens.light, "/light", issues);
	if (tokens.dark) checkGroups(tokens.dark, "/dark", issues);
	for (const [key, family] of [
		["family", tokens.font?.family],
		["monoFamily", tokens.font?.monoFamily],
	] as const) {
		if (
			family !== undefined &&
			(unsafeCss.test(family) || !safeFontFamily.test(family))
		)
			issues.push({ path: `/font/${key}`, message: "unsafe font family" });
	}
	const radius = tokens.spacing?.radius;
	if (
		radius !== undefined &&
		(unsafeCss.test(radius) || !safeLength.test(radius))
	)
		issues.push({ path: "/spacing/radius", message: "unsafe length token" });
	return issues.length === 0 ? parsed : { ok: false, issues };
}
