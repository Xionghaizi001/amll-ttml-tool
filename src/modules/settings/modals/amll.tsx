import { Card, Flex, Heading, Text, Checkbox } from "@radix-ui/themes";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import {
	amllNormalizeSpacesAtom,
	amllResetLineTimestampsAtom,
	amllConvertExcessiveBackgroundLinesAtom,
	amllSyncMainAndBackgroundLinesAtom,
	amllCleanUnintentionalOverlapsAtom,
	amllTryAdvanceStartTimeAtom,
} from "$/modules/settings/states/amll";

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
			<Flex direction="column" gap="1">
				<Heading size="4">{t("settings.amll.title", "AMLL")}</Heading>
				<Text size="2" color="gray">
					{t("settings.amll.subtitle", "歌词优化选项")}
				</Text>
			</Flex>
			<Card>
				<Flex direction="column" gap="3">
					<Flex align="center" justify="between" gap="3">
						<Text>{t("settings.amll.normalizeSpaces", "规范化空格")}</Text>
						<Checkbox
							checked={normalizeSpaces}
							onCheckedChange={(value) => setNormalizeSpaces(!!value)}
						/>
					</Flex>
					<Flex align="center" justify="between" gap="3">
						<Text>{t("settings.amll.resetLineTimestamps", "重置行时间戳")}</Text>
						<Checkbox
							checked={resetLineTimestamps}
							onCheckedChange={(value) => setResetLineTimestamps(!!value)}
						/>
					</Flex>
					<Flex align="center" justify="between" gap="3">
						<Text>
							{t(
								"settings.amll.convertExcessiveBackgroundLines",
								"合并多行背景人声",
							)}
						</Text>
						<Checkbox
							checked={convertExcessiveBackgroundLines}
							onCheckedChange={(value) =>
								setConvertExcessiveBackgroundLines(!!value)
							}
						/>
					</Flex>
					<Flex align="center" justify="between" gap="3">
						<Text>
							{t(
								"settings.amll.syncMainAndBackgroundLines",
								"同步主/背景人声时间",
							)}
						</Text>
						<Checkbox
							checked={syncMainAndBackgroundLines}
							onCheckedChange={(value) =>
								setSyncMainAndBackgroundLines(!!value)
							}
						/>
					</Flex>
					<Flex align="center" justify="between" gap="3">
						<Text>
							{t(
								"settings.amll.cleanUnintentionalOverlaps",
								"清理非刻意重叠",
							)}
						</Text>
						<Checkbox
							checked={cleanUnintentionalOverlaps}
							onCheckedChange={(value) =>
								setCleanUnintentionalOverlaps(!!value)
							}
						/>
					</Flex>
					<Flex align="center" justify="between" gap="3">
						<Text>
							{t("settings.amll.tryAdvanceStartTime", "尝试提前开始")}
						</Text>
						<Checkbox
							checked={tryAdvanceStartTime}
							onCheckedChange={(value) => setTryAdvanceStartTime(!!value)}
						/>
					</Flex>
				</Flex>
			</Card>
		</Flex>
	);
};
