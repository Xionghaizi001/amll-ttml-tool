/**
 * 平台文件能力端口（阶段 7）：将“选择文件 / 保存文件”与歌词格式处理解耦。
 * Web 实现基于 File API，Tauri 场景由平台 adapter 注入等价实现。
 */

export interface HostOpenedFile {
	/** 原始文件名（含扩展名）。 */
	name: string;
	/** 读取完整文本内容。 */
	text(): Promise<string>;
	/** 底层 File 对象（浏览器实现提供），供音频等二进制消费方使用。 */
	asFile?: () => Promise<File>;
}

export interface FilePickerOptions {
	/**
	 * 接受的扩展名（小写、不含点）或 MIME 模式（如 "audio/*"）。
	 * 为空表示接受任意文件。
	 */
	accept?: readonly string[];
}

export interface FilePickerPort {
	/** 打开系统文件选择器；用户取消时可能永不 resolve（浏览器限制）。 */
	pickFile(options?: FilePickerOptions): Promise<HostOpenedFile | null>;
}

export interface SaveTextFileInput {
	fileName: string;
	content: string;
	/** 缺省 text/plain。 */
	mimeType?: string;
}

export interface TextFileSaverPort {
	saveTextFile(input: SaveTextFileInput): Promise<void>;
}
