import { PLUGIN_API_VERSION } from "@amll-ttml-tool/plugin-api";
import { describe, expect, it, vi } from "vitest";
import type { ExtensionScope } from "$/kernel/extensions";
import {
	type TrustedJsActivationContext,
	type TrustedJsPluginEntry,
	TrustedJsPluginService,
	type TrustedJsPluginStateRecord,
} from "$/plugins/trusted/trusted-js-service";

interface FakeHost {
	tag: string;
}

const createService = () => {
	const importModule = vi.fn(async (_url: string) => ({
		activate: vi.fn(),
	}));
	const requestConsent = vi.fn(async () => true);
	const states = new Map<string, TrustedJsPluginStateRecord>();
	const scopeDisposed: string[] = [];
	const hostDisposed: string[] = [];
	const createdHosts: { pluginId: string; signal: AbortSignal }[] = [];
	const service = new TrustedJsPluginService<FakeHost>({
		origin: "https://app.test",
		importModule,
		createScope: (pluginId) =>
			({
				dispose: () => scopeDisposed.push(pluginId),
			}) as unknown as ExtensionScope,
		createHost: ({ pluginId, signal }) => {
			createdHosts.push({ pluginId, signal });
			return {
				host: { tag: pluginId },
				dispose: () => hostDisposed.push(pluginId),
			};
		},
		requestConsent,
		state: {
			get: (pluginId) => states.get(pluginId) ?? null,
			set: (pluginId, record) => states.set(pluginId, record),
			remove: (pluginId) => states.delete(pluginId),
		},
		isDesktop: () => false,
		isDesktopTrustEnabled: () => false,
	});
	return {
		service,
		states,
		scopeDisposed,
		hostDisposed,
		createdHosts,
		importModule,
		requestConsent,
	};
};

const bundledEntry = (
	id: string,
	activate: (
		context: TrustedJsActivationContext<FakeHost>,
	) => unknown | Promise<unknown>,
): TrustedJsPluginEntry => ({
	id,
	name: id,
	version: "1.0.0",
	apiVersion: PLUGIN_API_VERSION,
	entry: "bundled",
	firstParty: true,
	loadModule: async () => ({ activate }),
});

