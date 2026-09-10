import { open } from "@tauri-apps/plugin-shell";
import { useAtomValue, useSetAtom, useStore } from "jotai";
import { withImmer } from "jotai-immer";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
	distributeDocumentRomanization,
	generateDocumentRuby,
	previewSegmentWord,
	refreshRomanizationWarnings,
	segmentEntireDocument,
} from "$/application/lyrics";
import {
	cmdAutoRuby,
	cmdAutoSegment,
	cmdCheckRomanizationWarnings,
	cmdDeleteSelection,
	cmdDistributeRomanization,
	cmdNewFile,
	cmdOpenAdvancedSegmentation,
	cmdOpenFile,
	cmdOpenFileFromClipboard,
	cmdOpenGitHub,
	cmdOpenHistoryRestore,
	cmdOpenLatencyTest,
	cmdOpenPluginStore,
	cmdOpenMetadataEditor,
	cmdOpenSettings,
	cmdOpenSyllableSmoothing,
	cmdOpenWiki,
	cmdRedo,
	cmdRubySegment,
	cmdSaveFile,
	cmdSaveFileToClipboard,
	cmdSelectAll,
	cmdSelectInverted,
	cmdSelectWordsOfMatchedSelection,
	cmdSubmitToAMLLDB,
	cmdSyncLineTimestamps,
	cmdUndo,
	cmdUnselectAll,
} from "$/modules/keyboard/commands";
import { useCommandHandler } from "$/modules/keyboard/hooks";
import { rubyGenerationEngine } from "$/modules/lyric-editor/adapters/ruby-generation-engine";
import { romanizationEngine } from "$/modules/segmentation/adapters/romanization-engine";
import { segmentationEngine } from "$/modules/segmentation/adapters/segmentation-engine";
import { useSegmentationConfig } from "$/modules/segmentation/utils/useSegmentationConfig";
import {
	editorDocumentAdapter,
	editorDocumentHistoryAtom,
	editorDocumentRedoAtom,
	editorDocumentUndoAtom,
	editorDocumentWriteAtom,
} from "$/plugins/adapters/editor-document";
import { lyricFileFlow } from "$/plugins/adapters/lyric-file-flow-host";
import {
	advancedSegmentationDialogAtom,
	confirmDialogAtom,
	historyRestoreDialogAtom,
	latencyTestDialogAtom,
	pluginStoreDialogAtom,
	metadataEditorDialogAtom,
	settingsDialogAtom,
	submitToAMLLDBDialogAtom,
	syllableSmoothingDialogAtom,
} from "$/states/dialogs.ts";
import {
	lyricLinesAtom,
	selectedLinesAtom,
	selectedWordsAtom,
} from "$/states/main.ts";
import { type LyricWord, type LyricWordBase, newLyricWord } from "$/types/ttml";
import { createLogger } from "$/utils/logger";

const topMenuLogger = createLogger("TopMenu");

