import { describe, expect, it } from "vitest";
import { extensionRegistry } from "$/plugins/adapters/extension-host";
import type { LyricLine, TTMLLyric } from "$/types/ttml";
import { ensureBuiltinFormatsRegistered } from "$/plugins/builtin/formats/index";

const sampleLine = (): LyricLine =>
	({
		id: "l1",
		words: [
			{
				id: "w1",
				word: "Hello",
				startTime: 1000,
				endTime: 2000,
				obscene: false,
				emptyBeat: 0,
				romanWord: "",
			},
		],
		translatedLyric: "",
		romanLyric: "",
		isBG: false,
		isDuet: false,
		startTime: 1000,
		endTime: 2000,
		ignoreSync: false,
	}) as unknown as LyricLine;

const sampleLyric = (): TTMLLyric => ({
	lyricLines: [sampleLine()],
	metadata: [],
});

describe("builtin format providers", () => {
	ensureBuiltinFormatsRegistered();
	// 幂等：重复调用不会二次注册（否则 registry 会因重复 formatId 抛错）。
	ensureBuiltinFormatsRegistered();
	const contributions = extensionRegistry.contributions;

	it("registers every builtin format with TTML as the host-native provider", () => {
		expect(contributions.getFormatProviders().map((p) => p.formatId)).toEqual([
			"ttml",
			"lrc",
			"eslrc",
			"qrc",
			"yrc",
			"lys",
			"ass",
		]);
		const native = contributions.getHostNativeFormatProvider();
		expect(native?.formatId).toBe("ttml");
		expect(native?.importer).toBeDefined();
		expect(native?.exporter).toBeDefined();
		expect(contributions.findFormatProviderForExtension("qrc")?.formatId).toBe(
			"qrc",
		);
		expect(contributions.getFormatProvider("ass")?.importer).toBeUndefined();
	});

	it("imports LRC text into a normalized document", async () => {
		const provider = contributions.getFormatProvider("lrc");
		const importer = provider?.importer;
		expect(importer).toBeDefined();
		if (!importer) return;
		const lyric = await importer({
			text: "[00:01.00]Hello world",
			fileName: "song.lrc",
		});
		expect(lyric.lyricLines).toHaveLength(1);
		const line = lyric.lyricLines[0];
		expect(line.id).toBeTruthy();
		expect(line.ignoreSync).toBe(false);
		expect(line.words[0].id).toBeTruthy();
		expect(line.words.map((word) => word.word).join("")).toContain("Hello");
	});

	it("exports through the upstream stringifiers", async () => {
		const exporter = contributions.getFormatProvider("lrc")?.exporter;
		expect(exporter).toBeDefined();
		if (!exporter) return;
		const content = await exporter({
			lyric: sampleLyric(),
			fileName: "song.lrc",
		});
		expect(content).toContain("Hello");
	});

	it("round-trips the host-native TTML format", async () => {
		const provider = contributions.getHostNativeFormatProvider();
		if (!provider?.importer || !provider.exporter) throw new Error("missing");
		const exported = await provider.exporter({
			lyric: sampleLyric(),
			fileName: "song.ttml",
		});
		expect(exported).toContain("<tt");
		const reimported = await provider.importer({
			text: exported,
			fileName: "song.ttml",
		});
		expect(reimported.lyricLines).toHaveLength(1);
		expect(reimported.lyricLines[0].words[0].word).toBe("Hello");
	});
});
