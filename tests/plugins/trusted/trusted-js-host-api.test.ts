import type { TrustedJsViewV0 } from "@amll-ttml-tool/plugin-sdk-js";
import { describe, expect, it, vi } from "vitest";
import { createRealTrustedHost } from "./real-host-fixture";

const View = (() => null) as unknown as TrustedJsViewV0;

describe("createTrustedJsHost (real host over the SDK surface)", () => {
	it("projects the document with ruby and commits one labeled plugin transaction", () => {
		const { host, service } = createRealTrustedHost({ pluginId: "p" });
		const snapshot = host.document.readSnapshot();
		expect(snapshot.revision).toBe(0);
		expect(snapshot.lines[0].words[0].ruby).toEqual([
			{ text: "he", startTime: 100, endTime: 300 },
		]);
		expect("obscene" in snapshot.lines[0].words[0]).toBe(false);

		const events: unknown[] = [];
		service.subscribe((event) => events.push(event));
		const result = host.document.applyEdit(
			[
				{ op: "updateLine", lineId: "line-1", patch: { translation: "after" } },
				{ op: "updateWord", wordId: "word-1", patch: { startTime: 120 } },
			],
			"Two ops",
			{ expectedRevision: 0 },
		);
		expect(result).toEqual({ ok: true, value: { revision: 1, appliedOps: 2 } });
		expect(host.document.revision).toBe(1);
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			transaction: { source: "plugin", pluginId: "p", label: "Two ops" },
		});
		// Internal fields the projection does not carry survive the write-back.
		expect(service.readSnapshot().lyricLines[0].words[0].obscene).toBe(false);
		expect(service.readSnapshot().lyricLines[0].words[0].ruby).toHaveLength(1);

		expect(
			host.document.applyEdit([], "stale", { expectedRevision: 0 }),
		).toMatchObject({ ok: false, error: { code: "revision-conflict" } });
		expect(host.document.applyEdit([], "unchecked")).toMatchObject({
			ok: true,
		});
	});

	it("delivers document changes to onChanged until the host handle is disposed", () => {
		const { host, handle, service } = createRealTrustedHost({ pluginId: "p" });
		const listener = vi.fn();
		host.document.onChanged(listener);
		host.document.applyEdit(
			[{ op: "updateLine", lineId: "line-2", patch: { startTime: 1 } }],
			"edit",
		);
		expect(listener).toHaveBeenCalledWith(
			expect.objectContaining({
				revision: 1,
				source: "plugin",
				sourcePluginId: "p",
				changedLineIds: ["line-2"],
			}),
		);
		handle.dispose();
		service.transact({ source: "user", label: "manual" }, (draft) => {
			draft.lyricLines[1].startTime = 2;
		});
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("wraps commands, menus and title bar actions in the namespaced scope", async () => {
		const { host, commands, extensions, scope, setSelection } =
			createRealTrustedHost({ pluginId: "p" });
		expect(() =>
			host.commands.register({ id: "other.cmd", handler: () => undefined }),
		).toThrow(/outside its own namespace/);

		const handler = vi.fn();
		host.commands.register({
			id: "p.cmd",
			title: "Cmd",
			enablement: "hasLineSelection",
			handler,
		});
		host.menus.register({ command: "p.cmd", menu: "menu.edit", order: 5 });
		host.titleBarActions.register({
			command: "p.cmd",
			icon: { source: "@fluentui/react-icons", name: "AddRegular" },
			tooltip: "run",
		});

		expect(commands.isEnabled("p.cmd")).toBe(false);
		await expect(commands.execute("p.cmd")).rejects.toThrow(/disabled/);
		setSelection({ lineIds: ["line-1"], wordIds: [] });
		expect(commands.isEnabled("p.cmd")).toBe(true);
		await commands.execute("p.cmd", { x: 1 });
		expect(handler).toHaveBeenCalledWith({ x: 1 });
		expect(extensions.contributions.getMenus("menu.edit")[0]).toMatchObject({
			commandId: "p.cmd",
			owner: { kind: "plugin", pluginId: "p", runtime: "trusted-js" },
		});
		expect(extensions.contributions.getTitleBarActions()).toHaveLength(1);

		scope.dispose();
		expect(commands.get("p.cmd")).toBeUndefined();
		expect(extensions.contributions.getMenus("menu.edit")).toHaveLength(0);
		expect(extensions.contributions.getTitleBarActions()).toHaveLength(0);
	});

	it("registers format providers converting through the v0 projection", async () => {
		const { host, extensions } = createRealTrustedHost({ pluginId: "p" });
		host.formats.register({
			formatId: "p.txt",
			title: "Text",
			extensions: ["txt"],
			importer: ({ text }) => ({
				lines: text.split("\n").map((content, index) => ({
					words: [
						{
							text: content,
							startTime: index * 100,
							endTime: index * 100 + 50,
							emptyBeat: 0,
							romanText: "",
						},
					],
					translation: "",
					romanization: "",
					isBackground: false,
					isDuet: false,
					startTime: index * 100,
					endTime: index * 100 + 50,
					ignoreSync: false,
				})),
				metadata: [{ key: "source", values: ["txt"] }],
			}),
			exporter: ({ document }) =>
				document.lines
					.map((line) => line.words.map((word) => word.text).join(""))
					.join("\n"),
		});
		const provider = extensions.contributions.getFormatProvider("p.txt");
		expect(provider?.owner).toMatchObject({ pluginId: "p", trusted: true });

		const imported = await provider?.importer?.({
			text: "a\nb",
			fileName: "x.txt",
		});
		expect(imported?.lyricLines.map((line) => line.words[0].word)).toEqual([
			"a",
			"b",
		]);
		// One allocator per import: the line id is assigned before its word ids.
		expect(imported?.lyricLines[0].id).toBe("test-1-line-1");
		expect(imported?.lyricLines[0].words[0].id).toBe("test-1-word-2");
		expect(imported?.lyricLines[1].id).toBe("test-1-line-3");
		expect(imported?.metadata).toEqual([{ key: "source", value: ["txt"] }]);

		const exported = await provider?.exporter?.({
			lyric: imported as NonNullable<typeof imported>,
			fileName: "y.txt",
		});
		expect(exported).toBe("a\nb");
	});

	it("registers trusted views and modes through the host mode entry", () => {
		const registerMode = vi.fn((scope, input) => scope.registerMode(input));
		const { host, extensions, scope } = createRealTrustedHost({
			pluginId: "p",
			ports: { registerMode },
		});
		host.views.registerMode({ modeId: "p-mode", title: "P", mainView: View });
		host.views.registerView({
			id: "p.side",
			kind: "sidebar",
			title: "Side",
			view: View,
		});
		expect(registerMode).toHaveBeenCalledTimes(1);
		expect(
			extensions.contributions.getModes().map((mode) => mode.modeId),
		).toEqual(["p-mode"]);
		expect(extensions.contributions.getTrustedViews("sidebar")).toHaveLength(1);
		scope.dispose();
		expect(extensions.contributions.getModes()).toHaveLength(0);
	});

	it("scopes kv storage to the plugin id and reads selection live", async () => {
		const { host, kv, setSelection } = createRealTrustedHost({ pluginId: "p" });
		await host.storage.kv.set("k", [1]);
		await host.storage.kv.set("z", "v");
		expect(kv.get("p")).toEqual({ k: [1], z: "v" });
		expect(await host.storage.kv.get("k")).toEqual([1]);
		expect(await host.storage.kv.keys()).toEqual(["k", "z"]);
		await host.storage.kv.delete("k");
		expect(await host.storage.kv.get("k")).toBeNull();

		expect(host.selection.get()).toEqual({ lineIds: [], wordIds: [] });
		setSelection({ lineIds: ["line-2"], wordIds: [] });
		expect(host.selection.get().lineIds).toEqual(["line-2"]);
	});
});
