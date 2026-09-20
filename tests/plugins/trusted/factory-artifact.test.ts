import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import {
	parseTrustedJsPackage,
	type DocumentOpV0,
} from "@amll-ttml-tool/plugin-api";
import type { TrustedJsActivationContextV0 } from "@amll-ttml-tool/plugin-sdk-js";
import { beforeAll, describe, expect, it } from "vitest";
import { unpackPluginContainer } from "$/plugins/store/package-container";
import { createRealTrustedHost, realHostFixture } from "./real-host-fixture";
const TIME_SHIFT_PLUGIN_ID = "builtin.time-shift";
const TIME_SHIFT_COMMAND_ID = "builtin.time-shift.run";
const submitShift = (values: Record<string, string | number>) => () => ({
	submitted: true as const,
	values: {
		amount: 50,
		direction: "delay",
		scope: "selected",
		startLine: 1,
		endLine: 1,
		...values,
	},
});

describe.each(["artifact"])("time shift %s on the real trusted host", () => {
	let activatePlugin: (context: TrustedJsActivationContextV0) => void;
	beforeAll(async () => {
		const root = resolve(import.meta.dirname, "../../..");
		const lock = JSON.parse(
			await readFile(resolve(root, "factory-plugins.lock.json"), "utf8"),
		);
		const item = lock.plugins.find(
			(p: { id: string }) => p.id === TIME_SHIFT_PLUGIN_ID,
		);
			const bytes = /^https:\/\//.test(item.source)
				? Buffer.from(await (await fetch(item.source)).arrayBuffer())
				: await readFile(resolve(root, item.source));
		expect(createHash("sha256").update(bytes).digest("hex")).toBe(item.sha256);
		const unpacked = unpackPluginContainer(bytes);
		if (!unpacked.ok || unpacked.kind !== "trusted-js")
			throw new Error("Invalid artifact");
		const parsed = parseTrustedJsPackage(unpacked.pkg);
		if (!parsed.ok) throw new Error("Invalid package");
		activatePlugin = (
			await import(
				/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(parsed.value.code).toString("base64")}`
			)
		).activate;
	});

	it("commits the same plugin source as one editor transaction and undoes it once", async () => {
		const fixture = createRealTrustedHost({
			pluginId: TIME_SHIFT_PLUGIN_ID,
			selection: { lineIds: ["line-1"], wordIds: [] },
			onShowForm: submitShift({ scope: "selected-following" }),
		});
		await activatePlugin({
			pluginId: TIME_SHIFT_PLUGIN_ID,
			host: fixture.host,
			signal: new AbortController().signal,
		});
		expect(
			fixture.extensions.contributions.getMenus("menu.edit")[0]?.commandId,
		).toBe(TIME_SHIFT_COMMAND_ID);

		await fixture.commands.execute(TIME_SHIFT_COMMAND_ID);
		const snapshot = fixture.service.readSnapshot();
		expect(fixture.service.getRevision()).toBe(1);
		expect(snapshot.lyricLines[0].startTime).toBe(150);
		expect(snapshot.lyricLines[0].words[0].ruby?.[0].startTime).toBe(150);
		expect(snapshot.lyricLines[0].words[0].obscene).toBe(false);
		expect(snapshot.lyricLines[1].startTime).toBe(1050);
		expect(fixture.notifications).toEqual([
			expect.objectContaining({
				level: "success",
				detail: "2 line(s) updated",
			}),
		]);

		fixture.service.undo();
		expect(fixture.service.readSnapshot()).toEqual(realHostFixture());
		expect(fixture.service.canUndo()).toBe(false);

		fixture.scope.dispose();
		expect(fixture.commands.get(TIME_SHIFT_COMMAND_ID)).toBeUndefined();
		expect(fixture.extensions.contributions.getMenus("menu.edit")).toHaveLength(
			0,
		);
	});

	it("computes the shift against the document as it stands after the form closes", async () => {
		const fixture = createRealTrustedHost({
			pluginId: TIME_SHIFT_PLUGIN_ID,
			onShowForm: () => {
				// A concurrent edit while the form is open must neither be lost nor
				// make the shift stale: the plugin re-reads the snapshot afterwards
				// and commits against that revision.
				fixture.service.transact(
					{ source: "user", label: "Concurrent edit" },
					(draft) => {
						draft.lyricLines[0].translatedLyric = "new";
					},
				);
				return submitShift({ scope: "all" })();
			},
		});
		await activatePlugin({
			pluginId: TIME_SHIFT_PLUGIN_ID,
			host: fixture.host,
			signal: new AbortController().signal,
		});
		await fixture.commands.execute(TIME_SHIFT_COMMAND_ID);
		expect(fixture.service.getRevision()).toBe(2);
		const snapshot = fixture.service.readSnapshot();
		expect(snapshot.lyricLines[0].translatedLyric).toBe("new");
		expect(snapshot.lyricLines[0].startTime).toBe(150);
		expect(fixture.notifications).toEqual([
			expect.objectContaining({
				level: "success",
				detail: "2 line(s) updated",
			}),
		]);
		fixture.service.undo();
		expect(fixture.service.readSnapshot().lyricLines[0]).toMatchObject({
			translatedLyric: "new",
			startTime: 100,
		});
	});

	it("reports a revision conflict instead of applying a stale shift", () => {
		const fixture = createRealTrustedHost({ pluginId: TIME_SHIFT_PLUGIN_ID });
		const stale = fixture.host.document.readSnapshot();
		fixture.service.transact(
			{ source: "user", label: "Concurrent edit" },
			(draft) => {
				draft.lyricLines[0].translatedLyric = "new";
			},
		);
		const ops: DocumentOpV0[] = [
			{
				op: "updateLine",
				lineId: stale.lines[0].id,
				patch: { startTime: 200 },
			},
		];
		expect(
			fixture.host.document.applyEdit(ops, "Shift lyric timing", {
				expectedRevision: stale.revision,
			}),
		).toMatchObject({ ok: false, error: { code: "revision-conflict" } });
		expect(fixture.service.readSnapshot().lyricLines[0].startTime).toBe(100);
	});
});
