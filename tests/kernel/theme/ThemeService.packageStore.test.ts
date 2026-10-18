import { describe, expect, it, vi } from "vitest";
import { ThemeService } from "$/kernel/theme/ThemeService";
import type {
	ThemeInstallationMetadata,
	ThemePackageStorePort,
	ThemeServicePorts,
} from "$/kernel/theme/types";

const themePackage = (id: string) => ({
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
	},
	tokens: {
		tokenVersion: 0,
		color: { accent: "#7c5cff" },
	},
});

interface Harness {
	service: ThemeService;
	store: Map<string, string>;
	packages: Map<string, unknown>;
	warnings: string[];
	themeCss: string[];
}

const createHarness = (
	store = new Map<string, string>(),
	packages = new Map<string, unknown>(),
	customStore?: ThemePackageStorePort,
): Harness => {
	const warnings: string[] = [];
	const themeCss: string[] = [];
	const packageStore: ThemePackageStorePort = {
		loadAll: async () =>
			[...packages.entries()].map(([id, pkg]) => ({ id, pkg })),
		save: async (id, pkg) => void packages.set(id, pkg),
		remove: async (id) => void packages.delete(id),
	};
	const ports: ThemeServicePorts = {
		storage: {
			get: (key) => store.get(key) ?? null,
			set: (key, value) => void store.set(key, value),
			remove: (key) => void store.delete(key),
		},
		styles: {
			setThemeCss: (css) => void themeCss.push(css),
			setUserCss: () => undefined,
			setFlags: () => undefined,
		},
		assets: { create: () => "local:x", revoke: () => undefined },
		packageStore: customStore ?? packageStore,
		warn: (message) => void warnings.push(message),
	};
	return {
		service: new ThemeService(ports),
		store,
		packages,
		warnings,
		themeCss,
	};
};

describe("ThemeService with an async package store", () => {
	it("waits for uninstall commit and preserves active theme on deletion failure", async () => {
		let reject!: (reason: Error) => void;
		const harness = createHarness(undefined, undefined, {
			loadAll: async () => [],
			save: async () => {},
			remove: () =>
				new Promise((_resolve, fail) => {
					reject = fail;
				}),
		});
		await harness.service.installThemePackage(themePackage("user.theme"));
		harness.service.applyTheme("user.theme");
		const removing = harness.service.removeInstalledTheme("user.theme");
		await vi.waitFor(() => expect(reject).toBeTypeOf("function"));
		expect(harness.service.listThemes()).toHaveLength(1);
		expect(harness.service.getState().activeThemeId).toBe("user.theme");
		reject(new Error("delete aborted"));
		await expect(removing).rejects.toThrow("delete aborted");
		expect(harness.service.listThemes()).toHaveLength(1);
		expect(harness.service.getState().activeThemeId).toBe("user.theme");
		expect(harness.store.get("amll.theme.v0.active")).toBe("user.theme");
	});
	it("keeps legacy packages when migration cannot commit", async () => {
		const legacy = JSON.stringify([themePackage("legacy.theme")]);
		const store = new Map([["amll.theme.v0.installed", legacy]]);
		const harness = createHarness(store, undefined, {
			loadAll: async () => [],
			save: async () => {
				throw new Error("quota");
			},
			remove: async () => {},
		});
		await expect(harness.service.hydrateInstalledThemes()).rejects.toThrow(
			"quota",
		);
		expect(store.get("amll.theme.v0.installed")).toBe(legacy);
	});
	it("retains store provenance after restart and does not publish failed updates", async () => {
		let record:
			| ({ id: string; pkg: unknown } & ThemeInstallationMetadata)
			| undefined;
		let fail = false;
		const packageStore: ThemePackageStorePort = {
			loadAll: async () => (record ? [record] : []),
			save: async (id, pkg, metadata) => {
				if (fail) throw new Error("quota");
				record = { id, pkg, ...metadata };
			},
			remove: async () => {
				record = undefined;
			},
		};
		const store = {
			providerId: "local",
			providerName: "Local store",
			artifactSha256: "b".repeat(64),
		};
		const first = createHarness(undefined, undefined, packageStore);
		expect(
			(
				await first.service.installThemePackage(
					themePackage("store.theme"),
					store,
				)
			).ok,
		).toBe(true);
		const second = createHarness(undefined, undefined, packageStore);
		await second.service.hydrateInstalledThemes();
		expect(second.service.listThemes()[0]).toMatchObject({
			store,
			installedAt: expect.any(Number),
		});
		fail = true;
		await expect(
			second.service.installThemePackage(themePackage("store.theme"), {
				...store,
				providerId: "other",
			}),
		).rejects.toThrow("quota");
		expect(second.service.listThemes()[0].store?.providerId).toBe("local");
		expect(record?.store?.providerId).toBe("local");
	});

	it("migrates the legacy localStorage JSON into the package store once", async () => {
		const store = new Map<string, string>([
			[
				"amll.theme.v0.installed",
				JSON.stringify([themePackage("legacy.theme")]),
			],
		]);
		const harness = createHarness(store);
		harness.service.initialize();
		// Legacy JSON is not consumed synchronously when a package store exists.
		expect(harness.service.listThemes()).toHaveLength(0);
		await harness.service.hydrateInstalledThemes();
		expect(harness.packages.has("legacy.theme")).toBe(true);
		expect(store.has("amll.theme.v0.installed")).toBe(false);
		expect(harness.service.listThemes()).toMatchObject([
			{ id: "legacy.theme", source: "installed" },
		]);

		// A second boot loads straight from the package store.
		const second = createHarness(store, harness.packages);
		second.service.initialize();
		await second.service.hydrateInstalledThemes();
		expect(second.service.listThemes()).toHaveLength(1);
	});

	it("re-applies a persisted active installed theme after hydration", async () => {
		const harness = createHarness();
		harness.service.initialize();
		await harness.service.hydrateInstalledThemes();
		expect(
			(await harness.service.importThemePackage(themePackage("user.theme"))).ok,
		).toBe(true);
		harness.service.applyTheme("user.theme");
		expect(harness.packages.has("user.theme")).toBe(true);

		const second = createHarness(harness.store, harness.packages);
		second.service.initialize();
		// Active id is pending until the async hydration registers the theme.
		expect(second.service.getState().activeThemeId).toBeNull();
		// The crash marker still covers the pending theme.
		expect(second.store.has("amll.theme.v0.applyPending")).toBe(true);
		await second.service.hydrateInstalledThemes();
		expect(second.service.getState().activeThemeId).toBe("user.theme");
		expect(second.themeCss.at(-1)).toContain("--attt-color-accent");
	});

	it("removing an installed theme deletes it from the package store", async () => {
		const harness = createHarness();
		harness.service.initialize();
		await harness.service.importThemePackage(themePackage("user.theme"));
		expect(harness.packages.has("user.theme")).toBe(true);
		await harness.service.removeInstalledTheme("user.theme");
		expect(harness.packages.has("user.theme")).toBe(false);
	});

	it("skips corrupted stored packages with a warning", async () => {
		const packages = new Map<string, unknown>([["bad.theme", { nope: 1 }]]);
		const harness = createHarness(new Map(), packages);
		harness.service.initialize();
		await harness.service.hydrateInstalledThemes();
		expect(harness.service.listThemes()).toHaveLength(0);
		expect(
			harness.warnings.some((warning) => warning.includes("bad.theme")),
		).toBe(true);
	});
});
