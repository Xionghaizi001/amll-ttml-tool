import { PLUGIN_API_VERSION } from "@amll-ttml-tool/plugin-api";
import { describe, expect, it, vi } from "vitest";
import { CommandRegistry } from "$/kernel/commands";
import { ExtensionRegistry, type ExtensionScope } from "$/kernel/extensions";
import { resolveEntryOverrides } from "$/plugins/trusted/plugin-overrides";
import {
	type TrustedJsPluginEntry,
	TrustedJsPluginService,
	type TrustedJsPluginStateRecord,
} from "$/plugins/trusted/trusted-js-service";
import { createRealTrustedHost } from "./real-host-fixture";

interface LoaderHost {
	scope: ExtensionScope;
}

const targetEntry: TrustedJsPluginEntry = {
	id: "target",
	name: "Target",
	version: "1.0.0",
	apiVersion: PLUGIN_API_VERSION,
	entry: "bundled",
	firstParty: true,
	contributes: {
		commands: [{ id: "target.run", title: "Run" }],
	},
	strings: { hello: "Hello" },
	loadModule: async () => ({
		activate: ({ host }: { host: LoaderHost }) => {
			host.scope.registerCommand({ id: "target.run", title: "Run", handler: () => "ran" });
		},
	}),
};

const packEntry = (id: string, title: string): TrustedJsPluginEntry => ({
	id,
	name: id,
	version: "1.0.0",
	apiVersion: PLUGIN_API_VERSION,
	entry: "bundled",
	firstParty: true,
	dependencies: [{ id: "target", version: "^1.0.0" }],
	overrides: [{ pluginId: "target", kind: "localization", entry: "strings/l10n.json" }],
	resources: {
		"strings/l10n.json": {
			"/commands/target.run/title": title,
			"/commands/target.run/id": "hijack",
			"/strings/hello": `${title}!`,
		},
	},
	loadModule: async () => ({ activate: () => {} }),
});

const createLoader = () => {
	const commands = new CommandRegistry();
	const extensions = new ExtensionRegistry(commands);
	const states = new Map<string, TrustedJsPluginStateRecord>();
	const warn = vi.fn();
	const service: TrustedJsPluginService<LoaderHost> =
		new TrustedJsPluginService({
			origin: "https://app.test",
			importModule: async () => ({}),
			createScope: (pluginId) =>
				extensions.createScope({ kind: "plugin", pluginId, runtime: "trusted-js", trusted: true }),
			createHost: ({ scope }) => ({ host: { scope }, dispose: () => {} }),
			requestConsent: async () => true,
			state: {
				get: (id) => states.get(id) ?? null,
				set: (id, record) => states.set(id, record),
				remove: (id) => states.delete(id),
			},
			isDesktop: () => false,
			isDesktopTrustEnabled: () => true,
			resolveOverrides: (entry) =>
				resolveEntryOverrides(entry, (id) => service.getEntry(id), warn),
		});
	return { commands, extensions, service, warn };
};

describe("trusted-js localization overrides", () => {
	it("applies a language pack at activation, logs ignored keys and reverts on unload", async () => {
		const { commands, extensions, service, warn } = createLoader();
		await service.load(targetEntry);
		await expect(service.load(packEntry("pack.a", "A"))).resolves.toEqual({ ok: true });
		expect(commands.get("target.run")?.title).toEqual({ default: "A" });
		expect(warn).toHaveBeenCalledWith(
			expect.stringMatching(/pack\.a -> target .*\/commands\/target\.run\/id unknown or non-overridable/),
		);
		await expect(commands.execute("target.run")).resolves.toBe("ran");

		await service.load(packEntry("pack.b", "B"));
		expect(commands.get("target.run")?.title).toEqual({ default: "B" });
		expect(
			extensions.contributions.overrides.getSources("target").map((source) => source.sourcePluginId),
		).toEqual(["pack.a", "pack.b"]);

		await service.unload("pack.b");
		expect(commands.get("target.run")?.title).toEqual({ default: "A" });
		await service.unload("pack.a");
		expect(commands.get("target.run")?.title).toBe("Run");
	});

	it("skips overrides whose target is not live without failing the overrider", () => {
		const warn = vi.fn();
		expect(resolveEntryOverrides(packEntry("pack", "X"), () => undefined, warn)).toEqual([]);
		expect(warn).toHaveBeenCalledWith(expect.stringMatching(/pack -> target .*not a live trusted-js plugin/));
	});

	it("routes host.i18n.t through the override layer and re-notifies locale listeners", () => {
		const { host, extensions } = createRealTrustedHost({
			pluginId: "target",
			strings: { hello: { default: "Hello {name}", fr: "Bonjour {name}" } },
			locale: "fr",
		});
		const listener = vi.fn();
		host.i18n.onLocaleChanged(listener);
		const pack = extensions.createScope({ kind: "plugin", pluginId: "pack", runtime: "trusted-js", trusted: true });
		pack.registerOverride({
			targetPluginId: "target",
			kind: "localization",
			payload: { "/strings/hello": { fr: "Salut {name}" } },
		});
		expect(host.i18n.t("hello", { name: "A" })).toBe("Salut A");
		expect(listener).toHaveBeenLastCalledWith("fr");
		pack.dispose();
		expect(host.i18n.t("hello", { name: "A" })).toBe("Bonjour A");
		expect(listener).toHaveBeenCalledTimes(2);
	});
});
