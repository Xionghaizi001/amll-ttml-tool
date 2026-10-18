import { describe, expect, it } from "vitest";
import { parseManifest, parseThemePackage } from "@amll-ttml-tool/plugin-api";
import { ThemeService } from "$/kernel/theme/ThemeService";

const pkg = (id: string, target?: string) => ({
	packageVersion: 0,
	manifest: {
		id,
		name: id,
		version: "1.0.0",
		kind: "theme",
		themeApiVersion: 0,
		runtime: "none",
		appearance: "both",
		tokens: "tokens.json",
		styles: ["theme.css"],
		...(target
			? {
					scope: { pluginId: target },
					dependencies: [{ id: target, version: "*" }],
				}
			: {}),
	},
	tokens: { tokenVersion: 0, font: { scale: 1.2 } },
	styles: {
		"theme.css": `${target ? `[data-amll-plugin-scope="${target}"] ` : ""}[data-part="${target ? `${target}.panel` : "lyric-line"}"] { color: red; }`,
	},
});

const harness = (store = new Map<string, string>()) => {
	let css = "",
		userCss = "",
		missing = false;
	const service = new ThemeService({
		storage: {
			get: (key) => store.get(key) ?? null,
			set: (key, value) => {
				store.set(key, value);
			},
			remove: (key) => {
				store.delete(key);
			},
		},
		styles: {
			setThemeCss: (value) => {
				css = value;
			},
			setUserCss: (value) => {
				userCss = value;
			},
			setFlags: () => {},
		},
		assets: { create: () => "blob:asset", revoke: () => {} },
		targetParts: (id) => [`${id}.panel`],
		checkDependencies: (manifest) =>
			missing && manifest.scope !== undefined ? "missing target" : null,
	});
	return {
		service,
		store,
		css: () => css,
		userCss: () => userCss,
		removeTarget: () => {
			missing = true;
			service.refreshDependencies();
		},
	};
};

describe("scoped theme contract", () => {
	it("validates target declarations, scoped CSS boundaries and root-only tokens together", () => {
		const valid = pkg("test.theme", "test.editor");
		expect(
			parseThemePackage(valid, { targetParts: ["test.editor.panel"] }).ok,
		).toBe(true);
		expect(parseThemePackage(valid, { targetParts: [] }).ok).toBe(false);
		for (const selector of [
			'[data-slot="app-root"]',
			'[data-amll-plugin-scope="test.other"] [data-part="test.editor.panel"]',
			'[data-amll-plugin-scope="test.editor"] + [data-slot="app-root"]',
			'[data-amll-plugin-scope="test.editor"] [data-part="test.editor.panel"], body',
			'[data-amll-plugin-scope="test.editor"] [data-part="test.editor.panel"] ~ [data-slot="app-root"]',
			'[data-amll-plugin-scope="test.editor"] [data-part="test.editor.panel"] :is(body, *)',
			'[data-amll-plugin-scope="test.editor"] [data-part="test.editor.panel"] [data-amll-protected]',
		])
			expect(
				parseThemePackage({
					...valid,
					styles: { "theme.css": `${selector} { color: red; }` },
				}).ok,
				selector,
			).toBe(false);
		for (const extra of [
			{ color: { accent: "red" } },
			{ surfaces: {} },
			{ dark: { color: { accent: "red" } } },
		])
			expect(
				parseThemePackage({ ...valid, tokens: { tokenVersion: 0, ...extra } })
					.ok,
			).toBe(false);
		const functionManifest = {
			id: "test.editor",
			name: "Editor",
			version: "1.0.0",
			kind: "function",
			apiVersion: 0,
			runtime: "trusted-js",
			entry: "main.js",
			capabilities: [],
		};
		for (const parts of [
			["test.editor.panel"],
			["another.panel"],
			Array(33).fill("test.editor.panel"),
		])
			expect(
				parseManifest({
					...functionManifest,
					contributes: { themeParts: parts },
				}).ok,
			).toBe(parts.length === 1 && parts[0] === "test.editor.panel");
	});

	it("combines three scopes, replaces and undoes one scope, restores conflicts and rescues all scopes", async () => {
		const h = harness();
		const global = pkg("test.global");
		global.styles["theme.css"] = '[data-slot="app-root"] { color: blue; }';
		for (const entry of [
			global,
			pkg("test.a", "test.editor"),
			pkg("test.b", "test.viewer"),
			pkg("test.c", "test.editor"),
		])
			expect((await h.service.installThemePackage(entry)).ok).toBe(true);
		h.service.initialize();
		for (const id of ["test.global", "test.a", "test.b"])
			h.service.applyTheme(id);
		expect(h.service.getState().activeThemeIds).toEqual([
			"test.global",
			"test.a",
			"test.b",
		]);
		expect(h.css()).toContain('[data-amll-plugin-scope="test.editor"] {');
		expect(h.css()).toContain('[data-amll-plugin-scope="test.viewer"] {');
		h.service.setUserTokenOverrides({ tokenVersion: 0, font: { scale: 1.5 } });
		expect(h.userCss()).toContain("[data-amll-plugin-scope]");
		h.service.applyTheme("test.c");
		expect(h.service.getState().conflict).toMatchObject({
			scope: "test.editor",
			previousName: "test.a",
			nextName: "test.c",
		});
		h.service.resolveConflict(true);
		expect(h.service.getState().activeThemeIds).toEqual([
			"test.global",
			"test.a",
			"test.b",
		]);
		h.service.previewTheme("test.c");
		expect(h.service.isActive("test.a")).toBe(true);
		h.service.cancelPreview();
		h.store.set(
			"amll.theme.v0.active",
			JSON.stringify([
				{ id: "test.c", appliedAt: 30 },
				{ id: "test.a", appliedAt: 10 },
				{ id: "test.b", appliedAt: 20 },
				{ id: "test.global", appliedAt: 0 },
			]),
		);
		const restored = harness(h.store);
		restored.service.initialize();
		expect(restored.service.isActive("test.c")).toBe(true);
		expect(restored.service.getState().conflict?.previousId).toBe("test.a");
		restored.service.resolveConflict(true);
		restored.service.confirmStartupStable();
		restored.removeTarget();
		expect(
			restored.service.listThemes().find((theme) => theme.id === "test.a")
				?.disabledByDependency,
		).toBe("missing target");
		expect(restored.css()).not.toContain("data-amll-plugin-scope");
		restored.service.setSafeMode(true);
		restored.service.setSafeMode(false);
		expect(restored.service.getState().activeThemeIds).toEqual([]);
		h.service.restoreDefaultTheme();
		expect(h.css()).toBe("");
		expect(h.userCss()).toBe("");
	});
});
