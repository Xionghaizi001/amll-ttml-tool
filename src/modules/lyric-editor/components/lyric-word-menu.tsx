import { ContextMenu } from "@radix-ui/themes";
import { type Atom, atom, useAtomValue, useSetAtom, useStore } from "jotai";
import { useTranslation } from "react-i18next";
import { normalizeLineTime } from "$/application/lyrics";
import { ContextCommandMenuItem } from "$/components/TopMenu/ContextCommandMenuItem";
import { useLocalCommand } from "$/components/TopMenu/useLocalCommand";
import { editorDocumentWriteAtom } from "$/plugins/adapters/editor-document";
import { ContributionMenuItems } from "$/plugins/ui/ContributionMenuItems";
import { replaceWordDialogAtom, splitWordDialogAtom } from "$/states/dialogs";
import {
	editingWordStateAtom,
	selectedLinesAtom,
	selectedWordsAtom,
} from "$/states/main";
import {
	type LyricLine,
	type LyricWord,
	newLyricLine,
	newLyricWord,
} from "$/types/ttml";

const selectedLinesSizeAtom = atom((get) => get(selectedLinesAtom).size);
const selectedWordsSizeAtom = atom((get) => get(selectedWordsAtom).size);

export const LyricWordMenu = ({
	wordIndex,
	wordAtom,
	lineIndex,
}: {
	wordIndex: number;
	wordAtom: Atom<LyricWord>;
	lineIndex: number;
}) => {
	const { t } = useTranslation();

	const store = useStore();
	const selectedWordsSize = useAtomValue(selectedWordsSizeAtom);
	const selectedLinesSize = useAtomValue(selectedLinesSizeAtom);
	const editLyricLines = useSetAtom(editorDocumentWriteAtom);
	const setOpenSplitWordDialog = useSetAtom(splitWordDialogAtom);
	const setOpenReplaceWordDialog = useSetAtom(replaceWordDialogAtom);
	const setEditingWordState = useSetAtom(editingWordStateAtom);
	const word = useAtomValue(wordAtom);
	const commandPrefix = `core.context.word.${word.id}`;
	const commandIds = {
		split: `${commandPrefix}.split`,
		replace: `${commandPrefix}.replace`,
		combine: `${commandPrefix}.combine`,
		delete: `${commandPrefix}.delete`,
		followingToLine: `${commandPrefix}.followingToLine`,
		selectedToLine: `${commandPrefix}.selectedToLine`,
	};
	useLocalCommand(
		commandIds.split,
		() => {
			setEditingWordState({ wordIndex, lineIndex, word: word.word });
			setOpenSplitWordDialog(true);
		},
		() => selectedWordsSize === 1,
	);
	useLocalCommand(
		commandIds.replace,
		() => {
			setEditingWordState({ wordIndex, lineIndex, word: word.word });
			setOpenReplaceWordDialog(true);
		},
		() => selectedWordsSize === 1,
	);
	useLocalCommand(
		commandIds.combine,
		() => {
			editLyricLines((state) => {
				const selectedWords = store.get(selectedWordsAtom);
				const line = state.lyricLines[lineIndex];
				if (!line) return;
				const selectedWordsInLine = line.words.filter((item) =>
					selectedWords.has(item.id),
				);
				if (selectedWordsInLine.length <= 1) return;
				const firstWord = selectedWordsInLine[0];
				const lastWord = selectedWordsInLine[selectedWordsInLine.length - 1];
				const firstIndex = line.words.indexOf(firstWord);
				const mergedWord = newLyricWord();
				mergedWord.word = selectedWordsInLine.map((item) => item.word).join("");
				mergedWord.startTime = firstWord.startTime;
				mergedWord.endTime = lastWord.endTime;
				line.words = line.words.filter((item) => !selectedWords.has(item.id));
				if (firstIndex !== -1) line.words.splice(firstIndex, 0, mergedWord);
			});
		},
		() => selectedWordsSize > 1 && selectedLinesSize === 1,
	);
	useLocalCommand(
		commandIds.delete,
		() => {
			editLyricLines((state) => {
				const selectedWords = store.get(selectedWordsAtom);
				for (const line of state.lyricLines) {
					const originalLength = line.words.length;
					line.words = line.words.filter((item) => !selectedWords.has(item.id));
					if (originalLength !== line.words.length) normalizeLineTime(line);
				}
			});
		},
		() => selectedWordsSize > 0,
	);
	useLocalCommand(
		commandIds.followingToLine,
		afterToNewLine,
		() => selectedWordsSize === 1,
	);
	useLocalCommand(
		commandIds.selectedToLine,
		selectedToNewLine,
		() => selectedWordsSize > 0,
	);

	return (
		<>
			<ContextCommandMenuItem commandId={commandIds.split}>
				{t("contextMenu.splitWord", "拆分单词…")}
			</ContextCommandMenuItem>
			<ContextCommandMenuItem commandId={commandIds.replace}>
				{t("contextMenu.replaceWord", "替换单词…")}
			</ContextCommandMenuItem>
			<ContextCommandMenuItem commandId={commandIds.combine}>
				{t("contextMenu.combineWords", "合并单词")}
			</ContextCommandMenuItem>

			<ContextCommandMenuItem commandId={commandIds.delete}>
				{t("contextMenu.deleteWords", {
					count: selectedWordsSize,
					defaultValue: "删除选定单词",
				})}
			</ContextCommandMenuItem>

			<ContextMenu.Separator />

			<ContextCommandMenuItem commandId={commandIds.followingToLine}>
				{t("contextMenu.moveFollowingWordToNewLine", "此后单词拆至新行")}
			</ContextCommandMenuItem>

			<ContextCommandMenuItem commandId={commandIds.selectedToLine}>
				{t("contextMenu.moveWordToNewLine", {
					count: selectedWordsSize,
					defaultValue: "所选单词拆至新行",
				})}
			</ContextCommandMenuItem>

			<ContributionMenuItems
				location="context.lyricWord"
				variant="context"
				withLeadingSeparator
			/>

			<ContextMenu.Separator />
		</>
	);

	function selectedToNewLine() {
		editLyricLines((state) => {
			const selectedWordIds = store.get(selectedWordsAtom);
			const selectedWords: LyricWord[] = [];
			const affectedLines: LyricLine[] = [];
			for (const line of state.lyricLines) {
				const deletedAtBounds =
					line.words.length > 0 &&
					(selectedWordIds.has(line.words[0].id) ||
						selectedWordIds.has(line.words[line.words.length - 1].id));
				line.words = line.words.filter((w) => {
					if (selectedWordIds.has(w.id)) {
						selectedWords.push(w);
						affectedLines.push(line);
						return false;
					}
					return true;
				});
				if (deletedAtBounds) normalizeLineTime(line);
			}
			const newLine = {
				...newLyricLine(),
				isBG: state.lyricLines[lineIndex].isBG,
				isDuet: state.lyricLines[lineIndex].isDuet,
			} as LyricLine;
			newLine.words.push(...selectedWords);
			normalizeLineTime(newLine);
			state.lyricLines.splice(lineIndex + 1, 0, newLine);
		});
	}

	function afterToNewLine() {
		editLyricLines((state) => {
			const line = state.lyricLines[lineIndex];
			if (!line) return;
			const word = line.words[wordIndex];
			if (!word) return;
			if (/^\s*$/.test(word.word) && !word.startTime && !word.endTime)
				line.words.splice(wordIndex, 1);
			const wordsToMove = line.words.splice(wordIndex);
			const newLine = {
				...newLyricLine(),
				isBG: line.isBG,
				isDuet: line.isDuet,
			} as LyricLine;
			newLine.words.push(...wordsToMove);
			normalizeLineTime(line);
			normalizeLineTime(newLine);
			state.lyricLines.splice(lineIndex + 1, 0, newLine);
		});
	}
};
