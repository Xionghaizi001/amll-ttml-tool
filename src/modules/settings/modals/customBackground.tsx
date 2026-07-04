import {
	ArrowHookUpLeft24Regular,
	ChevronRight24Regular,
	Image24Regular,
} from "@fluentui/react-icons";
import { Button, Flex, IconButton, Slider, Text } from "@radix-ui/themes";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
	customBackgroundBlurAtom,
	customBackgroundBrightnessAtom,
	customBackgroundImageAtom,
	customBackgroundMaskAtom,
	customBackgroundOpacityAtom,
} from "../states/custom-background";
import { SettingsGroup, SettingsRow } from "./SettingsGroup";
export const SettingsCustomBackgroundSettings = () => {
	const customBackgroundImage = useAtomValue(customBackgroundImageAtom);
	const setCustomBackgroundImage = useSetAtom(customBackgroundImageAtom);
	const [customBackgroundOpacity, setCustomBackgroundOpacity] = useAtom(
		customBackgroundOpacityAtom,
	);
	const [customBackgroundMask, setCustomBackgroundMask] = useAtom(
		customBackgroundMaskAtom,
	);
	const [customBackgroundBlur, setCustomBackgroundBlur] = useAtom(
		customBackgroundBlurAtom,
	);
	const [customBackgroundBrightness, setCustomBackgroundBrightness] = useAtom(
		customBackgroundBrightnessAtom,
	);
	const { t } = useTranslation();
	const backgroundFileInputRef = useRef<HTMLInputElement>(null);

	const onSelectBackgroundFile = useCallback(
		(file: File) => {
			setCustomBackgroundImage(file);
		},
		[setCustomBackgroundImage],
	);

	const resetButtonLabel = t("settings.common.customBackgroundReset", "重置");

	return (
		<Flex direction="column" gap="4">
			<SettingsGroup
				title={t("settings.common.customBackground", "自定义背景")}
			>
				<SettingsRow
					icon={<Image24Regular />}
					title={t("settings.common.customBackgroundImage", "背景图片")}
					description={t(
						"settings.common.customBackgroundDesc",
						"选择一张图片作为背景。",
					)}
					action={
						<Flex gap="2" align="center">
							<input
								ref={backgroundFileInputRef}
								type="file"
								accept="image/*"
								style={{ display: "none" }}
								onChange={(event) => {
									const file = event.target.files?.[0];
									if (!file) return;
									onSelectBackgroundFile(file);
									event.target.value = "";
								}}
							/>
							<Button
								variant="soft"
								onClick={() => backgroundFileInputRef.current?.click()}
							>
								{t("settings.common.customBackgroundPick", "选择图片")}
							</Button>
							<Button
								variant="ghost"
								disabled={!customBackgroundImage}
								onClick={() => setCustomBackgroundImage(null)}
							>
								{t("settings.common.customBackgroundClear", "清除")}
							</Button>
						</Flex>
					}
				/>
			</SettingsGroup>

			<SettingsGroup
				title={t("settings.common.customBackgroundStyle", "背景效果")}
			>
				<SettingsRow
					icon={<Image24Regular />}
					title={t("settings.common.customBackgroundOpacity", "透明度")}
					action={
						<Flex align="center" gap="2">
							<Text wrap="nowrap" color="gray" size="1">
								{Math.round(customBackgroundOpacity * 100)}%
							</Text>
							{customBackgroundOpacity !== 0.4 && (
								<IconButton
									variant="ghost"
									size="1"
									aria-label={resetButtonLabel}
									onClick={() => setCustomBackgroundOpacity(0.4)}
								>
									<ArrowHookUpLeft24Regular />
								</IconButton>
							)}
						</Flex>
					}
				>
					<Slider
						min={0}
						max={1}
						step={0.01}
						value={[customBackgroundOpacity]}
						onValueChange={(v) => setCustomBackgroundOpacity(v[0])}
					/>
					{customBackgroundOpacity >= 0.5 && (
						<Text size="1" color="orange">
							{t(
								"settings.common.customBackgroundOpacityWarning",
								"如果这个数值太高可能让你看不清页面上的内容。",
							)}
						</Text>
					)}
				</SettingsRow>

				<SettingsRow
					icon={<Image24Regular />}
					title={t("settings.common.customBackgroundMask", "遮罩")}
					action={
						<Flex align="center" gap="2">
							<Text wrap="nowrap" color="gray" size="1">
								{Math.round(customBackgroundMask * 100)}%
							</Text>
							{customBackgroundMask !== 0.2 && (
								<IconButton
									variant="ghost"
									size="1"
									aria-label={resetButtonLabel}
									onClick={() => setCustomBackgroundMask(0.2)}
								>
									<ArrowHookUpLeft24Regular />
								</IconButton>
							)}
						</Flex>
					}
				>
					<Slider
						min={0}
						max={1}
						step={0.01}
						value={[customBackgroundMask]}
						onValueChange={(v) => setCustomBackgroundMask(v[0])}
					/>
				</SettingsRow>

				<SettingsRow
					icon={<Image24Regular />}
					title={t("settings.common.customBackgroundBlur", "模糊半径")}
					action={
						<Flex align="center" gap="2">
							<Text wrap="nowrap" color="gray" size="1">
								{customBackgroundBlur.toFixed(0)}px
							</Text>
							{customBackgroundBlur !== 0 && (
								<IconButton
									variant="ghost"
									size="1"
									aria-label={resetButtonLabel}
									onClick={() => setCustomBackgroundBlur(0)}
								>
									<ArrowHookUpLeft24Regular />
								</IconButton>
							)}
						</Flex>
					}
				>
					<Slider
						min={0}
						max={30}
						step={1}
						value={[customBackgroundBlur]}
						onValueChange={(v) => setCustomBackgroundBlur(v[0])}
					/>
				</SettingsRow>

				<SettingsRow
					icon={<Image24Regular />}
					title={t("settings.common.customBackgroundBrightness", "亮度")}
					action={
						<Flex align="center" gap="2">
							<Text wrap="nowrap" color="gray" size="1">
								{Math.round(customBackgroundBrightness * 100)}%
							</Text>
							{customBackgroundBrightness !== 1 && (
								<IconButton
									variant="ghost"
									size="1"
									aria-label={resetButtonLabel}
									onClick={() => setCustomBackgroundBrightness(1)}
								>
									<ArrowHookUpLeft24Regular />
								</IconButton>
							)}
						</Flex>
					}
				>
					<Slider
						min={0.5}
						max={1.5}
						step={0.01}
						value={[customBackgroundBrightness]}
						onValueChange={(v) => setCustomBackgroundBrightness(v[0])}
					/>
				</SettingsRow>
			</SettingsGroup>
		</Flex>
	);
};

export const SettingsCustomBackgroundCard = ({
	onOpen,
}: {
	onOpen: () => void;
}) => {
	const customBackgroundImage = useAtomValue(customBackgroundImageAtom);
	const { t } = useTranslation();

	return (
		<SettingsRow
			icon={<Image24Regular />}
			title={t("settings.common.customBackground", "自定义背景")}
			description={
				customBackgroundImage
					? t("settings.common.customBackgroundEnabled", "已设置背景")
					: t("settings.common.customBackgroundDesc", "选择一张图片作为背景。")
			}
			action={
				<IconButton
					variant="ghost"
					aria-label={t("settings.common.customBackgroundManage", "设置")}
					onClick={onOpen}
				>
					<ChevronRight24Regular />
				</IconButton>
			}
		/>
	);
};
