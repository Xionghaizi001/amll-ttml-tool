import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
	HostResponseV0,
	JsonValue,
	PluginCommandOutcomeV0,
	PluginReturnV0,
} from "@amll-ttml-tool/plugin-api";
import { parseCommandOutcome, parsePluginReturn } from "@amll-ttml-tool/plugin-api";
import { beforeAll, describe, expect, it } from "vitest";
import { WasmGuestSession } from "$/plugins/runtime/wasm-session.ts";
import {
	DEFAULT_WASM_TURN_LIMITS,
	type WasmTurnContext,
	WasmTurnHost,
} from "$/plugins/runtime/wasm-turn.ts";

const fixturePath = resolve(process.cwd(), "public/plugins/sample-tools.wasm");

const makeContext = (
	overrides: Partial<WasmTurnContext> = {},
): WasmTurnContext => ({
	pluginId: "example.sample-tools",
	grantedCapabilities: ["lyrics.core", "ui.notify", "ui.form", "storage.kv"],
	document: {
		revision: 3,
		lines: [
			{
				id: "line-1",
				words: [
					{
						id: "word-1",
						text: "  hello ",
						startTime: 0,
						endTime: 100,
						emptyBeat: 0,
						romanText: "",
					},
					{
						id: "word-2",
						text: "world",
						startTime: 100,
						endTime: 200,
						emptyBeat: 0,
						romanText: "",
					},
				],
				translation: "",
				romanization: "",
				isBackground: false,
				isDuet: false,
				startTime: 0,
				endTime: 200,
				ignoreSync: false,
			},
		],
		metadata: [],
	},
	selection: { lineIds: ["line-1"], wordIds: [] },
	storage: {},
	editIdSeed: "t1",
	...overrides,
});

const expectDone = (returnJson: string): PluginCommandOutcomeV0 => {
	const parsed = parsePluginReturn(JSON.parse(returnJson));
	expect(parsed.ok).toBe(true);
	if (!parsed.ok) throw new Error("invalid return");
	const value = parsed.value as PluginReturnV0;
	expect(value.ok).toBe(true);
	if (!value.ok) throw new Error(value.error.message);
	const outcome = parseCommandOutcome(value.value);
	expect(outcome.ok).toBe(true);
	if (!outcome.ok) throw new Error("invalid outcome");
	return outcome.value;
};

