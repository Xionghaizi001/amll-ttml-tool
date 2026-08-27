import i18next from "i18next";
import { toast } from "react-toastify";
import { uid } from "uid";
import {
	defaultTtmlAuthorGithubAtom,
	defaultTtmlAuthorGithubLoginAtom,
} from "$/modules/settings/states";
import { getProjectList } from "$/modules/project/autosave/autosave";
import {
	browserFilePicker,
	browserTextFileSaver,
} from "$/platform/files/BrowserFileDialog";
import { confirmDialogAtom } from "$/states/dialogs";
import {
	isDirtyAtom,
	projectIdAtom,
	saveFileNameAtom,
	selectedLinesAtom,
	selectedWordsAtom,
} from "$/states/main";
import { globalStore } from "$/states/store";
import { editorDocumentAdapter } from "./editor-document";
import { extensionRegistry } from "./extension-host";
import { LyricFileFlow } from "./lyric-file-flow";

const translate = i18next.t.bind(i18next) as (
	key: string,
	fallback: string,
	options?: Record<string, unknown>,
) => string;

/**
 * 宿主装配的统一文件流程单例：浏览器文件端口 + 文档事务 adapter +
 * contribution registry 中的格式 provider。音频引擎按需加载，
 * 保证本模块可以在 Node 环境中被安全导入。
 */
export const lyricFileFlow = new LyricFileFlow({
	documents: editorDocumentAdapter,
	formats: extensionRegistry.contributions,
	picker: browserFilePicker,
	saver: browserTextFileSaver,
	loadAudio: async (file) =>
		(await import("$/modules/audio/audio-engine")).audioEngine.loadMusic(file),
	listProjects: getProjectList,
	getDefaultAuthor: () => ({
		githubId: globalStore.get(defaultTtmlAuthorGithubAtom),
		githubLogin: globalStore.get(defaultTtmlAuthorGithubLoginAtom),
	}),
	getSaveFileName: () => globalStore.get(saveFileNameAtom),
	setSaveFileName: (fileName) => globalStore.set(saveFileNameAtom, fileName),
	setProjectId: (projectId) => globalStore.set(projectIdAtom, projectId),
	clearSelection: () => {
		globalStore.set(selectedLinesAtom, new Set<string>());
		globalStore.set(selectedWordsAtom, new Set<string>());
	},
	isDirty: () => globalStore.get(isDirtyAtom),
	requestConfirm: ({ title, description, onConfirm }) =>
		globalStore.set(confirmDialogAtom, {
			open: true,
			title,
			description,
			onConfirm,
		}),
	notifyError: (message) => toast.error(message),
	notifyWarning: (message) => toast.warn(message),
	translate,
	generateId: () => uid(),
	logDebug: (message, ...rest) =>
		console.debug(`[LyricFileFlow] ${message}`, ...rest),
	logError: (message, ...rest) =>
		console.error(`[LyricFileFlow] ${message}`, ...rest),
});
