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
	await page.goto(process.argv[2] ?? "http://127.0.0.1:5188/", {
		timeout: 90000,
	});
	await page.evaluate(
		async () =>
			await (await import("/src/plugins/trusted/trusted-js-host.ts"))
				.factoryPluginsLoaded,
	);
	const result = await page.evaluate(async () => {
		const { editorDocumentAdapter: doc } = await import(
			"/src/plugins/adapters/editor-document.ts"
		);
		const { commandRegistry } = await import("/src/modules/keyboard/registry.ts");
		const { newLyricLine, newLyricWord } = await import("/src/types/ttml.ts");
		doc.transact({ source: "user", label: "Word tools fixture" }, (draft) => {
			const line = { ...newLyricLine(), romanLyric: "bo ku xa" };
			line.words = ["ぼ", "く", "ら"].map((word, index) => ({
				...newLyricWord(),
				word,
				startTime: index * 100,
				endTime: index * 100 + 100,
			}));
			draft.lyricLines = [line];
		});
		const registered = [
			"builtin.word-tools.split",
			"builtin.word-tools.distribute-romanization",
			"builtin.segmentation.advanced",
		].map((id) => commandRegistry.get(id) !== undefined);
		await commandRegistry.execute("builtin.word-tools.distribute-romanization");
		const words = doc.readSnapshot().lyricLines[0].words;
		await commandRegistry.execute("builtin.word-tools.split", {
			wordId: words[0].id,
		});
		return {
			registered,
			roman: words.map((word) => word.romanWord),
			warnings: words.map((word) => Boolean(word.romanWarning)),
		};
	});
	assert.deepEqual(result.registered, [true, true, true]);
	assert.deepEqual(result.roman, ["bo", "ku", "xa"]);
	assert.deepEqual(result.warnings, [false, false, true]);
	await page
		.locator('[data-amll-plugin-scope="builtin.word-tools"]')
		.filter({ has: page.locator(".amll-word-tools-grapheme") })
		.waitFor();
	assert.deepEqual(errors, []);
	console.log("word-tools browser check passed");
} finally {
	await browser.close();
}
