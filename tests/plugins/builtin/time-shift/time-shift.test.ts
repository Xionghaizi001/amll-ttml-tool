import {
	parseFormSchema,
	type PluginDocumentV0,
} from "@amll-ttml-tool/plugin-api";
import { MockTrustedJsHost } from "@amll-ttml-tool/plugin-sdk-js/testing";
import { describe, expect, it } from "vitest";
import {
	buildTimeShiftOps,
	createTimeShiftForm,
	TIME_SHIFT_COMMAND_ID,
	TIME_SHIFT_PLUGIN_ID,
} from "$/plugins/builtin/time-shift";
import { activate } from "$/plugins/builtin/time-shift/plugin";
import {
	createRealTrustedHost,
	realHostFixture,
} from "../../trusted/real-host-fixture";

const projectedFixture = (): PluginDocumentV0 => ({
	revision: 0,
	lines: [
		{
			id: "line-1",
			startTime: 100,
			endTime: 500,
			translation: "",
			romanization: "",
			isBackground: false,
			isDuet: false,
			ignoreSync: false,
			words: [
				{
					id: "word-1",
					text: "one",
					startTime: 100,
					endTime: 500,
					emptyBeat: 0,
					romanText: "",
					ruby: [{ text: "o", startTime: 100, endTime: 300 }],
				},
			],
		},
		{
			id: "line-2",
			startTime: 1000,
			endTime: 1500,
			translation: "",
			romanization: "",
			isBackground: false,
			isDuet: false,
			ignoreSync: false,
			words: [],
		},
	],
	metadata: [],
});

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

describe("time shift form", () => {
	it("recreates the original modal layout with extended declarative fields", () => {
		const form = createTimeShiftForm({ selectedCount: 2, totalLines: 8 });
		expect(parseFormSchema(form).ok).toBe(true);
		expect(form.size).toBe("small");
		expect(form.fields[0]).toMatchObject({
			kind: "number",
			control: "stepper",
			step: 50,
			decrementIcon: {
				source: "@fluentui/react-icons",
				name: "ArrowLeftRegular",
			},
			incrementIcon: {
				source: "@fluentui/react-icons",
				name: "ArrowRightRegular",
			},
		});
		expect(form.fields[1]).toMatchObject({
			kind: "radio",
			orientation: "horizontal",
		});
		expect(form.fields[2]).toMatchObject({
			kind: "radio",
			default: "selected",
		});
		expect(form.fields[3]).toMatchObject({
			kind: "group",
			direction: "row",
			visibleWhen: { field: "scope", equals: "custom" },
		});
		const withoutSelection = createTimeShiftForm({
			selectedCount: 0,
			totalLines: 8,
		});
		expect(withoutSelection.fields[2]).toMatchObject({
			kind: "radio",
			default: "all",
			options: expect.arrayContaining([
				expect.objectContaining({ value: "selected", disabled: true }),
			]),
		});
	});
});

describe("time shift algorithm (SDK ops)", () => {
	it("shifts line, word and ruby timing of the targeted lines only", () => {
		const { ops, lineIds } = buildTimeShiftOps(projectedFixture(), {
			offsetMs: 200,
			lineIds: ["line-1"],
		});
		expect(lineIds).toEqual(["line-1"]);
		expect(ops).toEqual([
			{
				op: "updateLine",
				lineId: "line-1",
				patch: { startTime: 300, endTime: 700 },
			},
			{
				op: "updateWord",
				wordId: "word-1",
				patch: {
					startTime: 300,
					endTime: 700,
					ruby: [{ text: "o", startTime: 300, endTime: 500 }],
				},
			},
		]);
	});

	it("clamps advanced timing to zero and rejects non-integer offsets", () => {
		const { ops } = buildTimeShiftOps(projectedFixture(), { offsetMs: -200 });
		expect(ops[0]).toMatchObject({ patch: { startTime: 0, endTime: 300 } });
		expect(ops[2]).toMatchObject({
			lineId: "line-2",
			patch: { startTime: 800, endTime: 1300 },
		});
		expect(buildTimeShiftOps(projectedFixture(), { offsetMs: 0 }).ops).toEqual(
			[],
		);
		expect(() =>
			buildTimeShiftOps(projectedFixture(), { offsetMs: 1.5 }),
		).toThrow(RangeError);
	});
});

describe("time shift plugin on the mock trusted host (Node)", () => {
	it("runs menu -> command -> form -> one transaction -> notification -> undo", async () => {
		const host = new MockTrustedJsHost({
			pluginId: TIME_SHIFT_PLUGIN_ID,
			document: projectedFixture(),
			selection: { lineIds: ["line-1"], wordIds: [] },
			onShowForm: submitShift({}),
		});
		const abort = new AbortController();
		await activate({
			pluginId: TIME_SHIFT_PLUGIN_ID,
			host,
			signal: abort.signal,
		});

		expect(host.getMenus("menu.edit")[0]?.command).toBe(TIME_SHIFT_COMMAND_ID);
		await host.executeCommand(TIME_SHIFT_COMMAND_ID);

		expect(host.shownForms[0]).toMatchObject({ size: "small" });
		expect(host.shownForms[0].fields[2]).toMatchObject({ default: "selected" });
		expect(host.edits).toEqual([
			{ label: "Shift lyric timing", appliedOps: 2, revision: 1 },
		]);
		const shifted = host.document.readSnapshot();
		expect(shifted.lines[0]).toMatchObject({ startTime: 150, endTime: 550 });
		expect(shifted.lines[0].words[0].ruby?.[0].startTime).toBe(150);
		expect(shifted.lines[1].startTime).toBe(1000);
		expect(host.notifications).toEqual([
			expect.objectContaining({
				level: "success",
				detail: "1 line(s) updated",
			}),
		]);

		expect(host.undo()).toBe(true);
		expect(host.document.readSnapshot().lines).toEqual(
			projectedFixture().lines,
		);
		expect(host.canUndo()).toBe(false);

		host.dispose();
		expect(host.getCommandIds()).toEqual([]);
		expect(host.getMenus()).toEqual([]);
	});

	it("does nothing when the form is cancelled or the offset is zero", async () => {
		const host = new MockTrustedJsHost({
			pluginId: TIME_SHIFT_PLUGIN_ID,
			document: projectedFixture(),
			onShowForm: submitShift({ amount: 0, scope: "all" }),
		});
		await activate({
			pluginId: TIME_SHIFT_PLUGIN_ID,
			host,
			signal: new AbortController().signal,
		});
		await host.executeCommand(TIME_SHIFT_COMMAND_ID);
		expect(host.edits).toEqual([]);
		expect(host.notifications).toEqual([]);
	});
});

describe("time shift plugin on the real trusted host", () => {
	it("commits the same plugin source as one editor transaction and undoes it once", async () => {
		const fixture = createRealTrustedHost({
			pluginId: TIME_SHIFT_PLUGIN_ID,
			selection: { lineIds: ["line-1"], wordIds: [] },
			onShowForm: submitShift({ scope: "selected-following" }),
		});
		await activate({
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
		await activate({
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
		const { ops } = buildTimeShiftOps(stale, { offsetMs: 100 });
		expect(
			fixture.host.document.applyEdit(ops, "Shift lyric timing", {
				expectedRevision: stale.revision,
			}),
		).toMatchObject({ ok: false, error: { code: "revision-conflict" } });
		expect(fixture.service.readSnapshot().lyricLines[0].startTime).toBe(100);
	});
});
