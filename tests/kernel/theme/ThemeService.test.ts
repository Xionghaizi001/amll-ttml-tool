import { describe, expect, it } from "vitest";
import { ThemeService } from "$/kernel/theme/ThemeService";
import { compileThemeTokensCss } from "$/kernel/theme/token-css";
import type { ThemeServicePorts, ThemeStyleFlags } from "$/kernel/theme/types";

const themePackage = (id: string, overrides: Record<string, unknown> = {}) => ({
	packageVersion: 0,
	manifest: {
		id,
		name: `Theme ${id}`,
		version: "1.0.0",
		kind: "theme",
		themeApiVersion: 0,
		runtime: "none",
		appearance: "dark",
		tokens: "tokens.json",
		styles: ["theme.css"],
	},
	tokens: {
		tokenVersion: 0,
		color: { accent: "#7c5cff" },
		dark: { color: { accent: "#9d85ff" } },
	},
	styles: {
		"theme.css": `[data-slot="ribbon-bar"] { background-image: url(asset:bg); }`,
	},
	assets: { bg: { mime: "image/png", data: "aGVsbG8=" } },
	...overrides,
});

interface Harness {
	service: ThemeService;
	store: Map<string, string>;
	themeCss: string[];
	userCss: string[];
	flags: ThemeStyleFlags[];
	created: string[];
	revoked: string[];
	warnings: string[];
}

const createHarness = (store = new Map<string, string>()): Harness => {
	const harness: Omit<Harness, "service"> = {
		store,
		themeCss: [],
		userCss: [],
		flags: [],
		created: [],
		revoked: [],
		warnings: [],
	};
	let urlCounter = 0;
	const ports: ThemeServicePorts = {
		storage: {
			get: (key) => store.get(key) ?? null,
			set: (key, value) => void store.set(key, value),
			remove: (key) => void store.delete(key),
		},
		styles: {
			setThemeCss: (css) => void harness.themeCss.push(css),
			setUserCss: (css) => void harness.userCss.push(css),
			setFlags: (flags) => void harness.flags.push(flags),
		},
		assets: {
			create: () => {
				const url = `local:asset-${urlCounter}`;
				urlCounter += 1;
				harness.created.push(url);
				return url;
			},
			revoke: (url) => void harness.revoked.push(url),
		},
		warn: (message) => void harness.warnings.push(message),
	};
	return { ...harness, service: new ThemeService(ports) };
};

const lastThemeCss = (harness: Harness) =>
	harness.themeCss[harness.themeCss.length - 1];

