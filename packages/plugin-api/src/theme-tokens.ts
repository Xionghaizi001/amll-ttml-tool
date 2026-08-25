import { THEME_TOKENS_SCHEMA } from "./schema/schemas";
import { validate } from "./schema/validator";
import type {
	ParseIssue,
	ParseResult,
	ThemeSurfaceBackgroundV0,
	ThemeTokenModeOverridesV0,
	ThemeTokenSurfacesV0,
	ThemeTokensV0,
} from "./types";

const unsafeCss =
	/(?:url\s*\(|var\s*\(|expression\s*\(|@import|https?:|data:|\\|[;{}])/i;
const safeColor =
	/^(?:#[0-9a-f]{3}(?:[0-9a-f]{3})?(?:[0-9a-f]{2})?|(?:rgb|rgba|hsl|hsla|oklch|color-mix)\([^;{}]+\)|[a-z]+)$/i;
const safeLength = /^(?:0|(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:px|rem|em|%))$/;
const safeFontFamily = /^[\p{L}\p{N}\s"',_-]+$/u;
const assetReference = /^asset:[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/** True when the value is a safe standalone CSS color (no indirection). */
export const isSafeThemeColor = (value: string): boolean =>
	!unsafeCss.test(value) && safeColor.test(value);

type TokenGroups = ThemeTokenModeOverridesV0 & Pick<ThemeTokensV0, "color">;

const checkSurface = (
	name: string,
	surface: ThemeSurfaceBackgroundV0,
	prefix: string,
	issues: ParseIssue[],
): void => {
	const path = `${prefix}/surfaces/${name}`;
	if (surface.kind === "none") {
		if (surface.value !== undefined)
			issues.push({
				path: `${path}/value`,
				message: '"none" surfaces must not carry a value',
			});
	} else if (surface.value === undefined) {
		issues.push({ path: `${path}/value`, message: "surface requires a value" });
	} else if (surface.kind === "image") {
		if (!assetReference.test(surface.value))
			issues.push({
				path: `${path}/value`,
				message: "image surfaces must reference a package asset (asset:<name>)",
			});
	} else if (surface.kind === "gradient") {
		if (unsafeCss.test(surface.value) || !/gradient\s*\(/i.test(surface.value))
			issues.push({
				path: `${path}/value`,
				message: "gradient surfaces must be a safe CSS gradient",
			});
	} else if (unsafeCss.test(surface.value) || !safeColor.test(surface.value)) {
		issues.push({ path: `${path}/value`, message: "unsafe surface value" });
	}
	if (
		surface.scrim !== undefined &&
		(unsafeCss.test(surface.scrim) || !safeColor.test(surface.scrim))
	)
		issues.push({ path: `${path}/scrim`, message: "unsafe scrim color" });
};

const checkGroups = (
	groups: TokenGroups,
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
	for (const [name, surface] of Object.entries<
		ThemeSurfaceBackgroundV0 | undefined
	>(groups.surfaces ?? {})) {
		if (surface !== undefined) checkSurface(name, surface, prefix, issues);
	}
};

/**
 * Modal surfaces fall back small → medium → large; a token set (after
 * merging appearance overrides onto the base) that styles medium or small
 * without large would leave most dialogs unstyled while claiming coverage,
 * so it is rejected.
 */
export const checkModalSurfaceRule = (
	surfaces: ThemeTokenSurfacesV0 | undefined,
	prefix: string,
	issues: ParseIssue[],
): void => {
	const effective = (name: keyof ThemeTokenSurfacesV0): boolean => {
		const surface = surfaces?.[name];
		return surface !== undefined && surface.kind !== "none";
	};
	if (
		(effective("modalMedium") || effective("modalSmall")) &&
		!effective("modalLarge")
	)
		issues.push({
			path: `${prefix}/surfaces`,
			message:
				"modalMedium/modalSmall require modalLarge (modal backgrounds fall back small -> medium -> large)",
		});
};

const mergedSurfaces = (
	base: ThemeTokenSurfacesV0 | undefined,
	mode: ThemeTokenSurfacesV0 | undefined,
): ThemeTokenSurfacesV0 => ({ ...base, ...mode });

export interface ThemeTokenValidationOptions {
	/**
	 * Enforce the modal fallback chain (medium/small require large) inside
	 * this token set. Defaults to true; a host validating user overrides that
	 * layer on top of a theme checks the rule against the combined effective
	 * configuration instead.
	 */
	requireModalFallbackChain?: boolean;
}

export function validateThemeTokens(
	input: unknown,
	options: ThemeTokenValidationOptions = {},
): ParseResult<ThemeTokensV0> {
	const parsed = validate<ThemeTokensV0>(THEME_TOKENS_SCHEMA, input);
	if (!parsed.ok) return parsed;
	const issues: ParseIssue[] = [];
	const tokens = parsed.value;
	checkGroups(tokens, "", issues);
	if (tokens.light) checkGroups(tokens.light, "/light", issues);
	if (tokens.dark) checkGroups(tokens.dark, "/dark", issues);
	// Flag-gated tokens (accent, surfaces) must exist at the base level:
	// their bridges activate per token, not per appearance, so a mode-only
	// definition would leave the other appearance without a value.
	for (const [modeName, mode] of [
		["light", tokens.light],
		["dark", tokens.dark],
	] as const) {
		if (mode?.color?.accent !== undefined && tokens.color?.accent === undefined)
			issues.push({
				path: `/${modeName}/color/accent`,
				message: "appearance override requires a base accent token",
			});
		for (const name of Object.keys(mode?.surfaces ?? {})) {
			if (tokens.surfaces?.[name as keyof ThemeTokenSurfacesV0] === undefined)
				issues.push({
					path: `/${modeName}/surfaces/${name}`,
					message: "appearance override requires the base surface token",
				});
		}
	}
	if (options.requireModalFallbackChain !== false) {
		checkModalSurfaceRule(tokens.surfaces, "", issues);
		if (tokens.light)
			checkModalSurfaceRule(
				mergedSurfaces(tokens.surfaces, tokens.light.surfaces),
				"/light",
				issues,
			);
		if (tokens.dark)
			checkModalSurfaceRule(
				mergedSurfaces(tokens.surfaces, tokens.dark.surfaces),
				"/dark",
				issues,
			);
	}
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
