import { THEME_TOKENS_SCHEMA } from "./schema/schemas";
import { validate } from "./schema/validator";
import type { ParseIssue, ParseResult, ThemeTokensV0 } from "./types";

const unsafeCss = /(?:url\s*\(|var\s*\(|expression\s*\(|@import|https?:)/i;
const safeColor =
	/^(?:#[0-9a-f]{3}(?:[0-9a-f]{3})?(?:[0-9a-f]{2})?|(?:rgb|rgba|hsl|hsla|oklch|color-mix)\([^;{}]+\)|[a-z]+)$/i;
const safeLength = /^(?:0|(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:px|rem|em|%))$/;

export function validateThemeTokens(
	input: unknown,
): ParseResult<ThemeTokensV0> {
	const parsed = validate<ThemeTokensV0>(THEME_TOKENS_SCHEMA, input);
	if (!parsed.ok) return parsed;
	const issues: ParseIssue[] = [];
	for (const [name, value] of Object.entries(parsed.value.color ?? {})) {
		if (unsafeCss.test(value) || !safeColor.test(value))
			issues.push({ path: `/color/${name}`, message: "unsafe color token" });
	}
	const radius = parsed.value.spacing?.radius;
	if (
		radius !== undefined &&
		(unsafeCss.test(radius) || !safeLength.test(radius))
	)
		issues.push({ path: "/spacing/radius", message: "unsafe length token" });
	for (const [groupName, group] of [
		["lyrics", parsed.value.lyrics],
		["spectrogram", parsed.value.spectrogram],
	] as const) {
		for (const [name, value] of Object.entries(group ?? {})) {
			if (unsafeCss.test(value))
				issues.push({
					path: `/${groupName}/${name}`,
					message: "unsafe token value",
				});
		}
	}
	return issues.length === 0 ? parsed : { ok: false, issues };
}
