import { describe, expect, it, vi } from "vitest";
import { ExtensionRegistry } from "$/kernel/extensions";
import type { StoredTrustedJsRecord } from "$/platform/storage/IndexedDbTrustedJsStorage";
import { InstalledTrustedJsService } from "$/plugins/trusted/installed-trusted-js";
import {
	TrustedJsPluginService,
	type TrustedJsPluginStateRecord,
} from "$/plugins/trusted/trusted-js-service";

const pkg = (code = "export function activate() {}") => ({
	packageVersion: 0,
	manifest: {
		id: "test.local",
		name: "Local test",
		version: "1.0.0",
		apiVersion: 0,
		kind: "function",
		runtime: "trusted-js",
		entry: "index.js",
		capabilities: [],
	},
	code,
});

it("preserves override resources across restore and binds the digest to their contents", async () => {
	const f = fixture();
	const base = pkg();
	const resourcePackage = {
		...base,
		manifest: { ...base.manifest, dependencies: [{ id: "test.target", version: "*" }], overrides: [{ pluginId: "test.target", kind: "localization", entry: "strings/en.json" }] },
		resources: { "strings/en.json": { "/commands/test.target.run/title": "Run" } },
	};
	await expect(f.installed.install(resourcePackage)).resolves.toMatchObject({ ok: true });
	expect(f.records.get("test.local")?.resources).toEqual(resourcePackage.resources);
	const restored = new InstalledTrustedJsService(f.storage, f.runtime, async () => {});
	await restored.restore();
	expect(restored.list()).toHaveLength(1);
	const record = f.records.get("test.local")!;
	f.records.set(record.id, { ...record, resources: { "strings/en.json": { "/commands/test.target.run/title": "Changed" } } });
	const tampered = new InstalledTrustedJsService(f.storage, f.runtime, async () => {});
	await tampered.restore();
	expect(tampered.list()).toHaveLength(0);
});

function fixture(
	options: {
		desktop?: boolean;
		consent?: boolean;
		failSave?: boolean;
		failActivate?: boolean;
		failState?: boolean;
		failStateWrite?: number;
		missingDependency?: boolean;
	} = {},
) {
	const records = new Map<string, StoredTrustedJsRecord>();
	const states = new Map<string, TrustedJsPluginStateRecord>();
	const registry = new ExtensionRegistry();
	const consent = vi.fn(async () => options.consent !== false);
	const cleanup = vi.fn();
	let stateWrites = 0;
	const importModule = vi.fn(async (url: string) => {
		expect(url.startsWith("blob:")).toBe(true);
		expect(records.has("test.local")).toBe(true);
		return {
			activate() {
				if (options.failActivate) throw new Error("activation failed");
				return cleanup;
			},
		};
	});
	const runtime = new TrustedJsPluginService({
		origin: "https://app.test",
		importModule,
		createScope: (pluginId) =>
			registry.createScope({
				kind: "plugin",
				pluginId,
				runtime: "trusted-js",
				trusted: true,
			}),
		createHost: () => ({ host: {}, dispose() {} }),
		requestConsent: consent,
		state: {
			get: (id) => states.get(id) ?? null,
			set: (id, value) => {
				if (++stateWrites === options.failStateWrite)
					throw new Error("state commit failed");
				if (options.failState) {
					options.failState = false;
					throw new Error("state quota");
				}
				states.set(id, value);
			},
			remove: (id) => {
				states.delete(id);
			},
		},
		isDesktop: () => options.desktop === true,
		isDesktopTrustEnabled: () => false,
		checkDependencies: () => options.missingDependency ? "missing dependency" : null,
	});
	const storage = {
		loadAll: async () => [...records.values()],
		save: async (record: StoredTrustedJsRecord) => {
			if (options.failSave) throw new Error("quota");
			records.set(record.id, record);
		},
		remove: async (id: string) => {
			records.delete(id);
		},
	};
	const clearKv = vi.fn(async () => {});
	const installed = new InstalledTrustedJsService(storage, runtime, clearKv);
	return {
		records,
		states,
		runtime,
		installed,
		storage,
		options,
		clearKv,
		consent,
		importModule,
		cleanup,
	};
}

