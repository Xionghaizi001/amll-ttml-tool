import type {
	ThemeSurfaceBackgroundV0,
	ThemeTokenModeOverridesV0,
	ThemeTokensV0,
} from "@amll-ttml-tool/plugin-api";
import { relativeLuminance } from "./readability";

export interface CompileThemeTokensOptions {
	/**
	 * Resolves an `asset:<name>` reference from an image surface to a local
	 * URL. Unresolved assets degrade to about:invalid so nothing is fetched.
	 */
	resolveAsset?: (name: string) => string | null;
}

const kebab = (name: string): string =>
	name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);

/** Parses #rgb/#rrggbb(aa) and rgb()/rgba() forms; anything else is null. */
const parseSimpleColor = (
	value: string,
): { r: number; g: number; b: number } | null => {
	const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value.trim());
	if (hex) {
		const digits = hex[1];
		if (digits.length === 3)
			return {
				r: Number.parseInt(digits[0] + digits[0], 16),
				g: Number.parseInt(digits[1] + digits[1], 16),
				b: Number.parseInt(digits[2] + digits[2], 16),
			};
		return {
			r: Number.parseInt(digits.slice(0, 2), 16),
			g: Number.parseInt(digits.slice(2, 4), 16),
			b: Number.parseInt(digits.slice(4, 6), 16),
		};
	}
	const rgb = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i.exec(
		value.trim(),
	);
	if (rgb)
		return {
			r: Math.min(255, Number(rgb[1])),
			g: Math.min(255, Number(rgb[2])),
			b: Math.min(255, Number(rgb[3])),
		};
	return null;
};

/** Text color that keeps ≥ minimum contrast on top of a solid accent. */
export const accentContrastColor = (
	accent: string,
): "white" | "black" | null => {
	const parsed = parseSimpleColor(accent);
	if (parsed === null) return null;
	return relativeLuminance(parsed) >= 0.45 ? "black" : "white";
};

const surfaceDeclarations = (
	name: string,
	surface: ThemeSurfaceBackgroundV0,
	resolveAsset: CompileThemeTokensOptions["resolveAsset"],
): string[] => {
	const varName = `--attt-surface-${kebab(name)}`;
	const declarations: string[] = [];
	if (surface.kind === "none") {
		// `initial` makes the custom property guaranteed-invalid, so the
		// bridge var() falls back as if the theme never set it.
		declarations.push(`${varName}: initial;`);
		declarations.push(`${varName}-image: initial;`);
		declarations.push(`${varName}-scrim: initial;`);
		return declarations;
	}
	if (surface.kind === "image") {
		const assetRef = (surface.value ?? "").slice("asset:".length);
		const resolved = resolveAsset?.(assetRef) ?? null;
		declarations.push(
			`${varName}-image: url("${resolved ?? "about:invalid"}");`,
		);
	} else if (surface.kind === "gradient" && surface.value) {
		// Gradients are <image> values: they must land in the -image variable
		// or background-color would silently drop them.
		declarations.push(`${varName}-image: ${surface.value};`);
		declarations.push(`${varName}: initial;`);
	} else if (surface.value) {
		declarations.push(`${varName}: ${surface.value};`);
		declarations.push(`${varName}-image: initial;`);
	}
	if (surface.scrim) declarations.push(`${varName}-scrim: ${surface.scrim};`);
	return declarations;
};

const groupDeclarations = (
	groups: ThemeTokenModeOverridesV0 & Pick<ThemeTokensV0, "color">,
	resolveAsset: CompileThemeTokensOptions["resolveAsset"],
): string[] => {
	const declarations: string[] = [];
	for (const [groupName, group] of [
		["color", groups.color],
		["lyrics", groups.lyrics],
		["spectrogram", groups.spectrogram],
	] as const) {
		for (const [name, value] of Object.entries(group ?? {}))
			declarations.push(`--attt-${groupName}-${kebab(name)}: ${value};`);
	}
	const accent = groups.color?.accent;
	if (accent !== undefined) {
		const contrast = accentContrastColor(accent);
		if (contrast !== null)
			declarations.push(`--attt-color-accent-contrast: ${contrast};`);
	}
	const background = groups.background;
	if (background && background.kind !== "none" && background.value)
		declarations.push(`--attt-app-background: ${background.value};`);
	for (const [name, surface] of Object.entries<
		ThemeSurfaceBackgroundV0 | undefined
	>(groups.surfaces ?? {})) {
		if (surface !== undefined)
			declarations.push(...surfaceDeclarations(name, surface, resolveAsset));
	}
	return declarations;
};

const block = (selector: string, declarations: string[]): string =>
	declarations.length === 0
		? ""
		: `${selector} {\n\t${declarations.join("\n\t")}\n}`;

/**
 * Compiles validated theme tokens into CSS custom property declarations.
 * Appearance-specific overrides key off the data-amll-appearance attribute
 * the host keeps in sync with its dark mode state. The output is raw CSS;
 * the style sink adapter wraps it in the right cascade layer.
 */
export function compileThemeTokensCss(
	tokens: ThemeTokensV0,
	options: CompileThemeTokensOptions = {},
): string {
	const baseDeclarations = groupDeclarations(tokens, options.resolveAsset);
	if (tokens.font?.family)
		baseDeclarations.push(`--attt-font-family: ${tokens.font.family};`);
	if (tokens.font?.monoFamily)
		baseDeclarations.push(
			`--attt-font-mono-family: ${tokens.font.monoFamily};`,
		);
	if (tokens.font?.scale !== undefined)
		baseDeclarations.push(`--attt-font-scale: ${tokens.font.scale};`);
	if (tokens.spacing?.scale !== undefined)
		baseDeclarations.push(`--attt-spacing-scale: ${tokens.spacing.scale};`);
	if (tokens.spacing?.radius)
		baseDeclarations.push(`--attt-spacing-radius: ${tokens.spacing.radius};`);
	const sections = [
		block(":root", baseDeclarations),
		tokens.light
			? block(
					':root[data-amll-appearance="light"]',
					groupDeclarations(tokens.light, options.resolveAsset),
				)
			: "",
		tokens.dark
			? block(
					':root[data-amll-appearance="dark"]',
					groupDeclarations(tokens.dark, options.resolveAsset),
				)
			: "",
	];
	return sections.filter(Boolean).join("\n");
}
