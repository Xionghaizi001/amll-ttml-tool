import {
	Button,
	Checkbox,
	Dialog,
	Flex,
	IconButton,
	ScrollArea,
	Text,
} from "@radix-ui/themes";
import { PlayRegular } from "@fluentui/react-icons";
import { useAtom, useAtomValue } from "jotai";
import { useSetImmerAtom } from "jotai-immer";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { audioEngine } from "$/modules/audio/audio-engine";
import { reduceStutterDialogAtom } from "$/states/dialogs.ts";
import { lyricLinesAtom } from "$/states/main.ts";
import type { LyricWord } from "$/types/ttml";
import { msToTimestamp } from "$/utils/timestamp.ts";

interface StutterPair {
	lineIndex: number;
	wordIndex: number;
	nextWordIndex: number;
	prevWord: LyricWord;
	nextWord: LyricWord;
	gap: number;
}

export const ReduceStutterDialog = () => {
	const { t } = useTranslation();
	const [open, setOpen] = useAtom(reduceStutterDialogAtom);
	const lyricLines = useAtomValue(lyricLinesAtom);
	const setLyricLines = useSetImmerAtom(lyricLinesAtom);
	const [selectedPairs, setSelectedPairs] = useState<Set<string>>(new Set());

	const stutterPairs = useMemo<StutterPair[]>(() => {
		const pairs: StutterPair[] = [];
		lyricLines.lyricLines.forEach((line, lineIndex) => {
			for (let i = 0; i < line.words.length - 1; i++) {
				const currentWord = line.words[i];
				const nextWord = line.words[i + 1];
				const gap = nextWord.startTime - currentWord.endTime;
				if (gap > 0 && gap < 100) {
					pairs.push({
						lineIndex,
						wordIndex: i,
						nextWordIndex: i + 1,
						prevWord: currentWord,
						nextWord,
						gap,
					});
				}
			}
		});
		return pairs;
	}, [lyricLines.lyricLines]);

	// 当对话框打开时，默认全选所有卡顿项
	useEffect(() => {
		if (open.open) {
			const allIds = new Set(stutterPairs.map((_, index) => index.toString()));
			setSelectedPairs(allIds);
		}
	}, [open.open, stutterPairs]);

	const togglePair = (index: string) => {
		setSelectedPairs((prev) => {
			const next = new Set(prev);
			if (next.has(index)) {
				next.delete(index);
			} else {
				next.add(index);
			}
			return next;
		});
	};

	const handleConfirm = () => {
		const selectedIndices = Array.from(selectedPairs).map((id) =>
			parseInt(id, 10),
		);

		setLyricLines((draft) => {
			selectedIndices.forEach((pairIndex) => {
				const pair = stutterPairs[pairIndex];
				if (!pair) return;

				const line = draft.lyricLines[pair.lineIndex];
				if (!line) return;

				const prevWord = line.words[pair.wordIndex];
				const nextWord = line.words[pair.nextWordIndex];
				if (!prevWord || !nextWord) return;

				// 计算中间时间
				const middleTime = Math.round(
					(prevWord.endTime + nextWord.startTime) / 2,
				);

				// 设置两个音节的边界为中间时间
				prevWord.endTime = middleTime;
				nextWord.startTime = middleTime;
			});
		});

		setOpen({ open: false });
	};

	const handleClose = () => {
		setOpen({ open: false });
	};

	const handlePlay = (pair: StutterPair) => {
		// 播放前一个音节的开始-100ms 到后一个音节的结束+100ms
		const startTime = Math.max(0, pair.prevWord.startTime - 100) / 1000;
		const endTime = (pair.nextWord.endTime + 100) / 1000;
		audioEngine.auditionRange(startTime, endTime);
	};

	return (
		<Dialog.Root open={open.open} onOpenChange={(v) => setOpen({ open: v })}>
			<Dialog.Content maxWidth="600px" maxHeight="80vh">
				<Dialog.Title>
					{t("reduceStutterDialog.title", "消减卡顿")}
				</Dialog.Title>
				<Dialog.Description>
					{t(
						"reduceStutterDialog.description",
						"检测到以下音节间隔小于 100ms，选中项将被调整为中间时间点",
					)}
				</Dialog.Description>

				{stutterPairs.length === 0 ? (
					<Flex justify="center" py="4">
						<Text color="gray">
							{t("reduceStutterDialog.noStutter", "未检测到卡顿")}
						</Text>
					</Flex>
				) : (
					<ScrollArea style={{ maxHeight: "400px", marginTop: "16px" }}>
						<Flex direction="column" gap="2">
							{stutterPairs.map((pair, index) => (
								<Flex
									key={`${pair.lineIndex}-${pair.wordIndex}`}
									align="center"
									gap="2"
									p="2"
									style={{
										borderRadius: "4px",
										backgroundColor: "var(--gray-3)",
									}}
								>
									<Checkbox
										checked={selectedPairs.has(index.toString())}
										onCheckedChange={() => togglePair(index.toString())}
									/>
									<IconButton
										size="1"
										variant="soft"
										onClick={() => handlePlay(pair)}
										title={t("reduceStutterDialog.play", "播放")}
									>
										<PlayRegular />
									</IconButton>
									<Flex direction="column" style={{ flex: 1 }}>
										<Text size="2">
											{pair.prevWord.word} [
											{msToTimestamp(pair.prevWord.startTime)}~
											{msToTimestamp(pair.prevWord.endTime)}] -{" "}
											{pair.nextWord.word} [
											{msToTimestamp(pair.nextWord.startTime)}~
											{msToTimestamp(pair.nextWord.endTime)}] :{" "}
											{pair.gap} ms
										</Text>
									</Flex>
								</Flex>
							))}
						</Flex>
					</ScrollArea>
				)}

				<Flex gap="3" mt="4" justify="end">
					<Button variant="soft" color="gray" onClick={handleClose}>
						{t("common.cancel", "取消")}
					</Button>
					<Button
						onClick={handleConfirm}
						disabled={stutterPairs.length === 0 || selectedPairs.size === 0}
					>
						{t("common.confirm", "确认")}
					</Button>
				</Flex>
			</Dialog.Content>
		</Dialog.Root>
	);
};
