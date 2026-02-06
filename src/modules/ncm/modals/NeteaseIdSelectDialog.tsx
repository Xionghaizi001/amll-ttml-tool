import { Button, Dialog, Flex } from "@radix-ui/themes";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

type NeteaseIdSelectDialogProps = {
	open: boolean;
	ids: string[];
	onSelect: (id: string) => void;
	onClose: () => void;
};

export const NeteaseIdSelectDialog = ({
	open,
	ids,
	onSelect,
	onClose,
}: NeteaseIdSelectDialogProps) => {
	const { t } = useTranslation();
	const cleanedIds = useMemo(
		() => ids.map((id) => id.trim()).filter(Boolean),
		[ids],
	);

	return (
		<Dialog.Root open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
			<Dialog.Content maxWidth="420px">
				<Dialog.Title>
					{t("ncm.selectId.title", "选择网易云音乐 ID")}
				</Dialog.Title>
				<Dialog.Description size="2" color="gray">
					{t(
						"ncm.selectId.desc",
						"检测到多个网易云音乐 ID，请选择一个加载音频。",
					)}
				</Dialog.Description>
				<Flex direction="column" gap="2" mt="3">
					{cleanedIds.map((id) => (
						<Button key={id} variant="soft" onClick={() => onSelect(id)}>
							{id}
						</Button>
					))}
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
