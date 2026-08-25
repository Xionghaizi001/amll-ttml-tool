/**
 * Built-in sample theme packages. They go through the exact same
 * parseThemePackage validation as third-party imports — being built in
 * grants no extra CSS powers.
 */

export const MIDNIGHT_THEME_ID = "builtin.theme.midnight";
export const PAPER_THEME_ID = "builtin.theme.paper";

const midnightTheme = {
	packageVersion: 0,
	manifest: {
		id: MIDNIGHT_THEME_ID,
		name: "Midnight Violet",
		version: "1.0.0",
		description: "深紫夜色主题，附带柔和的渐变背景",
		kind: "theme",
		themeApiVersion: 0,
		runtime: "none",
		appearance: "dark",
		tokens: "tokens.json",
		styles: ["theme.css"],
	},
	tokens: {
		tokenVersion: 0,
		color: {
			accent: "#9d85ff",
			panelBackground: "rgb(26 22 40 / 0.85)",
		},
		lyrics: {
			lineSelectedBackground: "rgb(157 133 255 / 0.16)",
			lineHoverBackground: "rgb(157 133 255 / 0.08)",
		},
		spectrogram: {
			background: "#161226",
			playhead: "#b7a4ff",
		},
		background: {
			kind: "gradient",
			value: "linear-gradient(160deg, #14101f 0%, #1c1630 55%, #251c42 100%)",
		},
		surfaces: {
			dropdownMenu: { kind: "solid", value: "rgb(30 24 48 / 0.97)" },
			playControls: { kind: "solid", value: "rgb(24 19 40 / 0.75)" },
			modalLarge: {
				kind: "gradient",
				value: "linear-gradient(180deg, #201a36 0%, #161226 100%)",
			},
		},
	},
	styles: {
		"theme.css": [
			'[data-slot="title-bar"] { background: rgb(18 14 30 / 0.55); }',
			'[data-slot="ribbon-bar"] { background: rgb(18 14 30 / 0.35); }',
			'[data-part="lyric-line"] { border-radius: 10px; }',
		].join("\n"),
	},
};

const paperTheme = {
	packageVersion: 0,
	manifest: {
		id: PAPER_THEME_ID,
		name: "Paper & Ink",
		version: "1.0.0",
		description: "米白纸墨主题，适合亮色环境",
		kind: "theme",
		themeApiVersion: 0,
		runtime: "none",
		appearance: "light",
		tokens: "tokens.json",
	},
	tokens: {
		tokenVersion: 0,
		color: {
			accent: "#8a6d3b",
			panelBackground: "rgb(246 242 234 / 0.92)",
		},
		lyrics: {
			lineSelectedBackground: "rgb(138 109 59 / 0.14)",
			lineHoverBackground: "rgb(138 109 59 / 0.07)",
		},
		background: { kind: "solid", value: "#f6f2ea" },
		dark: {
			// Keep the paper look readable if the user forces dark mode.
			color: { panelBackground: "rgb(44 40 34 / 0.92)" },
			background: { kind: "solid", value: "#2c2822" },
		},
	},
};

export const BUILTIN_THEME_PACKAGES: readonly unknown[] = [
	midnightTheme,
	paperTheme,
];
