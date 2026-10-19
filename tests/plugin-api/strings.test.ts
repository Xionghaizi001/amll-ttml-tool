import { describe, expect, it } from "vitest";
import {
	formatPluginString,
	getOverrideSurfaceKeys,
	localizeText,
	parseManifest,
	parseStringTable,
	parseTrustedJsPackage,
	resolveOverridePayload,
	resolvePluginStrings,
	type FunctionPluginManifest,
} from "@amll-ttml-tool/plugin-api";

const manifest: FunctionPluginManifest = {
	id: "test.target",
	name: "Target",
	version: "1.0.0",
	kind: "function",
	apiVersion: 0,
	runtime: "trusted-js",
	entry: "index.js",
	capabilities: [],
	contributes: { strings: ["strings/base.json", "strings/ja.json"] },
};
const resources = {
	"strings/base.json": {
		greeting: { default: "Hello {name}", "zh-CN": "你好 {name}" },
		"status.done": "Done",
	},
	"strings/ja.json": { greeting: { ja: "こんにちは {name}" } },
};
const pkg = (overrides: Record<string, unknown> = {}) => ({
	packageVersion: 0,
	manifest,
	code: "export function activate() {}",
	resources,
	...overrides,
});

describe("plugin string tables", () => {
	it("merges per-locale files into one table", () => {
		expect(parseTrustedJsPackage(pkg()).ok).toBe(true);
		expect(resolvePluginStrings(manifest, resources)).toEqual({
			greeting: {
				default: "Hello {name}",
				"zh-CN": "你好 {name}",
				ja: "こんにちは {name}",
			},
			"status.done": { default: "Done" },
		});
	});

	it("requires exactly the declared files, a default per key and unique locales", () => {
		for (const bad of [
			{ resources: { "strings/base.json": resources["strings/base.json"] } },
			{ resources: { ...resources, "strings/extra.json": {} } },
			{ resources: { ...resources, "strings/ja.json": { orphan: { ja: "x" } } } },
			{
				resources: {
					...resources,
					"strings/ja.json": { greeting: { "zh-CN": "重复" } },
				},
			},
			{
				resources: {
					...resources,
					"strings/ja.json": {
						greeting: Object.fromEntries(
							Array.from({ length: 15 }, (_, i) => [`l${i}`, "x"]),
						),
					},
				},
			},
		])
			expect(parseTrustedJsPackage(pkg(bad)).ok).toBe(false);
		expect(resolvePluginStrings(manifest, {})).toEqual({});
	});

	it("rejects bad keys, empty entries, HTML and oversize text", () => {
		for (const table of [
			{ "a/b": "x" },
			{ ".hidden": "x" },
			{ ["k".repeat(129)]: "x" },
			{ key: {} },
			{ key: "<b>x</b>" },
			{ key: { default: "ok", en: "<img src=x>" } },
			{ key: "x".repeat(2049) },
			{ key: "" },
		])
			expect(parseStringTable(table).ok).toBe(false);
		expect(parseStringTable({ "a.b-c_1": "1 < 2" }).ok).toBe(true);
	});

	it("declares string files only as canonical, unshared package resources", () => {
		expect(parseManifest(manifest).ok).toBe(true);
		for (const strings of [["../x.json"], ["strings/a.js"], ["/a.json"]])
			expect(
				parseManifest({ ...manifest, contributes: { strings } }).ok,
			).toBe(false);
		expect(
			parseManifest({
				...manifest,
				dependencies: [{ id: "test.other", version: "*" }],
				overrides: [
					{ pluginId: "test.other", kind: "localization", entry: "strings/ja.json" },
				],
			}).ok,
		).toBe(false);
	});

	it("feeds /strings/<key> override addresses and localizes with fallback", () => {
		const strings = resolvePluginStrings(manifest, resources);
		const keys = getOverrideSurfaceKeys(manifest, "localization", strings);
		expect(keys.has("/strings/greeting")).toBe(true);
		expect(keys.has("/strings/status.done")).toBe(true);
		const resolved = resolveOverridePayload(
			{ pluginId: manifest.id, kind: "localization", entry: "x.json" },
			{ "/strings/greeting": "Hi", "/strings/missing": "?" },
			manifest,
			strings,
		);
		expect(resolved).toMatchObject({
			ok: true,
			value: { payload: { "/strings/greeting": "Hi" } },
		});
		expect(localizeText(strings.greeting, "zh-CN")).toBe("你好 {name}");
		expect(localizeText(strings.greeting, "ja-JP")).toBe("こんにちは {name}");
		expect(localizeText(strings.greeting, "fr")).toBe("Hello {name}");
		expect(formatPluginString("{name}: {n} {unknown}", { name: "A", n: 2 })).toBe(
			"A: 2 {unknown}",
		);
	});
});
