/** @jsxRuntime classic */
import {
	ArrowClockwise24Regular,
	ArrowSync24Regular,
	Broom24Regular,
	ClockArrowDownload24Regular,
	Spacebar24Regular,
	TextWrap24Regular,
} from "@fluentui/react-icons";
import { Checkbox, Flex } from "@radix-ui/themes";
import { useAtom } from "jotai";
// biome-ignore lint/correctness/noUnusedImports: classic JSX runtime needs React in scope for IDE TypeScript.
import * as React from "react";
import { useTranslation } from "react-i18next";
import {
	amllCleanUnintentionalOverlapsAtom,
	amllConvertExcessiveBackgroundLinesAtom,
	amllNormalizeSpacesAtom,
	amllResetLineTimestampsAtom,
	amllSyncMainAndBackgroundLinesAtom,
	amllTryAdvanceStartTimeAtom,
} from "$/modules/settings/states";
import { SettingsGroup, SettingsRow } from "./SettingsGroup";

export const SettingsAMLLTab = () => {
	const { t } = useTranslation();
	const [normalizeSpaces, setNormalizeSpaces] = useAtom(
		amllNormalizeSpacesAtom,
	);
	const [resetLineTimestamps, setResetLineTimestamps] = useAtom(
		amllResetLineTimestampsAtom,
	);
	const [convertExcessiveBackgroundLines, setConvertExcessiveBackgroundLines] =
		useAtom(amllConvertExcessiveBackgroundLinesAtom);
	const [syncMainAndBackgroundLines, setSyncMainAndBackgroundLines] = useAtom(
		amllSyncMainAndBackgroundLinesAtom,
	);
	const [cleanUnintentionalOverlaps, setCleanUnintentionalOverlaps] = useAtom(
		amllCleanUnintentionalOverlapsAtom,
	);
	const [tryAdvanceStartTime, setTryAdvanceStartTime] = useAtom(
		amllTryAdvanceStartTimeAtom,
	);

	return (
		<Flex direction="column" gap="4">
			<SettingsGroup title={t("settings.amll.subtitle", "歌词优化选项")}>
				<SettingsRow
					icon={<Spacebar24Regular />}
					title={t("settings.amll.normalizeSpaces", "规范化空格")}
					action={
						<Checkbox
							checked={normalizeSpaces}
							onCheckedChange={(value) => setNormalizeSpaces(!!value)}
						/>
					}
				/>
				<SettingsRow
					icon={<ClockArrowDownload24Regular />}
					title={t("settings.amll.resetLineTimestamps", "重置行时间戳")}
					action={
						<Checkbox
							checked={resetLineTimestamps}
							onCheckedChange={(value) => setResetLineTimestamps(!!value)}
						/>
					}
				/>
				<SettingsRow
					icon={<TextWrap24Regular />}
					title={t(
						"settings.amll.convertExcessiveBackgroundLines",
						"合并多行背景人声",
					)}
					action={
						<Checkbox
							checked={convertExcessiveBackgroundLines}
							onCheckedChange={(value) =>
								setConvertExcessiveBackgroundLines(!!value)
							}
						/>
					}
				/>
				<SettingsRow
					icon={<ArrowSync24Regular />}
					title={t(
						"settings.amll.syncMainAndBackgroundLines",
						"同步主/背景人声时间",
					)}
					action={
						<Checkbox
							checked={syncMainAndBackgroundLines}
							onCheckedChange={(value) =>
								setSyncMainAndBackgroundLines(!!value)
							}
						/>
					}
				/>
				<SettingsRow
					icon={<Broom24Regular />}
					title={t("settings.amll.cleanUnintentionalOverlaps", "清理非刻意重叠")}
					action={
						<Checkbox
							checked={cleanUnintentionalOverlaps}
							onCheckedChange={(value) =>
								setCleanUnintentionalOverlaps(!!value)
							}
						/>
					}
				/>
				<SettingsRow
					icon={<ArrowClockwise24Regular />}
					title={t("settings.amll.tryAdvanceStartTime", "尝试提前开始")}
					action={
						<Checkbox
							checked={tryAdvanceStartTime}
							onCheckedChange={(value) => setTryAdvanceStartTime(!!value)}
						/>
					}
				/>
			</SettingsGroup>
		</Flex>
	);
};
