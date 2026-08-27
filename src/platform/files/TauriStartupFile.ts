import { invoke } from "@tauri-apps/api/core";
import type { HostOpenedFile } from "$/kernel/platform";

interface TauriOpenFileData {
	filename: string;
	data: string;
	ext: string;
}

/**
 * Tauri 平台 adapter：读取通过命令行参数传入的启动文件
 * （Rust 侧 `get_open_file_data` 命令）。非 Tauri 环境返回 null。
 */
export const getTauriStartupOpenedFile =
	async (): Promise<HostOpenedFile | null> => {
		if (!import.meta.env.TAURI_ENV_PLATFORM) return null;
		const file = await invoke<TauriOpenFileData | null>("get_open_file_data");
		if (!file) return null;
		return { name: file.filename, text: async () => file.data };
	};
