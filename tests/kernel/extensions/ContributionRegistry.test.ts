import { describe, expect, it, vi } from "vitest";
import { CommandRegistry } from "$/kernel/commands";
import { ExtensionRegistry } from "$/kernel/extensions/ContributionRegistry";

describe("ExtensionRegistry", () => {
	it("cleans commands, contributions and listeners when a plugin unloads", async () => {
		const commands = new CommandRegistry();
		const registry = new ExtensionRegistry(commands);
		const scope = registry.createScope({
			kind: "plugin",
			pluginId: "example.shift",
			runtime: "extism-wasm",
			trusted: false,
		});
		const listener = vi.fn();
		scope.registerCommand({
			id: "example.shift.run",
			handler: () => "ok",
		});
		scope.registerMenu({
			command: "example.shift.run",
			menu: "menu.tool",
		});
		scope.addEventListener("document.changed", listener);

		await expect(commands.execute("example.shift.run")).resolves.toBe("ok");
		expect(registry.contributions.getMenus("menu.tool")).toHaveLength(1);
		registry.emit("document.changed", { revision: 1 });
		expect(listener).toHaveBeenCalledTimes(1);

		scope.dispose();
		expect(commands.get("example.shift.run")).toBeUndefined();
		expect(registry.contributions.getMenus("menu.tool")).toHaveLength(0);
		registry.emit("document.changed", { revision: 2 });
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("keeps plugin registrations inside their own id namespace", () => {
		const registry = new ExtensionRegistry(new CommandRegistry());
		const scope = registry.createScope({
			kind: "plugin",
			pluginId: "example.shift",
			runtime: "extism-wasm",
			trusted: false,
		});
		expect(() =>
			scope.registerCommand({ id: "file.save", handler: () => undefined }),
		).toThrow("outside its own namespace");
		expect(() =>
			scope.registerMenu({ command: "file.save", menu: "menu.tool" }),
		).toThrow("outside its own namespace");
		expect(() =>
			scope.registerDeclarativeForm({
				id: "builtin.other.settings",
				kind: "settings",
				title: "Settings",
				form: { title: "Settings", fields: [] },
			}),
		).toThrow("outside its own namespace");
		scope.registerCommand({
			id: "example.shift.run",
			handler: () => undefined,
		});
	});

	it("isolates a throwing event listener from the listeners after it", () => {
		const registry = new ExtensionRegistry(new CommandRegistry());
		const first = registry.createScope({
			kind: "plugin",
			pluginId: "example.crashy",
			runtime: "extism-wasm",
			trusted: false,
		});
		const second = registry.createScope({
			kind: "plugin",
			pluginId: "example.stable",
			runtime: "extism-wasm",
			trusted: false,
		});
		const survivor = vi.fn();
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		first.addEventListener("document.changed", () => {
			throw new Error("boom");
		});
		second.addEventListener("document.changed", survivor);
		registry.emit("document.changed", { revision: 1 });
		expect(survivor).toHaveBeenCalledTimes(1);
		consoleError.mockRestore();
	});

	it("keeps third-party plugins declarative and reserves React-like views for builtins", () => {
		const registry = new ExtensionRegistry<object>(new CommandRegistry());
		const thirdParty = registry.createScope({
			kind: "plugin",
			pluginId: "example.external",
			runtime: "extism-wasm",
			trusted: false,
		});
		expect(() =>
			thirdParty.registerTrustedView({
				id: "example.external.sidebar",
				kind: "sidebar",
				title: "Unsafe",
				view: { arbitraryHtml: "<script />" },
			}),
		).toThrow("cannot register trusted view");
		expect(() =>
			thirdParty.registerToolbar({
				id: "example.external.toolbar",
				commandId: "example.external.run",
				location: "toolbar.edit",
			}),
		).toThrow("cannot register toolbar");

		const builtin = registry.createScope({
			kind: "builtin",
			id: "builtin.example",
			trusted: true,
		});
		builtin.registerTrustedView({
			id: "builtin.example.sidebar",
			kind: "sidebar",
			title: "Trusted",
			view: { component: "TrustedReactComponent" },
		});
		expect(registry.contributions.getAll()).toHaveLength(1);
	});

	it("maintains host registries for toolbar, sidebar, settings and dialogs", () => {
		const registry = new ExtensionRegistry<object>(new CommandRegistry());
		const builtin = registry.createScope({
			kind: "builtin",
			id: "builtin.surfaces",
			trusted: true,
		});
		builtin.registerToolbar({
			id: "builtin.surfaces.toolbar",
			commandId: "builtin.surfaces.run",
			location: "toolbar.edit",
		});
		builtin.registerTrustedView({
			id: "builtin.surfaces.sidebar",
			kind: "sidebar",
			title: "Sidebar",
			view: { component: "Sidebar" },
		});
		builtin.registerDeclarativeForm({
			id: "builtin.surfaces.settings",
			kind: "settings",
			title: "Settings",
			form: { title: "Settings", fields: [] },
		});
		builtin.registerDeclarativeForm({
			id: "builtin.surfaces.dialog",
			kind: "dialog",
			title: "Dialog",
			form: { title: "Dialog", fields: [] },
		});
		expect(registry.contributions.getAll().map((item) => item.kind)).toEqual([
			"toolbar",
			"sidebar",
			"settings",
			"dialog",
		]);
	});

	it("restricts mode (main page) contributions to trusted builtin scopes", () => {
		const registry = new ExtensionRegistry<object>(new CommandRegistry());
		const thirdParty = registry.createScope({
			kind: "plugin",
			pluginId: "example.external",
			runtime: "extism-wasm",
			trusted: false,
		});
		expect(() =>
			thirdParty.registerMode({
				modeId: "example.external.review",
				title: "Review",
				mainView: { arbitraryHtml: "<script />" },
			}),
		).toThrow("cannot register mode contributions");

		const builtin = registry.createScope({
			kind: "builtin",
			id: "builtin.review",
			trusted: true,
		});
		builtin.registerMode({
			modeId: "builtin.review.review",
			title: "Review",
			order: 400,
			mainView: { component: "ReviewPage" },
			ribbonView: { component: "ReviewRibbon" },
			titleBarActions: { component: "ReviewActionGroup" },
			hideSidebar: true,
		});
		expect(
			registry.contributions.getModes().map((mode) => mode.modeId),
		).toEqual(["builtin.review.review"]);
	});

	it("keeps the edit fail-safe mode unique, unconditional and the fallback target", () => {
		const registry = new ExtensionRegistry<object>(new CommandRegistry());
		const core = registry.createScope({
			kind: "builtin",
			id: "core.modes",
			trusted: true,
		});
		core.registerMode({ modeId: "edit", title: "Edit", mainView: {} });
		expect(() =>
			core.registerMode({
				id: "core.modes.mode.edit-again",
				modeId: "edit",
				title: "Edit again",
				mainView: {},
			}),
		).toThrow("already registered");
		expect(() =>
			core.registerMode({
				id: "core.modes.mode.edit-hidden",
				modeId: "edit-hidden",
				title: "Edit hidden",
				mainView: {},
				when: "hasSelection",
			}),
		).not.toThrow();
		const otherScope = registry.createScope({
			kind: "builtin",
			id: "builtin.review",
			trusted: true,
		});
		expect(() =>
			otherScope.registerMode({
				id: "builtin.review.mode.edit",
				modeId: "edit",
				title: "Fake edit",
				mainView: {},
				when: "false",
			}),
		).toThrow();

		const review = otherScope.registerMode({
			modeId: "builtin.review.review",
			title: "Review",
			mainView: {},
		});
		expect(
			registry.contributions.resolveActiveModeId("builtin.review.review"),
		).toBe("builtin.review.review");
		review.dispose();
		// Active mode vanished (plugin disabled/unloaded/crashed): fall back.
		expect(
			registry.contributions.resolveActiveModeId("builtin.review.review"),
		).toBe("edit");
		expect(registry.contributions.resolveActiveModeId("unknown.mode")).toBe(
			"edit",
		);
	});

	it("sorts modes by order and refuses a conditional fail-safe mode", () => {
		const registry = new ExtensionRegistry<object>(new CommandRegistry());
		const core = registry.createScope({
			kind: "builtin",
			id: "core.modes",
			trusted: true,
		});
		expect(() =>
			core.registerMode({
				modeId: "edit",
				title: "Edit",
				mainView: {},
				when: "mode == 'edit'",
			}),
		).toThrow("fail-safe mode cannot be conditionally hidden");
		core.registerMode({
			modeId: "preview",
			title: "Preview",
			order: 300,
			mainView: {},
		});
		core.registerMode({ modeId: "edit", title: "Edit", order: 100, mainView: {} });
		core.registerMode({ modeId: "sync", title: "Sync", order: 200, mainView: {} });
		expect(
			registry.contributions.getModes().map((mode) => mode.modeId),
		).toEqual(["edit", "sync", "preview"]);
	});

	it("caps declarative title bar actions per plugin and enforces namespaces", () => {
		const registry = new ExtensionRegistry(new CommandRegistry());
		const scope = registry.createScope({
			kind: "plugin",
			pluginId: "example.actions",
			runtime: "extism-wasm",
			trusted: false,
		});
		const icon = {
			source: "@fluentui/react-icons",
			name: "PlayRegular",
		} as const;
		expect(() =>
			scope.registerTitleBarAction({
				command: "file.save",
				icon,
				tooltip: "Steal save",
			}),
		).toThrow("outside its own namespace");
		for (let index = 0; index < 3; index += 1)
			scope.registerTitleBarAction({
				command: `example.actions.run${index}`,
				icon,
				tooltip: `Run ${index}`,
			});
		expect(() =>
			scope.registerTitleBarAction({
				command: "example.actions.run3",
				icon,
				tooltip: "One too many",
			}),
		).toThrow("cannot register more than 3 title bar actions");
		expect(registry.contributions.getTitleBarActions()).toHaveLength(3);
		scope.dispose();
		expect(registry.contributions.getTitleBarActions()).toHaveLength(0);
	});

	it("reserves title bar action groups for trusted builtin scopes", () => {
		const registry = new ExtensionRegistry<object>(new CommandRegistry());
		const thirdParty = registry.createScope({
			kind: "plugin",
			pluginId: "example.external",
			runtime: "extism-wasm",
			trusted: false,
		});
		expect(() =>
			thirdParty.registerTrustedView({
				id: "example.external.titlebar",
				kind: "titlebar-group",
				title: "Unsafe",
				view: { arbitraryHtml: "<script />" },
			}),
		).toThrow("cannot register trusted view");
		const builtin = registry.createScope({
			kind: "builtin",
			id: "builtin.review",
			trusted: true,
		});
		builtin.registerTrustedView({
			id: "builtin.review.titlebar",
			kind: "titlebar-group",
			title: "Review actions",
			view: { component: "ReviewActionGroup" },
		});
		expect(
			registry.contributions.getTrustedViews("titlebar-group"),
		).toHaveLength(1);
	});
});
