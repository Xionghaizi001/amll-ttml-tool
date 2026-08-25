import type {
	ThemeTokenModeOverridesV0,
	ThemeTokensV0,
} from "@amll-ttml-tool/plugin-api";

const kebab = (name: string): string =>
	name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);

const groupDeclarations = (
	groups: ThemeTokenModeOverridesV0 & Pick<ThemeTokensV0, "color">,
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
	const background = groups.background;
	if (background && background.kind !== "none" && background.value)
		declarations.push(`--attt-app-background: ${background.value};`);
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
export function compileThemeTokensCss(tokens: ThemeTokensV0): string {
	const baseDeclarations = groupDeclarations(tokens);
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
					groupDeclarations(tokens.light),
				)
			: "",
		tokens.dark
			? block(
					':root[data-amll-appearance="dark"]',
					groupDeclarations(tokens.dark),
				)
			: "",
	];
	return sections.filter(Boolean).join("\n");
}
