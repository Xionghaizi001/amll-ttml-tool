import { it, expect } from "vitest";
import { createRealTrustedHost, realHostFixture } from "./real-host-fixture";
import { MockTrustedJsHost } from "@amll-ttml-tool/plugin-sdk-js/testing";
import {
	LYRICS_APPLY_EDIT_SCHEMA,
	validate,
} from "@amll-ttml-tool/plugin-api/schema";
import { toPluginDocument } from "$/plugins/adapters/plugin-document";
import { pluginSegmentation } from "$/plugins/adapters/segmentation";
import { extensionRegistry } from "$/plugins/adapters/extension-host";
import { applyWordTextInput } from "$/plugins/adapters/word-text-input";
import { newLyricWord } from "$/types/ttml";
it("distinguishes null removal from [] in schema, mock and real transactions", () => {
	const document = realHostFixture();
	const fixture = createRealTrustedHost({ pluginId: "test.ruby", document });
	const mock = new MockTrustedJsHost({
		pluginId: "test.ruby",
		document: toPluginDocument(document, 0, { includeRuby: true }),
	});
	for (const host of [fixture.host, mock]) {
		const word = host.document.readSnapshot().lines[0].words[0];
		const ops = [
			{ op: "updateWord" as const, wordId: word.id, patch: { ruby: null } },
		];
		expect(
			validate(LYRICS_APPLY_EDIT_SCHEMA, {
				expectedRevision: host.document.revision,
				label: "Remove ruby",
				ops,
			}).ok,
		).toBe(true);
		expect(host.document.applyEdit(ops, "remove").ok).toBe(true);
		expect(host.document.readSnapshot().lines[0].words[0].ruby).toBeUndefined();
		expect(
			host.document.applyEdit(
				[{ op: "updateWord", wordId: word.id, patch: { ruby: [] } }],
				"empty",
			).ok,
		).toBe(true);
		expect(host.document.readSnapshot().lines[0].words[0].ruby).toEqual([]);
	}
	fixture.scope.dispose();
	fixture.handle.dispose();
});
it("uses shared segmentation settings and rejects invalid inputs", async () => {
	expect(pluginSegmentation.isKanaOnly("「かな」♪")).toBe(true);
	expect(
		await pluginSegmentation.segmentText(
			{ text: "漢字", startTime: 100, endTime: 500 },
			["か", "な"],
		),
	).toEqual([
		{ text: "か", startTime: 100, endTime: 300 },
		{ text: "な", startTime: 300, endTime: 500 },
	]);
	await expect(
		pluginSegmentation.segmentText({ text: "x", startTime: NaN, endTime: 1 }),
	).rejects.toThrow("Invalid");
});
it("checks the transform patch and removes the input shortcut with its contribution", () => {
	const scope = extensionRegistry.createScope({
		kind: "plugin",
		pluginId: "test.ruby.input",
		runtime: "trusted-js",
		trusted: true,
	});
	const view = scope.registerTrustedView({
		id: "test.ruby.input.view",
		kind: "word-editor",
		title: "Test",
		view: () => null,
		transformTextInput: (text) => ({ text: text.slice(0, -1), ruby: [] }),
	});
	const word = newLyricWord();
	applyWordTextInput(word, "字|");
	expect(word.word).toBe("字");
	expect(word.ruby).toEqual([]);
	view.dispose();
	applyWordTextInput(word, "plain|");
	expect(word.word).toBe("plain|");
	scope.registerTrustedView({
		id: "test.ruby.input.invalid",
		kind: "word-editor",
		title: "Invalid",
		view: () => null,
		transformTextInput: () => ({ startTime: NaN }),
	});
	expect(() => applyWordTextInput(word, "unchanged")).toThrow(
		"Invalid word input patch",
	);
	expect(word.word).toBe("plain|");
	scope.dispose();
});
it("rejects a segmentation result after host disposal", async () => {
	let resolve!: (result: []) => void;
	const fixture = createRealTrustedHost({
		pluginId: "test.ruby",
		ports: {
			segmentation: {
				isKanaOnly: () => false,
				segmentText: () =>
					new Promise((done) => {
						resolve = done;
					}),
			},
		},
	});
	const pending = fixture.host.segmentation.segmentText({
		text: "x",
		startTime: 0,
		endTime: 1,
	});
	fixture.handle.dispose();
	resolve([]);
	await expect(pending).rejects.toThrow("disposed");
	fixture.scope.dispose();
});

it("does not allow an untrusted owner to register a word editor", () => {
	const scope = extensionRegistry.createScope({
		kind: "plugin",
		pluginId: "test.untrusted",
		runtime: "trusted-js",
		trusted: false,
	});
	expect(() =>
		scope.registerTrustedView({
			id: "test.untrusted.view",
			kind: "word-editor",
			title: "No",
			view: () => null,
		}),
	).toThrow("trusted view");
	scope.dispose();
});