describe("ThemeService", () => {
	it("applies a registered theme with compiled tokens and local asset URLs", () => {
		const harness = createHarness();
		expect(
			harness.service.registerBuiltinTheme(themePackage("a.theme")).ok,
		).toBe(true);
		harness.service.initialize();
		harness.service.applyTheme("a.theme");
		const css = lastThemeCss(harness);
		expect(css).toContain("--attt-color-accent: #7c5cff;");
		expect(css).toContain(':root[data-amll-appearance="dark"]');
		expect(css).toContain('url("local:asset-0")');
		expect(css).not.toContain("asset:bg");
		expect(harness.store.get("amll.theme.v0.active")).toBe("a.theme");
	});

	it("revokes asset URLs when switching away from a theme", () => {
		const harness = createHarness();
		harness.service.registerBuiltinTheme(themePackage("a.theme"));
		harness.service.initialize();
		harness.service.applyTheme("a.theme");
		harness.service.applyTheme(null);
		expect(harness.revoked).toEqual(harness.created);
		expect(lastThemeCss(harness)).toBe("");
	});

	it("previews without persisting and reverts on cancel", () => {
		const harness = createHarness();
		harness.service.registerBuiltinTheme(themePackage("a.theme"));
		harness.service.initialize();
		harness.service.previewTheme("a.theme");
		expect(lastThemeCss(harness)).toContain("--attt-color-accent");
		expect(harness.store.has("amll.theme.v0.active")).toBe(false);
		harness.service.cancelPreview();
		expect(lastThemeCss(harness)).toBe("");
	});

	it("restores the active theme from storage on initialize", () => {
		const store = new Map<string, string>();
		const first = createHarness(store);
		first.service.registerBuiltinTheme(themePackage("a.theme"));
		first.service.initialize();
		first.service.applyTheme("a.theme");
		first.service.confirmStartupStable();

		const second = createHarness(store);
		second.service.registerBuiltinTheme(themePackage("a.theme"));
		second.service.initialize();
		expect(second.service.getState().activeThemeId).toBe("a.theme");
		expect(lastThemeCss(second)).toContain("--attt-color-accent");
	});

	it("boots into safe mode when the previous apply never confirmed", () => {
		const store = new Map<string, string>();
		const first = createHarness(store);
		first.service.registerBuiltinTheme(themePackage("a.theme"));
		first.service.initialize();
		first.service.applyTheme("a.theme");
		// No confirmStartupStable(): simulate a crash on next boot.
		store.set("amll.theme.v0.applyPending", "1");

		const second = createHarness(store);
		second.service.registerBuiltinTheme(themePackage("a.theme"));
		second.service.initialize();
		expect(second.service.getState().safeMode).toBe(true);
		expect(second.service.getState().safeModeReason).toBe("crash");
		expect(lastThemeCss(second)).toBe("");
		expect(second.userCss[second.userCss.length - 1]).toBe("");
	});

	it("safe mode suppresses styles until it is turned off", () => {
		const harness = createHarness();
		harness.service.registerBuiltinTheme(themePackage("a.theme"));
		harness.service.initialize();
		harness.service.applyTheme("a.theme");
		harness.service.setSafeMode(true);
		expect(lastThemeCss(harness)).toBe("");
		expect(harness.store.get("amll.theme.v0.safeMode")).toBe("1");
		harness.service.setSafeMode(false);
		expect(lastThemeCss(harness)).toContain("--attt-color-accent");
	});

	it("honors forceSafeMode without persisting it", () => {
		const harness = createHarness();
		harness.service.registerBuiltinTheme(themePackage("a.theme"));
		harness.service.initialize({ forceSafeMode: true });
		expect(harness.service.getState().safeModeReason).toBe("forced");
		expect(harness.store.has("amll.theme.v0.safeMode")).toBe(false);
	});

	it("persists and re-applies user token overrides in the user layer", () => {
		const store = new Map<string, string>();
		const harness = createHarness(store);
		harness.service.initialize();
		const result = harness.service.setUserTokenOverrides({
			tokenVersion: 0,
			color: { accent: "#ff0000" },
		});
		expect(result.ok).toBe(true);
		expect(harness.userCss[harness.userCss.length - 1]).toContain(
			"--attt-color-accent: #ff0000;",
		);

		const second = createHarness(store);
		second.service.initialize();
		expect(second.userCss[second.userCss.length - 1]).toContain("#ff0000");
	});

	it("rejects invalid user token overrides without touching state", () => {
		const harness = createHarness();
		harness.service.initialize();
		const result = harness.service.setUserTokenOverrides({
			tokenVersion: 0,
			color: { accent: "url(https://x)" },
		});
		expect(result.ok).toBe(false);
		expect(harness.service.getState().hasUserOverrides).toBe(false);
	});

	it("imports, persists and removes installed themes", () => {
		const store = new Map<string, string>();
		const harness = createHarness(store);
		harness.service.initialize();
		const imported = harness.service.importThemePackage(
			themePackage("b.theme"),
		);
		expect(imported.ok).toBe(true);
		harness.service.applyTheme("b.theme");

		const second = createHarness(store);
		second.service.initialize();
		expect(second.service.getState().activeThemeId).toBe("b.theme");
		second.service.removeInstalledTheme("b.theme");
		expect(second.service.getState().activeThemeId).toBe(null);
		expect(second.service.listThemes()).toHaveLength(0);
		expect(store.has("amll.theme.v0.installed")).toBe(false);
	});

	it("rejects imported themes that shadow a built-in id", () => {
		const harness = createHarness();
		harness.service.registerBuiltinTheme(themePackage("a.theme"));
		harness.service.initialize();
		expect(harness.service.importThemePackage(themePackage("a.theme")).ok).toBe(
			false,
		);
	});

	it("skips corrupted installed themes instead of failing startup", () => {
		const store = new Map<string, string>();
		store.set(
			"amll.theme.v0.installed",
			JSON.stringify([{ packageVersion: 0 }]),
		);
		const harness = createHarness(store);
		harness.service.initialize();
		expect(harness.warnings.length).toBeGreaterThan(0);
		expect(harness.service.listThemes()).toHaveLength(0);
	});

	it("restoreDefaultTheme clears theme, preview and user overrides", () => {
		const harness = createHarness();
		harness.service.registerBuiltinTheme(themePackage("a.theme"));
		harness.service.initialize();
		harness.service.applyTheme("a.theme");
		harness.service.setUserTokenOverrides({
			tokenVersion: 0,
			color: { accent: "#00ff00" },
		});
		harness.service.restoreDefaultTheme();
		expect(lastThemeCss(harness)).toBe("");
		expect(harness.userCss[harness.userCss.length - 1]).toBe("");
		expect(harness.store.has("amll.theme.v0.active")).toBe(false);
		expect(harness.store.has("amll.theme.v0.userTokens")).toBe(false);
	});

	it("dispose revokes URLs and clears injected styles", () => {
		const harness = createHarness();
		harness.service.registerBuiltinTheme(themePackage("a.theme"));
		harness.service.initialize();
		harness.service.applyTheme("a.theme");
		harness.service.dispose();
		expect(harness.revoked).toEqual(harness.created);
		expect(lastThemeCss(harness)).toBe("");
	});
});

