import type { PluginDocumentV0 } from "@amll-ttml-tool/plugin-api";
import { MockTrustedJsHost } from "@amll-ttml-tool/plugin-sdk-js/testing";
import { describe, expect, it, vi } from "vitest";

const fixture = (): PluginDocumentV0 => ({
	revision: 0,
	lines: [
		{
			id: "line-1",
			words: [
				{
					id: "word-1",
					text: "hi",
					startTime: 0,
					endTime: 50,
					emptyBeat: 0,
					romanText: "",
				},
			],
			translation: "",
			romanization: "",
			isBackground: false,
			isDuet: false,
			startTime: 0,
			endTime: 50,
			ignoreSync: false,
		},
	],
	metadata: [],
});

describe("MockTrustedJsHost", () => {
	it("commits one edit as one revision and undoes it as one record", () => {
		const host = new MockTrustedJsHost({ pluginId: "p", document: fixture() });
		const changes = vi.fn();
		host.document.onChanged(changes);

		const result = host.document.applyEdit(
			[
				{ op: "updateLine", lineId: "line-1", patch: { startTime: 10 } },
				{ op: "updateWord", wordId: "word-1", patch: { startTime: 10 } },
			],
			"Two ops",
			{ expectedRevision: 0 },
		);
		expect(result).toEqual({ ok: true, value: { revision: 1, appliedOps: 2 } });
		expect(host.document.revision).toBe(1);
		expect(host.edits).toEqual([
			{ label: "Two ops", appliedOps: 2, revision: 1 },
		]);
		expect(changes).toHaveBeenCalledWith(
			expect.objectContaining({
				revision: 1,
				source: "plugin",
				sourcePluginId: "p",
				changedLineIds: ["line-1"],
				changedWordIds: ["word-1"],
			}),
		);

		expect(host.undo()).toBe(true);
		expect(host.document.readSnapshot().lines[0].startTime).toBe(0);
		expect(host.document.revision).toBe(2);
		expect(host.undo()).toBe(false);
	});

	it("rejects stale revisions and unknown ids without touching the document", () => {
		const host = new MockTrustedJsHost({ pluginId: "p", document: fixture() });
		const before = host.document.readSnapshot();
		expect(
			host.document.applyEdit([], "stale", { expectedRevision: 5 }),
		).toMatchObject({ ok: false, error: { code: "revision-conflict" } });
		expect(
			host.document.applyEdit(
				[{ op: "removeLine", lineId: "missing" }],
				"missing",
			),
		).toMatchObject({ ok: false, error: { code: "not-found" } });
		expect(host.document.readSnapshot()).toEqual(before);
		expect(host.edits).toHaveLength(0);
	});

	it("enforces the plugin namespace and disposes registrations like the host scope", async () => {
		const host = new MockTrustedJsHost({ pluginId: "p" });
		expect(() =>
			host.commands.register({ id: "other.cmd", handler: () => undefined }),
		).toThrow(/namespace/);
		expect(() =>
			host.menus.register({ command: "other.cmd", menu: "menu.edit" }),
		).toThrow(/namespace/);
		expect(() =>
			host.formats.register({
				formatId: "other.fmt",
				title: "x",
				extensions: ["x"],
				exporter: () => "",
			}),
		).toThrow(/namespace/);

		const handler = vi.fn();
		const command = host.commands.register({ id: "p.cmd", handler });
		host.menus.register({ command: "p.cmd", menu: "menu.tool" });
		await host.executeCommand("p.cmd", { n: 1 });
		expect(handler).toHaveBeenCalledWith({ n: 1 });
		expect(host.getMenus("menu.tool")).toHaveLength(1);

		command.dispose();
		expect(host.getCommandIds()).toEqual([]);
		host.dispose();
		expect(host.getMenus()).toEqual([]);
	});

	it("caps title bar actions per plugin and isolates kv storage", async () => {
		const host = new MockTrustedJsHost({ pluginId: "p" });
		const icon = {
			source: "@fluentui/react-icons",
			name: "AddRegular",
		} as const;
		for (let index = 0; index < 3; index += 1)
			host.titleBarActions.register({
				command: `p.cmd${index}`,
				icon,
				tooltip: "t",
			});
		expect(() =>
			host.titleBarActions.register({ command: "p.cmd3", icon, tooltip: "t" }),
		).toThrow(/more than 3/);

		await host.storage.kv.set("a", { deep: [1, 2] });
		await host.storage.kv.set("b", true);
		expect(await host.storage.kv.get("a")).toEqual({ deep: [1, 2] });
		expect(await host.storage.kv.keys()).toEqual(["a", "b"]);
		await host.storage.kv.delete("a");
		expect(await host.storage.kv.get("a")).toBeNull();
	});

	it("scripts forms and records notifications", async () => {
		const host = new MockTrustedJsHost({
			pluginId: "p",
			onShowForm: () => ({ submitted: true, values: { amount: 3 } }),
		});
		const result = await host.ui.showForm({ title: "t", fields: [] });
		expect(result).toEqual({ submitted: true, values: { amount: 3 } });
		expect(host.shownForms).toHaveLength(1);
		host.ui.notify({ level: "info", message: "hello" });
		expect(host.notifications).toEqual([{ level: "info", message: "hello" }]);
	});
});
