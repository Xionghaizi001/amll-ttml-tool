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
	let requests = 0;
	await page.route("https://lrclib.net/api/**", async (route) => {
		requests++;
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify([
				{
					id: 1,
					name: "Song",
					artistName: "Artist",
					albumName: "Album",
					duration: 30,
					instrumental: false,
					plainLyrics: null,
					syncedLyrics:
						"[00:01.00]Main (back)\n[00:01.00]Translation\n[00:01.00]Roman\n[00:02.00]Next",
				},
			]),
		});
	});
	await page.goto(process.argv[2] ?? "http://127.0.0.1:5191/", {
		timeout: 90000,
	});
	const ready = () =>
		page.evaluate(async () => {
			await (await import("/src/plugins/trusted/trusted-js-host.ts"))
				.factoryPluginsLoaded;
			await (await import("/src/i18n/index.ts")).default.changeLanguage(
				"zh-CN",
			);
		});
	await ready();
	const open = () =>
		page.evaluate(async () => {
			await (
				await import("/src/modules/keyboard/registry.ts")
			).commandRegistry.execute("builtin.lrclib.run");
		});
	const state = () =>
		page.evaluate(async () =>
			(
				await import("/src/plugins/adapters/editor-document.ts")
			).editorDocumentAdapter.readSnapshot(),
		);
	await page.evaluate(async () => {
		(
			await import("/src/plugins/adapters/editor-document.ts")
		).editorDocumentAdapter.transact(
			{ source: "user", label: "LRCLIB fixture" },
			(d) => {
				d.metadata = [{ key: "musicName", value: ["Before"] }];
			},
		);
	});
	const before = await state();
	await open();
	const panel = page.locator('[data-amll-plugin-scope="builtin.lrclib"]');
	await panel.waitFor();
	await panel.getByRole("textbox").fill("Song");
	await panel.getByRole("button", { name: "搜索", exact: true }).click();
	await panel.getByRole("button", { name: /Song/ }).click();
	const preview = page.getByRole("dialog", { name: "Song", exact: true });
	await preview.waitFor();
	assert.match(await preview.getByRole("textbox").inputValue(), /Translation/);
	await preview.getByRole("checkbox").first().check();
	await preview.getByRole("button", { name: "导入歌词", exact: true }).click();
	const confirmation = page.getByRole("dialog", {
		name: "确认导入歌词",
		exact: true,
	});
	await confirmation.getByRole("button", { name: "取消", exact: true }).click();
	assert.deepEqual(await state(), before);
	await preview.getByRole("button", { name: "导入歌词", exact: true }).click();
	await confirmation.getByRole("button", { name: "确定", exact: true }).click();
	await panel.waitFor({ state: "detached" });
	const imported = await state();
	assert.equal(imported.lyricLines.length, 3);
	assert.equal(imported.lyricLines[1].isBG, true);
	assert.equal(imported.lyricLines[0].translatedLyric, "Translation");
	assert.equal(imported.lyricLines[0].romanLyric, "Roman");
	const fileName = await page.evaluate(async () => {
		const { globalStore } = await import("/src/states/store.ts");
		const { saveFileNameAtom } = await import("/src/states/main.ts");
		return globalStore.get(saveFileNameAtom);
	});
	assert.equal(fileName, "Artist - Song.ttml");
	await page.evaluate(async () =>
		(
			await import("/src/plugins/adapters/editor-document.ts")
		).editorDocumentAdapter.undo(),
	);
	assert.deepEqual(await state(), before);
	await open();
	await page.evaluate(async () => {
		const { globalStore } = await import("/src/states/store.ts");
		const { pluginNetworkOfflineAtom } = await import("/src/states/plugins.ts");
		globalStore.set(pluginNetworkOfflineAtom, true);
	});
	await panel.getByRole("textbox").fill("Song");
	await panel.getByRole("button", { name: "搜索", exact: true }).click();
	await page
		.getByText("搜索失败，请检查网络或稍后重试", { exact: false })
		.first()
		.waitFor();
	assert.equal(requests, 1);
	await page.evaluate(async () => {
		const { globalStore } = await import("/src/states/store.ts");
		const { pluginNetworkOfflineAtom } = await import("/src/states/plugins.ts");
		globalStore.set(pluginNetworkOfflineAtom, false);
	});
	await panel.getByRole("button", { name: "搜索", exact: true }).click();
	await panel.getByRole("button", { name: /Song/ }).waitFor();
	await page.screenshot({ path: resolve(root, "release/lrclib-browser.png") });
	await panel.getByRole("button", { name: /Song/ }).click();
	await preview.getByRole("button", { name: "导入歌词", exact: true }).click();
	await confirmation.waitFor();
	await page.evaluate(async () =>
		(
			await import("/src/plugins/trusted/trusted-js-host.ts")
		).trustedJsPluginService.setEnabled("builtin.lrclib", false),
	);
	await panel.waitFor({ state: "detached" });
	await confirmation.getByRole("button", { name: "确定", exact: true }).click();
	assert.deepEqual(await state(), before);
	await page.reload();
	await ready();
	assert.equal(
		await page.evaluate(
			async () =>
				!!(
					await import("/src/modules/keyboard/registry.ts")
				).commandRegistry.get("builtin.lrclib.run"),
		),
		false,
	);
	await page.evaluate(async () => {
		const h = await import("/src/plugins/trusted/trusted-js-host.ts");
		await h.trustedJsPluginService.setEnabled("builtin.lrclib", true);
		await h.reloadTrustedJsPlugin("builtin.lrclib");
	});
	await open();
	await panel.waitFor();
	await panel.getByRole("textbox").fill("Song");
	await panel.getByRole("button", { name: "搜索", exact: true }).click();
	await panel.getByRole("button", { name: /Song/ }).waitFor();
	assert.deepEqual(errors, []);
	console.log(
		"LRCLIB browser checks passed: search/preview/import, confirm cancel, metadata/filename/undo, offline/recovery, unload during confirm, disable/restart/enable.",
	);
} finally {
	await browser.close();
}
