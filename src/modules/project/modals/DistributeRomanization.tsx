import { InfoRegular } from "@fluentui/react-icons";
import {
	Button,
	Card,
	Dialog,
	Flex,
	Text,
} from "@radix-ui/themes";
import { useAtom } from "jotai";
import { useSetImmerAtom } from "jotai-immer";
import { useTranslation } from "react-i18next";
import {
	DialogScopeSelector,
	useDialogScope,
} from "$/hooks/useDialogScope.tsx";
import { applyLineRomanization } from "$/modules/segmentation/utils/Transliteration/distributor";
import { distributeRomanizationDialogAtom } from "$/states/dialogs";
import { lyricLinesAtom } from "$/states/main";
import { projectLogger } from "../logger";

export const DistributeRomanizationDialog = () => {
	const { t } = useTranslation();
	const [open, setOpen] = useAtom(distributeRomanizationDialogAtom);
	const setLyricLines = useSetImmerAtom(lyricLinesAtom);
	const scopeState = useDialogScope(open);

	const handleConfirm = () => {
		const targetLineIndices = scopeState.getTargetLineIndices();

		setLyricLines((draft) => {
			draft.lyricLines.forEach((line, index) => {
				if (!targetLineIndices.has(index)) return;
				try {
					applyLineRomanization(line);
				} catch (e) {
					projectLogger.error(
						`Failed to distribute romanization for line ${index + 1}`,
						e,
					);
				}
			});
		});

		setOpen(false);
	};

	return (
		<Dialog.Root open={open} onOpenChange={setOpen}>
			<Dialog.Content maxWidth="450px">
				<Dialog.Title>
					{t("distributeRomanDialog.title", "生成或分配逐字音译")}
				</Dialog.Title>

				<Flex direction="column" gap="4">
					<Card>
						<Flex gap="2" align="start">
							<InfoRegular />
							<Text size="2" color="gray">
								{t(
									"distributeRomanDialog.warning",
									"韩文可直接生成罗马音。其他歌词会使用已有的逐行音译，分配算法主要适用于日语。",
								)}
							</Text>
						</Flex>
					</Card>

					<DialogScopeSelector {...scopeState} />
				</Flex>

				<Flex gap="3" mt="5" justify="end">
					<Dialog.Close>
						<Button variant="soft" color="gray">
							{t("common.cancel", "取消")}
						</Button>
					</Dialog.Close>
					<Button onClick={handleConfirm}>{t("common.apply", "应用")}</Button>
				</Flex>
			</Dialog.Content>
		</Dialog.Root>
	);
};