describe("TrustedJsPluginService activation contract", () => {
	it.each([false, true])(
		"cancels activation without restoring disabled state (reject=%s)",
		async (reject) => {
			const { service, states, hostDisposed, scopeDisposed } = createService();
			const started = Promise.withResolvers<AbortSignal>();
			const activation = Promise.withResolvers<() => void>();
			const cleanup = vi.fn();
			const entry = bundledEntry("pending", ({ signal }) => {
				started.resolve(signal);
				return activation.promise;
			});
			const loading = service.load(entry);
			const signal = await started.promise;
			expect(await service.load(entry)).toMatchObject({
				reason: "already-loaded",
			});
			await service.setEnabled(entry.id, false);
			expect(signal.aborted).toBe(true);
			if (reject) activation.reject(new Error("aborted activation"));
			else activation.resolve(cleanup);
			expect(await loading).toMatchObject({
				ok: false,
				reason: "load-cancelled",
			});
			expect(service.getLoaded()).toEqual([]);
			expect(states.get(entry.id)).toMatchObject({
				disabled: true,
				pending: false,
				crashes: 0,
			});
			expect(hostDisposed).toEqual([entry.id]);
			expect(scopeDisposed).toEqual([entry.id]);
			expect(cleanup).toHaveBeenCalledTimes(reject ? 0 : 1);
			await service.setEnabled(entry.id, true);
			expect(
				await service.load(bundledEntry(entry.id, () => undefined)),
			).toEqual({ ok: true });
		},
	);

	it("cancels consent without importing or overwriting the disabled state", async () => {
		const { service, states, requestConsent, importModule } = createService();
		const consent = Promise.withResolvers<boolean>();
		requestConsent.mockReturnValue(consent.promise);
		const entry = {
			...bundledEntry("consent", () => undefined),
			loadModule: undefined,
			entry: "/plugin.js",
		};
		const loading = service.load(entry);
		expect(await service.load(entry)).toMatchObject({
			reason: "already-loaded",
		});
		expect(requestConsent).toHaveBeenCalledTimes(1);
		await service.setEnabled(entry.id, false);
		consent.resolve(true);
		expect(await loading).toMatchObject({ reason: "load-cancelled" });
		expect(importModule).not.toHaveBeenCalled();
		expect(states.get(entry.id)).toMatchObject({
			disabled: true,
			crashes: 0,
			pending: false,
		});
	});

	it.each(["beforeImport", "import"])(
		"unloadAll cancels at %s and releases the loading slot",
		async (stage) => {
			const { service, states, createdHosts } = createService();
			const started = Promise.withResolvers<void>();
			const gate = Promise.withResolvers<void>();
			const activate = vi.fn();
			const wait = () => {
				started.resolve();
				return gate.promise;
			};
			const entry = {
				...bundledEntry("pending", activate),
				beforeImport: stage === "beforeImport" ? wait : undefined,
				loadModule: async () => {
					if (stage === "import") await wait();
					return { activate };
				},
			};
			const loading = service.load(entry);
			await started.promise;
			await service.unloadAll();
			expect(await service.load(entry)).toMatchObject({
				reason: "already-loaded",
			});
			gate.resolve();
			expect(await loading).toMatchObject({ reason: "load-cancelled" });
			expect(activate).not.toHaveBeenCalled();
			expect(createdHosts).toEqual([]);
			expect(states.get(entry.id)).toMatchObject({
				pending: false,
				crashes: 0,
			});
			expect(await service.load(entry)).toEqual({ ok: true });
		},
	);

	it("loads factory modules without consent regardless of first-party labeling", async () => {
		const { service, requestConsent, importModule } = createService();
		requestConsent.mockResolvedValue(false);
		const activate = vi.fn();
		expect(
			await service.load({
				...bundledEntry("factory", activate),
				firstParty: false,
			}),
		).toEqual({ ok: true });
		expect(activate).toHaveBeenCalledTimes(1);
		expect(requestConsent).not.toHaveBeenCalled();
		expect(importModule).not.toHaveBeenCalled();
	});

	it.each([true, false])(
		"waits for consent before importing remote code (firstParty=%s)",
		async (firstParty) => {
			const { service, requestConsent, importModule } = createService();
			let approve!: (approved: boolean) => void;
			requestConsent.mockImplementation(
				() =>
					new Promise<boolean>((resolve) => {
						approve = resolve;
					}),
			);
			const loading = service.load({
				id: "remote",
				name: "Remote plugin",
				version: "1.0.0",
				apiVersion: PLUGIN_API_VERSION,
				entry: "/plugins/remote.js",
				firstParty,
			});
			expect(requestConsent).toHaveBeenCalledTimes(1);
			expect(importModule).not.toHaveBeenCalled();
			approve(true);
			expect(await loading).toEqual({ ok: true });
			expect(importModule).toHaveBeenCalledWith(
				"https://app.test/plugins/remote.js",
			);
		},
	);

	it("does not import a first-party remote module when consent is declined", async () => {
		const { service, requestConsent, importModule, createdHosts } =
			createService();
		requestConsent.mockResolvedValue(false);
		expect(
			await service.load({
				id: "remote",
				name: "Remote plugin",
				version: "1.0.0",
				apiVersion: PLUGIN_API_VERSION,
				entry: "/plugins/remote.js",
				firstParty: true,
			}),
		).toMatchObject({ ok: false, reason: "consent-declined" });
		expect(importModule).not.toHaveBeenCalled();
		expect(createdHosts).toEqual([]);
	});

	it("reuses remote consent only while the consent key remains unchanged", async () => {
		const { service, requestConsent, importModule } = createService();
		const entry: TrustedJsPluginEntry = {
			id: "remote",
			name: "Remote plugin",
			version: "1.0.0",
			apiVersion: PLUGIN_API_VERSION,
			entry: "/plugins/remote.js",
			firstParty: true,
			consentKey: "artifact-v1",
		};
		expect(await service.load(entry)).toEqual({ ok: true });
		await service.unload(entry.id);
		expect(await service.load(entry)).toEqual({ ok: true });
		expect(requestConsent).toHaveBeenCalledTimes(1);
		expect(importModule).toHaveBeenCalledTimes(2);
		await service.unload(entry.id);
		requestConsent.mockResolvedValue(false);
		expect(
			await service.load({ ...entry, consentKey: "artifact-v2" }),
		).toMatchObject({ ok: false, reason: "consent-declined" });
		expect(requestConsent).toHaveBeenCalledTimes(2);
		expect(importModule).toHaveBeenCalledTimes(2);
	});

	it("activates with { pluginId, host, signal } and aborts the signal before cleanup on unload", async () => {
		const { service, scopeDisposed, hostDisposed, createdHosts } =
			createService();
		let context: TrustedJsActivationContext<FakeHost> | undefined;
		const abortedAtCleanup: boolean[] = [];
		const cleanup = vi.fn(() => {
			abortedAtCleanup.push(context?.signal.aborted ?? false);
		});
		const result = await service.load(
			bundledEntry("plugin.a", (ctx) => {
				context = ctx;
				return cleanup;
			}),
		);
		expect(result).toEqual({ ok: true });
		expect(context).toMatchObject({
			pluginId: "plugin.a",
			host: { tag: "plugin.a" },
		});
		expect(Object.keys(context ?? {}).sort()).toEqual([
			"host",
			"pluginId",
			"signal",
		]);
		expect(context?.signal.aborted).toBe(false);
		expect(createdHosts[0].signal).toBe(context?.signal);

		await service.unload("plugin.a");
		expect(cleanup).toHaveBeenCalledTimes(1);
		expect(abortedAtCleanup).toEqual([true]);
		expect(hostDisposed).toEqual(["plugin.a"]);
		expect(scopeDisposed).toEqual(["plugin.a"]);
		expect(service.isLoaded("plugin.a")).toBe(false);
	});

	it("aborts the signal and disposes host and scope when activation throws", async () => {
		const { service, states, scopeDisposed, hostDisposed } = createService();
		let signal: AbortSignal | undefined;
		const result = await service.load(
			bundledEntry("plugin.b", (ctx) => {
				signal = ctx.signal;
				throw new Error("boom");
			}),
		);
		expect(result).toMatchObject({ ok: false, reason: "activation-failed" });
		expect(signal?.aborted).toBe(true);
		expect(hostDisposed).toEqual(["plugin.b"]);
		expect(scopeDisposed).toEqual(["plugin.b"]);
		expect(states.get("plugin.b")).toMatchObject({
			crashes: 1,
			pending: false,
		});
	});

	it("disabling a live plugin unloads it and aborts in-flight work", async () => {
		const { service } = createService();
		let signal: AbortSignal | undefined;
		await service.load(
			bundledEntry("plugin.c", (ctx) => {
				signal = ctx.signal;
			}),
		);
		await service.setEnabled("plugin.c", false);
		expect(signal?.aborted).toBe(true);
		expect(service.isLoaded("plugin.c")).toBe(false);
		expect(
			await service.load(bundledEntry("plugin.c", () => undefined)),
		).toMatchObject({ ok: false, reason: "user-disabled" });
	});
});
