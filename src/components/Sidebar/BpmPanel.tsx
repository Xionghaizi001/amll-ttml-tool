import {
	ArrowLeft16Regular,
	ArrowResetRegular,
	Dismiss16Regular,
	ErrorCircle16Regular,
	Info16Regular,
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
	Slider,
	Text,
	TextField,
	Tooltip,
} from "@radix-ui/themes";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { type FC, useCallback, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { KeyBinding } from "$/components/KeyBinding";
import { useBpmControl, useBpmTapEngine, useMetronome } from "$/modules/audio/hooks";
import {
	audioEngineStateAtom,
	autoAnchorTickAtom,
	bpmScaleAtom,
	bpmStateAtom,
	bpmTapSettingsAtom,
	hasSeenTapWindowTipAtom,
	metronomeAccentEnabledAtom,
	metronomeEnabledAtom,
	metronomeVolumeAtom,
} from "$/modules/audio/states";
import { isTapWarmupComplete } from "$/modules/audio/utils/bpm-algorithm";
import { showBeatLinesAtom } from "$/modules/spectrogram/states";
import { keySyncNextAtom } from "$/states/keybindings";
import { globalStore } from "$/states/store";
import { useKeyBindingAtom } from "$/utils/keybindings";

function formatCalculationTime(timeMs: number): string {
	if (timeMs < 1000) {
		return `${Math.round(timeMs)} ms`;
	}
	return `${(timeMs / 1000).toFixed(2)} s`;
}

export const BpmPanel: FC = () => {
	const { t } = useTranslation();
	const followRateCheckboxId = useId();
	const showBeatLinesCheckboxId = useId();
	const {
		bpmState,
		originalBpm,
		currentBpm,
		followPlaybackRate,
		setFollowPlaybackRate,
		isAdjusted,
		halveBpm,
		doubleBpm,
		resetBpm: rawResetBpm,
	} = useBpmControl();
	const setScale = useSetAtom(bpmScaleAtom);

	const {
		setTapMode,
		isKeyTapMode,
		isSpectrogramTapMode,
		tapTimes,
		triggerTap,
		resetTapTimes,
		isHighlighted,
	} = useBpmTapEngine();

	const setBpmState = useSetAtom(bpmStateAtom);
	const engineState = useAtomValue(audioEngineStateAtom);
	const tapSettings = useAtomValue(bpmTapSettingsAtom);
	const [showBeatLines, setShowBeatLines] = useAtom(showBeatLinesAtom);
	const [metronomeEnabled, setMetronomeEnabled] = useAtom(metronomeEnabledAtom);
	const [metronomeVolume, setMetronomeVolume] = useAtom(metronomeVolumeAtom);
	const [metronomeAccent, setMetronomeAccent] = useAtom(
		metronomeAccentEnabledAtom,
	);
	const metronomeCheckboxId = useId();
	const metronomeVolumeSliderId = useId();
	const metronomeAccentCheckboxId = useId();
	const autoAnchorTick = useAtomValue(autoAnchorTickAtom);

	// 参考节拍器：面板挂载即生效，开关由 metronomeEnabledAtom 控制
	useMetronome();

	// 锚点偏移控件：直接改写 result.anchorTick（单位秒，控件以毫秒呈现）
	const anchorMs =
		bpmState.status === "completed"
			? Math.round((bpmState.result.anchorTick ?? 0) * 1000)
			: 0;

	const updateAnchorMs = useCallback((ms: number) => {
		const state = globalStore.get(bpmStateAtom);
		if (state.status !== "completed") return;
		const next = Math.max(0, ms) / 1000;
		globalStore.set(bpmStateAtom, {
			...state,
			result: { ...state.result, anchorTick: next },
		});
	}, []);

	// 手动输入 BPM：写回原曲速度（与打拍/分析语义一致），
	// 同时重置缩放并把 calculationTime 置 0 以触发「重置」按钮
	const updateBpm = useCallback(
		(value: number) => {
			const state = globalStore.get(bpmStateAtom);
			if (state.status !== "completed" || !Number.isFinite(value)) return;
			const clamped =
				Math.round(
					Math.min(tapSettings.maxBpm, Math.max(tapSettings.minBpm, value)) * 10,
				) / 10;
			setScale(1);
			globalStore.set(bpmStateAtom, {
				...state,
				calculationTime: 0,
				result: { ...state.result, bpm: clamped, baseBpm: clamped },
			});
		},
		[tapSettings, setScale],
	);
	const [hasSeenTapWindowTip, setHasSeenTapWindowTip] = useAtom(
		hasSeenTapWindowTipAtom,
	);

	const audioLoaded =
		engineState === "ready" ||
		engineState === "playing" ||
		engineState === "paused";

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
		resetTapTimes();
		if (initialBpmRef.current) {
			setBpmState(initialBpmRef.current);
		}
	}, [rawResetBpm, resetTapTimes, setBpmState]);

	useKeyBindingAtom(
		keySyncNextAtom,
		(evt) => {
			if (!isKeyTapMode) return;
			triggerTap(undefined, evt.downTimeOffset);
		},
		[isKeyTapMode, triggerTap],
	);

	let bpmValueText = "--";
	let durationText = "--";

	// 对齐 osu TapButton：预热期（前 ignoreCount*2 拍）不显示数值，仅显示点占位
	const isTapWarmup =
		(isKeyTapMode || isSpectrogramTapMode) &&
		tapTimes.length > 0 &&
		!isTapWarmupComplete(tapTimes.length, tapSettings);

	if (isTapWarmup) {
		bpmValueText = ".".repeat(
			Math.min(tapTimes.length, tapSettings.ignoreCount * 2),
		);
	} else if (bpmState.status === "completed") {
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

				{isCompleted && originalBpm !== null && (
					<Tooltip
						content={t(
							"sidebar.bpm.manualBpmTip",
							"手动输入会覆盖分析/打拍结果，可通过右上角重置按钮恢复",
						)}
					>
						<Flex direction="column" gap="2" width="100%">
							<Text size="1" color="gray" style={{ textAlign: "center" }}>
								{t("sidebar.bpm.manualBpm", "原曲 BPM")}
							</Text>
							<Flex align="center" gap="1" justify="center">
								<Button
									size="1"
									variant="soft"
									color="gray"
									onClick={() => updateBpm(originalBpm - 1)}
									style={{ fontFamily: "var(--default-font-family-mono)" }}
								>
									-1
								</Button>
								<Button
									size="1"
									variant="soft"
									color="gray"
									onClick={() => updateBpm(originalBpm - 0.1)}
									style={{ fontFamily: "var(--default-font-family-mono)" }}
								>
									-.1
								</Button>
								<TextField.Root
									size="1"
									type="number"
									min={tapSettings.minBpm}
									max={tapSettings.maxBpm}
									step={0.1}
									value={originalBpm}
									onChange={(e) => {
										const v = Number.parseFloat(e.target.value);
										if (!Number.isNaN(v)) updateBpm(v);
									}}
									style={{
										width: "76px",
										fontFamily: "var(--default-font-family-mono)",
									}}
								/>
								<Button
									size="1"
									variant="soft"
									color="gray"
									onClick={() => updateBpm(originalBpm + 0.1)}
									style={{ fontFamily: "var(--default-font-family-mono)" }}
								>
									+.1
								</Button>
								<Button
									size="1"
									variant="soft"
									color="gray"
									onClick={() => updateBpm(originalBpm + 1)}
									style={{ fontFamily: "var(--default-font-family-mono)" }}
								>
									+1
								</Button>
							</Flex>
						</Flex>
					</Tooltip>
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

				<Flex align="center" gap="2">
					<Checkbox
						id={metronomeCheckboxId}
						checked={metronomeEnabled}
						disabled={!isCompleted}
						onCheckedChange={(checked) => setMetronomeEnabled(Boolean(checked))}
					/>
					<Text size="2" asChild>
						<label
							htmlFor={metronomeCheckboxId}
							style={{ userSelect: "none", cursor: "pointer" }}
						>
							{t("sidebar.bpm.metronome", "参考节拍器")}
						</label>
					</Text>
				</Flex>

				{metronomeEnabled && (
					<Flex direction="column" gap="2" pl="5">
						<Flex align="center" gap="2">
							<Text size="1" color="gray" wrap="nowrap">
								{t("sidebar.bpm.metronomeVolume", "音量")}
							</Text>
							<Slider
								id={metronomeVolumeSliderId}
								min={0}
								max={1}
								step={0.01}
								value={[metronomeVolume]}
								onValueChange={(v) => setMetronomeVolume(v[0])}
								style={{ flex: 1 }}
							/>
							<Text size="1" color="gray" wrap="nowrap">
								{Math.round(metronomeVolume * 100)}%
							</Text>
						</Flex>
						<Flex align="center" gap="2">
							<Checkbox
								id={metronomeAccentCheckboxId}
								checked={metronomeAccent}
								onCheckedChange={(checked) =>
									setMetronomeAccent(Boolean(checked))
								}
							/>
							<Text size="2" asChild>
								<label
									htmlFor={metronomeAccentCheckboxId}
									style={{ userSelect: "none", cursor: "pointer" }}
								>
									{t("sidebar.bpm.metronomeAccent", "每 4 拍重音")}
								</label>
							</Text>
						</Flex>
					</Flex>
				)}

				{isCompleted && (
					<Flex direction="column" gap="2">
						<Text size="1" color="gray">
							{t("sidebar.bpm.anchorOffset", "锚点偏移 (ms)")}
						</Text>
						<Flex align="center" gap="1" justify="center">
							<Button
								size="1"
								variant="soft"
								color="gray"
								onClick={() => updateAnchorMs(anchorMs - 10)}
								style={{ fontFamily: "var(--default-font-family-mono)" }}
							>
								-10
							</Button>
							<Button
								size="1"
								variant="soft"
								color="gray"
								onClick={() => updateAnchorMs(anchorMs - 1)}
								style={{ fontFamily: "var(--default-font-family-mono)" }}
							>
								-1
							</Button>
							<TextField.Root
								size="1"
								type="number"
								min={0}
								step={1}
								value={anchorMs}
								onChange={(e) => {
									const v = Number.parseFloat(e.target.value);
									if (!Number.isNaN(v)) updateAnchorMs(v);
								}}
								style={{ width: "84px", fontFamily: "var(--default-font-family-mono)" }}
							/>
							<Button
								size="1"
								variant="soft"
								color="gray"
								onClick={() => updateAnchorMs(anchorMs + 1)}
								style={{ fontFamily: "var(--default-font-family-mono)" }}
							>
								+1
							</Button>
							<Button
								size="1"
								variant="soft"
								color="gray"
								onClick={() => updateAnchorMs(anchorMs + 10)}
								style={{ fontFamily: "var(--default-font-family-mono)" }}
							>
								+10
							</Button>
						</Flex>
						{autoAnchorTick !== null && (
							<Button
								size="1"
								variant="ghost"
								color="gray"
								onClick={() => updateAnchorMs(autoAnchorTick * 1000)}
								style={{ alignSelf: "center", cursor: "pointer" }}
							>
								{t("sidebar.bpm.anchorResetAuto", "恢复自动值")}
							</Button>
						)}
					</Flex>
				)}

				{!hasSeenTapWindowTip && (isKeyTapMode || isSpectrogramTapMode) && (
					<Callout.Root
						color="blue"
						size="1"
						variant="soft"
						style={{
							display: "flex",
							alignItems: "center",
							paddingRight: "10px",
						}}
					>
						<Callout.Icon style={{ display: "flex", alignItems: "center" }}>
							<Info16Regular style={{ display: "block" }} />
						</Callout.Icon>

						<Callout.Text size="1" style={{ flex: 1 }}>
							{t(
								"sidebar.bpm.slidingWindowTip",
								"只会使用最近 {{windowSize}} 次校准数据计算 BPM",
								{ windowSize: tapSettings.windowSize },
							)}
						</Callout.Text>

						<IconButton
							size="1"
							variant="ghost"
							color="gray"
							onClick={() => setHasSeenTapWindowTip(true)}
							style={{
								margin: 0,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
							}}
						>
							<Dismiss16Regular />
						</IconButton>
					</Callout.Root>
				)}

				{!isKeyTapMode && !isSpectrogramTapMode && (
					<Flex direction="column" gap="2" align="start">
						<Button
							size="2"
							variant="soft"
							disabled={!audioLoaded}
							onClick={() => setTapMode("key")}
							style={{ alignSelf: "flex-start", cursor: "pointer" }}
						>
							{t("sidebar.bpm.manualCalibration", "手动打拍校准")}
						</Button>
						<Button
							size="2"
							variant="soft"
							disabled={!audioLoaded}
							onClick={() => setTapMode("spectrogram")}
							style={{ alignSelf: "flex-start", cursor: "pointer" }}
						>
							{t("sidebar.bpm.spectrogramCalibration", "使用频谱图校准")}
						</Button>
					</Flex>
				)}

				{isKeyTapMode && (
					<Card size="2">
						<Flex direction="column" gap="3" style={{ position: "relative" }}>
							<Flex align="center" justify="start">
								<IconButton
									size="1"
									variant="ghost"
									color="gray"
									onClick={() => {
										setTapMode("off");
										resetTapTimes();
									}}
									style={{
										position: "absolute",
										left: 0,
										top: 0,
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
										onClick={() => triggerTap()}
										style={{
											textAlign: "center",
											color: isHighlighted ? "var(--accent-11)" : undefined,
											cursor: "pointer",
											userSelect: "none",
										}}
									>
										{t("sidebar.bpm.tapInstructionPrefix", "根据节拍按下 ")}
										<KeyBinding kbdAtom={keySyncNextAtom} />
										{t("sidebar.bpm.tapInstructionSuffix", " 或点击此处")}
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
					</Card>
				)}

				{isSpectrogramTapMode && (
					<Card size="2">
						<Flex direction="column" gap="3" style={{ position: "relative" }}>
							<Flex align="center" justify="start">
								<IconButton
									size="1"
									variant="ghost"
									color="gray"
									onClick={() => {
										setTapMode("off");
										resetTapTimes();
									}}
									style={{
										position: "absolute",
										left: 0,
										top: 0,
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
										style={{
											textAlign: "center",
											color: isHighlighted ? "var(--accent-11)" : undefined,
											userSelect: "none",
										}}
									>
										{t(
											"sidebar.bpm.clickOnSpectrogramToCalibrate",
											"在频谱图上点击以校准",
										)}
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
					</Card>
				)}
			</Flex>
		</Box>
	);
};

export default BpmPanel;
