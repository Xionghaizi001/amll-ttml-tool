import { describe, expect, it } from "vitest";
import {
	negotiateCapabilities,
	parseEnablement,
	parseFormSchema,
	parseManifest,
} from "@amll-ttml-tool/plugin-api";

describe("plugin-api v0 validation", () => {
	it("parses function and theme manifests as a discriminated union", () => {
		expect(
			parseManifest({
				kind: "function",
				id: "dev.amll.time-shift",
				name: "Time Shift",
				version: "0.1.0",
				apiVersion: 0,
				runtime: "builtin",
				entry: "time-shift",
				capabilities: ["lyrics.core", "ui.form"],
			}).ok,
		).toBe(true);
		expect(
			parseManifest({
				kind: "theme",
				id: "dev.amll.theme.clean",
				name: "Clean",
				version: "1.0.0",
				themeApiVersion: 0,
				runtime: "none",
				appearance: "both",
				tokens: "theme.json",
			}).ok,
		).toBe(true);
	});

	it("rejects unknown and duplicate capabilities", () => {
		const result = parseManifest({
			kind: "function",
			id: "dev.amll.invalid",
			name: "Invalid",
			version: "1.0.0",
			apiVersion: 0,
			runtime: "builtin",
			entry: "invalid",
			capabilities: ["lyrics.core", "lyrics.core", "network.any"],
		});
		expect(result.ok).toBe(false);
	});

	it("caps declarative form payload sizes", () => {
		expect(
			parseFormSchema({
				title: "x".repeat(4096),
				fields: [],
			}).ok,
		).toBe(false);
		expect(
			parseFormSchema({
				title: "Too many fields",
				fields: Array.from({ length: 65 }, (_, index) => ({
					kind: "boolean",
					key: `flag${index}`,
					label: `Flag ${index}`,
				})),
			}).ok,
		).toBe(false);
	});

	it("rejects mode (main page) declarations in every plugin manifest", () => {
		const result = parseManifest({
			kind: "function",
			id: "dev.amll.review",
			name: "Review",
			version: "0.1.0",
			apiVersion: 0,
			runtime: "trusted-js",
			entry: "plugin.js",
			capabilities: ["ui.form"],
			contributes: {
				modes: [{ modeId: "dev.amll.review.review", title: "Review" }],
			},
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.issues[0]?.path).toBe("$/contributes/modes");
			expect(result.error.message).toContain("trusted builtin scopes");
		}
	});

	it("validates declarative title bar action contributions", () => {
		const base = {
			kind: "function",
			id: "dev.amll.actions",
			name: "Actions",
			version: "0.1.0",
			apiVersion: 0,
			runtime: "trusted-js",
			entry: "plugin.js",
			capabilities: ["ui.form"],
		};
		const action = {
			command: "dev.amll.actions.run",
			icon: { source: "@fluentui/react-icons", name: "PlayRegular" },
			tooltip: { default: "Run", "zh-CN": "运行" },
			when: "mode == 'edit'",
		};
		expect(
			parseManifest({
				...base,
				contributes: { titleBarActions: [action] },
			}).ok,
		).toBe(true);
		// Command outside the plugin's namespace.
		expect(
			parseManifest({
				...base,
				contributes: {
					titleBarActions: [{ ...action, command: "file.save" }],
				},
			}).ok,
		).toBe(false);
		// Icons come from the host whitelist only.
		expect(
			parseManifest({
				...base,
				contributes: {
					titleBarActions: [
						{
							...action,
							icon: { source: "@fluentui/react-icons", name: "EvilSvg" },
						},
					],
				},
			}).ok,
		).toBe(false);
		// Per-plugin count cap.
		expect(
			parseManifest({
				...base,
				contributes: {
					titleBarActions: [1, 2, 3, 4].map((index) => ({
						...action,
						command: `dev.amll.actions.run${index}`,
					})),
				},
			}).ok,
		).toBe(false);
	});

	it("requires menu contributions to reference the plugin's own commands", () => {
		const manifest = {
			kind: "function",
			id: "dev.amll.example",
			name: "Example",
			version: "0.1.0",
			apiVersion: 0,
			runtime: "trusted-js",
			entry: "plugin.js",
			capabilities: ["ui.form"],
			contributes: {
				menus: [{ command: "file.save", menu: "menu.tool" }],
			},
		};
		expect(parseManifest(manifest).ok).toBe(false);
		expect(
			parseManifest({
				...manifest,
				contributes: {
					menus: [{ command: "dev.amll.example.run", menu: "menu.tool" }],
				},
			}).ok,
		).toBe(true);
	});

	it("validates lyric format contributions", () => {
		const base = {
			kind: "function",
			id: "dev.amll.formats",
			name: "Formats",
			version: "0.1.0",
			apiVersion: 0,
			runtime: "trusted-js",
			entry: "plugin.js",
		};
		const format = {
			id: "dev.amll.formats.krc",
			title: "KRC",
			extensions: ["krc"],
			import: true,
			export: true,
		};
		expect(
			parseManifest({
				...base,
				capabilities: ["lyrics.format"],
				contributes: { formats: [format] },
			}).ok,
		).toBe(true);
		// Capability declarations do not gate trusted-js format registration.
		expect(
			parseManifest({
				...base,
				capabilities: ["lyrics.core"],
				contributes: { formats: [format] },
			}).ok,
		).toBe(true);
		// 格式 id 必须落在插件命名空间内。
		expect(
			parseManifest({
				...base,
				capabilities: ["lyrics.format"],
				contributes: { formats: [{ ...format, id: "ttml" }] },
			}).ok,
		).toBe(false);
		// 至少启用导入或导出之一。
		expect(
			parseManifest({
				...base,
				capabilities: ["lyrics.format"],
				contributes: {
					formats: [{ ...format, import: false, export: false }],
				},
			}).ok,
		).toBe(false);
		// 扩展名必须是小写字母数字（无点）。
		expect(
			parseManifest({
				...base,
				capabilities: ["lyrics.format"],
				contributes: { formats: [{ ...format, extensions: [".KRC"] }] },
			}).ok,
		).toBe(false);
	});

	it("negotiates exact capabilities without prefix matching", () => {
		expect(
			negotiateCapabilities(
				["lyrics.core", "lyrics", "ui.form"],
				["lyrics.core", "storage.kv"],
			),
		).toEqual({ granted: ["lyrics.core"], rejected: ["lyrics", "ui.form"] });
		expect(
			negotiateCapabilities(
				["extensions.dev.amll.review", "extensions.dev.amll.other"],
				["extensions.dev.amll.review"],
			),
		).toEqual({
			granted: ["extensions.dev.amll.review"],
			rejected: ["extensions.dev.amll.other"],
		});
	});

	it("parses the restricted enablement expression language", () => {
		expect(
			parseEnablement("mode == 'edit' && hasSelection").unknownIdents,
		).toEqual([]);
		expect(() => parseEnablement("globalThis.alert(1)")).toThrow();
	});
});
