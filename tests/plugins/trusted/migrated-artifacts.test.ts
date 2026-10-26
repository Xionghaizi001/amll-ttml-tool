import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { Theme } from "@radix-ui/themes";
import { createElement, type ComponentType } from "react";
import { renderToString } from "react-dom/server";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import {
	parseTrustedJsPackage,
	resolvePluginStrings,
} from "@amll-ttml-tool/plugin-api";
import type { TrustedJsActivationContextV0 } from "@amll-ttml-tool/plugin-sdk-js";
import { describe, expect, it } from "vitest";
import { unpackPluginContainer } from "$/plugins/store/package-container";
import { createRealTrustedHost, realHostFixture } from "./real-host-fixture";

/** Loads a locked factory ZIP exactly as the collector does: digest, container, package gate. */
const loadLockedArtifact = async (pluginId: string) => {
	const root = resolve(import.meta.dirname, "../../..");
	const lock = JSON.parse(
		await readFile(resolve(root, "factory-plugins.lock.json"), "utf8"),
	);
	const item = lock.plugins.find((p: { id: string }) => p.id === pluginId);
	const bytes = await readFile(resolve(root, item.source));
	expect(createHash("sha256").update(bytes).digest("hex")).toBe(item.sha256);
	const unpacked = unpackPluginContainer(bytes);
	if (!unpacked.ok || unpacked.kind !== "trusted-js")
		throw new Error("Invalid artifact");
	const parsed = parseTrustedJsPackage(unpacked.pkg);
	if (!parsed.ok) throw new Error("Invalid package");
	expect(parsed.value.manifest.version).toBe(item.version);
	// A file inside the repo lets bare react/Radix imports resolve to the host's copies, as in the factory bundle.
	const cache = resolve(root, "node_modules/.cache/factory-artifacts");
	await mkdir(cache, { recursive: true });
	const file = resolve(cache, `${item.sha256}.mjs`);
	await writeFile(file, parsed.value.code);
	const module = await import(/* @vite-ignore */ pathToFileURL(file).href);
	return {
		activate: module.activate as (context: TrustedJsActivationContextV0) => void,
		strings: resolvePluginStrings(parsed.value.manifest, parsed.value.resources),
	};
};

describe("sync line timestamps artifact on the real trusted host", () => {
	it("confirms, syncs line timing in one transaction and disposes its entries", async () => {
		const id = "builtin.sync-line-timestamps";
		const { activate, strings } = await loadLockedArtifact(id);
		const document = realHostFixture();
		document.lyricLines[0].startTime = 0;
		document.lyricLines[0].endTime = 900;
		const fixture = createRealTrustedHost({
			pluginId: id,
			document,
			strings,
			locale: "zh-CN",
			onShowForm: () => ({ submitted: true, values: {} }),
		});
		await activate({ pluginId: id, host: fixture.host, signal: new AbortController().signal });
		expect(fixture.extensions.contributions.getMenus("menu.tool")[0]?.commandId).toBe(`${id}.run`);

		await fixture.commands.execute(`${id}.run`);
		expect(fixture.shownForms[0].title).toBe("确认同步行时间戳");
		expect(fixture.service.getRevision()).toBe(1);
		expect(fixture.service.readSnapshot().lyricLines[0]).toMatchObject({ startTime: 100, endTime: 500 });
		fixture.service.undo();
		expect(fixture.service.readSnapshot()).toEqual(document);

		fixture.scope.dispose();
		expect(fixture.commands.get(`${id}.run`)).toBeUndefined();
		expect(fixture.extensions.contributions.getMenus("menu.tool")).toHaveLength(0);
	});
});

describe("lyric formats artifact on the real trusted host", () => {
	it("registers namespaced providers that import and export through the host registry", async () => {
		const id = "builtin.formats";
		const { activate } = await loadLockedArtifact(id);
		const fixture = createRealTrustedHost({ pluginId: id });
		await activate({ pluginId: id, host: fixture.host, signal: new AbortController().signal });
		const contributions = fixture.extensions.contributions;
		expect(contributions.getFormatProviders().map((p) => p.formatId)).toEqual(
			["lrc", "eslrc", "qrc", "yrc", "lys"].map((format) => `${id}.${format}`),
		);
		const lrc = contributions.findFormatProviderForExtension("lrc");
		if (!lrc?.importer || !lrc.exporter) throw new Error("missing LRC provider");
		const lyric = await lrc.importer({ text: "[00:01.00]Hello\n[00:01.00]你好\n[00:02.00]", fileName: "a.lrc" });
		expect(lyric.lyricLines[0]).toMatchObject({ startTime: 1000, endTime: 2000, translatedLyric: "你好" });
		expect(lyric.lyricLines[0].words[0]).toMatchObject({ word: "Hello", obscene: false });
		expect(await lrc.exporter({ lyric: realHostFixture(), fileName: "a.lrc" })).toContain("hello");

		fixture.scope.dispose();
		expect(contributions.getFormatProviders()).toEqual([]);
	});
});

