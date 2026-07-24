import {
	ArrowLeft16Regular,
	ArrowResetRegular,
	ErrorCircle16Regular,
	Timer16Regular,
} from "@fluentui/react-icons";
import {
	Box,
	Button,
	Callout,
	Card,
	Checkbox,
	Flex,
	IconButton,
	Text,
	Tooltip,
} from "@radix-ui/themes";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { type FC, useCallback, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyBinding } from "$/components/KeyBinding";
import { audioEngine } from "$/modules/audio/audio-engine";
import { useBpmControl } from "$/modules/audio/hooks";
import {
	audioEngineStateAtom,
	bpmScaleAtom,
	bpmStateAtom,
} from "$/modules/audio/states";
import { SyncJudgeMode, syncJudgeModeAtom } from "$/modules/settings/states";
import { showBeatLinesAtom } from "$/modules/spectrogram/states";
import { keySyncNextAtom } from "$/states/keybindings";
import { useKeyBindingAtom } from "$/utils/keybindings";

function formatCalculationTime(timeMs: number): string {
	if (timeMs < 1000) {
		return `${Math.round(timeMs)} ms`;
	}
	return `${(timeMs / 1000).toFixed(2)} s`;
}

function computeOptimalAnchorTick(tapTimes: number[], bpm: number): number {
	if (tapTimes.length === 0) return 0;
	if (tapTimes.length === 1) return tapTimes[0];

	const period = 60 / bpm;
	if (period <= 0) return tapTimes[0];

	const t0 = tapTimes[0];
	const stableTaps = tapTimes.length >= 4 ? tapTimes.slice(1) : tapTimes;

	const offsets: number[] = stableTaps.map((t) => {
		const diff = (t - t0) % period;
		let normalizedDiff = diff;
		if (normalizedDiff > period / 2) {
			normalizedDiff -= period;
		} else if (normalizedDiff < -period / 2) {
			normalizedDiff += period;
		}
		return normalizedDiff;
	});

	offsets.sort((a, b) => a - b);
	const mid = Math.floor(offsets.length / 2);
	const medianOffset =
		offsets.length % 2 !== 0
			? offsets[mid]
			: (offsets[mid - 1] + offsets[mid]) / 2;

	let optimalAnchor = t0 + medianOffset;
	while (optimalAnchor < 0) {
		optimalAnchor += period;
	}

	return optimalAnchor;
}

