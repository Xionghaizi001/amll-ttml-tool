import { describe, expect, it, vi } from "vitest";
import { CommandRegistry } from "$/kernel/commands";
import { ExtensionRegistry } from "$/kernel/extensions";

const pluginScope = (registry: ExtensionRegistry, pluginId: string) =>
	registry.createScope({
		kind: "plugin",
		pluginId,
		runtime: "trusted-js",
		trusted: true,
	});

const setup = () => {
	const commands = new CommandRegistry();
	const registry = new ExtensionRegistry(commands);
	const target = pluginScope(registry, "target");
	target.registerCommand({
		id: "target.run",
		title: { default: "Run", "zh-CN": "运行" },
		category: "Tools",
		handler: () => "ran",
	});
	target.registerTitleBarAction({
		command: "target.run",
		icon: { source: "@fluentui/react-icons", name: "TimerRegular" },
		tooltip: "Run it",
	});
	target.registerFormatProvider({
		formatId: "target.fmt",
		title: "Fmt",
		extensions: ["fmt"],
		importer: async () => {
			throw new Error("unused");
		},
	});
	return { commands, registry, target };
};

describe("localization override layer", () => {
	it("routes plugin-owned LocalizedText and icons through the overriding scope and reverts on dispose", async () => {
		const { commands, registry } = setup();
		const changed = vi.fn();
		registry.contributions.subscribe(changed);
		const pack = pluginScope(registry, "pack");
		pack.registerOverride({
			targetPluginId: "target",
			kind: "localization",
			payload: {
				"/commands/target.run/title": { default: "Execute", ja: "実行" },
				"/titleBarActions/target.run/tooltip": "Execute it",
				"/formats/target.fmt/title": "Format",
			},
		});
		pack.registerOverride({
			targetPluginId: "target",
			kind: "icons",
			payload: {
				"/titleBarActions/target.run/icon": { source: "@fluentui/react-icons", name: "StopRegular" },
			},
		});
		expect(changed).toHaveBeenCalledTimes(2);
		// Per-locale merge: zh-CN is not covered by the pack and stays original.
		expect(commands.get("target.run")?.title).toEqual({
			default: "Execute",
			"zh-CN": "运行",
			ja: "実行",
		});
		expect(commands.get("target.run")?.category).toBe("Tools");
		const [action] = registry.contributions.getTitleBarActions();
		expect(action.tooltip).toEqual({ default: "Execute it" });
		expect(action.icon.name).toBe("StopRegular");
		expect(registry.contributions.getFormatProvider("target.fmt")?.title).toEqual({
			default: "Format",
		});
		expect(registry.contributions.overrides.getSources("target")).toEqual([
			{
				sourcePluginId: "pack",
				kind: "localization",
				keys: [
					"/commands/target.run/title",
					"/titleBarActions/target.run/tooltip",
					"/formats/target.fmt/title",
				],
				shadowedBy: [],
			},
			{
				sourcePluginId: "pack",
				kind: "icons",
				keys: ["/titleBarActions/target.run/icon"],
				shadowedBy: [],
			},
		]);
		// Behavior and ids are untouched.
		await expect(commands.execute("target.run")).resolves.toBe("ran");

		pack.dispose();
		expect(commands.get("target.run")?.title).toEqual({ default: "Run", "zh-CN": "运行" });
		expect(registry.contributions.getTitleBarActions()[0].icon.name).toBe("TimerRegular");
		expect(registry.contributions.getFormatProvider("target.fmt")?.title).toBe("Fmt");
		expect(registry.contributions.overrides.getSources("target")).toEqual([]);
		expect(changed).toHaveBeenCalledTimes(4);
	});

	it("lets the last enabled source win a key+locale and falls back to the earlier one when it leaves", () => {
		const { commands, registry } = setup();
		const first = pluginScope(registry, "first");
		const second = pluginScope(registry, "second");
		first.registerOverride({
			targetPluginId: "target",
			kind: "localization",
			payload: { "/commands/target.run/title": { default: "First", ja: "一" } },
		});
		second.registerOverride({
			targetPluginId: "target",
			kind: "localization",
			payload: { "/commands/target.run/title": { default: "Second" } },
		});
		expect(commands.get("target.run")?.title).toEqual({
			default: "Second",
			"zh-CN": "运行",
			ja: "一",
		});
		second.dispose();
		expect(commands.get("target.run")?.title).toEqual({
			default: "First",
			"zh-CN": "运行",
			ja: "一",
		});
	});

	it("orders sources by enabledAt rather than load order and reports key+locale conflicts", () => {
		const { commands, registry } = setup();
		const conflicts = vi.fn();
		registry.contributions.overrides.onConflict(conflicts);
		const newer = pluginScope(registry, "newer");
		const older = pluginScope(registry, "older");
		newer.registerOverride({
			targetPluginId: "target",
			kind: "localization",
			enabledAt: 200,
			payload: {
				"/commands/target.run/title": { default: "Newer" },
				"/commands/target.run/category": { ja: "道具" },
			},
		});
		expect(conflicts).not.toHaveBeenCalled();
		// Startup may load the older overrider second; it must still lose.
		older.registerOverride({
			targetPluginId: "target",
			kind: "localization",
			enabledAt: 100,
			payload: {
				"/commands/target.run/title": { default: "Older", ja: "古い" },
				"/commands/target.run/category": "Older tools",
			},
		});
		expect(commands.get("target.run")?.title).toEqual({
			default: "Newer",
			"zh-CN": "运行",
			ja: "古い",
		});
		// Different locales of the same key are a merge, not a conflict.
		expect(conflicts).toHaveBeenCalledTimes(1);
		expect(conflicts).toHaveBeenCalledWith([
			{
				targetPluginId: "target",
				kind: "localization",
				winnerPluginId: "newer",
				winnerEnabledAt: 200,
				loserPluginId: "older",
				keys: ["/commands/target.run/title"],
			},
		]);
		expect(registry.contributions.overrides.getSources("target")).toEqual([
			expect.objectContaining({
				sourcePluginId: "older",
				shadowedBy: [{ sourcePluginId: "newer", keys: ["/commands/target.run/title"] }],
			}),
			expect.objectContaining({ sourcePluginId: "newer", shadowedBy: [] }),
		]);

		// One plugin's own resources never conflict with each other.
		older.registerOverride({
			targetPluginId: "target",
			kind: "localization",
			enabledAt: 100,
			payload: { "/commands/target.run/title": { ja: "古い2" } },
		});
		expect(conflicts).toHaveBeenCalledTimes(1);
	});

	it("never creates a surface, touches builtin owners or lets a plugin override itself", () => {
		const commands = new CommandRegistry();
		const registry = new ExtensionRegistry(commands);
		const target = pluginScope(registry, "target");
		target.registerCommand({ id: "target.untitled", handler: () => {} });
		const builtin = registry.createScope({ kind: "builtin", id: "target", trusted: true });
		builtin.registerCommand({ id: "core.thing", title: "Thing", handler: () => {} });
		pluginScope(registry, "pack").registerOverride({
			targetPluginId: "target",
			kind: "localization",
			payload: {
				"/commands/target.untitled/title": "Created",
				"/commands/core.thing/title": "Hijacked",
			},
		});
		expect(commands.get("target.untitled")?.title).toBeUndefined();
		expect(commands.get("core.thing")?.title).toBe("Thing");
		expect(() =>
			target.registerOverride({ targetPluginId: "target", kind: "localization", payload: {} }),
		).toThrow(/itself/);
		expect(() =>
			builtin.registerOverride({ targetPluginId: "target", kind: "localization", payload: {} }),
		).toThrow(/Builtin/);
	});

	it("resolves the owner's own string surfaces and notifies only that owner", () => {
		const registry = new ExtensionRegistry(new CommandRegistry());
		const target = pluginScope(registry, "target");
		const other = pluginScope(registry, "other");
		const targetListener = vi.fn();
		const otherListener = vi.fn();
		target.onOwnOverridesChanged(targetListener);
		other.onOwnOverridesChanged(otherListener);
		const pack = pluginScope(registry, "pack");
		pack.registerOverride({
			targetPluginId: "target",
			kind: "localization",
			payload: { "/strings/hello": { default: "Hi", fr: "Salut" } },
		});
		expect(target.resolveOwnText("/strings/hello", "Hello")).toEqual({ default: "Hi", fr: "Salut" });
		expect(other.resolveOwnText("/strings/hello", "Hello")).toBe("Hello");
		expect(targetListener).toHaveBeenCalledTimes(1);
		expect(otherListener).not.toHaveBeenCalled();
		target.dispose();
		pack.dispose();
		expect(targetListener).toHaveBeenCalledTimes(1);
	});
});