describe("WasmTurnHost", () => {
	const call = (
		host: WasmTurnHost,
		method: string,
		params: JsonValue,
		id = "c1",
	): HostResponseV0 =>
		JSON.parse(
			host.handleHostCallJson(JSON.stringify({ id, method, params })),
		) as HostResponseV0;

	it("resolves document and selection reads from the turn context", () => {
		const host = new WasmTurnHost(makeContext());
		const document = call(host, "lyrics.getDocument", {});
		expect(document.result.ok).toBe(true);
		if (document.result.ok)
			expect(
				(document.result.value as { revision: number }).revision,
			).toBe(3);
		const selection = call(host, "lyrics.getSelection", {});
		expect(selection.result.ok).toBe(true);
	});

	it("rejects calls missing the granted capability", () => {
		const host = new WasmTurnHost(
			makeContext({ grantedCapabilities: ["ui.notify"], document: null }),
		);
		const response = call(host, "lyrics.getDocument", {});
		expect(response.result).toMatchObject({
			ok: false,
			error: { code: "permission-denied" },
		});
	});

	it("queues applyEdit batches with optimistic local revisions and one base revision", () => {
		const host = new WasmTurnHost(makeContext());
		const first = call(host, "lyrics.applyEdit", {
			expectedRevision: 3,
			label: "first",
			ops: [
				{ op: "updateWord", wordId: "word-1", patch: { text: "hello" } },
			],
		});
		expect(first.result.ok).toBe(true);
		if (first.result.ok)
			expect((first.result.value as { revision: number }).revision).toBe(4);
		const second = call(host, "lyrics.applyEdit", {
			expectedRevision: 4,
			label: "second",
			ops: [
				{ op: "updateLine", lineId: "line-1", patch: { translation: "x" } },
			],
		});
		expect(second.result.ok).toBe(true);
		const effects = host.getEffects();
		expect(effects.edits).toMatchObject({
			baseRevision: 3,
			labels: ["first", "second"],
		});
		expect(effects.edits?.ops).toHaveLength(2);
	});

	it("rejects a stale expectedRevision against the local turn revision", () => {
		const host = new WasmTurnHost(makeContext());
		const response = call(host, "lyrics.applyEdit", {
			expectedRevision: 2,
			label: "stale",
			ops: [{ op: "removeLine", lineId: "line-1" }],
		});
		expect(response.result).toMatchObject({
			ok: false,
			error: { code: "revision-conflict" },
		});
		expect(host.getEffects().edits).toBeNull();
	});

	it("assigns deterministic seeded ids for inserted lines", () => {
		const host = new WasmTurnHost(makeContext());
		const response = call(host, "lyrics.applyEdit", {
			expectedRevision: 3,
			label: "insert",
			ops: [
				{
					op: "insertLine",
					afterLineId: null,
					line: {
						words: [
							{
								text: "new",
								startTime: 0,
								endTime: 1,
								emptyBeat: 0,
								romanText: "",
							},
						],
						translation: "",
						romanization: "",
						isBackground: false,
						isDuet: false,
						startTime: 0,
						endTime: 1,
						ignoreSync: false,
					},
				},
			],
		});
		expect(response.result.ok).toBe(true);
		const document = call(host, "lyrics.getDocument", {}, "c2");
		if (!document.result.ok) throw new Error("read failed");
		const lines = (document.result.value as { lines: { id: string }[] }).lines;
		expect(lines[0].id).toBe("t1-line-1");
	});

	it("refuses ui.showForm as a synchronous host call", () => {
		const host = new WasmTurnHost(makeContext());
		const response = call(host, "ui.showForm", {
			schema: { title: "x", fields: [] },
		});
		expect(response.result).toMatchObject({
			ok: false,
			error: { code: "invalid-params" },
		});
	});

	it("caps notifications per turn", () => {
		const host = new WasmTurnHost(makeContext(), {
			...DEFAULT_WASM_TURN_LIMITS,
			maxNotifications: 2,
		});
		for (let index = 0; index < 2; index += 1) {
			const ok = call(host, "ui.notify", { level: "info", message: "m" });
			expect(ok.result.ok).toBe(true);
		}
		const over = call(host, "ui.notify", { level: "info", message: "m" });
		expect(over.result).toMatchObject({
			ok: false,
			error: { code: "limit-exceeded" },
		});
		expect(host.getEffects().notifications).toHaveLength(2);
	});

	it("enforces storage quotas and tracks changes", () => {
		const host = new WasmTurnHost(
			makeContext({ storage: { existing: 1 } }),
			{
				...DEFAULT_WASM_TURN_LIMITS,
				maxStorageKeys: 2,
				maxStorageValueBytes: 16,
			},
		);
		expect(
			call(host, "storage.set", { key: "a", value: "ok" }).result.ok,
		).toBe(true);
		expect(
			call(host, "storage.set", { key: "b", value: "no" }).result,
		).toMatchObject({ ok: false, error: { code: "limit-exceeded" } });
		expect(
			call(host, "storage.set", {
				key: "a",
				value: "0123456789abcdefgh",
			}).result,
		).toMatchObject({ ok: false, error: { code: "payload-too-large" } });
		expect(
			call(host, "storage.delete", { key: "existing" }).result.ok,
		).toBe(true);
		const keys = call(host, "storage.keys", {});
		if (!keys.result.ok) throw new Error("keys failed");
		expect((keys.result.value as { keys: string[] }).keys).toEqual(["a"]);
		expect(host.getEffects().storage).toEqual({
			set: { a: "ok" },
			deleted: ["existing"],
		});
	});

	it("caps host calls per turn", () => {
		const host = new WasmTurnHost(makeContext(), {
			...DEFAULT_WASM_TURN_LIMITS,
			maxHostCalls: 1,
		});
		expect(call(host, "lyrics.getSelection", {}).result.ok).toBe(true);
		expect(call(host, "lyrics.getSelection", {}).result).toMatchObject({
			ok: false,
			error: { code: "limit-exceeded" },
		});
	});
});