export const BpmPanel: FC = () => {
	const { t } = useTranslation();
	const followRateCheckboxId = useId();
	const showBeatLinesCheckboxId = useId();
	const {
		bpmState,
		currentBpm,
		followPlaybackRate,
		setFollowPlaybackRate,
		isAdjusted,
		halveBpm,
		doubleBpm,
		resetBpm: rawResetBpm,
	} = useBpmControl();

	const setBpmState = useSetAtom(bpmStateAtom);
	const setScale = useSetAtom(bpmScaleAtom);
	const syncJudgeMode = useAtomValue(syncJudgeModeAtom);
	const engineState = useAtomValue(audioEngineStateAtom);
	const [showBeatLines, setShowBeatLines] = useAtom(showBeatLinesAtom);

	const audioLoaded =
		engineState === "ready" ||
		engineState === "playing" ||
		engineState === "paused";

	const [isTapMode, setIsTapMode] = useState(false);
	const [tapTimes, setTapTimes] = useState<number[]>([]);
	const [isHighlighted, setIsHighlighted] = useState(false);

	const initialBpmRef = useRef<typeof bpmState | null>(null);
	if (
		bpmState.status === "completed" &&
		initialBpmRef.current === null &&
		bpmState.calculationTime > 0
	) {
		initialBpmRef.current = bpmState;
	}

	const handleResetBpm = useCallback(() => {
		rawResetBpm();
		setTapTimes([]);
		if (initialBpmRef.current) {
			setBpmState(initialBpmRef.current);
		}
	}, [rawResetBpm, setBpmState]);

	const triggerHighlight = useCallback(() => {
		setIsHighlighted(true);
		setTimeout(() => {
			setIsHighlighted(false);
		}, 150);
	}, []);

	const handleTap = useCallback(
		(downTimeOffset = 0) => {
			triggerHighlight();
			let hitTime = audioEngine.ctxCurrentTime + audioEngine.ctxOutputLatency;
			if (hitTime <= 0) {
				hitTime = performance.now() / 1000;
			} else {
				switch (syncJudgeMode) {
					case SyncJudgeMode.FirstKeyDownTime:
						hitTime -= downTimeOffset / 1000;
						break;
					case SyncJudgeMode.LastKeyUpTime:
						break;
					case SyncJudgeMode.MiddleKeyTime:
						hitTime -= downTimeOffset / 2000;
						break;
				}
			}

			setTapTimes((prev) => {
				const now = hitTime;
				let nextTapTimes: number[];
				if (prev.length > 0) {
					const last = prev[prev.length - 1];
					if (now - last > 2.5) {
						nextTapTimes = [now];
					} else {
						nextTapTimes = [...prev, now];
					}
				} else {
					nextTapTimes = [now];
				}

				if (nextTapTimes.length >= 2) {
					const interval =
						(nextTapTimes[nextTapTimes.length - 1] - nextTapTimes[0]) /
						(nextTapTimes.length - 1);
					if (interval > 0) {
						const bpm = Math.round(60 / interval);
						if (bpm >= 20 && bpm <= 400) {
							const optimalAnchor = computeOptimalAnchorTick(
								nextTapTimes,
								bpm,
							);
							setBpmState({
								status: "completed",
								result: {
									bpm,
									anchorTick: optimalAnchor,
									confidence: 1,
									ticks: [],
								},
								calculationTime: 0,
							});
							setScale(1);
						}
					}
				}

				return nextTapTimes;
			});
		},
		[syncJudgeMode, setBpmState, setScale, triggerHighlight],
	);

	useKeyBindingAtom(
		keySyncNextAtom,
		(evt) => {
			if (!isTapMode) return;
			handleTap(evt.downTimeOffset);
		},
		[isTapMode, handleTap],
	);

	let bpmValueText = "--";
	let durationText = "--";

	if (bpmState.status === "completed") {
		bpmValueText = `${currentBpm ?? Math.round(bpmState.result.bpm)}`;
		durationText = formatCalculationTime(bpmState.calculationTime);
	} else if (bpmState.status === "analyzing") {
		bpmValueText = t("sidebar.bpm.analyzing", "正在分析");
	}

	const isAnalyzing = bpmState.status === "analyzing";
	const isCompleted = bpmState.status === "completed";
	const isModified =
		isAdjusted ||
		tapTimes.length > 0 ||
		(isCompleted && bpmState.calculationTime === 0);

	return (
		<Box p="4">
			<Flex direction="column" gap="4">
				<Flex
					direction="column"
					align="center"
					gap="1"
					style={{ position: "relative", width: "100%" }}
				>
					<Text size="1" color="gray" weight="medium">
						BPM
					</Text>

					<Flex
						align="center"
						justify="center"
						gap="5"
						style={{ width: "100%" }}
					>
						<Tooltip content={t("sidebar.bpm.halve", "减半 BPM")}>
							<Button
								size="2"
								variant="soft"
								color="gray"
								disabled={!isCompleted}
								onClick={halveBpm}
								style={{ fontFamily: "var(--default-font-family-mono)" }}
							>
								÷2
							</Button>
						</Tooltip>

						<Text
							size={isAnalyzing ? "6" : "8"}
							weight="bold"
							style={{
								fontFamily: "var(--default-font-family-mono)",
								fontVariantNumeric: "tabular-nums",
							}}
						>
							{bpmValueText}
						</Text>

						<Tooltip content={t("sidebar.bpm.double", "加倍 BPM")}>
							<Button
								size="2"
								variant="soft"
								color="gray"
								disabled={!isCompleted}
								onClick={doubleBpm}
								style={{ fontFamily: "var(--default-font-family-mono)" }}
							>
								×2
							</Button>
						</Tooltip>
					</Flex>

					{isCompleted && isModified && (
						<Tooltip content={t("sidebar.bpm.reset", "重置 BPM")}>
							<IconButton
								size="2"
								variant="ghost"
								color="gray"
								onClick={handleResetBpm}
								style={{
									position: "absolute",
									right: 0,
									top: "100%",
									transform: "translateY(-50%)",
								}}
							>
								<ArrowResetRegular style={{ fontSize: 18 }} />
							</IconButton>
						</Tooltip>
					)}
				</Flex>

				<Flex align="center" justify="center" gap="2">
					<Timer16Regular style={{ color: "var(--gray-10)" }} />
					<Text
						size="2"
						color="gray"
						style={{ fontFamily: "var(--default-font-family-mono)" }}
					>
						{durationText}
					</Text>
				</Flex>

				{bpmState.status === "error" && (
					<Callout.Root color="red" size="1">
						<Callout.Icon>
							<ErrorCircle16Regular />
						</Callout.Icon>
						<Callout.Text>{bpmState.error}</Callout.Text>
					</Callout.Root>
				)}

				<Flex align="center" gap="2" mt="2">
					<Checkbox
						id={followRateCheckboxId}
						checked={followPlaybackRate}
						onCheckedChange={(checked) =>
							setFollowPlaybackRate(Boolean(checked))
						}
					/>
					<Text size="2" asChild>
						<label
							htmlFor={followRateCheckboxId}
							style={{ userSelect: "none", cursor: "pointer" }}
						>
							{t("sidebar.bpm.followPlaybackRate", "跟随音频播放倍速")}
						</label>
					</Text>
				</Flex>

				<Flex align="center" gap="2">
					<Checkbox
						id={showBeatLinesCheckboxId}
						checked={showBeatLines}
						onCheckedChange={(checked) => setShowBeatLines(Boolean(checked))}
					/>
					<Text size="2" asChild>
						<label
							htmlFor={showBeatLinesCheckboxId}
							style={{ userSelect: "none", cursor: "pointer" }}
						>
							{t("sidebar.bpm.showBeatLines", "在频谱图上显示拍子")}
						</label>
					</Text>
				</Flex>

				{!isTapMode && (
					<Flex justify="start">
						<Button
							size="2"
							variant="outline"
							disabled={!audioLoaded}
							onClick={() => setIsTapMode(true)}
							style={{ cursor: audioLoaded ? "pointer" : "not-allowed" }}
						>
							{t("sidebar.bpm.manualCalibration", "手动打拍校准")}
						</Button>
					</Flex>
				)}

				{isTapMode && (
					<Card variant="surface">
						<Box p="1">
							<Flex direction="column" gap="3">
								<Flex
									align="center"
									justify="center"
									style={{
										position: "relative",
										width: "100%",
										minHeight: "24px",
									}}
								>
									<IconButton
										size="1"
										variant="ghost"
										color="gray"
										onClick={() => {
											setIsTapMode(false);
											setTapTimes([]);
										}}
										style={{
											position: "absolute",
											left: 0,
											cursor: "pointer",
										}}
									>
										<ArrowLeft16Regular />
									</IconButton>

									<Flex
										align="center"
										justify="center"
										style={{
											width: "100%",
											paddingLeft: "28px",
											paddingRight: "28px",
										}}
									>
										<Text
											size="2"
											weight={isHighlighted ? "bold" : "medium"}
											onClick={() => handleTap(0)}
											style={{
												textAlign: "center",
												color: isHighlighted ? "var(--accent-11)" : undefined,
												cursor: "pointer",
												userSelect: "none",
											}}
										>
											{t("sidebar.bpm.tapInstructionPrefix", "根据节拍按下 ")}
											<KeyBinding kbdAtom={keySyncNextAtom} />
											{t("sidebar.bpm.tapInstructionSuffix", " 键或点击此处")}
										</Text>
									</Flex>
								</Flex>

								<Flex gap="1" style={{ width: "100%" }} justify="center">
									{Array.from({ length: 10 }).map((_, index) => (
										<Box
											// biome-ignore lint/suspicious/noArrayIndexKey: fixed 10 indicator bars
											key={index}
											style={{
												flex: 1,
												height: "4px",
												borderRadius: "2px",
												backgroundColor:
													index < Math.min(tapTimes.length, 10)
														? "var(--accent-9)"
														: "var(--gray-5)",
											}}
										/>
									))}
								</Flex>
							</Flex>
						</Box>
					</Card>
				)}
			</Flex>
		</Box>
	);
};

export default BpmPanel;
