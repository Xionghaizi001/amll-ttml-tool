import { Button, Dialog, Flex, Text } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import type { AudioSourceOption, AudioSourceDialogState } from "$/modules/review/services/audio-switch";

type AudioSourceSelectDialogProps = AudioSourceDialogState & {
	onSelect: (source: AudioSourceOption) => void;
	onClose: () => void;
};

export const AudioSourceSelectDialog = ({
	open,
	options,
	currentSource,
	audioSourceInfos,
	onSelect,
	onClose,
}: AudioSourceSelectDialogProps) => {
	const { t } = useTranslation();

	const lyricsSiteInfo = audioSourceInfos?.find(info => info.type === "lyrics-site");
	const neteaseInfo = audioSourceInfos?.find(info => info.type === "netease");

	return (
		<Dialog.Root open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
			<Dialog.Content maxWidth="420px">
				<Dialog.Title>
					{t("audio.selectSource.title", "选择音频源")}
				</Dialog.Title>
				<Dialog.Description size="2" color="gray">
					{t(
						"audio.selectSource.desc",
						"检测到多个可用音频源，请选择要加载的音频。",
					)}
				</Dialog.Description>
				<Flex direction="column" gap="2" mt="3">
					{options.includes("lyrics-site") && (
						<Button
							variant={currentSource === "user-upload" ? "solid" : "soft"}
							color={currentSource === "user-upload" ? "green" : undefined}
							onClick={() => onSelect("lyrics-site")}
						>
							<Flex direction="row" align="center" justify="between" style={{ width: "100%" }}>
								<Flex direction="column" align="start" gap="1">
									<Text>
										{t("audio.source.userUpload", "用户上传音频")}
									</Text>
									{lyricsSiteInfo?.description && (
										<Text size="1" color="gray">
											{lyricsSiteInfo.description}
										</Text>
									)}
								</Flex>
								{currentSource === "user-upload" && (
									<Text size="1" color="green" weight="medium">
										{t("audio.source.current", "当前")}
									</Text>
								)}
							</Flex>
						</Button>
					)}
					{options.includes("netease") && (
						<Button
							variant={currentSource === "netease" ? "solid" : "soft"}
							color={currentSource === "netease" ? "green" : undefined}
							onClick={() => onSelect("netease")}
						>
							<Flex direction="row" align="center" justify="between" style={{ width: "100%" }}>
								<Flex direction="column" align="start" gap="1">
									<Text>
										{t("audio.source.netease", "网易云音乐")}
									</Text>
									{neteaseInfo?.description && (
										<Text size="1" color="gray">
											{neteaseInfo.description}
										</Text>
									)}
								</Flex>
								{currentSource === "netease" && (
									<Text size="1" color="green" weight="medium">
										{t("audio.source.current", "当前")}
									</Text>
								)}
							</Flex>
						</Button>
					)}
				</Flex>
				<Flex justify="end" mt="4">
					<Dialog.Close>
						<Button variant="soft" color="gray">
							{t("common.cancel", "取消")}
						</Button>
					</Dialog.Close>
				</Flex>
			</Dialog.Content>
		</Dialog.Root>
	);
};
