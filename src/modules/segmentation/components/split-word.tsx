import { Info16Regular } from "@fluentui/react-icons";
import {
	Box,
	Button,
	Callout,
	Checkbox,
	Dialog,
	Flex,
	Text,
} from "@radix-ui/themes";
import { useAtom, useAtomValue } from "jotai";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	createSegmentationConfig,
	splitDocumentWord,
} from "$/application/lyrics";
import {
	segmentationCustomRulesAtom,
	segmentationIgnoreListTextAtom,
	segmentationLangAtom,
	segmentationPunctuationModeAtom,
	segmentationPunctuationWeightAtom,
	segmentationRemoveEmptySegmentsAtom,
	segmentationSplitCJKAtom,
	segmentationSplitEnglishAtom,
	splitWordApplyToAllAtom,
	splitWordIgnoreCaseAtom,
} from "$/modules/segmentation/states";
import type {
	HyphenatorFunc,
	SegmentationConfig,
} from "$/modules/segmentation/types";
import { loadHyphenator } from "$/modules/segmentation/utils/hyphen-loader.ts";
import {
	recalculateWordTime,
	segmentWord,
} from "$/modules/segmentation/utils/segmentation.ts";
import { editorDocumentAdapter } from "$/plugins/adapters/editor-document";
import { splitWordDialogAtom } from "$/states/dialogs.ts";
import { editingWordStateAtom, lyricLinesAtom } from "$/states/main";
import { ManualWordSplitter } from "./ManualWordSplitter";

export const SplitWordDialog = memo(() => {
	const [splitWordDialog, splitWordDialogOpen] = useAtom(splitWordDialogAtom);
	const editingState = useAtomValue(editingWordStateAtom);
	const lyricLines = useAtomValue(lyricLinesAtom);
	const { t } = useTranslation();

	const [splitIndices, setSplitIndices] = useState(new Set<number>());
	const [targetWordText, setTargetWordText] = useState("");

	const [applyToAll, setApplyToAll] = useAtom(splitWordApplyToAllAtom);
	const [ignoreCase, setIgnoreCase] = useAtom(splitWordIgnoreCaseAtom);

	const splitCJK = useAtomValue(segmentationSplitCJKAtom);
	const splitEnglish = useAtomValue(segmentationSplitEnglishAtom);
	const punctuationMode = useAtomValue(segmentationPunctuationModeAtom);
	const punctuationWeight = useAtomValue(segmentationPunctuationWeightAtom);
	const removeEmptySegments = useAtomValue(segmentationRemoveEmptySegmentsAtom);
	const ignoreListText = useAtomValue(segmentationIgnoreListTextAtom);
	const customRules = useAtomValue(segmentationCustomRulesAtom);
	const lang = useAtomValue(segmentationLangAtom);
	const [activeHyphenator, setActiveHyphenator] = useState<
		HyphenatorFunc | undefined
	>(undefined);

	useEffect(() => {
		let isMounted = true;

		const fetchHyphenator = async () => {
			const func = await loadHyphenator(lang);
			if (isMounted && func) {
				setActiveHyphenator(() => func);
			}
		};

		fetchHyphenator();

		return () => {
			isMounted = false;
		};
	}, [lang]);

	const segmentationConfig = useMemo(
		(): SegmentationConfig =>
			createSegmentationConfig({
				splitCJK,
				splitEnglish,
				punctuationMode,
				punctuationWeight,
				removeEmptySegments,
				ignoreListText,
				customRules,
				hyphenator: activeHyphenator,
			}),
		[
			splitCJK,
			splitEnglish,
			punctuationMode,
			punctuationWeight,
			removeEmptySegments,
			ignoreListText,
			customRules,
			activeHyphenator,
		],
	);

	useEffect(() => {
		if (!splitWordDialog) {
			return;
		}

		const line = lyricLines.lyricLines[editingState.lineIndex];
		const word = line?.words[editingState.wordIndex];

		if (word) {
			setTargetWordText(word.word);

			const resultWords = segmentWord(word, segmentationConfig);
			if (resultWords.length > 1) {
				const indices = new Set<number>();
				let currentIndex = 0;
				for (let i = 0; i < resultWords.length - 1; i++) {
					currentIndex += resultWords[i].word.length;
					indices.add(currentIndex);
				}
				setSplitIndices(indices);
			} else {
				setSplitIndices(new Set());
			}
		} else {
			setTargetWordText("");
			setSplitIndices(new Set());
		}
	}, [
		splitWordDialog,
		editingState.lineIndex,
		editingState.wordIndex,
		lyricLines,
		segmentationConfig,
	]);

	const toggleSplitPoint = useCallback((index: number) => {
		setSplitIndices((prev) => {
			const next = new Set(prev);
			if (next.has(index)) {
				next.delete(index);
			} else {
				next.add(index);
			}
			return next;
		});
	}, []);

	const handleSplit = useCallback(() => {
		if (!targetWordText) return;

		splitDocumentWord(
			editorDocumentAdapter,
			{
				lineIndex: editingState.lineIndex,
				wordIndex: editingState.wordIndex,
				targetText: targetWordText,
				splitIndices,
				applyToAll,
				ignoreCase,
				config: segmentationConfig,
			},
			recalculateWordTime,
		);
	}, [
		targetWordText,
		splitIndices,
		applyToAll,
		ignoreCase,
		editingState.lineIndex,
		editingState.wordIndex,
		segmentationConfig,
	]);

	return (
		<Dialog.Root open={splitWordDialog} onOpenChange={splitWordDialogOpen}>
			<Dialog.Content>
				<Dialog.Title>{t("splitWordDialog.title", "拆分单词")}</Dialog.Title>
				<Flex direction="column" gap="2">
					<Callout.Root color="blue">
						<Callout.Icon>
							<Info16Regular />
						</Callout.Icon>
						<Callout.Text>
							{t(
								"splitWordDialog.tip",
								"拆分后新单词将会按自身单词字符平均分配原单词的始末时间，如有空拍则会被清除",
							)}
						</Callout.Text>
					</Callout.Root>

					<Box my="3">
						<ManualWordSplitter
							word={targetWordText}
							splitIndices={splitIndices}
							onSplitIndexToggle={toggleSplitPoint}
						/>
					</Box>

					<Flex direction="column" gap="2">
						<Text as="label" size="2">
							<Flex gap="2" align="center">
								<Checkbox
									checked={applyToAll}
									onCheckedChange={(c) => setApplyToAll(c as boolean)}
								/>
								{t(
									"splitWordDialog.applyToAll",
									"将此拆分规则应用于所有相同的单词",
								)}
							</Flex>
						</Text>

						<Text as="label" size="2">
							<Flex
								gap="2"
								align="center"
								style={{ opacity: applyToAll ? 1 : 0.5 }}
							>
								<Checkbox
									disabled={!applyToAll}
									checked={ignoreCase}
									onCheckedChange={(c) => setIgnoreCase(c as boolean)}
								/>
								{t("splitWordDialog.ignoreCase", "忽略大小写")}
							</Flex>
						</Text>
					</Flex>
				</Flex>

				<Flex justify="end" mt="4">
					<Dialog.Close>
						<Button onClick={handleSplit}>
							{t("splitWordDialog.actionButton", "执行")}
						</Button>
					</Dialog.Close>
				</Flex>
			</Dialog.Content>
		</Dialog.Root>
	);
});
