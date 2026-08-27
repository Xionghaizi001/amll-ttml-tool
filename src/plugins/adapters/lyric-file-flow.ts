import {
	getExportedContentIssues,
	getExportFileName,
	getFileExtension,
	getLyricExportIssues,
	mergeExtractedLyricMetadata,
	resolveImportedFileName,
	resolveImportedProjectId,
} from "$/application/lyrics";
import {
	applyDefaultTtmlAuthorMetadata,
	type DefaultTtmlAuthorMetadata,
	type ProjectInfo,
} from "$/application/project";
import type { DocumentTransactionMeta } from "$/kernel/editor/EditorDocumentService";
import type { FormatProviderContributionRecord } from "$/kernel/extensions";
import { isLyricFormatHandledError } from "$/kernel/formats";
import type {
	FilePickerPort,
	HostOpenedFile,
	TextFileSaverPort,
} from "$/kernel/platform";
import type { TTMLLyric, TTMLMetadata } from "$/types/ttml";

/**
 * 统一文件流程（阶段 7）：所有歌词文件的打开、导入、导出与保存都经过这里，
 * 统一处理 dirty 确认、项目 ID、文件名、导入事务与导出校验。格式转换由
 * format provider registry 提供，文件选择/保存由平台端口提供 —— 二者都
 * 不允许绕过文档事务服务。
 */

const AUDIO_EXTENSIONS = new Set([
	"flac",
	"wav",
	"m4a",
	"alac",
	"ape",
	"mac",
	"wv",
	"tta",
	"tak",
	"aiff",
	"aif",
	"aifc",
	"mp3",
	"aac",
	"mp4",
	"ogg",
	"oga",
	"opus",
	"wma",
	"asf",
	"mpc",
	"mpp",
	"mp+",
	"dsf",
	"ac3",
	"eac3",
	"dts",
	"dtshd",
	"thd",
	"mlp",
	"mka",
	"amr",
	"rm",
	"ra",
	"au",
	"snd",
	"caf",
	"w64",
	"iff",
	"8svx",
]);

export const isAudioFileExtension = (extension: string): boolean =>
	AUDIO_EXTENSIONS.has(extension.toLowerCase());

export interface LyricFileFlowDocumentPort {
	getRevision(): number;
	readSnapshot(): TTMLLyric;
	replace(document: TTMLLyric, meta: DocumentTransactionMeta): unknown;
	transact(
		meta: DocumentTransactionMeta,
		updater: (draft: TTMLLyric) => undefined,
	): unknown;
}

export interface LyricFormatRegistryPort {
	getFormatProviders(): FormatProviderContributionRecord[];
	getFormatProvider(
		formatId: string,
	): FormatProviderContributionRecord | undefined;
	getHostNativeFormatProvider(): FormatProviderContributionRecord | undefined;
	findFormatProviderForExtension(
		extension: string,
	): FormatProviderContributionRecord | undefined;
}

export interface ConfirmRequest {
	title: string;
	description: string;
	onConfirm: () => void;
}

export interface LyricFileFlowPorts {
	documents: LyricFileFlowDocumentPort;
	formats: LyricFormatRegistryPort;
	picker: FilePickerPort;
	saver: TextFileSaverPort;
	/** 加载音频并返回从中提取的元数据。 */
	loadAudio: (file: File) => Promise<TTMLMetadata[]>;
	listProjects: () => Promise<ProjectInfo[]>;
	getDefaultAuthor: () => DefaultTtmlAuthorMetadata;
	getSaveFileName: () => string;
	setSaveFileName: (fileName: string) => void;
	setProjectId: (projectId: string) => void;
	clearSelection: () => void;
	isDirty: () => boolean;
	requestConfirm: (request: ConfirmRequest) => void;
	notifyError: (message: string) => void;
	notifyWarning: (message: string) => void;
	translate: (
		key: string,
		fallback: string,
		options?: Record<string, unknown>,
	) => string;
	generateId: () => string;
	logDebug: (message: string, ...rest: unknown[]) => void;
	logError: (message: string, ...rest: unknown[]) => void;
}

export interface CommitImportedLyricOptions {
	label: string;
	/** 导入来源的原始文件名（含扩展名）；剪贴板/纯文本等来源省略。 */
	importedFileName?: string;
	/** 宿主原生格式（TTML）保留原始文件名。 */
	keepImportedFileName?: boolean;
	/** 显式指定导入后的保存文件名（如 LRCLIB 生成的规范文件名）。 */
	fileNameOverride?: string;
	expectedRevision?: number;
}

export interface LyricTextSource {
	name: string;
	text(): Promise<string>;
}

export class LyricFileFlow {
	constructor(private readonly ports: LyricFileFlowPorts) {}

	/** 未保存修改的统一确认闸门；不脏时直接执行。 */
	confirmIfDirty(
		texts: { title: string; description: string },
		action: () => void,
	): void {
		if (this.ports.isDirty()) {
			this.ports.requestConfirm({ ...texts, onConfirm: action });
		} else {
			action();
		}
	}