describe("plain text import artifact on the real trusted host", () => {
	it("opens its full-width dialog with host Radix controls and imports through the host port", async () => {
		const id = "builtin.plain-text-import";
		const { activate, strings } = await loadLockedArtifact(id);
		const imports: string[] = [];
		const fixture = createRealTrustedHost({
			pluginId: id,
			strings,
			locale: "zh-CN",
			ports: {
				importDocument: async (lyric, { label }) => {
					imports.push(label);
					fixture.service.replace(lyric, { source: "user", label });
					return true;
				},
			},
		});
		await activate({ pluginId: id, host: fixture.host, signal: new AbortController().signal });
		expect(fixture.extensions.contributions.getMenus("menu.file")[0]?.commandId).toBe(`${id}.run`);

		await fixture.commands.execute(`${id}.run`);
		const [open] = fixture.views.getSnapshot();
		expect(open).toMatchObject({ id: `${id}.dialog`, record: { kind: "dialog-view", size: "full" } });
		const html = renderToString(
			createElement(Theme, null, createElement(open.record.view as ComponentType)),
		);
		expect(html).toContain("rt-TextAreaRoot");
		expect(html).toContain("rt-SwitchRoot");
		expect(html).toContain("导入模式");

		const lyric = await fixture.host.project.importDocument(
			{ lines: [], metadata: [] },
			"Import plain text lyrics",
		);
		expect(lyric.ok).toBe(true);
		expect(imports).toEqual(["Import plain text lyrics"]);

		fixture.scope.dispose();
		expect(fixture.commands.get(`${id}.run`)).toBeUndefined();
		expect(fixture.views.getSnapshot()).toHaveLength(0);
	});
});

describe('metronome factory artifact',()=>{
 it('renders the migrated panel, calibrates through public ports and restores after disposal',async()=>{
 const id='builtin.metronome';const {activate,strings}=await loadLockedArtifact(id);
 const fixture=createRealTrustedHost({pluginId:id,strings,locale:'zh-CN'});
 const signal=new AbortController();await activate({host:fixture.host,pluginId:id,signal:signal.signal});
 const view=fixture.extensions.contributions.getTrustedViews('sidebar')[0];expect(view.id).toBe(id+'.sidebar');
 const html=renderToString(createElement(Theme,null,createElement(view.view as ComponentType)));
 expect(html).toContain('手动打拍校准');expect(html).toContain('使用频谱图校准');
 fixture.host.bpm.setTapMode('spectrogram');fixture.host.bpm.tap(1);fixture.host.bpm.tap(1.5);
 expect(fixture.host.bpm.getState()).toMatchObject({status:'completed',bpm:120});
 fixture.host.bpm.setShowBeatLines(true);signal.abort();fixture.handle.dispose();fixture.scope.dispose();
 expect(fixture.extensions.contributions.getTrustedViews('sidebar')).toHaveLength(0);
 expect(()=>fixture.host.bpm.tap(2)).toThrow('disposed');
 const second=new AbortController();const next=createRealTrustedHost({pluginId:id,strings});await activate({host:next.host,pluginId:id,signal:second.signal});expect(next.extensions.contributions.getTrustedViews('sidebar')).toHaveLength(1);second.abort();next.handle.dispose();next.scope.dispose();
 });
});

describe("outline factory artifact", () => {
	it("renders projection and selection, reveals lines, and removes its contribution on unload", async () => {
		const id = "builtin.outline";
		const { activate, strings } = await loadLockedArtifact(id);
		const document = realHostFixture();
		document.lyricLines[1].isBG = true;
		document.lyricLines[1].isDuet = true;
		const fixture = createRealTrustedHost({
			pluginId: id,
			strings,
			locale: "zh-CN",
			document,
			selection: { lineIds: ["line-1"], wordIds: ["word-1"] },
		});
		await activate({
			host: fixture.host,
			pluginId: id,
			signal: new AbortController().signal,
		});
		const view = fixture.extensions.contributions.getTrustedViews("sidebar")[0];
		expect(view.id).toBe(id + ".sidebar");
		const html = renderToString(createElement(view.view as ComponentType));
		expect(html).toContain("hello");
		expect(html).toContain(">空</span>");
		expect(html).toContain('data-selected="true"');
		expect(html).toContain("amll-outline-isBG amll-outline-isDuet");
		expect(html.match(/class="amll-outline-lineNumber">1</g)).toHaveLength(2);
		fixture.host.editor.revealLine("line-2");
		expect(fixture.host.selection.get()).toEqual({
			lineIds: ["line-2"],
			wordIds: [],
		});
		expect(() => fixture.host.editor.revealLine("missing")).toThrow();
		fixture.handle.dispose();
		fixture.scope.dispose();
		expect(
			fixture.extensions.contributions.getTrustedViews("sidebar"),
		).toHaveLength(0);
		expect(() => fixture.host.editor.revealLine("line-1")).toThrow("disposed");
	});
});
