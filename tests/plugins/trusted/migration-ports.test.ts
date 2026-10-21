import { describe, expect, it, vi } from "vitest";
import { createRealTrustedHost } from "./real-host-fixture";

describe("migration SDK ports", () => {
	it("reads project identity and disposes selection subscriptions", () => {
		const { host, handle, setSelection } = createRealTrustedHost({
			pluginId: "p",
		});
		expect(host.project.getInfo()).toEqual({
			projectId: "test-project",
			fileName: "lyric.ttml",
		});
		const changed = vi.fn();
		host.selection.onChanged(changed);
		setSelection({ lineIds: ["line-1"], wordIds: [] });
		expect(changed).toHaveBeenCalledWith(host.selection.get());
		handle.dispose();
		setSelection({ lineIds: [], wordIds: [] });
		expect(changed).toHaveBeenCalledTimes(1);
	});

	it("imports a plugin document through the host import path unless the user keeps the current one", async () => {
		const answers = [false, true];
		const imported: string[] = [];
		const { host, service } = createRealTrustedHost({
			pluginId: "p",
			ports: {
				importDocument: async (lyric, { label }) => {
					if (!answers.shift()) return false;
					imported.push(label);
					service.replace(lyric, { source: "user", label });
					return true;
				},
			},
		});
		const document = {
			lines: [
				{
					words: [
						{ text: "hi", startTime: 0, endTime: 0, emptyBeat: 1, romanText: "" },
					],
					translation: "t",
					romanization: "",
					isBackground: true,
					isDuet: false,
					startTime: 0,
					endTime: 0,
					ignoreSync: false,
				},
			],
			metadata: [],
		};
		const kept = await host.project.importDocument(document, "Import");
		expect(kept).toMatchObject({ ok: false, error: { code: "cancelled" } });
		const result = await host.project.importDocument(document, "Import");
		expect(result).toEqual({ ok: true, value: { revision: host.document.revision } });
		expect(imported).toEqual(["Import"]);
		const [line] = host.document.readSnapshot().lines;
		expect(line).toMatchObject({ translation: "t", isBackground: true });
		expect(line.words[0]).toMatchObject({ text: "hi", emptyBeat: 1 });
	});

	it("opens only owned dialogs and closes them when contributions disappear", () => {
		const { host, scope, views } = createRealTrustedHost({ pluginId: "p" });
		const register = () =>
			host.views.registerView({
				id: "p.editor",
				kind: "dialog-view",
				title: "Editor",
				view: () => null,
			});
		const registration = register();
		expect(() => host.ui.openView("other.editor")).toThrow();
		host.ui.openView("p.editor");
		host.ui.openView("p.editor");
		expect(views.getSnapshot()).toHaveLength(1);
		registration.dispose();
		expect(views.getSnapshot()).toHaveLength(0);
		register();
		host.ui.openView("p.editor");
		scope.dispose();
		expect(views.getSnapshot()).toHaveLength(0);
	});

	it("does not close dialogs of a plugin whose id extends another id", () => {
		const { extensions, views } = createRealTrustedHost({ pluginId: "p" });
		const child = extensions.createScope({
			kind: "plugin",
			pluginId: "p.child",
			runtime: "trusted-js",
			trusted: true,
		});
		child.registerTrustedView({
			id: "p.child.editor",
			kind: "dialog-view",
			title: "Child",
			view: () => null,
		});
		views.open("p.child", "p.child.editor");
		views.closeAllOf("p");
		expect(views.getSnapshot()).toHaveLength(1);
		child.dispose();
	});

	it("blocks offline and credential-bearing requests before transport", async () => {
		const { host, requests, setOffline } = createRealTrustedHost({
			pluginId: "p",
			offline: true,
		});
		expect(
			await host.network.request({ url: "https://example.com" }),
		).toMatchObject({ ok: false, error: { code: "network-unavailable" } });
		setOffline(false);
		expect(
			await host.network.request({
				url: "https://example.com",
				headers: { Authorization: "secret" },
			}),
		).toMatchObject({ ok: false, error: { code: "invalid-params" } });
		expect(requests).toHaveLength(0);
	});
});
