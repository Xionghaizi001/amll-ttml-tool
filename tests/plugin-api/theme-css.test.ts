import { describe, expect, it } from "vitest";
import { substituteThemeAssetUrls, validateThemeCss } from "@amll-ttml-tool/plugin-api/theme-css";

const expectIssues = (css: string, messagePart: string) => {
	const result = validateThemeCss(css);
	expect(result.ok).toBe(false);
	if (result.ok) return;
	expect(
		result.issues.some((issue) => issue.message.includes(messagePart)),
		result.issues.map((issue) => issue.message).join("; "),
	).toBe(true);
};

describe("validateThemeCss", () => {
	it("accepts slot-scoped rules, media queries and appearance prefixes", () => {
		const result = validateThemeCss(`
			/* decorate the ribbon */
			[data-slot="ribbon-bar"] { background: rgb(20 20 28 / 0.6); }
			[data-slot="sidebar"] .panel > [data-part="lyric-line"]:hover,
			[data-part="lyric-word"] { color: oklch(0.8 0.1 150); }
			[data-amll-appearance="dark"] [data-slot="lyric-editor"] {
				border-radius: 8px;
			}
			@media (max-width: 800px) {
				[data-slot="audio-controls"] { gap: 4px; }
			}
		`);
		expect(result.ok, JSON.stringify(result)).toBe(true);
	});

	it("strips comments from the returned CSS", () => {
		const result = validateThemeCss(
			`/* note */[data-slot="sidebar"] { color: red; }`,
		);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value).not.toContain("note");
	});

	it("rejects @import and other at-rules", () => {
		expectIssues(`@import url(other.css);`, "@import is not allowed");
		expectIssues(
			`@layer amll.base { [data-slot="sidebar"] { color: red; } }`,
			"@layer is not allowed",
		);
		expectIssues(
			`@keyframes spin { from { transform: none; } }`,
			"@keyframes is not allowed",
		);
	});

	it("rejects remote and scheme URLs even inside url()", () => {
		expectIssues(
			`[data-slot="sidebar"] { background: url(https://evil.example/x.png); }`,
			"remote or scheme URLs are not allowed",
		);
		expectIssues(
			`[data-slot="sidebar"] { background: url(asset:../escape); }`,
			"url() may only reference package assets",
		);
	});

	it("requires url() to reference known package assets", () => {
		const good = validateThemeCss(
			`[data-slot="background-layer"] { background-image: url(asset:bg.png); }`,
			{ assetNames: ["bg.png"] },
		);
		expect(good.ok).toBe(true);
		const bad = validateThemeCss(
			`[data-slot="background-layer"] { background-image: url(asset:missing); }`,
			{ assetNames: ["bg.png"] },
		);
		expect(bad.ok).toBe(false);
	});

	it("rejects selectors that are not scoped to a published slot or part", () => {
		expectIssues(`body { display: none; }`, "must be scoped");
		expectIssues(`:root { --x: 1; }`, "must be scoped");
		expectIssues(`* [data-slot="sidebar"] { color: red; }`, "must be scoped");
		expectIssues(`.rt-DialogOverlay { display: none; }`, "must be scoped");
		expectIssues(
			`[data-slot="sidebar"], body { color: red; }`,
			"must be scoped",
		);
		expectIssues(
			`[data-slot="not-a-slot"] { color: red; }`,
			'unknown data-slot "not-a-slot"',
		);
	});

	it("rejects any reference to protected host regions", () => {
		expectIssues(
			`[data-slot="sidebar"][data-amll-protected] { display: none; }`,
			"protected host regions",
		);
	});

	it("rejects !important so user overrides always win", () => {
		expectIssues(
			`[data-slot="sidebar"] { display: none !important; }`,
			"!important is not allowed",
		);
	});

	it("rejects escape sequences that could smuggle keywords", () => {
		expectIssues(
			`[data-slot="sidebar"] { background: \\75rl(https://evil); }`,
			"escape sequences are not allowed",
		);
	});

	it("rejects structural characters inside strings", () => {
		expectIssues(
			`[data-slot="sidebar"] { content: "a;b{c}"; }`,
			"forbidden characters",
		);
		expectIssues(
			`[data-slot="sidebar"] { content: "http://x"; }`,
			"forbidden characters",
		);
	});

	it("rejects nested style rules and unbalanced braces", () => {
		expectIssues(
			`[data-slot="sidebar"] { .child { color: red; } }`,
			"nested rules are not allowed",
		);
		expectIssues(`[data-slot="sidebar"] { color: red;`, "unbalanced braces");
	});

	it("rejects oversized CSS", () => {
		const result = validateThemeCss("a".repeat(200000));
		expect(result.ok).toBe(false);
	});
});

describe("substituteThemeAssetUrls", () => {
	it("replaces asset references with resolved local URLs", () => {
		const css = `[data-slot="sidebar"] { background: url(asset:bg.png); }`;
		expect(substituteThemeAssetUrls(css, () => "blob:abc")).toContain(
			'url("blob:abc")',
		);
	});

	it("degrades unresolved assets to about:invalid", () => {
		const css = `[data-slot="sidebar"] { background: url(asset:bg.png); }`;
		expect(substituteThemeAssetUrls(css, () => null)).toContain(
			'url("about:invalid")',
		);
	});
});
