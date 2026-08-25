import { InfoRegular } from "@fluentui/react-icons";
import { Button, Callout, Dialog, Flex } from "@radix-ui/themes";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { distributeDocumentRomanization } from "$/application/lyrics";
import {
	DialogScopeSelector,
	useDialogScope,
} from "$/hooks/useDialogScope.tsx";
import { romanizationEngine } from "$/modules/segmentation/adapters/romanization-engine";
import { editorDocumentAdapter } from "$/plugins/adapters/editor-document";
import { distributeRomanizationDialogAtom } from "$/states/dialogs";
import { projectLogger } from "../logger";

export const DistributeRomanizationDialog = () => {
	const { t } = useTranslation();
	const [open, setOpen] = useAtom(distributeRomanizationDialogAtom);
	const scopeState = useDialogScope(open);

	const handleConfirm = () => {
		const targetLineIndices = scopeState.getTargetLineIndices();

		const snapshot = editorDocumentAdapter.readSnapshot();
		const lineIds = new Set(
			snapshot.lyricLines
				.filter((_line, index) => targetLineIndices.has(index))
				.map((line) => line.id),
		);
		const { failures } = distributeDocumentRomanization(
			editorDocumentAdapter,
			romanizationEngine,
			lineIds,
		);
		for (const failure of failures) {
			projectLogger.error(
				`Failed to distribute romanization for line ${failure.lineIndex + 1}`,
				failure.error,
			);
		}

		setOpen(false);
	};

	return (
		<Dialog.Root open={open} onOpenChange={setOpen}>
			<Dialog.Content maxWidth="450px">
				<Dialog.Title>
					{t("distributeRomanDialog.title", "应用逐行音译到逐字")}
				</Dialog.Title>

				<Flex direction="column" gap="4">
					<Callout.Root color="gray" size="1">
						<Callout.Icon>
							<InfoRegular />
						</Callout.Icon>
						<Callout.Text>
							{t(
								"distributeRomanDialog.warning",
								"此功能将读取整行音译并自动分配给每个单词。算法专为日语罗马音设计，对其他语言可能效果不佳。",
							)}
						</Callout.Text>
					</Callout.Root>

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
