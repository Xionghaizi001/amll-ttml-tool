import { describe, expect, it } from "vitest";
import {
	getOverrideSurfaceKeys,
	parseManifest,
	parseOverridePayload,
	parseThemePackage,
	parseTrustedJsPackage,
	resolveOverridePayload,
	validatePackageResources,
	type FunctionPluginManifest,
	type PluginOverrideV0,
} from "@amll-ttml-tool/plugin-api";

const override: PluginOverrideV0 = {
	pluginId: "test.target",
	kind: "localization",
	entry: "strings/zh-CN.json",
};
const manifest: FunctionPluginManifest = {
	id: "test.language",
	name: "Language",
	version: "1.0.0",
	kind: "function",
	apiVersion: 0,
	runtime: "trusted-js",
	entry: "index.js",
	capabilities: [],
	dependencies: [{ id: "test.target", version: "^1.0.0" }],
	overrides: [override],
};
const payload = {
	"/commands/test.target.run/title": { default: "Run", "zh-CN": "运行" },
};
const pkg = {
	packageVersion: 0,
	manifest,
	code: "export function activate() {}",
	resources: { [override.entry]: payload },
};
const target: FunctionPluginManifest = {
	...manifest,
	id: "test.target",
	overrides: undefined,
	dependencies: undefined,
	contributes: {
		commands: [{ id: "test.target.run", title: "Run" }],
		menus: [{ menu: "menu.tool", command: "test.target.run" }],
		titleBarActions: [
			{
				command: "test.target.run",
				tooltip: "Run",
				icon: { source: "@fluentui/react-icons", name: "SettingsRegular" },
			},
		],
		settings: [
			{
				id: "test.target.settings",
				title: "Settings",
				form: {
					title: "Form",
					fields: [
						{
							kind: "group",
							id: "group",
							label: "Group",
							fields: [
								{
									kind: "select",
									key: "choice",
									label: "Choice",
									options: [{ value: "one", label: "One" }],
								},
								{ kind: "note", text: "Note" },
							],
						},
					],
					actions: [{ id: "apply", label: "Apply" }],
				},
			},
		],
	},
};