	/**
	 * 打开一个宿主收到的文件（拖拽、Ctrl+O、剪贴板、启动参数）。
	 * 音频文件直接装载（不触发 dirty 确认），歌词文件走导入流程。
	 */
	openTransferredFile(file: File, forceExtension?: string): void {
		const extension =
			forceExtension?.toLowerCase() || getFileExtension(file.name);
		if (isAudioFileExtension(extension)) {
			this.loadAudioFile(file);
			return;
		}
		this.openLyricSource(
			{ name: file.name, text: () => file.text() },
			extension,
		);
	}

	/** 打开一个纯文本来源（剪贴板、Tauri 启动参数）。 */
	openLyricSource(source: LyricTextSource, forceExtension?: string): void {
		const extension =
			forceExtension?.toLowerCase() || getFileExtension(source.name);
		const provider = this.ports.formats.findFormatProviderForExtension(
			extension,
		);
		this.confirmIfDirty(
			{
				title: this.ports.translate(
					"confirmDialog.openFile.title",
					"确认打开文件",
				),
				description: this.ports.translate(
					"confirmDialog.openFile.description",
					"当前文件有未保存的更改。如果继续，这些更改将会丢失。确定要打开新文件吗？",
				),
			},
			() => void this.importLyricSource(source, provider, extension),
		);
	}

	/** 通过系统文件选择器打开任意受支持的歌词或音频文件（Ctrl+O）。 */
	async openWithPicker(): Promise<void> {
		const accept = this.ports.formats
			.getFormatProviders()
			.filter((provider) => provider.importer)
			.flatMap((provider) => provider.extensions);
		const file = await this.ports.picker.pickFile({ accept });
		if (!file) return;
		const extension = getFileExtension(file.name);
		if (isAudioFileExtension(extension) && file.asFile) {
			this.loadAudioFile(await file.asFile());
			return;
		}
		this.openLyricSource(file);
	}

	/** 通过系统文件选择器导入指定格式。 */
	async importWithPicker(formatId: string): Promise<void> {
		const provider = this.ports.formats.getFormatProvider(formatId);
		if (!provider?.importer) {
			this.notifyUnsupportedFormat(formatId);
			return;
		}
		const file = await this.ports.picker.pickFile({
			accept: provider.extensions,
		});
		if (!file) return;
		this.confirmIfDirty(
			{
				title: this.ports.translate(
					"confirmDialog.openFile.title",
					"确认打开文件",
				),
				description: this.ports.translate(
					"confirmDialog.openFile.description",
					"当前文件有未保存的更改。如果继续，这些更改将会丢失。确定要打开新文件吗？",
				),
			},
			() =>
				void this.importLyricSource(file, provider, provider.extensions[0]),
		);
	}

	/**
	 * 将 provider 解析出的文档提交为一次导入事务，并统一处理项目 ID、
	 * 默认作者元数据、选区清理与保存文件名。
	 */
	async commitImportedLyric(
		lyric: TTMLLyric,
		options: CommitImportedLyricOptions,
	): Promise<void> {
		const projectId = await resolveImportedProjectId({
			lyric,
			listProjects: this.ports.listProjects,
			generateProjectId: this.ports.generateId,
			onMatched: (project) =>
				this.ports.logDebug(
					`匹配到了已有项目: ${project.name} (${project.id})`,
				),
			onLookupError: (error) =>
				this.ports.logError("解析项目数据时失败", error),
		});

		applyDefaultTtmlAuthorMetadata(
			lyric.metadata,
			this.ports.getDefaultAuthor(),
		);

		this.ports.documents.replace(lyric, {
			source: "user",
			label: options.label,
			expectedRevision: options.expectedRevision,
		});
		this.ports.setProjectId(projectId);
		this.ports.clearSelection();

		const fileName =
			options.fileNameOverride ??
			resolveImportedFileName({
				metadata: lyric.metadata,
				importedFileName: options.importedFileName,
				keepImportedFileName: options.keepImportedFileName,
			});
		if (fileName) this.ports.setSaveFileName(fileName);
	}

	/** 导出为指定格式并保存到文件（含导出校验）。 */
	async exportDocumentAs(formatId: string): Promise<void> {
		const provider = this.ports.formats.getFormatProvider(formatId);
		if (!provider?.exporter) {
			this.notifyUnsupportedFormat(formatId);
			return;
		}
		const lyric = this.ports.documents.readSnapshot();
		if (getLyricExportIssues(lyric).length > 0) {
			this.ports.notifyWarning(
				this.ports.translate(
					"error.exportEmptyDocument",
					"当前没有可导出的歌词内容",
				),
			);
			return;
		}
		const fileName = getExportFileName(
			this.ports.getSaveFileName(),
			provider.extensions[0],
		);
		try {
			const content = await provider.exporter({ lyric, fileName });
			if (getExportedContentIssues(content).length > 0)
				throw new Error(`Format ${formatId} produced empty output`);
			await this.ports.saver.saveTextFile({
				fileName,
				content,
				mimeType: provider.mimeType,
			});
		} catch (error) {
			this.handleExportError(formatId, error);
		}
	}