describe("installed trusted-js lifecycle", () => {
	it("does not publish a missing-dependency package if its disabled state cannot commit", async () => {
		const f = fixture({ missingDependency: true, failState: true });
		expect((await f.installed.install(pkg())).ok).toBe(false);
		expect(f.records.size).toBe(0);
		expect(f.installed.list()).toHaveLength(0);
		expect(f.states.size).toBe(0);
		expect(f.importModule).not.toHaveBeenCalled();
	});
	it("reports rollback failure instead of reporting a successful installation", async () => {
		const f = fixture();
		await f.installed.install(pkg());
		f.importModule.mockRejectedValueOnce(new Error("broken update"));
		const save = f.storage.save;
		let calls = 0;
		f.storage.save = async (record) => {
			if (++calls === 2) throw new Error("rollback disk failure");
			await save(record);
		};
		const result = await f.installed.install(pkg("export function activate() { /* update */ }"));
		expect(result).toMatchObject({ ok: false, message: expect.stringContaining("回滚失败") });
	});
	it("cleans up activated code when the final state commit fails", async () => {
		const f = fixture({ failStateWrite: 3 });
		expect((await f.installed.install(pkg())).ok).toBe(false);
		expect(f.runtime.isLoaded("test.local")).toBe(false);
		expect(f.cleanup).toHaveBeenCalledOnce();
		expect(f.records.size).toBe(0);
		expect(f.states.size).toBe(0);
	});
	it("waits for durable save before executing or publishing an installation", async () => {
		const f = fixture();
		let commit!: () => void;
		const save = f.storage.save;
		f.storage.save = (record) =>
			new Promise<void>((resolve) => {
				commit = () => {
					void save(record).then(resolve);
				};
			});
		const installing = f.installed.install(pkg());
		await vi.waitFor(() => expect(commit).toBeTypeOf("function"));
		expect(f.installed.list()).toHaveLength(0);
		expect(f.importModule).not.toHaveBeenCalled();
		commit();
		expect((await installing).ok).toBe(true);
	});

	it.each(["package", "state", "activate"])(
		"restores old package, consent and instance after %s failure",
		async (failure) => {
			const f = fixture();
			await f.installed.install(pkg());
			f.runtime.confirmStartupStable();
			const old = f.records.get("test.local");
			const state = { ...f.states.get("test.local") };
			if (failure === "package") f.options.failSave = true;
			if (failure === "state") f.options.failState = true;
			if (failure === "activate")
				f.importModule.mockRejectedValueOnce(new Error("bad activation"));
			const result = await f.installed.install(
				pkg("export function activate() { /* new */ }"),
			);
			expect(result.ok).toBe(false);
			expect(f.records.get("test.local")).toEqual(old);
			expect(f.states.get("test.local")).toEqual(state);
			expect(f.runtime.isLoaded("test.local")).toBe(true);
			expect(f.clearKv).not.toHaveBeenCalled();
		},
	);

	it("failed enablement writes keep the live instance and previous enabled state", async () => {
		const f = fixture();
		await f.installed.install(pkg());
		const old = { ...f.states.get("test.local") };
		f.options.failState = true;
		await expect(f.runtime.setEnabled("test.local", false)).rejects.toThrow(
			"state quota",
		);
		expect(f.runtime.isLoaded("test.local")).toBe(true);
		expect(f.states.get("test.local")).toEqual(old);
	});

	it("restores KV snapshot when activated update fails and when a batch rolls back", async () => {
		const f = fixture();
		let value = "old data";
		const storage = {
			...f.storage,
			checkpoint: async (id: string) => {
				const old = f.records.get(id),
					saved = value;
				return async () => {
					value = saved;
					if (old) f.records.set(id, old);
					else f.records.delete(id);
				};
			},
		};
		const service = new InstalledTrustedJsService(
			storage,
			f.runtime,
			f.clearKv,
		);
		await service.install(pkg());
		f.importModule.mockImplementationOnce(async () => ({
			activate() {
				value = "partial write";
				throw new Error("failed after KV write");
			},
		}));
		expect(
			(await service.install(pkg("export function activate() { /* bad */ }")))
				.ok,
		).toBe(false);
		expect(value).toBe("old data");
		const rollback = await service.checkpoint("test.local");
		await service.install(
			pkg("export function activate() { /* successful update */ }"),
		);
		value = "new data";
		await rollback();
		expect(value).toBe("old data");
		expect(f.runtime.isLoaded("test.local")).toBe(true);
	});
	it("preserves store provenance across restore and names the provider in consent", async () => {
		const f = fixture();
		const store = {
			providerId: "local",
			providerName: "Local store",
			artifactSha256: "a".repeat(64),
		};
		expect((await f.installed.install(pkg(), "store", store)).ok).toBe(true);
		expect(f.consent).toHaveBeenCalledWith(
			expect.objectContaining({ providerName: "Local store" }),
		);
		const persisted = f.records.get("test.local");
		expect(persisted?.store).toEqual(store);
		expect(persisted?.sha256).not.toBe(store.artifactSha256);
		const restored = new InstalledTrustedJsService(
			f.storage,
			f.runtime,
			f.clearKv,
		);
		await restored.restore();
		expect(restored.list()[0]).toMatchObject({
			store,
			installedAt: persisted?.installedAt,
		});
		expect(restored.entry("test.local")?.providerName).toBe("Local store");
		await restored.uninstall("test.local");
		expect(f.records.has("test.local")).toBe(false);
	});

	it("uses the atomic uninstall port and keeps installation state if persistence fails", async () => {
		const f = fixture();
		const atomic = vi.fn(async (_id: string) => {
			throw new Error("transaction aborted");
		});
		const service = new InstalledTrustedJsService(
			{ ...f.storage, uninstall: atomic },
			f.runtime,
			f.clearKv,
		);
		expect((await service.install(pkg())).ok).toBe(true);
		const consent = f.runtime.getConsent("test.local");
		await expect(service.uninstall("test.local")).rejects.toThrow(
			"transaction aborted",
		);
		expect(f.records.has("test.local")).toBe(true);
		expect(service.list()).toHaveLength(1);
		expect(f.runtime.getConsent("test.local")).toEqual(consent);
		expect(f.runtime.isLoaded("test.local")).toBe(true);
		expect(f.clearKv).not.toHaveBeenCalled();
		atomic.mockImplementation(async (id) => {
			f.records.delete(id);
		});
		await service.uninstall("test.local");
		expect(atomic).toHaveBeenCalledWith("test.local");
		expect(service.list()).toHaveLength(0);
		expect(f.states.size).toBe(0);
		expect(f.clearKv).not.toHaveBeenCalled();
	});

	it("hot reload preserves release state, reuses session consent and rolls back failed code", async () => {
		const f = fixture();
		f.importModule.mockImplementation(async () => ({
			activate: () => f.cleanup,
		}));
		const releaseState = {
			consented: true,
			consentKey: "release",
			crashes: 2,
			pending: false,
		};
		f.states.set("test.local", { ...releaseState });
		expect((await f.installed.install(pkg(), "dev")).ok).toBe(true);
		const firstUrl = f.importModule.mock.calls[0][0];
		expect(await (await fetch(firstUrl)).text()).toContain("//# sourceURL=amll-plugin:///test.local/module.js");
		expect(
			(
				await f.installed.install(
					pkg("export function activate() { /* edit */ }"),
					"dev",
				)
			).ok,
		).toBe(true);
		expect(f.importModule.mock.calls[1][0]).not.toBe(firstUrl);
		expect(f.cleanup).toHaveBeenCalledOnce();
		expect(f.consent).toHaveBeenCalledOnce();
		const previous = f.installed.entry("test.local")?.moduleBlob;
		f.importModule.mockImplementationOnce(async () => {
			throw new Error("broken module");
		});
		expect(
			(
				await f.installed.install(
					pkg("export function activate() { /* bad */ }"),
					"dev",
				)
			).ok,
		).toBe(false);
		expect(f.runtime.isLoaded("test.local")).toBe(true);
		expect(f.installed.entry("test.local")?.moduleBlob).toBe(previous);
		f.runtime.confirmStartupStable();
		expect(f.states.get("test.local")).toEqual(releaseState);
		expect(f.records.size).toBe(0);
		expect(f.clearKv).not.toHaveBeenCalled();
		await f.runtime.setEnabled("test.local", false);
		expect((await f.installed.install(pkg(), "dev")).ok).toBe(false);
		expect(f.runtime.isLoaded("test.local")).toBe(false);
		f.installed.discardDevelopment("test.local");
		expect(f.installed.entry("test.local")).toBeUndefined();
		expect(f.states.get("test.local")?.disabled).toBe(true);
		expect(f.clearKv).not.toHaveBeenCalled();
	});
	it("persists only after consent, restores, respects disable, and fully uninstalls", async () => {
		const f = fixture();
		expect(await f.installed.install(pkg())).toEqual({
			ok: true,
			pluginId: "test.local",
		});
		expect(f.consent).toHaveBeenCalledOnce();
		await f.runtime.setEnabled("test.local", false);
		expect(f.cleanup).toHaveBeenCalledOnce();
		const restored = new InstalledTrustedJsService(
			f.storage,
			f.runtime,
			f.clearKv,
		);
		await restored.restore();
		expect(restored.list()).toHaveLength(1);
		const entry = restored.entry("test.local");
		if (!entry) throw new Error("missing restored entry");
		expect(await f.runtime.load(entry)).toMatchObject({
			reason: "user-disabled",
		});
		await f.runtime.setEnabled("test.local", true);
		expect(await f.runtime.load(entry)).toEqual({ ok: true });
		expect(f.consent).toHaveBeenCalledOnce();
		await restored.uninstall("test.local");
		expect(f.records.size).toBe(0);
		expect(f.states.size).toBe(0);
		expect(f.clearKv).toHaveBeenCalledWith("test.local");
	});
	it.each([
		{ consent: false },
		{ desktop: true },
		{ failSave: true },
		{ failActivate: true },
		{ failState: true },
	])(
		"does not leave a package installed after rejection %j",
		async (options) => {
			const f = fixture(options);
			expect((await f.installed.install(pkg())).ok).toBe(false);
			expect(f.records.size).toBe(0);
			expect(f.installed.list()).toHaveLength(0);
			if (!options.failActivate) expect(f.importModule).not.toHaveBeenCalled();
		},
	);
	it("asks again when the same identity carries different code", async () => {
		const f = fixture();
		await f.installed.install(pkg());
		await f.installed.install(
			pkg("export function activate() { /* changed */ }"),
		);
		expect(f.consent).toHaveBeenCalledTimes(2);
	});
	it("refuses corrupted persisted bytes", async () => {
		const f = fixture();
		await f.installed.install(pkg());
		const record = f.records.get("test.local");
		if (!record) throw new Error("missing installed record");
		record.code = new Blob(["changed"]);
		const restored = new InstalledTrustedJsService(
			f.storage,
			f.runtime,
			f.clearKv,
		);
		await restored.restore();
		expect(restored.list()).toHaveLength(0);
	});
});