describe("scoped override protocol", () => {
	it("accepts function/theme declarations and validates the required target dependency", () => {
		expect(parseManifest(manifest).ok).toBe(true);
		for (const dependencies of [
			undefined,
			[],
			[{ id: "test.target", version: "*", optional: true }],
		])
			expect(parseManifest({ ...manifest, dependencies }).ok).toBe(false);
		expect(
			parseManifest({
				...manifest,
				overrides: [{ ...override, pluginId: manifest.id }],
			}).ok,
		).toBe(false);
		expect(
			parseManifest({ ...manifest, overrides: [override, override] }).ok,
		).toBe(false);
		expect(
			parseManifest({
				...manifest,
				overrides: [{ ...override, kind: "commands" }],
			}).ok,
		).toBe(false);
		expect(
			parseManifest({
				...manifest,
				overrides: [{ ...override, capabilities: [] }],
			}).ok,
		).toBe(false);
		const theme = {
			id: manifest.id,
			name: "Theme",
			version: "1.0.0",
			kind: "theme",
			themeApiVersion: 0,
			runtime: "none",
			appearance: "both",
			tokens: "theme.json",
			dependencies: manifest.dependencies,
			overrides: [override],
		};
		expect(
			parseThemePackage({
				packageVersion: 0,
				manifest: theme,
				tokens: { tokenVersion: 0 },
				resources: pkg.resources,
			}).ok,
		).toBe(true);
		expect(
			parseThemePackage({
				packageVersion: 0,
				manifest: theme,
				tokens: { tokenVersion: 0 },
			}).ok,
		).toBe(false);
	});
	it.each([
		"../x.json",
		"/x.json",
		"C:/x.json",
		"https://x/a.json",
		"a\\b.json",
		"a/./b.json",
		"a//b.json",
		"a/%2e%2e/b.json",
		"a.json?q=1",
		"a.js",
	])("rejects noncanonical resource path %s", (entry) => {
		expect(
			parseManifest({ ...manifest, overrides: [{ ...override, entry }] }).ok,
		).toBe(false);
	});
	it("enforces LocalizedText limits and rejects HTML and executable icon values", () => {
		const key = Object.keys(payload)[0];
		expect(
			parseOverridePayload("localization", { [key]: "x".repeat(2048) }).ok,
		).toBe(true);
		for (const value of [
			"x".repeat(2049),
			"<img src=x onerror=alert(1)>",
			{ default: "Safe", en: "<b>bad</b>" },
			{
				default: "Safe",
				...Object.fromEntries(
					Array.from({ length: 16 }, (_, i) => [`lang${i}`, "text"]),
				),
			},
		])
			expect(parseOverridePayload("localization", { [key]: value }).ok).toBe(
				false,
			);
		expect(
			parseOverridePayload("localization", { [key]: "1 < 2 & 3 > 2" }).ok,
		).toBe(true);
		for (const value of [
			"https://example.com/icon.svg",
			{ source: "svg", name: "x" },
			{ source: "@fluentui/react-icons", name: "Unknown" },
		])
			expect(
				parseOverridePayload("icons", {
					"/titleBarActions/test.target.run/icon": value,
				}).ok,
			).toBe(false);
		expect(
			parseOverridePayload("icons", {
				"/titleBarActions/test.target.run/icon":
					target.contributes?.titleBarActions?.[0].icon,
			}).ok,
		).toBe(true);
	});
	it("requires exactly the declared resources and enforces locale limits across files", () => {
		expect(parseTrustedJsPackage(pkg).ok).toBe(true);
		expect(parseTrustedJsPackage({ ...pkg, resources: undefined }).ok).toBe(
			false,
		);
		expect(
			parseTrustedJsPackage({
				...pkg,
				resources: { ...pkg.resources, "extra.json": {} },
			}).ok,
		).toBe(false);
		const declarations = Array.from({ length: 16 }, (_, i) => ({
			...override,
			entry: `strings/${i}.json`,
		}));
		const resources = Object.fromEntries(
			declarations.map((item, i) => [
				item.entry,
				{ "/strings/key": { default: "Text", [`lang${i}`]: "Text" } },
			]),
		);
		expect(
			validatePackageResources(
				{ ...manifest, overrides: declarations },
				resources,
			),
		).not.toHaveLength(0);
	});
	it("filters absent and forbidden keys with diagnostics without changing target behavior", () => {
		const before = JSON.stringify(target);
		const result = resolveOverridePayload(
			override,
			{
				...payload,
				"/commands/test.target.run/id": "evil",
				"/capabilities": "evil",
				"/commands/missing/title": "Missing",
				"/strings/private": "Unknown",
				"/strings/greeting": "Hello",
			},
			target,
			{ greeting: "Greeting" },
		);
		expect(result).toMatchObject({
			ok: true,
			value: { payload: { ...payload, "/strings/greeting": "Hello" } },
		});
		if (result.ok) expect(result.value.diagnostics).toHaveLength(4);
		expect(JSON.stringify(target)).toBe(before);
		expect(resolveOverridePayload(override, payload, manifest).ok).toBe(false);
		const keys = getOverrideSurfaceKeys(target, "localization");
		expect(
			keys.has(
				"/settings/test.target.settings/form/fields/0/fields/0/options/0/label",
			),
		).toBe(true);
		expect(
			keys.has("/settings/test.target.settings/form/fields/0/fields/1/text"),
		).toBe(true);
		expect(
			keys.has("/settings/test.target.settings/form/actions/0/label"),
		).toBe(true);
		expect(keys.has("/settings/test.target.settings/form/fields/0/id")).toBe(
			false,
		);
	});
});