	/** 以宿主原生格式（TTML）序列化当前文档；失败返回 null（错误已展示）。 */
	async serializeNativeDocument(): Promise<string | null> {
		const provider = this.ports.formats.getHostNativeFormatProvider();
		if (!provider?.exporter) {
			this.ports.logError("No host-native format provider is registered");
			return null;
		}
		try {
			const content = await provider.exporter({
				lyric: this.ports.documents.readSnapshot(),
				fileName: this.ports.getSaveFileName(),
			});
			if (getExportedContentIssues(content).length > 0)
				throw new Error("Host-native format produced empty output");
			return content;
		} catch (error) {
			this.handleExportError(provider.formatId, error);
			return null;
		}
	}

	/** 保存当前文档到文件（Ctrl+S；允许保存空文档）。 */
	async saveDocumentToFile(): Promise<void> {
		const provider = this.ports.formats.getHostNativeFormatProvider();
		const content = await this.serializeNativeDocument();
		if (content === null) return;
		try {
			await this.ports.saver.saveTextFile({
				fileName: this.ports.getSaveFileName(),
				content,
				mimeType: provider?.mimeType,
			});
		} catch (error) {
			this.handleExportError(provider?.formatId ?? "native", error);
		}
	}

	/** 新建空白文档（含 dirty 确认与项目/文件名重置）。 */
	newDocument(): void {
		this.confirmIfDirty(
			{
				title: this.ports.translate(
					"confirmDialog.newFile.title",
					"确认新建文件",
				),
				description: this.ports.translate(
					"confirmDialog.newFile.description",
					"当前文件有未保存的更改。如果继续，这些更改将会丢失。确定要新建文件吗？",
				),
			},
			() => {
				this.ports.documents.replace(
					{ lyricLines: [], metadata: [] },
					{ source: "user", label: "New lyric document" },
				);
				this.ports.clearSelection();
				this.ports.setProjectId(this.ports.generateId());
				this.ports.setSaveFileName("lyric.ttml");
			},
		);
	}

	private async importLyricSource(
		source: LyricTextSource | HostOpenedFile,
		provider: FormatProviderContributionRecord | undefined,
		extension: string,
	): Promise<void> {
		if (!provider?.importer) {
			this.notifyUnsupportedFormat(extension);
			return;
		}
		const importer = provider.importer;
		const expectedRevision = this.ports.documents.getRevision();
		try {
			const text = await source.text();
			const lyric = await importer({ text, fileName: source.name });
			await this.commitImportedLyric(lyric, {
				label: "Import lyric file",
				importedFileName: source.name,
				keepImportedFileName: provider.hostNative,
				expectedRevision,
			});
		} catch (error) {
			if (isLyricFormatHandledError(error)) {
				this.ports.logDebug(
					`Import of ${source.name} failed; error already surfaced by provider`,
				);
				return;
			}
			this.ports.logError(`Failed to open file: ${source.name}`, error);
			this.ports.notifyError(
				this.ports.translate("error.openFileFailed", "打开文件失败"),
			);
		}
	}

	private loadAudioFile(file: File): void {
		const expectedRevision = this.ports.documents.getRevision();
		const defaultAuthor = this.ports.getDefaultAuthor();
		void this.ports
			.loadAudio(file)
			.then((metadata) => {
				this.ports.documents.transact(
					{
						source: "system",
						label: "Import audio metadata",
						expectedRevision,
					},
					(prev) => {
						const nextMetadata = prev.metadata.map((item) => ({
							...item,
							value: [...item.value],
						}));
						const metadataChanged = mergeExtractedLyricMetadata(
							nextMetadata,
							metadata,
						);
						const defaultChanged = applyDefaultTtmlAuthorMetadata(
							nextMetadata,
							defaultAuthor,
						);

						if (!metadataChanged && !defaultChanged) return;
						prev.metadata = nextMetadata;
					},
				);
			})
			.catch((error) => {
				this.ports.logError(
					`Failed to load audio or extract metadata: ${file.name}`,
					error,
				);
			});
	}

	private notifyUnsupportedFormat(extension: string): void {
		this.ports.notifyError(
			this.ports.translate(
				"error.unsupportedFileFormat",
				"不支持的文件格式: {ext}",
				{ ext: extension },
			),
		);
	}

	private handleExportError(formatId: string, error: unknown): void {
		if (isLyricFormatHandledError(error)) return;
		this.ports.logError(
			`Failed to export lyric with format "${formatId}"`,
			error,
		);
		this.ports.notifyError(
			this.ports.translate("error.exportFileFailed", "导出歌词失败"),
		);
	}
}
