import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "../../..");
const require = createRequire(
	resolve(root, "../amll-ttml-tool-plugin-toolkit/package.json"),
);
const { chromium } = require("playwright-core");
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
	const page = await browser.newPage({
		viewport: { width: 1440, height: 1000 },
	});
	const errors = [];
	page.on("pageerror", (e) => errors.push(e.message));
	await page.goto(process.argv[2] ?? "http://127.0.0.1:5189/", {
		timeout: 90000,
	});
	const ready = () =>
		page.evaluate(async () => {
			const h = await import("/src/plugins/trusted/trusted-js-host.ts");
			await Promise.race([
				h.factoryPluginsLoaded,
				new Promise((_, reject) =>
					setTimeout(() => reject(Error("Factory timeout")), 25000),
				),
			]);
		});
	await ready();
	const seed = async () =>
		page.evaluate(async () => {
			const { globalStore } = await import("/src/states/store.ts");
			const m = await import("/src/states/main.ts");
			const settings = await import("/src/modules/settings/states/index.ts");
			const { editorDocumentAdapter: doc } = await import(
				"/src/plugins/adapters/editor-document.ts"
			);
			const { newLyricLine, newLyricWord } = await import("/src/types/ttml.ts");
			doc.replace(
				{
					metadata: [],
					lyricLines: [
						{
							...newLyricLine(),
							id: "ruby-line",
							words: [
								{
									...newLyricWord(),
									id: "ruby-one",
									word: "漢字",
									romanWord: "kanji",
									startTime: 100,
									endTime: 500,
								},
								{
									...newLyricWord(),
									id: "ruby-two",
									word: "漢字",
									romanWord: "kanji",
									startTime: 1000,
									endTime: 2000,
								},
								{
									...newLyricWord(),
									id: "ruby-english",
									word: "Hello",
									romanWord: "hello",
								},
								{
									...newLyricWord(),
									id: "ruby-kana",
									word: "「かな」♪",
									romanWord: "kana",
								},
							],
						},
					],
				},
				{ source: "user", label: "Ruby browser fixture" },
			);
			globalStore.set(m.toolModeAtom, m.ToolMode.Edit);
			globalStore.set(settings.layoutModeAtom, settings.LayoutMode.Advance);
			globalStore.set(m.selectedLinesAtom, new Set());
			globalStore.set(m.selectedWordsAtom, new Set());
		});
	await seed();
	const panels = page.locator('[data-amll-plugin-scope="builtin.ruby"]');
	const first = panels.first();
	await first.waitFor();
	assert.equal(await panels.count(), 4);
	const state = () =>
		page.evaluate(
			async () =>
				(
					await import("/src/plugins/adapters/editor-document.ts")
				).editorDocumentAdapter.readSnapshot().lyricLines[0].words,
		);
	const undo = () =>
		page.evaluate(async () =>
			(
				await import("/src/plugins/adapters/editor-document.ts")
			).editorDocumentAdapter.undo(),
		);
	await first.getByRole("button", { name: "添加注音", exact: true }).click();
	await page.getByRole("button", { name: "我已了解", exact: true }).click();
	let inputs = first.locator("input");
	await inputs.first().fill("か");
	await first.getByRole("button", { name: "添加注音", exact: true }).click();
	await inputs.nth(1).fill("ん");
	await inputs.nth(1).press("Home");
	await inputs.nth(1).press("Backspace");
	assert.deepEqual(
		(await state())[0].ruby.map((r) => r.word),
		["かん"],
	);
	await undo();
	assert.deepEqual(
		(await state())[0].ruby.map((r) => r.word),
		["か", "ん"],
	);
	await first
		.getByRole("button", { name: "应用到所有相同单词", exact: true })
		.click();
	await page.waitForFunction(
		async () =>
			!!(
				await import("/src/plugins/adapters/editor-document.ts")
			).editorDocumentAdapter.readSnapshot().lyricLines[0].words[1].ruby,
	);
	assert.deepEqual(
		(await state())[1].ruby.map((r) => [r.word, r.startTime, r.endTime]),
		[
			["か", 1000, 1500],
			["ん", 1500, 2000],
		],
	);
	await undo();
	assert.equal((await state())[1].ruby, undefined);
	await inputs.nth(1).fill("");
	await inputs.nth(1).press("Backspace");
	await inputs.first().fill("");
	await inputs.first().press("Backspace");
	assert.equal((await state())[0].ruby, undefined);
	await undo();
	assert.equal((await state())[0].ruby.length, 1);
	await seed();
	await page.evaluate(async () =>
		(await import("/src/modules/keyboard/registry.ts")).commandRegistry.execute(
			"builtin.ruby.generate",
		),
	);
	assert.deepEqual(
		(await state()).map((w) => w.ruby?.map((r) => r.word)),
		[["か", "ん", "じ"], ["か", "ん", "じ"], undefined, undefined],
	);
	await page.screenshot({
		path: resolve(root, "release/ruby-editor-advanced.png"),
	});
	await first.locator("input").first().fill("か|な");
	await page.evaluate(async () => {
		const { globalStore } = await import("/src/states/store.ts");
		const m = await import("/src/states/main.ts");
		globalStore.set(m.selectedWordsAtom, new Set(["ruby-one"]));
		await (
			await import("/src/modules/keyboard/registry.ts")
		).commandRegistry.execute("builtin.ruby.segment");
	});
	assert.deepEqual(
		(await state())[0].ruby.map((r) => r.word),
		["か", "な", "ん", "じ"],
	);
	await undo();
	assert.equal((await state())[0].ruby[0].word, "か|な");
	await page.evaluate(async () => {
		const { globalStore } = await import("/src/states/store.ts");
		const s = await import("/src/modules/settings/states/index.ts");
		globalStore.set(s.layoutModeAtom, s.LayoutMode.Simple);
	});
	await first.locator("input").first().waitFor();
	await page.screenshot({
		path: resolve(root, "release/ruby-editor-simple.png"),
	});
	const saved = await state();
	await page.evaluate(async () =>
		(
			await import("/src/plugins/trusted/trusted-js-host.ts")
		).trustedJsPluginService.unload("builtin.ruby"),
	);
	await panels.first().waitFor({ state: "detached" });
	assert.deepEqual(await state(), saved);
	assert.equal(
		await page.evaluate(
			async () =>
				!!(
					await import("/src/modules/keyboard/registry.ts")
				).commandRegistry.get("builtin.ruby.generate"),
		),
		false,
	);
	await page.evaluate(async () =>
		(
			await import("/src/plugins/trusted/trusted-js-host.ts")
		).reloadTrustedJsPlugin("builtin.ruby"),
	);
	await first.locator("input").first().waitFor();
	assert.deepEqual(await state(), saved);
	// Actual insertion control must lose the pipe shortcut while disabled.
	await page.evaluate(async () =>
		(
			await import("/src/plugins/trusted/trusted-js-host.ts")
		).trustedJsPluginService.unload("builtin.ruby"),
	);
	const insert = page.getByPlaceholder("插入单词…");
	await insert.fill("literal|");
	await insert.press("Enter");
	assert.equal((await state()).at(-1).word, "literal|");
	assert.equal((await state()).at(-1).ruby, undefined);
	await page.evaluate(async () =>
		(
			await import("/src/plugins/trusted/trusted-js-host.ts")
		).reloadTrustedJsPlugin("builtin.ruby"),
	);
	await insert.fill("字|");
	await insert.press("Enter");
	assert.equal((await state()).at(-1).word, "字");
	assert.equal((await state()).at(-1).ruby[0].word, "");
	await page.evaluate(async () =>
		(
			await import("/src/plugins/trusted/trusted-js-host.ts")
		).trustedJsPluginService.setEnabled("builtin.ruby", false),
	);
	await page.reload();
	await ready();
	assert.equal(await panels.count(), 0);
	await page.evaluate(async () => {
		const h = await import("/src/plugins/trusted/trusted-js-host.ts");
		await h.trustedJsPluginService.setEnabled("builtin.ruby", true);
		await h.reloadTrustedJsPlugin("builtin.ruby");
	});
	await seed();
	await first.waitFor();
	assert.deepEqual(errors, []);
	console.log(
		"Ruby browser checks passed: layouts, warning, add/edit/merge/delete, matching timing, generation exclusions, segmentation, undo, inline unload/re-enable, pipe shortcut, disable across reload.",
	);
} finally {
	await browser.close();
}
