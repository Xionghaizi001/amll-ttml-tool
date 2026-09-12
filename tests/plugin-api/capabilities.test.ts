import { describe, expect, it } from "vitest";
import { negotiateCapabilities } from "@amll-ttml-tool/plugin-api/capabilities";
import { parseManifest, type FunctionPluginManifest } from "@amll-ttml-tool/plugin-api/manifest";

describe("negotiateCapabilities", () => {
	it("grants known capabilities and rejects unknown ones", () => {
		const result = negotiateCapabilities([
			"lyrics.core",
			"ui.notify",
			"lyrics.totally-fake",
			"lyrics",
		]);
		expect(result.granted).toEqual(["lyrics.core", "ui.notify"]);
		expect(result.rejected).toEqual(["lyrics.totally-fake", "lyrics"]);
	});

	it("does no prefix wildcarding", () => {
		const result = negotiateCapabilities(["lyrics.*"]);
		expect(result.granted).toEqual([]);
		expect(result.rejected).toEqual(["lyrics.*"]);
	});

	it("deduplicates requested capabilities", () => {
		const result = negotiateCapabilities(["ui.form", "ui.form"]);
		expect(result.granted).toEqual(["ui.form"]);
		expect(result.rejected).toEqual([]);
	});

	it("respects a narrower host support set", () => {
		const result = negotiateCapabilities(
			["lyrics.core", "storage.kv"],
			["lyrics.core"],
		);
		expect(result.granted).toEqual(["lyrics.core"]);
		expect(result.rejected).toEqual(["storage.kv"]);
	});
});

const validFunctionManifest: FunctionPluginManifest = {
	kind: "function",
	id: "dev.amll.time-shift",
	name: "Time Shift",
	version: "1.0.0",
	apiVersion: 0,
	runtime: "builtin",
	entry: "time-shift",
	capabilities: ["lyrics.core"],
};

describe("parseManifest", () => {
	it("accepts a valid function manifest", () => {
		const result = parseManifest(validFunctionManifest);
		expect(result.ok).toBe(true);
	});

	it("accepts a valid theme manifest", () => {
		const result = parseManifest({
			kind: "theme",
			id: "dev.amll.theme-sunset",
			name: "Sunset",
			version: "0.1.0",
			themeApiVersion: 0,
			runtime: "none",
			appearance: "dark",
			tokens: "tokens.json",
		});
		expect(result.ok).toBe(true);
	});

	it("rejects a non-object manifest", () => {
		expect(parseManifest("nope").ok).toBe(false);
		expect(parseManifest(null).ok).toBe(false);
		expect(parseManifest([]).ok).toBe(false);
	});

	it("rejects a missing kind discriminant", () => {
		const result = parseManifest({
			id: "dev.amll.x",
			name: "x",
			version: "1.0.0",
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe("invalid-params");
	});

	it("rejects a bad reverse-domain id", () => {
		const result = parseManifest({
			...validFunctionManifest,
			id: "not-an-id",
		});
		expect(result.ok).toBe(false);
	});

	it("rejects a non-semver version", () => {
		const result = parseManifest({
			...validFunctionManifest,
			version: "latest",
		});
		expect(result.ok).toBe(false);
	});

	it("rejects a non-https homepage", () => {
		const result = parseManifest({
			...validFunctionManifest,
			homepage: "http://example.com",
		});
		expect(result.ok).toBe(false);
	});

	it("rejects an apiVersion mismatch", () => {
		const result = parseManifest({
			...validFunctionManifest,
			apiVersion: 1,
		});
		expect(result.ok).toBe(false);
	});

	it("rejects trusted-js runtime in MVP", () => {
		const result = parseManifest({
			...validFunctionManifest,
			runtime: "trusted-js",
		});
		expect(result.ok).toBe(false);
	});

	it("rejects a builtin entry that looks like a path", () => {
		const result = parseManifest({
			...validFunctionManifest,
			entry: "dist/index.js",
		});
		expect(result.ok).toBe(false);
	});

	it("rejects unknown capabilities", () => {
		const result = parseManifest({
			...validFunctionManifest,
			capabilities: ["lyrics.core", "filesystem.root"],
		});
		expect(result.ok).toBe(false);
	});

	it("rejects command contribution ids without the plugin id prefix", () => {
		const result = parseManifest({
			...validFunctionManifest,
			contributes: {
				commands: [{ id: "someOtherPlugin.shift", title: "Shift" }],
			},
		});
		expect(result.ok).toBe(false);
	});

	it("accepts command contribution ids with the plugin id prefix", () => {
		const result = parseManifest({
			...validFunctionManifest,
			contributes: {
				commands: [{ id: "dev.amll.time-shift.shift", title: "Shift" }],
				menus: [{ command: "dev.amll.time-shift.shift", menu: "menu.tool" }],
			},
		});
		expect(result.ok).toBe(true);
	});

	it("rejects a theme manifest with executable runtime", () => {
		const result = parseManifest({
			kind: "theme",
			id: "dev.amll.theme-bad",
			name: "Bad",
			version: "1.0.0",
			themeApiVersion: 0,
			runtime: "builtin",
			appearance: "both",
			tokens: "tokens.json",
		});
		expect(result.ok).toBe(false);
	});

	it("rejects a theme manifest with an absolute tokens path", () => {
		const result = parseManifest({
			kind: "theme",
			id: "dev.amll.theme-bad",
			name: "Bad",
			version: "1.0.0",
			themeApiVersion: 0,
			runtime: "none",
			appearance: "both",
			tokens: "/etc/passwd",
		});
		expect(result.ok).toBe(false);
	});
});
