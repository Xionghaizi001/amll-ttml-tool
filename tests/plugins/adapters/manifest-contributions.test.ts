import type { FunctionPluginManifest } from "@amll-ttml-tool/plugin-api";
import { describe, expect, it, vi } from "vitest";
import { CommandRegistry } from "$/kernel/commands";
import { ExtensionRegistry } from "$/kernel/extensions";
import { registerManifestContributions } from "$/plugins/adapters/manifest-contributions";

const manifest: FunctionPluginManifest = {
	id: "example.declarative",
	name: "Declarative",
	version: "0.1.0",
	kind: "function",
	apiVersion: 0,
	runtime: "extism-wasm",
	entry: "plugin.wasm",
	capabilities: ["ui.notify", "ui.form"],
	contributes: {
		commands: [
			{
				id: "example.declarative.run",
				title: "Run",
				enablement: "hasSelection",
			},
		],
		menus: [{ command: "example.declarative.run", menu: "menu.tool" }],
		settings: [
			{
				id: "example.declarative.settings",
				title: "Settings",
				form: { title: "Settings", fields: [] },
			},
		],
		titleBarActions: [
			{
				command: "example.declarative.run",
				icon: { source: "@fluentui/react-icons", name: "PlayRegular" },
				tooltip: "Run",
				when: "mode == 'edit'",
			},
		],
	},
};

describe("registerManifestContributions", () => {
	it("exposes only command, menu, declarative form and title bar action records for third parties", async () => {
		const commands = new CommandRegistry();
		const extensions = new ExtensionRegistry(commands);
		const scope = extensions.createScope({
			kind: "plugin",
			pluginId: manifest.id,
			runtime: "extism-wasm",
			trusted: false,
		});
		const executeCommand = vi.fn();
		registerManifestContributions(scope, manifest, {
			executeCommand,
			getEnablementContext: () => ({ hasSelection: true }),
		});

		await commands.execute("example.declarative.run", { amount: 5 });
		expect(executeCommand).toHaveBeenCalledWith("example.declarative.run", {
			amount: 5,
		});
		expect(extensions.contributions.getAll().map((item) => item.kind)).toEqual([
			"menu",
			"settings",
			"titlebar-action",
		]);
		expect(extensions.contributions.getTitleBarActions()).toHaveLength(1);
		scope.dispose();
		expect(commands.getAll()).toHaveLength(0);
		expect(extensions.contributions.getAll()).toHaveLength(0);
	});

	it("rejects toolbar/sidebar surfaces until they leave the MVP allowlist", () => {
		const extensions = new ExtensionRegistry(new CommandRegistry());
		const scope = extensions.createScope({
			kind: "plugin",
			pluginId: manifest.id,
			runtime: "extism-wasm",
			trusted: false,
		});
		expect(() =>
			scope.registerMenu({
				command: "example.declarative.run",
				menu: "toolbar.edit",
			}),
		).toThrow("cannot register toolbar.edit");
		expect(() =>
			scope.registerMenu({
				command: "example.declarative.run",
				menu: "sidebar.panel",
			}),
		).toThrow("cannot register sidebar.panel");
	});

	it("rejects manifests declaring mode contributions at the trust boundary", () => {
		const extensions = new ExtensionRegistry(new CommandRegistry());
		const scope = extensions.createScope({
			kind: "plugin",
			pluginId: manifest.id,
			runtime: "extism-wasm",
			trusted: false,
		});
		const withModes = {
			...manifest,
			contributes: {
				...manifest.contributes,
				modes: [{ modeId: "example.declarative.page", title: "Page" }],
			},
		} as unknown as FunctionPluginManifest;
		expect(() =>
			registerManifestContributions(scope, withModes, {
				executeCommand: vi.fn(),
				getEnablementContext: () => ({}),
			}),
		).toThrow("trusted builtin scopes");
		expect(extensions.contributions.getAll()).toHaveLength(0);
	});
});
