import { describe, expect, it } from "vitest";
import { validateThemeTokens } from "@amll-ttml-tool/plugin-api/theme-tokens";

const base = { tokenVersion: 0 } as const;

describe("validateThemeTokens", () => {
	it("accepts a full token set with light and dark overrides", () => {
		const result = validateThemeTokens({
			...base,
			color: { accent: "#7c5cff", panelBackground: "rgb(20 20 28 / 0.8)" },
			font: { family: "MiSans, sans-serif", scale: 1.1 },
			spacing: { scale: 1, radius: "8px" },
			lyrics: { lineSelectedBackground: "oklch(0.4 0.1 300 / 0.4)" },
			spectrogram: { background: "#101018" },
			background: { kind: "gradient", value: "linear-gradient(#111, #223)" },
			dark: { color: { accent: "#9d85ff" } },
			light: { background: { kind: "solid", value: "#f6f3ee" } },
		});
		expect(result.ok, JSON.stringify(result)).toBe(true);
	});

	it("rejects unknown token names", () => {
		const result = validateThemeTokens({
			...base,
			color: { evilToken: "#fff" },
		});
		expect(result.ok).toBe(false);
	});

	it("rejects unsafe values in any group, including mode overrides", () => {
		for (const tokens of [
			{ ...base, color: { accent: "url(https://x)" } },
			{ ...base, lyrics: { lineBackground: "red; } body { display: none" } },
			{ ...base, background: { kind: "solid", value: "url(x)" } },
			{ ...base, dark: { color: { accent: "expression(alert(1))" } } },
			{ ...base, font: { family: "x; @import url(y)" } },
			{ ...base, spacing: { radius: "calc(1px + 100vw)" } },
		]) {
			expect(validateThemeTokens(tokens).ok, JSON.stringify(tokens)).toBe(
				false,
			);
		}
	});

	it("requires a value for solid and gradient backgrounds", () => {
		expect(
			validateThemeTokens({ ...base, background: { kind: "solid" } }).ok,
		).toBe(false);
		expect(
			validateThemeTokens({ ...base, background: { kind: "none" } }).ok,
		).toBe(true);
	});

	it("rejects unknown token versions", () => {
		expect(validateThemeTokens({ tokenVersion: 1 }).ok).toBe(false);
	});

	it("accepts surface backgrounds of every kind", () => {
		const result = validateThemeTokens({
			...base,
			surfaces: {
				titleBar: { kind: "solid", value: "#101018" },
				ribbonBar: {
					kind: "gradient",
					value: "linear-gradient(#111, #223)",
					scrim: "rgb(0 0 0 / 0.3)",
				},
				dropdownMenu: { kind: "image", value: "asset:menu.png" },
				modalLarge: { kind: "solid", value: "#181420" },
			},
		});
		expect(result.ok, JSON.stringify(result)).toBe(true);
	});

	it("rejects unknown surfaces and unsafe surface values", () => {
		expect(
			validateThemeTokens({
				...base,
				surfaces: { statusBar: { kind: "solid", value: "#111" } },
			}).ok,
		).toBe(false);
		expect(
			validateThemeTokens({
				...base,
				surfaces: {
					titleBar: { kind: "solid", value: "url(https://x)" },
				},
			}).ok,
		).toBe(false);
		expect(
			validateThemeTokens({
				...base,
				surfaces: {
					titleBar: { kind: "image", value: "https://evil/x.png" },
				},
			}).ok,
		).toBe(false);
		expect(
			validateThemeTokens({
				...base,
				surfaces: {
					titleBar: {
						kind: "solid",
						value: "#111",
						scrim: "expression(alert(1))",
					},
				},
			}).ok,
		).toBe(false);
	});

	it("enforces the modal fallback chain: medium/small require large", () => {
		expect(
			validateThemeTokens({
				...base,
				surfaces: { modalMedium: { kind: "solid", value: "#111" } },
			}).ok,
		).toBe(false);
		expect(
			validateThemeTokens({
				...base,
				surfaces: { modalSmall: { kind: "solid", value: "#111" } },
			}).ok,
		).toBe(false);
		expect(
			validateThemeTokens({
				...base,
				surfaces: { modalLarge: { kind: "solid", value: "#111" } },
			}).ok,
		).toBe(true);
		expect(
			validateThemeTokens({
				...base,
				surfaces: {
					modalLarge: { kind: "solid", value: "#111" },
					modalSmall: { kind: "solid", value: "#222" },
				},
			}).ok,
		).toBe(true);
		// A dark override may not disable large while medium stays configured.
		expect(
			validateThemeTokens({
				...base,
				surfaces: {
					modalLarge: { kind: "solid", value: "#111" },
					modalMedium: { kind: "solid", value: "#222" },
				},
				dark: { surfaces: { modalLarge: { kind: "none" } } },
			}).ok,
		).toBe(false);
	});

	it("allows skipping the intra-set modal rule for layered user overrides", () => {
		expect(
			validateThemeTokens(
				{
					...base,
					surfaces: { modalMedium: { kind: "solid", value: "#111" } },
				},
				{ requireModalFallbackChain: false },
			).ok,
		).toBe(true);
	});

	it("requires base definitions for flag-gated mode overrides", () => {
		expect(
			validateThemeTokens({
				...base,
				dark: { color: { accent: "#9d85ff" } },
			}).ok,
		).toBe(false);
		expect(
			validateThemeTokens({
				...base,
				dark: { surfaces: { titleBar: { kind: "solid", value: "#111" } } },
			}).ok,
		).toBe(false);
		expect(
			validateThemeTokens({
				...base,
				color: { accent: "#7c5cff" },
				surfaces: { titleBar: { kind: "solid", value: "#f6f2ea" } },
				dark: {
					color: { accent: "#9d85ff" },
					surfaces: { titleBar: { kind: "solid", value: "#111" } },
				},
			}).ok,
		).toBe(true);
	});
});
