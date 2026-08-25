import { ContextMenu } from "@radix-ui/themes";
import { atom, useAtomValue, useSetAtom } from "jotai";
import * as React from "react";
import { useTranslation } from "react-i18next";
import {
	ContextCommandCheckboxItem,
	ContextCommandMenuItem,
} from "$/components/TopMenu/ContextCommandMenuItem";
import { useLocalCommand } from "$/components/TopMenu/useLocalCommand";
import { editorDocumentWriteAtom } from "$/plugins/adapters/editor-document";
import { lyricLinesAtom, selectedLinesAtom } from "$/states/main";
import { type LyricLine, newLyricLine, newLyricWord } from "$/types/ttml";

const selectedLinesSizeAtom = atom((get) => get(selectedLinesAtom).size);

export const LyricLineMenu = ({ lineIndex }: { lineIndex: number }) => {
	const { t } = useTranslation();

	const selectedLinesSize = useAtomValue(selectedLinesSizeAtom);
	const selectedLines = useAtomValue(selectedLinesAtom);
	const editLyricLines = useSetAtom(editorDocumentWriteAtom);

	const lineObjs = useAtomValue(lyricLinesAtom);
	const selectedLineObjs = lineObjs.lyricLines.filter((line) =>
		selectedLines.has(line.id),
	);
	const [Bgchecked, setBgChecked] = React.useState(() => {
		if (selectedLineObjs.every((line) => line.isBG)) return true;
		else if (selectedLineObjs.every((line) => !line.isBG)) return false;
		else return "indeterminate" as const;
	});
	const [DuetChecked, setDuetChecked] = React.useState(() => {
		if (selectedLineObjs.every((line) => line.isDuet)) return true;
		else if (selectedLineObjs.every((line) => !line.isDuet)) return false;
		else return "indeterminate" as const;
	});
	const combineEnabled = (() => {
		if (selectedLinesSize < 2) return null;
		const lineIdxs = lineObjs.lyricLines
			.filter((line) => selectedLines.has(line.id))
			.map((line) => lineObjs.lyricLines.indexOf(line));
		const minIdx = Math.min(...lineIdxs);
		const maxIdx = Math.max(...lineIdxs);
		if (lineIdxs.length !== maxIdx - minIdx + 1) return null;
		for (let i = minIdx; i <= maxIdx; i++)
			if (!lineIdxs.includes(i)) return null;
		return { minIdx, maxIdx };
	})();

	function bgOnCheck(checked: boolean) {
		setBgChecked(checked);
		editLyricLines((state) => {
			const lines = state.lyricLines.filter((line) =>
				selectedLines.has(line.id),
			);
			for (const line of lines) line.isBG = checked;
		});
	}
	function duetOnCheck(checked: boolean) {
		setDuetChecked(checked);
		editLyricLines((state) => {
			const lines = state.lyricLines.filter((line) =>
				selectedLines.has(line.id),
			);
			for (const line of lines) line.isDuet = checked;
		});
	}

	const commandPrefix = `core.context.line.${lineObjs.lyricLines[lineIndex]?.id ?? lineIndex}`;
	const commandIds = {
		background: `${commandPrefix}.background`,
		duet: `${commandPrefix}.duet`,
		insertBefore: `${commandPrefix}.insertBefore`,
		insertAfter: `${commandPrefix}.insertAfter`,
		copy: `${commandPrefix}.copy`,
		combine: `${commandPrefix}.combine`,
		delete: `${commandPrefix}.delete`,
	};
	useLocalCommand(commandIds.background, (checked) =>
		bgOnCheck(checked === true),
	);
	useLocalCommand(commandIds.duet, (checked) => duetOnCheck(checked === true));
	useLocalCommand(commandIds.insertBefore, () => {
		editLyricLines((state) => {
			state.lyricLines.splice(lineIndex, 0, newLyricLine());
		});
	});
	useLocalCommand(commandIds.insertAfter, () => {
		editLyricLines((state) => {
			state.lyricLines.splice(lineIndex + 1, 0, newLyricLine());
		});
	});
	useLocalCommand(commandIds.copy, copyLines, () => selectedLinesSize > 0);
	useLocalCommand(commandIds.combine, combineLines, () =>
		Boolean(combineEnabled),
	);
	useLocalCommand(commandIds.delete, () => {
		editLyricLines((state) => {
			if (selectedLinesSize === 0) state.lyricLines.splice(lineIndex, 1);
			else
				state.lyricLines = state.lyricLines.filter(
					(line) => !selectedLines.has(line.id),
				);
		});
	});

	return (
		<>
			<ContextCommandCheckboxItem
				commandId={commandIds.background}
				checked={Bgchecked}
			>
				{t("contextMenu.bgLyric", "背景歌词")}
			</ContextCommandCheckboxItem>
			<ContextCommandCheckboxItem
				commandId={commandIds.duet}
				checked={DuetChecked}
			>
				{t("contextMenu.duetLyric", "对唱歌词")}
			</ContextCommandCheckboxItem>
			<ContextMenu.Separator />
			<ContextCommandMenuItem commandId={commandIds.insertBefore}>
				{t("contextMenu.insertLineBefore", "在前插入空行")}
			</ContextCommandMenuItem>
			<ContextCommandMenuItem commandId={commandIds.insertAfter}>
				{t("contextMenu.insertLineAfter", "在后插入空行")}
			</ContextCommandMenuItem>
			<ContextCommandMenuItem commandId={commandIds.copy}>
				{t("contextMenu.copyLine", {
					count: selectedLinesSize,
					defaultValue: "复制行",
				})}
			</ContextCommandMenuItem>
			<ContextCommandMenuItem commandId={commandIds.combine}>
				{t("contextMenu.combineLine", "合并行")}
			</ContextCommandMenuItem>
			<ContextCommandMenuItem commandId={commandIds.delete}>
				{t("contextMenu.deleteLine", {
					count: selectedLinesSize,
					defaultValue: "删除行",
				})}
			</ContextCommandMenuItem>
		</>
	);

	function combineLines() {
		editLyricLines((state) => {
			if (!combineEnabled) return;
			const { minIdx, maxIdx } = combineEnabled;
			const target = state.lyricLines[minIdx];
			for (let i = minIdx + 1; i <= maxIdx; i++) {
				const line = state.lyricLines[i];
				target.words.push(...line.words);
			}
			target.endTime = state.lyricLines[maxIdx].endTime;
			state.lyricLines.splice(minIdx + 1, maxIdx - minIdx);
		});
	}

	function copyLines() {
		editLyricLines((state) => {
			state.lyricLines = state.lyricLines.flatMap((line) => {
				if (!selectedLines.has(line.id)) return line;
				const newLine: LyricLine = {
					...line,
					id: newLyricLine().id,
					words: line.words.map((word) => ({
						...word,
						id: newLyricWord().id,
					})),
				};
				return [line, newLine];
			});
		});
	}
};
