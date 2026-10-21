import { PLUGIN_API_VERSION } from "@amll-ttml-tool/plugin-api";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandRegistry } from "$/kernel/commands";
import { ExtensionRegistry, type ExtensionScope } from "$/kernel/extensions";
import {
	createOverrideConflictNotices,
	resolveEntryOverrides,
} from "$/plugins/trusted/plugin-overrides";
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
			"/commands/target.run/handler": "hijack",
			"/commands/target.run/enablement": "hijack",
			"/capabilities": "hijack",
			"/activationEvents": "hijack",
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
	return { commands, extensions, service, states, warn };
};

describe("trusted-js localization overrides", () => {
	afterEach(() => vi.restoreAllMocks());
	it("applies a language pack at activation, logs ignored keys and reverts on unload", async () => {
		const { commands, extensions, service, warn } = createLoader();
		await service.load(targetEntry);
		await expect(service.load(packEntry("pack.a", "A"))).resolves.toEqual({ ok: true });
		expect(commands.get("target.run")?.title).toEqual({ default: "A" });
		expect(warn).toHaveBeenCalledWith(
			expect.stringMatching(/pack\.a -> target .*\/commands\/target\.run\/id unknown or non-overridable/),
		);
		await expect(commands.execute("target.run")).resolves.toBe("ran");
		for (const key of ["handler", "enablement", "capabilities", "activationEvents"])
			expect(warn).toHaveBeenCalledWith(expect.stringContaining(`${key} unknown or non-overridable`));
		expect(commands.get("target.run")?.id).toBe("target.run");

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

	it.each([100, 50])(
		"keeps the last enabled pack winning across restart when the clock stays at or rolls back to %i",
		async (now) => {
			const clock = vi.spyOn(Date, "now").mockReturnValue(100);
			const first = createLoader();
			await first.service.load(targetEntry);
			await first.service.load(packEntry("pack.a", "A"));
			await first.service.load(packEntry("pack.b", "B"));
			clock.mockReturnValue(now);
			await first.service.setEnabled("pack.a", false);
			await first.service.setEnabled("pack.a", true);
			await first.service.load(packEntry("pack.a", "A"));
			expect(first.commands.get("target.run")?.title).toEqual({ default: "A" });
			const enabledAt = first.states.get("pack.a")?.enabledAt ?? 0;
			expect(enabledAt).toBeGreaterThan(
				first.states.get("pack.b")?.enabledAt ?? Infinity,
			);

			// Next session restores pack.a before pack.b; pack.a still wins.
			const next = createLoader();
			for (const [id, state] of first.states)
				next.states.set(id, { ...state, pending: false });
			await next.service.load(targetEntry);
			await next.service.load(packEntry("pack.a", "A"));
			await next.service.load(packEntry("pack.b", "B"));
			expect(next.commands.get("target.run")?.title).toEqual({ default: "A" });
			expect(next.states.get("pack.a")?.enabledAt).toBe(enabledAt);
			await next.service.setEnabled("pack.b", false);
			await next.service.setEnabled("pack.b", true);
			await next.service.load(packEntry("pack.b", "B"));
			expect(next.commands.get("target.run")?.title).toEqual({ default: "B" });
			expect(next.states.get("pack.b")?.enabledAt).toBeGreaterThan(enabledAt);
		},
	);

	it("uses the latest user enable for a development language pack too", async () => {
		vi.spyOn(Date, "now").mockReturnValue(100);
		const { service, commands } = createLoader();
		const development = { ...packEntry("pack.dev", "Dev"), development: true };
		await service.load(targetEntry);
		await service.load(development);
		await service.load(packEntry("pack.b", "B"));
		expect(commands.get("target.run")?.title).toEqual({ default: "B" });
		await service.setEnabled(development.id, false);
		await service.setEnabled(development.id, true);
		await service.load(development);
		expect(commands.get("target.run")?.title).toEqual({ default: "Dev" });
	});

	it("announces only conflicts whose winner was enabled this session, once per enable", async () => {
		const { extensions, service, states } = createLoader();
		states.set("pack.old", { crashes: 0, pending: false, enabledAt: 1 });
		const notices = createOverrideConflictNotices(extensions.contributions.overrides, 10);
		const listener = vi.fn();
		notices.subscribe(listener);
		await service.load(targetEntry);
		states.set("pack.b", { crashes: 0, pending: false, enabledAt: 2 });
		await service.load(packEntry("pack.b", "B"));
		// Restored order from an earlier session: no reminder.
		await service.load(packEntry("pack.old", "Old"));
		expect(notices.current()).toBeUndefined();

		await service.setEnabled("pack.c", true);
		await service.load(packEntry("pack.c", "C"));
		expect(notices.current()).toEqual({
			targetPluginId: "target",
			winnerPluginId: "pack.c",
			loserPluginIds: ["pack.old", "pack.b"],
			keys: ["/commands/target.run/title", "/strings/hello"],
		});
		expect(listener).toHaveBeenCalled();
		notices.dismiss();

		// Reloading an unchanged winner (update / hot reload) does not repeat it.
		await service.unload("pack.c");
		await service.load(packEntry("pack.c", "C"));
		expect(notices.current()).toBeUndefined();
	});
});
