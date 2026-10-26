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
	await page.goto(process.argv[2] ?? "http://127.0.0.1:5187/", { timeout: 90_000 });
	await page.evaluate(async () => {
		const host = await import("/src/plugins/trusted/trusted-js-host.ts");
		await Promise.race([
			host.factoryPluginsLoaded,
			new Promise((_, reject) =>
				setTimeout(() => reject(Error("Factory load timeout")), 25000),
			),
		]);
		const { globalStore } = await import("/src/states/store.ts");
		const main = await import("/src/states/main.ts");
		const { editorDocumentAdapter } = await import(
			"/src/plugins/adapters/editor-document.ts"
		);
		const { newLyricLine, newLyricWord } = await import("/src/types/ttml.ts");
		editorDocumentAdapter.replace(
			{
				metadata: [],
				lyricLines: Array.from({ length: 30 }, (_, i) => ({
					...newLyricLine(),
					id: "outline-" + i,
					words: [{ ...newLyricWord(), word: "Line " + i }],
					isBG: i === 1,
					isDuet: i === 2,
				})),
			},
			{ source: "user", label: "Outline browser fixture" },
		);
		globalStore.set(main.toolModeAtom, main.ToolMode.Edit);
	});
	const panel = page.locator('[data-amll-plugin-scope="builtin.outline"]');
	await panel.waitFor();
	const row = (i) =>
		panel.locator(
			'[data-line-id="outline-' + i + '"] .amll-outline-outlineItem',
		);
	const state = () =>
		page.evaluate(async () => {
			const { globalStore } = await import("/src/states/store.ts");
			const main = await import("/src/states/main.ts");
			const { revealLineActionAtom } = await import("/src/states/sidebar.ts");
			return {
				selected: [...globalStore.get(main.selectedLinesAtom)],
				ids: globalStore.get(main.lyricLinesAtom).lyricLines.map((l) => l.id),
				dragging: globalStore.get(main.isDraggingGlobalAtom),
				source: globalStore.get(main.dragSourceAtom),
				jump: globalStore.get(revealLineActionAtom),
			};
		});
	await row(0).click();
	assert.deepEqual((await state()).selected, ["outline-0"]);
	await row(2).click({ modifiers: ["Control"] });
	assert.deepEqual((await state()).selected, ["outline-0", "outline-2"]);
	await row(4).click({ modifiers: ["Shift"] });
	assert.equal((await state()).selected.length, 5);
	await row(25).dblclick();
	assert.deepEqual((await state()).selected, ["outline-25"]);
	assert.equal((await state()).jump.id, "outline-25");
	await row(2).click({ button: "right" });
	await page.getByRole("menu").waitFor();
	assert.deepEqual((await state()).selected, ["outline-2"]);
	assert.ok((await page.getByRole("menuitem").count()) >= 5);
	await page.getByRole("menuitemcheckbox").first().click();
	assert.equal(
		await page.evaluate(async () => {
			const { globalStore } = await import("/src/states/store.ts");
			const { lyricLinesAtom } = await import("/src/states/main.ts");
			return globalStore.get(lyricLinesAtom).lyricLines[2].isBG;
		}),
		true,
	);
	await page.keyboard.press("Escape");
	await page.evaluate(async () =>
		(
			await import("/src/plugins/adapters/editor-document.ts")
		).editorDocumentAdapter.undo(),
	);
	// Pointer gestures go through the host hook, including undo and Ctrl-copy.
	const drag = async (from, to, copy = false) => {
		await row(from).scrollIntoViewIfNeeded();
		const a = await row(from).boundingBox();
		const b = await row(to).boundingBox();
		if (copy) await page.keyboard.down("Control");
		await page.mouse.move(a.x + 40, a.y + a.height / 2);
		await page.mouse.down();
		await page.mouse.move(b.x + 40, b.y + b.height - 2, { steps: 8 });
		await page.mouse.up();
		if (copy) await page.keyboard.up("Control");
	};
	await row(0).click();
	await drag(0, 3);
	assert.deepEqual((await state()).ids.slice(0, 4), [
		"outline-1",
		"outline-2",
		"outline-3",
		"outline-0",
	]);
	await page.evaluate(async () =>
		(
			await import("/src/plugins/adapters/editor-document.ts")
		).editorDocumentAdapter.undo(),
	);
	assert.equal((await state()).ids[0], "outline-0");
	await row(0).click();
	await drag(0, 3, true);
	assert.equal((await state()).ids.length, 31);
	await page.evaluate(async () =>
		(
			await import("/src/plugins/adapters/editor-document.ts")
		).editorDocumentAdapter.undo(),
	);
	// Unloading during a gesture must cancel it and clear global drag state.
	await row(0).click();
	const a = await row(0).boundingBox();
	await page.mouse.move(a.x + 40, a.y + 8);
	await page.mouse.down();
	await page.mouse.move(a.x + 40, a.y + 45, { steps: 5 });
	assert.equal((await state()).dragging, true);
	await page.evaluate(async () =>
		(
			await import("/src/plugins/trusted/trusted-js-host.ts")
		).trustedJsPluginService.unload("builtin.outline"),
	);
	await panel.waitFor({ state: "detached" });
	await page.mouse.up();
	assert.equal((await state()).dragging, false);
	assert.equal((await state()).source, null);
	await page.evaluate(async () =>
		(
			await import("/src/plugins/trusted/trusted-js-host.ts")
		).reloadTrustedJsPlugin("builtin.outline"),
	);
	await panel.waitFor();
	assert.equal(await panel.locator("[data-line-id]").count(), 30);
	await panel
		.locator(":scope > *")
		.first()
		.screenshot({ path: resolve(root, "release/outline-panel.png") });
	await page.evaluate(async () =>
		(
			await import("/src/plugins/trusted/trusted-js-host.ts")
		).trustedJsPluginService.setEnabled("builtin.outline", false),
	);
	await page.reload();
	await page.evaluate(
		async () =>
			await (await import("/src/plugins/trusted/trusted-js-host.ts"))
				.factoryPluginsLoaded,
	);
	assert.equal(await panel.count(), 0);
	await page.evaluate(async () => {
		const host = await import("/src/plugins/trusted/trusted-js-host.ts");
		await host.trustedJsPluginService.setEnabled("builtin.outline", true);
		await host.reloadTrustedJsPlugin("builtin.outline");
	});
	await panel.waitFor();
	await page.evaluate(() => {
		localStorage.setItem("openSidebarTabs", JSON.stringify(["outline"]));
		localStorage.setItem("activeSidebarTab", JSON.stringify("outline"));
	});
	await page.reload();
	await panel.waitFor();
	assert.deepEqual(errors, []);
	console.log(
		"Outline browser checks passed: default view, selection, reveal, shared menu, reorder, copy, undo, unload during drag, restore.",
	);
} finally {
	await browser.close();
}