export const useTopMenuActions = () => {
	const { t } = useTranslation();
	const editLyricLines = useSetAtom(editorDocumentWriteAtom);
	const setMetadataEditorOpened = useSetAtom(metadataEditorDialogAtom);
	const setSettingsDialogOpened = useSetAtom(settingsDialogAtom);
	const documentHistory = useAtomValue(editorDocumentHistoryAtom);
	const store = useStore();
	const setConfirmDialog = useSetAtom(confirmDialogAtom);
	const setHistoryRestoreDialog = useSetAtom(historyRestoreDialogAtom);
	const setAdvancedSegmentationDialog = useSetAtom(
		advancedSegmentationDialogAtom,
	);
	const setSyllableSmoothingDialog = useSetAtom(syllableSmoothingDialogAtom);
	const { config: segmentationConfig } = useSegmentationConfig();

	const buildRubySegments = useCallback(
		(text: string, baseWord: LyricWordBase) => {
			const sourceWord: LyricWord = {
				...newLyricWord(),
				word: text,
				startTime: baseWord.startTime,
				endTime: baseWord.endTime,
				emptyBeat: 0,
			};
			const segments = previewSegmentWord(
				sourceWord,
				segmentationConfig,
				segmentationEngine,
			);
			if (segments.length === 0) {
				return [
					{
						word: text,
						startTime: baseWord.startTime,
						endTime: baseWord.endTime,
					},
				];
			}
			return segments.map((segment) => ({
				word: segment.word,
				startTime: segment.startTime,
				endTime: segment.endTime,
			}));
		},
		[segmentationConfig],
	);

	const onNewFile = useCallback(() => {
		lyricFileFlow.newDocument();
	}, []);

	const onOpenFile = useCallback(() => {
		void lyricFileFlow.openWithPicker();
	}, []);

	const onOpenFileFromClipboard = useCallback(async () => {
		try {
			const ttmlText = await navigator.clipboard.readText();
			lyricFileFlow.openLyricSource({
				name: "lyric.ttml",
				text: async () => ttmlText,
			});
		} catch (e) {
			topMenuLogger.error("Failed to parse TTML file from clipboard", e);
		}
	}, []);

	const onSaveFile = useCallback(() => {
		void lyricFileFlow.saveDocumentToFile();
	}, []);

	const onOpenHistoryRestore = useCallback(() => {
		setHistoryRestoreDialog(true);
	}, [setHistoryRestoreDialog]);

	const onSaveFileToClipboard = useCallback(async () => {
		try {
			const content = await lyricFileFlow.serializeNativeDocument();
			if (content === null) return;
			await navigator.clipboard.writeText(content);
		} catch (e) {
			topMenuLogger.error("Failed to save TTML file into clipboard", e);
		}
	}, []);

	const onSubmitToAMLLDB = useCallback(() => {
		store.set(submitToAMLLDBDialogAtom, true);
	}, [store]);

	const onOpenMetadataEditor = useCallback(() => {
		setMetadataEditorOpened(true);
	}, [setMetadataEditorOpened]);

	const onOpenSettings = useCallback(() => {
		setSettingsDialogOpened(true);
	}, [setSettingsDialogOpened]);

	const onOpenLatencyTest = useCallback(() => {
		store.set(latencyTestDialogAtom, true);
	}, [store]);

	const onOpenPluginStore = useCallback(() => {
		store.set(pluginStoreDialogAtom, true);
	}, [store]);

	const onOpenGitHub = useCallback(async () => {
		if (import.meta.env.TAURI_ENV_PLATFORM) {
			await open("https://github.com/amll-dev/amll-ttml-tool");
		} else {
			window.open("https://github.com/amll-dev/amll-ttml-tool");
		}
	}, []);

	const onOpenWiki = useCallback(async () => {
		if (import.meta.env.TAURI_ENV_PLATFORM) {
			await open("https://github.com/amll-dev/amll-ttml-tool/wiki");
		} else {
			window.open("https://github.com/amll-dev/amll-ttml-tool/wiki");
		}
	}, []);

	const onUndo = useCallback(() => {
		store.set(editorDocumentUndoAtom);
	}, [store]);

	const onRedo = useCallback(() => {
		store.set(editorDocumentRedoAtom);
	}, [store]);

	const onUnselectAll = useCallback(() => {
		const immerSelectedLinesAtom = withImmer(selectedLinesAtom);
		const immerSelectedWordsAtom = withImmer(selectedWordsAtom);
		store.set(immerSelectedLinesAtom, (old) => {
			old.clear();
		});
		store.set(immerSelectedWordsAtom, (old) => {
			old.clear();
		});
	}, [store]);

	const onSelectAll = useCallback(() => {
		const lines = store.get(lyricLinesAtom).lyricLines;
		const selectedLineIds = store.get(selectedLinesAtom);
		const selectedLines = lines.filter((l) => selectedLineIds.has(l.id));
		const selectedWordIds = store.get(selectedWordsAtom);
		const selectedWords = lines
			.flatMap((l) => l.words)
			.filter((w) => selectedWordIds.has(w.id));
		if (selectedWords.length > 0) {
			const tmpWordIds = new Set(selectedWordIds);
			for (const selLine of selectedLines) {
				for (const word of selLine.words) {
					tmpWordIds.delete(word.id);
				}
			}
			if (tmpWordIds.size === 0) {
				store.set(
					selectedWordsAtom,
					new Set(selectedLines.flatMap((line) => line.words.map((w) => w.id))),
				);
				return;
			}
		} else {
			store.set(
				selectedLinesAtom,
				new Set(store.get(lyricLinesAtom).lyricLines.map((l) => l.id)),
			);
		}
		const sel = window.getSelection();
		if (sel) {
			if (sel.empty) {
				sel.empty();
			} else if (sel.removeAllRanges) {
				sel.removeAllRanges();
			}
		}
	}, [store]);

	const onSelectInverted = useCallback(() => {}, []);

	const onSelectWordsOfMatchedSelection = useCallback(() => {}, []);

	const onDeleteSelection = useCallback(() => {
		const selectedWordIds = store.get(selectedWordsAtom);
		const selectedLineIds = store.get(selectedLinesAtom);
		topMenuLogger.info("deleting selections", selectedWordIds, selectedLineIds);
		if (selectedWordIds.size === 0) {
			editLyricLines((prev) => {
				prev.lyricLines = prev.lyricLines.filter(
					(l) => !selectedLineIds.has(l.id),
				);
			});
		} else {
			editLyricLines((prev) => {
				for (const line of prev.lyricLines) {
					line.words = line.words.filter((w) => !selectedWordIds.has(w.id));
				}
			});
		}
		store.set(selectedWordsAtom, new Set());
		store.set(selectedLinesAtom, new Set());
	}, [store, editLyricLines]);

	const onAutoSegment = useCallback(() => {
		segmentEntireDocument(
			editorDocumentAdapter,
			segmentationConfig,
			segmentationEngine,
		);
	}, [segmentationConfig]);

	const onRubySegment = useCallback(() => {
		const selectedWordIds = store.get(selectedWordsAtom);
		const hasSelection = selectedWordIds.size > 0;
		editLyricLines((state) => {
			for (const line of state.lyricLines) {
				for (const word of line.words) {
					if (hasSelection && !selectedWordIds.has(word.id)) continue;
					if (!word.ruby || word.ruby.length === 0) continue;
					const nextRuby: LyricWordBase[] = [];
					for (const rubyWord of word.ruby) {
						const parts = rubyWord.word.split("|");
						const nextSegments = buildRubySegments(parts[0] ?? "", rubyWord);
						const fallbackBase = {
							word: "",
							startTime: word.startTime,
							endTime: word.endTime,
						};
						const extraSegments = parts
							.slice(1)
							.flatMap((part) => buildRubySegments(part, fallbackBase));
						nextRuby.push(...nextSegments, ...extraSegments);
					}
					word.ruby = nextRuby;
				}
			}
		});
	}, [buildRubySegments, editLyricLines, store]);

	const onSyncLineTimestamps = useCallback(() => {
		const action = () => {
			editLyricLines((draft) => {
				for (let i = 0; i < draft.lyricLines.length; i++) {
					const line = draft.lyricLines[i];
					if (line.words.length === 0) continue;

					let startTime = line.words[0].startTime;
					let endTime = line.words[line.words.length - 1].endTime;

					if (i + 1 < draft.lyricLines.length) {
						const nextLine = draft.lyricLines[i + 1];
						if (nextLine.isBG && nextLine.words.length > 0) {
							const nextLineStart = nextLine.words[0].startTime;
							const nextLineEnd =
								nextLine.words[nextLine.words.length - 1].endTime;
							startTime = Math.min(startTime, nextLineStart);
							endTime = Math.max(endTime, nextLineEnd);
						}
					}

					line.startTime = startTime;
					line.endTime = endTime;
				}
			});
		};

		setConfirmDialog({
			open: true,
			title: t("confirmDialog.syncLineTimestamps.title", "确认同步行时间戳"),
			description: t(
				"confirmDialog.syncLineTimestamps.description",
				"此操作将根据每行单词的时间戳自动同步所有行的起始和结束时间为第一个和最后一个音节的开始和结束时间。确定要继续吗？",
			),
			onConfirm: action,
		});
	}, [editLyricLines, setConfirmDialog, t]);

	const onOpenDistributeRomanization = useCallback(() => {
		const selectedLines = store.get(selectedLinesAtom);
		const { failures } = distributeDocumentRomanization(
			editorDocumentAdapter,
			romanizationEngine,
			selectedLines.size ? selectedLines : undefined,
		);
		for (const failure of failures)
			topMenuLogger.error(
				`Failed to distribute romanization for line ${failure.lineIndex + 1}`,
				failure.error,
			);
	}, [store]);

	const onAutoRuby = useCallback(() => {
		const selectedLines = store.get(selectedLinesAtom);
		generateDocumentRuby(
			editorDocumentAdapter,
			rubyGenerationEngine,
			selectedLines.size ? selectedLines : undefined,
		);
	}, [store]);

	const onCheckRomanizationWarnings = useCallback(() => {
		refreshRomanizationWarnings(editorDocumentAdapter, romanizationEngine);
	}, []);

	const onOpenAdvancedSegmentation = useCallback(() => {
		setAdvancedSegmentationDialog(true);
	}, [setAdvancedSegmentationDialog]);

	const onOpenSyllableSmoothing = useCallback(() => {
		setSyllableSmoothingDialog(true);
	}, [setSyllableSmoothingDialog]);

	const canUndo = useCallback(() => documentHistory.canUndo, [documentHistory]);
	const canRedo = useCallback(() => documentHistory.canRedo, [documentHistory]);
	useCommandHandler(cmdNewFile, onNewFile);
	useCommandHandler(cmdOpenFile, onOpenFile);
	useCommandHandler(cmdOpenFileFromClipboard, onOpenFileFromClipboard);
	useCommandHandler(cmdSaveFile, onSaveFile);
	useCommandHandler(cmdOpenHistoryRestore, onOpenHistoryRestore);
	useCommandHandler(cmdSaveFileToClipboard, onSaveFileToClipboard);
	useCommandHandler(cmdSubmitToAMLLDB, onSubmitToAMLLDB);
	useCommandHandler(cmdUndo, onUndo, canUndo);
	useCommandHandler(cmdRedo, onRedo, canRedo);
	useCommandHandler(cmdSelectAll, onSelectAll);
	useCommandHandler(cmdUnselectAll, onUnselectAll);
	useCommandHandler(cmdSelectInverted, onSelectInverted);
	useCommandHandler(
		cmdSelectWordsOfMatchedSelection,
		onSelectWordsOfMatchedSelection,
	);
	useCommandHandler(cmdDeleteSelection, onDeleteSelection);
	useCommandHandler(cmdOpenMetadataEditor, onOpenMetadataEditor);
	useCommandHandler(cmdOpenSettings, onOpenSettings);
	useCommandHandler(cmdAutoSegment, onAutoSegment);
	useCommandHandler(cmdRubySegment, onRubySegment);
	useCommandHandler(cmdOpenAdvancedSegmentation, onOpenAdvancedSegmentation);
	useCommandHandler(cmdOpenSyllableSmoothing, onOpenSyllableSmoothing);
	useCommandHandler(cmdSyncLineTimestamps, onSyncLineTimestamps);
	useCommandHandler(cmdDistributeRomanization, onOpenDistributeRomanization);
	useCommandHandler(cmdCheckRomanizationWarnings, onCheckRomanizationWarnings);
	useCommandHandler(cmdAutoRuby, onAutoRuby);
	useCommandHandler(cmdOpenLatencyTest, onOpenLatencyTest);
	useCommandHandler(cmdOpenPluginStore, onOpenPluginStore);
	useCommandHandler(cmdOpenGitHub, onOpenGitHub);
	useCommandHandler(cmdOpenWiki, onOpenWiki);

	return {
		onNewFile,
		onOpenFile,
		onOpenFileFromClipboard,
		onSaveFile,
		onOpenHistoryRestore,
		onSaveFileToClipboard,
		onSubmitToAMLLDB,
		onUndo,
		onRedo,
		onSelectAll,
		onUnselectAll,
		onSelectInverted,
		onSelectWordsOfMatchedSelection,
		onDeleteSelection,
		onOpenSyllableSmoothing,
		onOpenMetadataEditor,
		onOpenSettings,
		onAutoSegment,
		onRubySegment,
		onOpenAdvancedSegmentation,
		onSyncLineTimestamps,
		onOpenDistributeRomanization,
		onAutoRuby,
		onCheckRomanizationWarnings,
		onOpenLatencyTest,
		onOpenGitHub,
		onOpenWiki,
	};
};
