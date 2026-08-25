import { ContextMenu } from "@radix-ui/themes";
import { type Atom, atom, useAtomValue, useSetAtom, useStore } from "jotai";
import { useSetImmerAtom } from "jotai-immer";
import {
	type MouseEvent,
	type PropsWithChildren,
	useMemo,
	useRef,
} from "react";
import { LyricLineMenu } from "$/components/Menus/lyric-line-menu";
import { editorDocumentWriteAtom } from "$/plugins/adapters/editor-document";
import {
	selectedLinesAtom,
	selectedWordsAtom,
	ToolMode,
	toolModeAtom,
} from "$/states/main";
import { type LyricLine, type LyricWord, newLyricWord } from "$/types/ttml";
import { normalizeLineTime } from "../utils/normalize-line-time";
import styles from "./index.module.css";
import { LyricWordMenu } from "./lyric-word-menu";

const isDraggingAtom = atom(false);

export interface LyricWordViewEditProps {
	wordAtom: Atom<LyricWord>;
	wordIndex: number;
	line: LyricLine;
	lineIndex: number;
}

export const LyricWordViewEditSpan = ({
	wordAtom,
	wordIndex,
	line,
	lineIndex,
	className,
	children,
	onDoubleClick,
}: PropsWithChildren<
	LyricWordViewEditProps & {
		className?: string;
		onDoubleClick?: () => void;
	}
>) => {
	const word = useAtomValue(wordAtom);
	const store = useStore();
	const editLyricLines = useSetAtom(editorDocumentWriteAtom);
	const setSelectedLines = useSetImmerAtom(selectedLinesAtom);
	const isWordSelectedAtom = useMemo(
		() => atom((get) => get(selectedWordsAtom).has(get(wordAtom).id)),
		[wordAtom],
	);
	const isWordSelected = useAtomValue(isWordSelectedAtom);
	const selectedWords = useAtomValue(selectedWordsAtom);
	const setSelectedWords = useSetImmerAtom(selectedWordsAtom);
	const toolMode = useAtomValue(toolModeAtom);
	const blockDragRef = useRef(false);

	function onWordSelect(event: MouseEvent<HTMLSpanElement>) {
		if (event.ctrlKey || event.metaKey) {
			setSelectedWords((selection) => {
				if (selection.has(word.id)) selection.delete(word.id);
				else selection.add(word.id);
			});
		} else if (event.shiftKey) {
			setSelectedWords((selection) => {
				if (!selection.size) {
					selection.add(word.id);
					return;
				}
				let minBoundary = Number.NaN;
				let maxBoundary = Number.NaN;
				line.words.forEach((lineWord, index) => {
					if (!selection.has(lineWord.id)) return;
					if (Number.isNaN(minBoundary)) minBoundary = index;
					if (Number.isNaN(maxBoundary)) maxBoundary = index;
					minBoundary = Math.min(minBoundary, index, wordIndex);
					maxBoundary = Math.max(maxBoundary, index, wordIndex);
				});
				for (let index = minBoundary; index <= maxBoundary; index += 1)
					selection.add(line.words[index].id);
			});
		} else {
			setSelectedLines((selection) => {
				if (!selection.has(line.id) || selection.size !== 1) {
					selection.clear();
					selection.add(line.id);
				}
			});
			setSelectedWords((selection) => {
				if (!selection.has(word.id) || selection.size !== 1) {
					selection.clear();
					selection.add(word.id);
				}
			});
		}
	}

	return (
		<ContextMenu.Root
			onOpenChange={(open) => {
				if (!open || isWordSelected) return;
				setSelectedWords((selection) => {
					selection.clear();
					selection.add(word.id);
				});
				setSelectedLines((selection) => {
					selection.clear();
					selection.add(line.id);
				});
			}}
		>
			<ContextMenu.Trigger>
				<span
					draggable={toolMode === ToolMode.Edit}
					onPointerDown={(event) => {
						blockDragRef.current =
							(event.target as HTMLElement | null)?.tagName === "INPUT";
					}}
					onPointerUp={() => {
						blockDragRef.current = false;
					}}
					onDragStart={(event) => {
						if (blockDragRef.current) {
							blockDragRef.current = false;
							event.preventDefault();
							event.stopPropagation();
							return;
						}
						if (!isWordSelected) onWordSelect(event);
						event.dataTransfer.effectAllowed = "copyMove";
						event.dataTransfer.dropEffect = "move";
						store.set(isDraggingAtom, true);
						event.stopPropagation();
					}}
					onDragEnd={() => {
						store.set(isDraggingAtom, false);
						blockDragRef.current = false;
					}}
					onDragOver={(event) => {
						if (!store.get(isDraggingAtom) || isWordSelected) return;
						event.preventDefault();
						const rect = event.currentTarget.getBoundingClientRect();
						const insertLeft = event.clientX - rect.left < rect.width / 2;
						event.currentTarget.classList.toggle(styles.dropLeft, insertLeft);
						event.currentTarget.classList.toggle(styles.dropRight, !insertLeft);
						event.dataTransfer.dropEffect =
							event.ctrlKey || event.metaKey ? "copy" : "move";
					}}
					onDrop={(event) => {
						event.currentTarget.classList.remove(
							styles.dropLeft,
							styles.dropRight,
						);
						if (!store.get(isDraggingAtom) || isWordSelected) return;
						const rect = event.currentTarget.getBoundingClientRect();
						const insertRight = event.clientX - rect.left > rect.width / 2;
						const isCopyingWords = event.ctrlKey || event.metaKey;
						editLyricLines((state) => {
							let collectedWords: LyricWord[] = [];
							for (const sourceLine of state.lyricLines) {
								collectedWords.push(
									...sourceLine.words.filter((item) =>
										selectedWords.has(item.id),
									),
								);
								if (isCopyingWords) continue;
								const deletedAtBounds =
									sourceLine.words.length > 0 &&
									(selectedWords.has(sourceLine.words[0].id) ||
										selectedWords.has(sourceLine.words.at(-1)?.id ?? ""));
								sourceLine.words = sourceLine.words.filter(
									(item) => !selectedWords.has(item.id),
								);
								if (deletedAtBounds) normalizeLineTime(sourceLine);
							}
							const targetLine = state.lyricLines.find(
								(item) => item.id === line.id,
							);
							if (!targetLine) throw new Error("Target line not found");
							const targetIndex = targetLine.words.findIndex(
								(item) => item.id === word.id,
							);
							if (targetIndex < 0) throw new Error("Target word not found");
							if (isCopyingWords) {
								collectedWords = collectedWords.map((item) => ({
									...item,
									id: newLyricWord().id,
								}));
								setSelectedWords((selection) => {
									selection.clear();
									for (const item of collectedWords) selection.add(item.id);
								});
							}
							const insertPosition = targetIndex + (insertRight ? 1 : 0);
							const insertedAtBounds =
								insertPosition === 0 ||
								insertPosition === targetLine.words.length;
							targetLine.words.splice(insertPosition, 0, ...collectedWords);
							if (insertedAtBounds) normalizeLineTime(targetLine);
						});
					}}
					onDragLeave={(event) =>
						event.currentTarget.classList.remove(
							styles.dropLeft,
							styles.dropRight,
						)
					}
					className={className}
					onDoubleClick={onDoubleClick}
					onClick={(event) => {
						event.stopPropagation();
						event.preventDefault();
						onWordSelect(event);
					}}
				>
					{children}
				</span>
			</ContextMenu.Trigger>
			<ContextMenu.Content>
				<LyricWordMenu
					wordAtom={wordAtom}
					wordIndex={wordIndex}
					lineIndex={lineIndex}
				/>
				<LyricLineMenu lineIndex={lineIndex} />
			</ContextMenu.Content>
		</ContextMenu.Root>
	);
};
