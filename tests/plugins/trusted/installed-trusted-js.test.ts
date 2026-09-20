import { describe, expect, it, vi } from "vitest";
import { ExtensionRegistry } from "$/kernel/extensions";
import { InstalledTrustedJsService } from "$/plugins/trusted/installed-trusted-js";
import {
	TrustedJsPluginService,
	type TrustedJsPluginStateRecord,
} from "$/plugins/trusted/trusted-js-service";
import type { StoredTrustedJsRecord } from "$/platform/storage/IndexedDbTrustedJsStorage";

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

function fixture(
	options: {
		desktop?: boolean;
		consent?: boolean;
		failSave?: boolean;
		failActivate?: boolean;
	} = {},
) {
	const records = new Map<string, StoredTrustedJsRecord>();
	const states = new Map<string, TrustedJsPluginStateRecord>();
	const registry = new ExtensionRegistry();
	const consent = vi.fn(async () => options.consent !== false);
	const cleanup = vi.fn();
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
				states.set(id, value);
			},
			remove: (id) => {
				states.delete(id);
			},
		},
		isDesktop: () => options.desktop === true,
		isDesktopTrustEnabled: () => false,
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
		clearKv,
		consent,
		importModule,
		cleanup,
	};
}

describe("installed trusted-js lifecycle", () => {
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
