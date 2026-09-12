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
	const states = new Map<string, TrustedJsPluginStateRecord>();
	const scopeDisposed: string[] = [];
	const hostDisposed: string[] = [];
	const createdHosts: { pluginId: string; signal: AbortSignal }[] = [];
	const service = new TrustedJsPluginService<FakeHost>({
		origin: "https://app.test",
		importModule: async () => {
			throw new Error("remote import is not exercised here");
		},
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
		requestConsent: async () => true,
		state: {
			get: (pluginId) => states.get(pluginId) ?? null,
			set: (pluginId, record) => states.set(pluginId, record),
			remove: (pluginId) => states.delete(pluginId),
		},
		isDesktop: () => false,
		isDesktopTrustEnabled: () => false,
	});
	return { service, states, scopeDisposed, hostDisposed, createdHosts };
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
