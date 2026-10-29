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
	const ready = () =>
		page.evaluate(
			async () =>
				await (await import("/src/plugins/trusted/trusted-js-host.ts"))
					.factoryPluginsLoaded,
		);
	await ready();
	await page.evaluate(async () => {
		const { editorDocumentAdapter: doc } = await import(
			"/src/plugins/adapters/editor-document.ts"
		);
		doc.transact({ source: "user", label: "Metadata fixture" }, (draft) => {
			draft.metadata = [{ key: "artists", value: ["A", ""] }];
		});
		await (
			await import("/src/modules/keyboard/registry.ts")
		).commandRegistry.execute("builtin.metadata.run");
	});
	const panel = page.locator('[data-amll-plugin-scope="builtin.metadata"]');
	await panel.waitFor();
	const bounds = await panel.boundingBox();
	assert.equal(Math.round(bounds.width), 920);
	assert.equal(Math.round(bounds.height), 680);
	const dialogStyle = await page
		.getByRole("dialog")
		.evaluate((el) => ({
			padding: getComputedStyle(el).padding,
			headingHeight: el.querySelector("h1,h2").getBoundingClientRect().height,
		}));
	assert.equal(dialogStyle.padding, "0px");
	assert.equal(dialogStyle.headingHeight, 1);
	await panel.screenshot({
		path: resolve(root, "release/metadata-editor-original-layout.png"),
	});

	const state = () =>
		page.evaluate(
			async () =>
				(
					await import("/src/plugins/adapters/editor-document.ts")
				).editorDocumentAdapter.readSnapshot().metadata,
		);
	const undo = () =>
		page.evaluate(async () =>
			(
				await import("/src/plugins/adapters/editor-document.ts")
			).editorDocumentAdapter.undo(),
		);
	await panel.locator("nav button").nth(1).click();
	const inputs = panel.locator("[data-metadata-input]");
	await inputs.first().fill("Artist");
	assert.equal((await state())[0].value[0], "Artist");
	await undo();
	assert.equal((await state())[0].value[0], "A");
	await panel.locator(".amll-metadata-editorPanel").evaluate((el) => {
		const dataTransfer = new DataTransfer();
		dataTransfer.setData("text", "A, B；C\nB");
		el.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer }));
	});
	assert.deepEqual((await state())[0].value, ["A", "B", "C"]);
	await undo();
	assert.deepEqual((await state())[0].value, ["A", ""]);
	await panel.locator(".amll-metadata-customKeyForm input").fill("custom");
	await panel.locator(".amll-metadata-customKeyForm input").press("Enter");
	await panel.locator(".amll-metadata-editorPanel button").last().click();
	await inputs.first().fill("Saved");
	assert.deepEqual((await state())[1], { key: "custom", value: ["Saved"] });
	await page.screenshot({ path: resolve(root, "release/metadata-editor.png") });
	await page.evaluate(async () =>
		(
			await import("/src/plugins/trusted/trusted-js-host.ts")
		).trustedJsPluginService.unload("builtin.metadata"),
	);
	await panel.waitFor({ state: "detached" });
	assert.equal(
		await page.evaluate(
			async () =>
				!!(
					await import("/src/modules/keyboard/registry.ts")
				).commandRegistry.get("builtin.metadata.run"),
		),
		false,
	);
	await page.evaluate(async () => {
		await (
			await import("/src/plugins/trusted/trusted-js-host.ts")
		).reloadTrustedJsPlugin("builtin.metadata");
		await (
			await import("/src/modules/keyboard/registry.ts")
		).commandRegistry.execute("builtin.metadata.run");
	});
	await panel.waitFor();
	assert.deepEqual((await state())[1], { key: "custom", value: ["Saved"] });
	await page.evaluate(async () =>
		(
			await import("/src/plugins/trusted/trusted-js-host.ts")
		).trustedJsPluginService.setEnabled("builtin.metadata", false),
	);
	await page.reload();
	await ready();
	assert.equal(
		await page.evaluate(
			async () =>
				!!(
					await import("/src/modules/keyboard/registry.ts")
				).commandRegistry.get("builtin.metadata.run"),
		),
		false,
	);
	await page.evaluate(async () => {
		const h = await import("/src/plugins/trusted/trusted-js-host.ts");
		await h.trustedJsPluginService.setEnabled("builtin.metadata", true);
		await h.reloadTrustedJsPlugin("builtin.metadata");
		await (
			await import("/src/modules/keyboard/registry.ts")
		).commandRegistry.execute("builtin.metadata.run");
	});
	await panel.waitFor();
	assert.deepEqual(errors, []);
	console.log(
		"Metadata browser checks passed: edit, drop/deduplicate, undo, custom key, unload/restore, disable/reload/enable.",
	);
} finally {
	await browser.close();
}
