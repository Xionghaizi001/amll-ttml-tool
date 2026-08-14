import { Dismiss16Regular, Info16Regular } from "@fluentui/react-icons";
import {
	Button,
	Callout,
	Checkbox,
	Dialog,
	Flex,
	IconButton,
	RadioGroup,
	Text,
	TextField,
} from "@radix-ui/themes";
import { useAtom } from "jotai";
import { useSetImmerAtom } from "jotai-immer";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
	DialogScopeSelector,
	useDialogScope,
} from "$/hooks/useDialogScope.tsx";
import { smoothSyllables } from "$/modules/segmentation/utils/syllable-smoothing.ts";
import {
	hasDismissedSyllableSmoothingTipAtom,
	syllableSmoothingDialogAtom,
} from "$/states/dialogs.ts";
import { lyricLinesAtom } from "$/states/main.ts";

type ThresholdPreset = "5" | "15" | "30" | "custom";

export const SyllableSmoothingDialog = () => {
	const { t } = useTranslation();
	const [open, setOpen] = useAtom(syllableSmoothingDialogAtom);
	const [hasDismissedTip, setHasDismissedTip] = useAtom(
		hasDismissedSyllableSmoothingTipAtom,
	);
	const setLyricLines = useSetImmerAtom(lyricLinesAtom);
	const scopeState = useDialogScope(open);

	const [thresholdPreset, setThresholdPreset] = useState<ThresholdPreset>("15");
	const [customThreshold, setCustomThreshold] = useState("15");
	const [mergeSyllables, setMergeSyllables] = useState(false);

	const parsedCustom = parseFloat(customThreshold);
	const isCustomInvalid =
		thresholdPreset === "custom" &&
		(Number.isNaN(parsedCustom) || parsedCustom < 0 || parsedCustom > 100);

	const handleConfirm = () => {
		if (isCustomInvalid) return;

		const finalThreshold =
			thresholdPreset === "custom" ? parsedCustom : Number(thresholdPreset);

		const targetLineIndices = scopeState.getTargetLineIndices();

		setLyricLines((draft) => {
			draft.lyricLines.forEach((line, index) => {
				if (targetLineIndices.has(index)) {
					draft.lyricLines[index] = smoothSyllables(line, {
						threshold: finalThreshold,
						mergeSyllables,
					});
				}
			});
		});

		setOpen(false);
	};

	return (
		<Dialog.Root open={open} onOpenChange={setOpen}>
			<Dialog.Content maxWidth="450px">
				<Dialog.Title>
					{t("syllableSmoothingDialog.title", "平滑时间轴")}
				</Dialog.Title>
				<Dialog.Description
					size="2"
					mb="2"
					color="gray"
					style={{ whiteSpace: "pre-line", lineHeight: "2" }}
				>
					{t(
						"syllableSmoothingDialog.description",
						"对 CJK 音节的时间轴进行平滑处理\n不会平滑其他语言的音节",
					)}
				</Dialog.Description>
				<Flex direction="column" gap="4">
					{!hasDismissedTip && (
						<Callout.Root
							color="amber"
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
									"syllableSmoothingDialog.thresholdWarning",
									"过高的阈值可能会导致过度拉伸音节，影响时间戳的准确性",
								)}
							</Callout.Text>

							<IconButton
								size="1"
								variant="ghost"
								color="gray"
								onClick={() => setHasDismissedTip(true)}
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

					<Flex direction="column" gap="2">
						<Text size="2" weight="bold">
							{t("syllableSmoothingDialog.thresholdLabel", "平滑阈值")}
						</Text>
						<RadioGroup.Root
							value={thresholdPreset}
							onValueChange={(v) => setThresholdPreset(v as ThresholdPreset)}
						>
							<Flex direction="column" gap="2">
								<RadioGroup.Item value="5">
									{t("syllableSmoothingDialog.thresholdLow", "低 (5%)")}
								</RadioGroup.Item>
								<RadioGroup.Item value="15">
									{t("syllableSmoothingDialog.thresholdMedium", "中 (15%)")}
								</RadioGroup.Item>
								<RadioGroup.Item value="30">
									{t("syllableSmoothingDialog.thresholdHigh", "高 (30%)")}
								</RadioGroup.Item>
								<RadioGroup.Item value="custom">
									{t("syllableSmoothingDialog.thresholdCustom", "自定义")}
								</RadioGroup.Item>
							</Flex>
						</RadioGroup.Root>
						{thresholdPreset === "custom" && (
							<Flex align="center" gap="2" ml="4">
								<Text size="2">
									{t("syllableSmoothingDialog.customThresholdInput", "阈值")}
								</Text>
								<TextField.Root
									style={{ width: "80px" }}
									size="1"
									type="number"
									min="0"
									max="100"
									value={customThreshold}
									onChange={(e) => setCustomThreshold(e.target.value)}
									color={isCustomInvalid ? "red" : undefined}
								>
									<TextField.Slot />
									<TextField.Slot>%</TextField.Slot>
								</TextField.Root>
							</Flex>
						)}
					</Flex>

					<Flex direction="column" gap="1">
						<Text as="label" size="2">
							<Flex gap="2" align="center">
								<Checkbox
									checked={mergeSyllables}
									onCheckedChange={(c) => setMergeSyllables(Boolean(c))}
								/>
								<Text weight="bold">
									{t("syllableSmoothingDialog.mergeSyllables", "合并音节")}
								</Text>
							</Flex>
						</Text>
						<Text size="1" color="gray" ml="5">
							{t(
								"syllableSmoothingDialog.mergeSyllablesHint",
								"可以获得类似 Apple Music 的、把 CJK 合并到一起的歌词，但不适合日常使用",
							)}
						</Text>
					</Flex>

					<DialogScopeSelector {...scopeState} />
				</Flex>

				<Flex gap="3" mt="5" justify="end">
					<Dialog.Close>
						<Button variant="soft" color="gray">
							{t("common.cancel", "取消")}
						</Button>
					</Dialog.Close>
					<Button disabled={isCustomInvalid} onClick={handleConfirm}>
						{t("common.apply", "应用")}
					</Button>
				</Flex>
			</Dialog.Content>
		</Dialog.Root>
	);
};
