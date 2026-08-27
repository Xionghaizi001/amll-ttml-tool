/**
 * @description 处理打开文件的逻辑（阶段 7 起为统一文件流程的薄封装）
 */

import { useCallback } from "react";
import { lyricFileFlow } from "$/plugins/adapters/lyric-file-flow-host";

export const useFileOpener = () => {
	const openFile = useCallback(
		/**
		 * 打开文件（音频直接装载；歌词经格式 provider 走统一导入事务）
		 * @param file
		 * @param forceExt 可选参数，用于强制指定解析方式，不传入则从文件后缀名推断
		 */
		(file: File, forceExt?: string) => {
			lyricFileFlow.openTransferredFile(file, forceExt);
		},
		[],
	);

	return { openFile };
};