const lastFlags = (harness: Harness) => harness.flags[harness.flags.length - 1];

describe("ThemeService surfaces and flags", () => {
	const surfaceTheme = (id: string) =>
		themePackage(id, {
			tokens: {
				tokenVersion: 0,
				color: { accent: "#7c5cff" },
				surfaces: {
					titleBar: { kind: "solid", value: "#101018" },
					modalLarge: {
						kind: "gradient",
						value: "linear-gradient(#111, #223)",
					},
				},
			},
		});

	it("activates accent and surface flags for the applied theme", () => {
		const harness = createHarness();
		harness.service.registerBuiltinTheme(surfaceTheme("a.theme"));
		harness.service.initialize();
		harness.service.applyTheme("a.theme");
		const flags = lastFlags(harness);
		expect(flags.accent).toBe(true);
		expect(flags.surfaces).toEqual(["titleBar", "modalLarge"]);
		const css = lastThemeCss(harness);
		expect(css).toContain("--attt-surface-title-bar: #101018;");
		expect(css).toContain(
			"--attt-surface-modal-large-image: linear-gradient(#111, #223);",
		);
		expect(css).toContain("--attt-color-accent-contrast: white;");
	});

	it("clears all flags in safe mode and after restoreDefaultTheme", () => {
		const harness = createHarness();
		harness.service.registerBuiltinTheme(surfaceTheme("a.theme"));
		harness.service.initialize();
		harness.service.applyTheme("a.theme");
		harness.service.setSafeMode(true);
		expect(lastFlags(harness)).toEqual({ accent: false, surfaces: [] });
		harness.service.setSafeMode(false);
		harness.service.restoreDefaultTheme();
		expect(lastFlags(harness)).toEqual({ accent: false, surfaces: [] });
	});

	it("lets a user surface token none disable a theme surface flag", () => {
		const harness = createHarness();
		harness.service.registerBuiltinTheme(surfaceTheme("a.theme"));
		harness.service.initialize();
		harness.service.applyTheme("a.theme");
		const result = harness.service.setUserTokenOverrides({
			tokenVersion: 0,
			surfaces: { titleBar: { kind: "none" } },
		});
		expect(result.ok, JSON.stringify(result)).toBe(true);
		expect(lastFlags(harness).surfaces).toEqual(["modalLarge"]);
		expect(harness.userCss[harness.userCss.length - 1]).toContain(
			"--attt-surface-title-bar: initial;",
		);
	});

	it("accepts user modal refinements once the theme provides the large base", () => {
		const harness = createHarness();
		harness.service.registerBuiltinTheme(surfaceTheme("a.theme"));
		harness.service.initialize();
		harness.service.applyTheme("a.theme");
		const result = harness.service.setUserTokenOverrides({
			tokenVersion: 0,
			surfaces: { modalSmall: { kind: "solid", value: "#181420" } },
		});
		expect(result.ok, JSON.stringify(result)).toBe(true);
		expect(lastFlags(harness).surfaces).toContain("modalSmall");
	});

	it("rejects user overrides that would strand medium/small modals", () => {
		const harness = createHarness();
		harness.service.initialize();
		const result = harness.service.setUserTokenOverrides({
			tokenVersion: 0,
			surfaces: { modalMedium: { kind: "solid", value: "#181420" } },
		});
		expect(result.ok).toBe(false);
	});

	it("rejects image surfaces inside user token overrides", () => {
		const harness = createHarness();
		harness.service.initialize();
		const result = harness.service.setUserTokenOverrides({
			tokenVersion: 0,
			surfaces: { titleBar: { kind: "image", value: "asset:x" } },
		});
		expect(result.ok).toBe(false);
	});

	it("applies user surface images with scrims and activates their flags", () => {
		const harness = createHarness();
		harness.service.initialize();
		const result = harness.service.setUserSurfaceImage("ribbonBar", {
			url: "blob:https://host/abc",
			scrim: "rgb(0 0 0 / 0.4)",
		});
		expect(result.ok, JSON.stringify(result)).toBe(true);
		expect(lastFlags(harness).surfaces).toEqual(["ribbonBar"]);
		const userCss = harness.userCss[harness.userCss.length - 1];
		expect(userCss).toContain(
			'--attt-surface-ribbon-bar-image: url("blob:https://host/abc");',
		);
		expect(userCss).toContain(
			"--attt-surface-ribbon-bar-scrim: rgb(0 0 0 / 0.4);",
		);
	});

	it("rejects non-blob surface image URLs and unsafe scrims", () => {
		const harness = createHarness();
		harness.service.initialize();
		expect(
			harness.service.setUserSurfaceImage("ribbonBar", {
				url: "https://evil.example/x.png",
			}).ok,
		).toBe(false);
		expect(
			harness.service.setUserSurfaceImage("ribbonBar", {
				url: "blob:x",
				scrim: "url(https://x)",
			}).ok,
		).toBe(false);
	});

	it("rejects a small modal image while no large modal background exists", () => {
		const harness = createHarness();
		harness.service.initialize();
		const result = harness.service.setUserSurfaceImage("modalSmall", {
			url: "blob:x",
		});
		expect(result.ok).toBe(false);
	});

	it("drops stranded modal flags after a theme switch instead of breaking dialogs", () => {
		const harness = createHarness();
		harness.service.registerBuiltinTheme(surfaceTheme("a.theme"));
		harness.service.initialize();
		harness.service.applyTheme("a.theme");
		expect(
			harness.service.setUserSurfaceImage("modalSmall", { url: "blob:x" }).ok,
		).toBe(true);
		harness.service.applyTheme(null);
		expect(lastFlags(harness).surfaces).not.toContain("modalSmall");
		expect(harness.warnings.some((w) => w.includes("modalLarge"))).toBe(true);
	});

	it("restoreDefaultTheme clears user surface images", () => {
		const harness = createHarness();
		harness.service.registerBuiltinTheme(surfaceTheme("a.theme"));
		harness.service.initialize();
		harness.service.applyTheme("a.theme");
		harness.service.setUserSurfaceImage("ribbonBar", { url: "blob:x" });
		harness.service.restoreDefaultTheme();
		expect(harness.service.getState().userSurfaceImages).toEqual({});
	});
});

