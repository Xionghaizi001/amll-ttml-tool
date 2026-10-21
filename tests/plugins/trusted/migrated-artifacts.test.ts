import { readFile } from "node:fs/promises";
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
	const module = await import(
		/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(parsed.value.code).toString("base64")}`
	);
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

describe("plain text import artifact on the real trusted host", () => {
	it("imports pasted text through the host import port and remembers its options", async () => {
		const id = "builtin.plain-text-import";
		const { activate, strings } = await loadLockedArtifact(id);
		const imports: string[] = [];
		const fixture = createRealTrustedHost({
			pluginId: id,
			strings,
			onShowForm: (schema) => ({
				submitted: true,
				values: {
					...Object.fromEntries(
						schema.fields.flatMap((field) =>
							"key" in field && field.default !== undefined ? [[field.key, field.default]] : [],
						),
					),
					text: "one\n<two",
					enableSpecialPrefix: true,
				},
			}),
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
		expect(imports).toEqual(["Import plain text lyrics"]);
		const lines = fixture.service.readSnapshot().lyricLines;
		expect(lines.map((line) => [line.words[0].word, line.isBG])).toEqual([
			["one", false],
			["two", true],
		]);
		expect(fixture.kv.get(id)?.options).toMatchObject({ enableSpecialPrefix: true });
		fixture.service.undo();
		expect(fixture.service.readSnapshot()).toEqual(realHostFixture());

		fixture.scope.dispose();
		expect(fixture.commands.get(`${id}.run`)).toBeUndefined();
	});
});
