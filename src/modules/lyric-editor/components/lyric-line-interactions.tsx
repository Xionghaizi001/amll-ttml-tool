import { Button, Flex, Text, TextField } from "@radix-ui/themes";
import { type Atom, atom, useAtomValue, useSetAtom } from "jotai";
import {
	memo,
	type SyntheticEvent,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { editorDocumentWriteAtom } from "$/plugins/adapters/editor-document";
import { selectedWordsAtom } from "$/states/main";
import type { LyricLine } from "$/types/ttml";
import styles from "./index.module.css";

export const LyricLineScroller = ({
	lineAtom,
	wordsContainer,
	editingRomanWordIndex,
}: {
	lineAtom: Atom<LyricLine>;
	wordsContainer: HTMLDivElement | null;
	editingRomanWordIndex: number | null;
}) => {
	const scrollToIndexAtom = useMemo(
		() =>
			atom((get) => {
				const line = get(lineAtom);
				const selectedWords = get(selectedWordsAtom);
				if (selectedWords.size === 0) return Number.NaN;
				let index = 0;
				for (const word of line.words) {
					if (selectedWords.has(word.id)) return index;
					index += 1;
				}
				return Number.NaN;
			}),
		[lineAtom],
	);
	const scrollToIndex = useAtomValue(scrollToIndexAtom);

	useEffect(() => {
		const targetIndex = !Number.isNaN(scrollToIndex)
			? scrollToIndex
			: editingRomanWordIndex;
		if (targetIndex === null || Number.isNaN(targetIndex) || !wordsContainer)
			return;
		const wordElement = wordsContainer.children[targetIndex] as HTMLElement;
		if (!wordElement) return;
		wordsContainer.scrollTo({
			left: wordElement.offsetLeft - wordsContainer.clientWidth / 2,
			behavior: "auto",
		});
	}, [scrollToIndex, editingRomanWordIndex, wordsContainer]);

	useEffect(() => {
		if (!wordsContainer) return;
		const handleFocusIn = (event: FocusEvent) => {
			const target = event.target as HTMLElement | null;
			const wordGroup = target?.closest<HTMLElement>("[data-word-index]");
			if (!wordGroup || !wordsContainer.contains(wordGroup)) return;
			wordsContainer.scrollTo({
				left: wordGroup.offsetLeft - wordsContainer.clientWidth / 2,
				behavior: "auto",
			});
		};
		wordsContainer.addEventListener("focusin", handleFocusIn);
		return () => wordsContainer.removeEventListener("focusin", handleFocusIn);
	}, [wordsContainer]);

	return null;
};

export const SubLineEdit = memo(
	({
		lineAtom,
		lineIndex,
		type,
	}: {
		lineAtom: Atom<LyricLine>;
		lineIndex: number;
		type: "translatedLyric" | "romanLyric";
	}) => {
		const editLyricLines = useSetAtom(editorDocumentWriteAtom);
		const line = useAtomValue(lineAtom);
		const [editing, setEditing] = useState(false);
		const [inputValue, setInputValue] = useState("");
		const { t } = useTranslation();

		const onEnter = useCallback(
			(event: SyntheticEvent<HTMLInputElement>) => {
				setEditing(false);
				const newValue = event.currentTarget.value;
				if (newValue === line[type]) return;
				editLyricLines((state) => {
					state.lyricLines[lineIndex][type] = newValue;
				});
			},
			[editLyricLines, line, lineIndex, type],
		);

		useEffect(() => {
			if (editing) setInputValue(line[type] || "");
		}, [editing, line, type]);

		const label = useMemo(
			() =>
				type === "translatedLyric"
					? t("lyricLineView.translatedLabel", "翻译：")
					: t("lyricLineView.romanLabel", "音译："),
			[type, t],
		);

		return (
			<Flex align="baseline">
				<Text size="2">{label}</Text>
				{editing ? (
					<div
						className={styles.autoSizeInput}
						style={{ maxWidth: "calc(100% - 4rem)", flexShrink: 1 }}
						onPointerDown={(event) => event.stopPropagation()}
					>
						<div
							className={styles.autoSizeInputText}
							style={{ padding: 0, maxWidth: "100%", overflow: "hidden" }}
						>
							{`${inputValue}  `}
						</div>
						<TextField.Root
							className={styles.autoSizeInputField}
							autoFocus
							size="1"
							value={inputValue}
							onChange={(event) => setInputValue(event.currentTarget.value)}
							onBlur={onEnter}
							onKeyDown={(event) => {
								if (event.key === "Enter") onEnter(event);
							}}
						/>
					</div>
				) : (
					<Button
						size="2"
						color="gray"
						variant="ghost"
						onPointerDown={(event) => event.stopPropagation()}
						onClick={(event) => {
							event.stopPropagation();
							setEditing(true);
						}}
						style={{
							textAlign: "left",
							maxWidth: "calc(100% - 4rem)",
							wordBreak: "break-all",
						}}
					>
						{line[type] || (
							<Text color="gray">{t("lyricLineView.empty", "无")}</Text>
						)}
					</Button>
				)}
			</Flex>
		);
	},
);
