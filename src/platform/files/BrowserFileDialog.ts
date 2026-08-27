import saveFile from "save-file";
import type {
	FilePickerOptions,
	FilePickerPort,
	HostOpenedFile,
	SaveTextFileInput,
	TextFileSaverPort,
} from "$/kernel/platform";

const toAcceptAttribute = (options?: FilePickerOptions): string => {
	const entries = (options?.accept ?? []).map((entry) =>
		entry.includes("/") ? entry : `.${entry}`,
	);
	// 与既有行为保持一致：始终允许用户选择任意文件（例如扩展名不规范的歌词）。
	return [...entries, "*/*"].join(",");
};

/**
 * 基于 File API 的文件选择实现。浏览器无法可靠感知“取消”，
 * 用户取消选择时 Promise 可能永不 resolve（与旧实现一致，不会泄漏监听器）。
 */
export const browserFilePicker: FilePickerPort = {
	pickFile: (options?: FilePickerOptions) =>
		new Promise<HostOpenedFile | null>((resolve) => {
			const inputEl = document.createElement("input");
			inputEl.type = "file";
			inputEl.accept = toAcceptAttribute(options);
			inputEl.addEventListener(
				"change",
				() => {
					const file = inputEl.files?.[0];
					resolve(
						file
							? {
									name: file.name,
									text: () => file.text(),
									asFile: async () => file,
								}
							: null,
					);
				},
				{ once: true },
			);
			inputEl.click();
		}),
};

/** 基于 anchor 下载（save-file 包）的文本保存实现，Web 与 Tauri WebView 通用。 */
export const browserTextFileSaver: TextFileSaverPort = {
	saveTextFile: async ({ fileName, content, mimeType }: SaveTextFileInput) => {
		const blob = new Blob([content], { type: mimeType ?? "text/plain" });
		await saveFile(blob, fileName);
	},
};
