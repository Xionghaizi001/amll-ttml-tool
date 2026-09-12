import { describe, expect, it } from "vitest";
import {
	negotiateCapabilities,
	parseEnablement,
	parseFormatConversionResult,
	parseFormSchema,
	parseHostCall,
	parseManifest,
	parsePluginReturn,
	requiredCapabilitiesForCall,
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

	it("validates form key uniqueness and host method params", () => {
		expect(
			parseFormSchema({
				title: "Form",
				fields: [
					{ kind: "text", key: "same", label: "One" },
					{ kind: "boolean", key: "same", label: "Two" },
				],
			}).ok,
		).toBe(false);
		expect(
			parseHostCall({
				id: "notify",
				method: "ui.notify",
				params: { level: "info", message: "Ready" },
			}).ok,
		).toBe(true);
	});

	it("applies form semantic validation to ui.showForm host calls", () => {
		expect(
			parseHostCall({
				id: "form",
				method: "ui.showForm",
				params: {
					schema: {
						title: "Form",
						fields: [
							{ kind: "text", key: "same", label: "One" },
							{ kind: "boolean", key: "same", label: "Two" },
						],
					},
				},
			}).ok,
		).toBe(false);
		expect(
			parseHostCall({
				id: "form",
				method: "ui.showForm",
				params: {
					schema: {
						title: "Form",
						fields: [{ kind: "text", key: "name", label: "Name" }],
					},
				},
			}).ok,
		).toBe(true);
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
			runtime: "extism-wasm",
			entry: "plugin.wasm",
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
			runtime: "extism-wasm",
			entry: "plugin.wasm",
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

	it("validates enum-only form animation presets", () => {
		expect(
			parseFormSchema({
				title: "Animated",
				animation: { preset: "scale-in", speed: "fast" },
				fields: [
					{
						kind: "text",
						key: "name",
						label: "Name",
						animation: { preset: "slide-up" },
					},
					{
						kind: "group",
						id: "extras",
						animation: { preset: "fade", speed: "slow" },
						fields: [
							{ kind: "note", text: "Hi", animation: { preset: "fade" } },
						],
					},
				],
			}).ok,
		).toBe(true);
		// Unknown presets, tiers and raw durations are all rejected.
		expect(
			parseFormSchema({
				title: "Bad preset",
				animation: { preset: "spin" },
				fields: [],
			}).ok,
		).toBe(false);
		expect(
			parseFormSchema({
				title: "Bad speed",
				animation: { preset: "fade", speed: "instant" },
				fields: [],
			}).ok,
		).toBe(false);
		expect(
			parseFormSchema({
				title: "Raw duration",
				animation: { preset: "fade", durationMs: 5000 },
				fields: [],
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
			runtime: "extism-wasm",
			entry: "plugin.wasm",
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

	it("validates extended declarative form layout without allowing executable UI", () => {
		expect(
			parseFormSchema({
				title: "Shift timing",
				size: "small",
				icon: {
					source: "@fluentui/react-icons",
					name: "ClockRegular",
				},
				fields: [
					{
						kind: "number",
						key: "amount",
						label: "Amount",
						control: "stepper",
						step: 50,
						decrementIcon: {
							source: "@fluentui/react-icons",
							name: "ArrowLeftRegular",
						},
					},
					{
						kind: "radio",
						key: "scope",
						label: "Scope",
						orientation: "horizontal",
						default: "all",
						options: [
							{ value: "all", label: "All" },
							{ value: "selected", label: "Selected", disabled: true },
							{ value: "custom", label: "Custom" },
						],
					},
					{
						kind: "group",
						id: "range",
						direction: "row",
						visibleWhen: { field: "scope", equals: "custom" },
						fields: [
							{ kind: "note", text: "From" },
							{
								kind: "number",
								key: "start",
								label: "Start",
								labelPlacement: "hidden",
								width: "compact",
							},
						],
					},
				],
			}).ok,
		).toBe(true);

		expect(
			parseFormSchema({
				title: "Invalid",
				fields: [
					{
						kind: "group",
						id: "unsafe",
						visibleWhen: { field: "missing", equals: true },
						fields: [{ kind: "note", text: "No HTML", html: "<b>x</b>" }],
					},
				],
			}).ok,
		).toBe(false);

		expect(
			parseFormSchema({
				title: "Invalid icon",
				icon: {
					source: "@fluentui/react-icons",
					name: "ArbitraryIconRegular",
				},
				fields: [],
			}).ok,
		).toBe(false);
	});

	it("validates lyric format contributions", () => {
		const base = {
			kind: "function",
			id: "dev.amll.formats",
			name: "Formats",
			version: "0.1.0",
			apiVersion: 0,
			runtime: "extism-wasm",
			entry: "plugin.wasm",
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
		// 声明 formats 必须同时声明 lyrics.format 能力。
		expect(
			parseManifest({
				...base,
				capabilities: ["lyrics.core"],
				contributes: { formats: [format] },
			}).ok,
		).toBe(false);
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

	it("validates format conversion results per direction", () => {
		const line = {
			words: [
				{
					text: "Hello",
					startTime: 0,
					endTime: 1000,
					emptyBeat: 0,
					romanText: "",
				},
			],
			translation: "",
			romanization: "",
			isBackground: false,
			isDuet: false,
			startTime: 0,
			endTime: 1000,
			ignoreSync: false,
		};
		expect(
			parseFormatConversionResult(
				{ kind: "imported", lines: [line], metadata: [] },
				"import",
			).ok,
		).toBe(true);
		expect(
			parseFormatConversionResult(
				{ kind: "imported", lines: [line], metadata: [] },
				"export",
			).ok,
		).toBe(false);
		expect(
			parseFormatConversionResult({ kind: "exported", text: "[x]" }, "export")
				.ok,
		).toBe(true);
		expect(
			parseFormatConversionResult({ kind: "exported", text: "" }, "export").ok,
		).toBe(false);
		expect(
			parseFormatConversionResult({ kind: "exported" }, "export").ok,
		).toBe(false);
	});

	it("validates guest plugin return values as JSON", () => {
		expect(parsePluginReturn({ ok: true, value: { shifted: 3 } }).ok).toBe(
			true,
		);
		expect(parsePluginReturn({ ok: true, value: undefined }).ok).toBe(false);
	});

	it("rejects non-JSON storage values and detects ruby edits structurally", () => {
		expect(
			parseHostCall({
				id: "set",
				method: "storage.set",
				params: { key: "bad", value: undefined },
			}).ok,
		).toBe(false);
		expect(
			requiredCapabilitiesForCall("lyrics.applyEdit", {
				ops: [
					{
						op: "updateWord",
						wordId: "word-1",
						patch: { text: "ruby" },
					},
				],
			}),
		).toEqual(["lyrics.core"]);
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