describe("WasmGuestSession with the sample plugin", () => {
	let wasm: Uint8Array;

	beforeAll(async () => {
		wasm = new Uint8Array(await readFile(fixturePath));
	});

	it("activates and runs a document-editing command through the sync bridge", async () => {
		const session = new WasmGuestSession();
		try {
			await session.load(wasm);
			const activation = await session.runTurn(
				"plugin_activate",
				JSON.stringify({
					pluginId: "example.sample-tools",
					apiVersion: 0,
					grantedCapabilities: [
						"lyrics.core",
						"ui.notify",
						"ui.form",
						"storage.kv",
					],
					locale: "zh-CN",
					hostVersion: "test",
				}),
				makeContext(),
			);
			const activated = parsePluginReturn(JSON.parse(activation.returnJson));
			expect(activated.ok && activated.value.ok).toBe(true);

			const turn = await session.runTurn(
				"plugin_execute_command",
				JSON.stringify({ commandId: "example.sample-tools.trimWords" }),
				makeContext({ editIdSeed: "t2" }),
			);
			const outcome = expectDone(turn.returnJson);
			expect(outcome).toMatchObject({ kind: "done", value: { trimmed: 1 } });
			expect(turn.effects.edits).toMatchObject({
				baseRevision: 3,
				labels: ["Trim word whitespace"],
			});
			expect(turn.effects.edits?.ops).toEqual([
				{ op: "updateWord", wordId: "word-1", patch: { text: "hello" } },
			]);
			expect(turn.effects.notifications).toEqual([
				{ level: "success", message: "Trimmed 1 word(s)" },
			]);
			expect(turn.effects.storage).toEqual({
				set: { lastTrimCount: 1 },
				deleted: [],
			});
		} finally {
			await session.close();
		}
	});

	it("runs the showForm outcome and resume continuation", async () => {
		const session = new WasmGuestSession();
		try {
			await session.load(wasm);
			const first = await session.runTurn(
				"plugin_execute_command",
				JSON.stringify({ commandId: "example.sample-tools.wordCount" }),
				makeContext(),
			);
			const outcome = expectDone(first.returnJson);
			expect(outcome.kind).toBe("showForm");
			if (outcome.kind !== "showForm") throw new Error("expected form");
			expect(first.effects.edits).toBeNull();

			const resumed = await session.runTurn(
				"plugin_resume_form",
				JSON.stringify({
					commandId: "example.sample-tools.wordCount",
					state: outcome.state,
					result: { submitted: true, values: { scope: "selected" } },
				}),
				makeContext({ editIdSeed: "t3" }),
			);
			const done = expectDone(resumed.returnJson);
			expect(done).toMatchObject({
				kind: "done",
				value: { lines: 1, words: 2, chars: 13 },
			});
			expect(resumed.effects.notifications).toHaveLength(1);
			expect(resumed.effects.storage?.set.lastCount).toEqual({
				lines: 1,
				words: 2,
				chars: 13,
			});
		} finally {
			await session.close();
		}
	});

	it("denies host calls beyond the granted capabilities", async () => {
		const session = new WasmGuestSession();
		try {
			await session.load(wasm);
			// The sample guest propagates the permission-denied host error, which
			// surfaces as a failed turn; no edits leak out either way.
			await expect(
				session.runTurn(
					"plugin_execute_command",
					JSON.stringify({ commandId: "example.sample-tools.trimWords" }),
					makeContext({
						grantedCapabilities: ["ui.notify"],
						document: null,
					}),
				),
			).rejects.toThrow(/permission|requires lyrics.core/);
		} finally {
			await session.close();
		}
	});
});