describe("compileThemeTokensCss", () => {
	it("compiles all token groups to prefixed custom properties", () => {
		const css = compileThemeTokensCss({
			tokenVersion: 0,
			color: { panelBackground: "#111" },
			font: { family: "MiSans", monoFamily: "Menlo", scale: 1.2 },
			spacing: { scale: 1.1, radius: "6px" },
			lyrics: { lineSelectedBackground: "#222" },
			spectrogram: { playhead: "#f00" },
			background: { kind: "solid", value: "#000" },
		});
		expect(css).toContain("--attt-color-panel-background: #111;");
		expect(css).toContain("--attt-font-family: MiSans;");
		expect(css).toContain("--attt-font-mono-family: Menlo;");
		expect(css).toContain("--attt-font-scale: 1.2;");
		expect(css).toContain("--attt-spacing-scale: 1.1;");
		expect(css).toContain("--attt-spacing-radius: 6px;");
		expect(css).toContain("--attt-lyrics-line-selected-background: #222;");
		expect(css).toContain("--attt-spectrogram-playhead: #f00;");
		expect(css).toContain("--attt-app-background: #000;");
	});

	it("emits nothing for empty token sets", () => {
		expect(compileThemeTokensCss({ tokenVersion: 0 })).toBe("");
	});
});
