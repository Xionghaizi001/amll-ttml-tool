import {
	ArrowResetRegular,
	ErrorCircle16Regular,
	Timer16Regular,
} from "@fluentui/react-icons";
import {
	Box,
	Button,
	Callout,
	Checkbox,
	Flex,
	IconButton,
	Text,
	Tooltip,
} from "@radix-ui/themes";
import { type FC, useId } from "react";
import { useTranslation } from "react-i18next";
import { useBpmControl } from "$/modules/audio/hooks";

function formatCalculationTime(timeMs: number): string {
	if (timeMs < 1000) {
		return `${Math.round(timeMs)} ms`;
	}
	return `${(timeMs / 1000).toFixed(2)} s`;
}

export const BpmPanel: FC = () => {
	const { t } = useTranslation();
	const followRateCheckboxId = useId();
	const {
		bpmState,
		currentBpm,
		followPlaybackRate,
		setFollowPlaybackRate,
		isAdjusted,
		halveBpm,
		doubleBpm,
		resetBpm,
	} = useBpmControl();

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

					{isCompleted && isAdjusted && (
						<Tooltip content={t("sidebar.bpm.reset", "重置 BPM")}>
							<IconButton
								size="2"
								variant="ghost"
								color="gray"
								onClick={resetBpm}
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

				<Flex align="center" gap="2" mt="4">
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
			</Flex>
		</Box>
	);
};

export default BpmPanel;
