/**
 * @description "空间音频偏差" 模态框
 * Sets the lyricOffset value for the spatial audio tag in iTunesMetadata:
 *   <audio lyricOffset="<value>" role="spatial"/>
 */
import {
	Button,
	Callout,
	Dialog,
	Flex,
	IconButton,
	Text,
	TextField,
} from "@radix-ui/themes";
import { useAtom } from "jotai";
import { useSetImmerAtom } from "jotai-immer";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { InfoRegular } from "@fluentui/react-icons";
import { spatialAudioBiasDialogAtom } from "$/states/dialogs.ts";
import { lyricLinesAtom } from "$/states/main.ts";

export const SpatialAudioBiasDialog = () => {
	const { t } = useTranslation();
	const [open, setOpen] = useAtom(spatialAudioBiasDialogAtom);
	const setLyricLines = useSetImmerAtom(lyricLinesAtom);
	const [lyricLines] = useAtom(lyricLinesAtom);

	const [biasStr, setBiasStr] = useState("0");

	useEffect(() => {
		if (open) {
			const current = lyricLines.spatialAudioBias;
			setBiasStr(current !== undefined ? String(current) : "0");
		}
	}, [open, lyricLines.spatialAudioBias]);

	const adjustBias = (delta: number) => {
		const current = Number(biasStr);
		const val = Number.isNaN(current) ? 0 : current;
		setBiasStr(String(val + delta));
	};

	const handleConfirm = () => {
		const parsed = Number(biasStr);
		setLyricLines((draft) => {
			if (biasStr.trim() === "" || Number.isNaN(parsed)) {
				delete draft.spatialAudioBias;
			} else {
				draft.spatialAudioBias = parsed;
			}
		});
		setOpen(false);
	};

	const handleClear = () => {
		setLyricLines((draft) => {
			delete draft.spatialAudioBias;
		});
		setOpen(false);
	};

	return (
		<Dialog.Root open={open} onOpenChange={setOpen}>
			<Dialog.Content maxWidth="420px">
				<Dialog.Title>
					{t("spatialAudioBiasDialog.title", "空间音频偏差")}
				</Dialog.Title>

				<Flex direction="column" gap="4">
					<Callout.Root size="1">
						<Callout.Icon>
							<InfoRegular />
						</Callout.Icon>
						<Callout.Text>
							{t(
								"spatialAudioBiasDialog.description",
								"设置空间音频的歌词时间偏差值（毫秒）。该值将写入 TTML 文件的 iTunesMetadata 块中，对应 <audio lyricOffset=\"...\" role=\"spatial\"/> 标签。",
							)}
						</Callout.Text>
					</Callout.Root>

					<Flex direction="column" gap="1">
						<Text size="2" weight="bold">
							{t("spatialAudioBiasDialog.lyricOffset", "lyricOffset (ms)")}
						</Text>
						<Flex gap="2" align="center">
							<IconButton
								variant="soft"
								onClick={() => adjustBias(-50)}
								title="- 50ms"
							>
								−
							</IconButton>
							<IconButton
								variant="soft"
								onClick={() => adjustBias(-10)}
								title="- 10ms"
							>
								-10
							</IconButton>
							<TextField.Root
								type="number"
								value={biasStr}
								onChange={(e) => setBiasStr(e.target.value)}
								placeholder="0"
								style={{ flexGrow: 1 }}
							/>
							<IconButton
								variant="soft"
								onClick={() => adjustBias(10)}
								title="+ 10ms"
							>
								+10
							</IconButton>
							<IconButton
								variant="soft"
								onClick={() => adjustBias(50)}
								title="+ 50ms"
							>
								+
							</IconButton>
						</Flex>
					</Flex>

					<Text size="1" color="gray">
						{t(
							"spatialAudioBiasDialog.hint",
							"留空或清除将从 TTML 文件中移除该标签。",
						)}
					</Text>
				</Flex>

				<Flex gap="3" mt="5" justify="between">
					<Button variant="soft" color="red" onClick={handleClear}>
						{t("spatialAudioBiasDialog.clear", "清除偏差")}
					</Button>
					<Flex gap="3">
						<Dialog.Close>
							<Button variant="soft" color="gray">
								{t("common.cancel", "取消")}
							</Button>
						</Dialog.Close>
						<Button onClick={handleConfirm}>
							{t("common.apply", "应用")}
						</Button>
					</Flex>
				</Flex>
			</Dialog.Content>
		</Dialog.Root>
	);
};
