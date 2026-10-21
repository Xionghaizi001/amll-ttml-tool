import { prepareLyricLinesForExport } from "$/application/lyrics";
import { LyricFormatHandledError } from "$/kernel/formats";
import { extensionRegistry } from "$/plugins/adapters/extension-host";
import { ttmlErrorDialogAtom } from "$/states/dialogs";
import { globalStore } from "$/states/store";
import type { JsError } from "$/modules/ttml-processor/types";
import { normalizeAmllLyricResult } from "./normalize";

/**
 * 内置歌词格式 provider（阶段 7）。
 *
 * TTML 来自自有 ttml-processor wasm，ASS 导出来自上游
 * @applemusic-like-lyrics/lyric；LRC/ESLRC/QRC/YRC/LYS 已迁出为出厂插件
 * `builtin.formats`。重量实现按需动态加载，保证本模块可以在 Node 测试中导入。
 *
 * TTML 是宿主原生序列化格式（保存/自动保存/提交管线依赖），注册为
 * hostNative；本 scope 永不 dispose，即宿主级“TTML provider 不可卸载”
 * 保证（与 Edit 模式 fail-safe 同先例）。
 */

const surfaceTtmlError = (
	error: JsError,
	contextInfo: string,
	rawText?: string,
): never => {
	console.warn("[core.formats] TTML error", contextInfo, error);
	globalStore.set(ttmlErrorDialogAtom, { error, rawText });
	throw new LyricFormatHandledError(contextInfo, { cause: error });
};

const loadUpstream = () => import("@applemusic-like-lyrics/lyric");

let registered = false;

/**
 * 注册内置格式 provider。scope 终生存活；派生的导入/导出命令由
 * `ensureFormatCommandsRegistered` 依据 registry 内容自动维护。
 */
export const ensureBuiltinFormatsRegistered = (): void => {
	if (registered) return;
	registered = true;
	const scope = extensionRegistry.createScope({
		kind: "builtin",
		id: "core.formats",
		trusted: true,
	});

	scope.registerFormatProvider({
		formatId: "ttml",
		title: "TTML",
		extensions: ["ttml"],
		mimeType: "text/xml",
		order: 100,
		hostNative: true,
		importer: async ({ text, fileName }) => {
			const { ttmlToAmll } = await import("$/modules/ttml-processor");
			const result = ttmlToAmll(text);
			if (!result.success)
				throw surfaceTtmlError(
					result.error,
					`Error when parsing TTML: ${fileName}`,
					text,
				);
			return normalizeAmllLyricResult(result.data);
		},
		exporter: async ({ lyric }) => {
			const { amllToTTML, ttmlLyricToAmllResult } = await import(
				"$/modules/ttml-processor"
			);
			const result = amllToTTML(ttmlLyricToAmllResult(lyric));
			if (!result.success)
				throw surfaceTtmlError(result.error, "Error when generating TTML");
			return result.data;
		},
	});

	scope.registerFormatProvider({
		formatId: "ass",
		title: { default: "ASS", "zh-CN": "ASS 字幕" },
		extensions: ["ass"],
		order: 700,
		exporter: async ({ lyric }) =>
			(await loadUpstream()).stringifyAss(
				prepareLyricLinesForExport(lyric.lyricLines),
			),
	});
};
