import type { LocalizedText } from "@amll-ttml-tool/plugin-api";
import type { TTMLLyric } from "$/types/ttml";

/**
 * 歌词格式 provider 协议（阶段 7）。
 *
 * provider 只负责“文本 ↔ 文档结构”的转换；文件选择、dirty 确认、项目 ID、
 * 文件名与导入事务统一由宿主文件流程处理，provider 永远不允许直接触碰
 * 文档事务服务或宿主状态。
 */

export interface LyricFormatImportInput {
	/** 待解析的完整文本内容。 */
	text: string;
	/** 原始文件名（含扩展名），仅供诊断与错误提示使用。 */
	fileName: string;
}

export interface LyricFormatExportInput {
	/** 当前文档快照（已含稳定 id 等内部字段）。 */
	lyric: TTMLLyric;
	/** 目标导出文件名，仅供诊断与错误提示使用。 */
	fileName: string;
}

/**
 * 解析文本为完整的内部文档结构。实现必须返回已归一化的文档
 * （所有行/词具备稳定 id 与必填字段）；解析失败时抛出异常。
 */
export type LyricFormatImporter = (
	input: LyricFormatImportInput,
) => TTMLLyric | Promise<TTMLLyric>;

/** 将文档序列化为目标格式文本；失败时抛出异常。 */
export type LyricFormatExporter = (
	input: LyricFormatExportInput,
) => string | Promise<string>;

/**
 * importer/exporter 已自行向用户完整展示过失败原因（例如 TTML 的专用
 * 错误对话框）时抛出此错误，宿主文件流程据此跳过通用错误 toast。
 */
export class LyricFormatHandledError extends Error {
	readonly handled = true as const;

	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "LyricFormatHandledError";
	}
}

export const isLyricFormatHandledError = (
	error: unknown,
): error is LyricFormatHandledError =>
	error instanceof Error &&
	(error as Partial<LyricFormatHandledError>).handled === true;

export interface LyricFormatProvider {
	/** 全局唯一格式 id（如 "ttml"、"lrc"；插件必须使用自身命名空间前缀）。 */
	formatId: string;
	/** 展示名（如 "LyRiC"、"Lyricify Syllable"），用于菜单与命令标题。 */
	title: LocalizedText;
	/** 关联的文件扩展名（小写、不含点）；第一个为导出时使用的主扩展名。 */
	extensions: string[];
	/** 导出文件的 MIME 类型，缺省为 text/plain。 */
	mimeType?: string;
	importer?: LyricFormatImporter;
	exporter?: LyricFormatExporter;
}

/** 规范化扩展名：小写、去空白、去掉前导点。 */
export const normalizeFormatExtension = (extension: string): string =>
	extension.trim().replace(/^\./, "").toLowerCase();
