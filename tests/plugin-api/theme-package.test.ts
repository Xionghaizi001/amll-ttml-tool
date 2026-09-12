import { describe, expect, it } from "vitest";
import { parseThemePackage } from "@amll-ttml-tool/plugin-api/theme-package";

const manifest = {
	id: "dev.amll.theme.midnight",
	name: "Midnight",
	version: "1.0.0",
	kind: "theme",
	themeApiVersion: 0,
	runtime: "none",
	appearance: "dark",
	tokens: "tokens.json",
	styles: ["theme.css"],
} as const;

const validPackage = {
	packageVersion: 0,
	manifest,
	tokens: { tokenVersion: 0, color: { accent: "#7c5cff" } },
	styles: {
		"theme.css": `[data-slot="ribbon-bar"] { background: url(asset:bg.png); }`,
	},
	assets: { "bg.png": { mime: "image/png", data: "aGVsbG8=" } },
};

describe("parseThemePackage", () => {
	it("accepts a complete theme package and strips CSS comments", () => {
		const result = parseThemePackage(validPackage);
		expect(result.ok, JSON.stringify(result)).toBe(true);
	});

	it("rejects function manifests", () => {
		const result = parseThemePackage({
			...validPackage,
			manifest: {
				id: "dev.amll.fn",
				name: "fn",
				version: "1.0.0",
				kind: "function",
				apiVersion: 0,
				runtime: "extism-wasm",
				entry: "main.wasm",
				capabilities: ["lyrics.core"],
			},
			styles: undefined,
		});
		expect(result.ok).toBe(false);
	});

	it("rejects style files the manifest does not declare, and vice versa", () => {
		expect(parseThemePackage({ ...validPackage, styles: {} }).ok).toBe(false);
		expect(
			parseThemePackage({
				...validPackage,
				styles: {
					...validPackage.styles,
					"extra.css": `[data-slot="sidebar"] { color: red; }`,
				},
			}).ok,
		).toBe(false);
	});

	it("rejects CSS referencing assets the package does not carry", () => {
		const result = parseThemePackage({ ...validPackage, assets: undefined });
		expect(result.ok).toBe(false);
	});

	it("rejects unsafe tokens and out-of-scope CSS", () => {
		expect(
			parseThemePackage({
				...validPackage,
				tokens: { tokenVersion: 0, color: { accent: "url(https://x)" } },
			}).ok,
		).toBe(false);
		expect(
			parseThemePackage({
				...validPackage,
				styles: { "theme.css": "body { display: none; }" },
			}).ok,
		).toBe(false);
	});

	it("rejects surface image tokens referencing assets the package lacks", () => {
		expect(
			parseThemePackage({
				...validPackage,
				tokens: {
					tokenVersion: 0,
					surfaces: {
						titleBar: { kind: "image", value: "asset:missing.png" },
					},
				},
			}).ok,
		).toBe(false);
		expect(
			parseThemePackage({
				...validPackage,
				tokens: {
					tokenVersion: 0,
					surfaces: {
						titleBar: { kind: "image", value: "asset:bg.png" },
					},
				},
			}).ok,
		).toBe(true);
	});

	it("rejects disallowed asset mime types and malformed base64", () => {
		expect(
			parseThemePackage({
				...validPackage,
				assets: {
					"bg.png": { mime: "text/html", data: "aGVsbG8=" },
				},
			}).ok,
		).toBe(false);
		expect(
			parseThemePackage({
				...validPackage,
				assets: {
					"bg.png": { mime: "image/png", data: "not base64!!" },
				},
			}).ok,
		).toBe(false);
	});
});
