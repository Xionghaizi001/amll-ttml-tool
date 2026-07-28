import { Button, Dialog, Flex, Text } from "@radix-ui/themes";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

type NeteaseIdSelectDialogProps = {
	open: boolean;
	ids: string[];
	/** 本次会话中已经选择过的 ID，会被高亮标注 */
	selectedIds?: string[];
	/** 当前正在使用的 ID */
	currentId?: string;
	onSelect: (id: string) => void;
	onClose: () => void;
};

export const NeteaseIdSelectDialog = ({
	open,
	ids,
	selectedIds,
	currentId,
	onSelect,
	onClose,
}: NeteaseIdSelectDialogProps) => {
	const { t } = useTranslation();
	const cleanedIds = useMemo(
		() => ids.map((id) => id.trim()).filter(Boolean),
		[ids],
	);
	const selectedIdSet = useMemo(
		() => new Set((selectedIds ?? []).map((id) => id.trim()).filter(Boolean)),
		[selectedIds],
	);

	return (
		<Dialog.Root
			open={open}
			onOpenChange={(nextOpen) => !nextOpen && onClose()}
		>
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
					{cleanedIds.map((id) => {
						const isCurrent = currentId?.trim() === id;
						const isSelected = isCurrent || selectedIdSet.has(id);
						return (
							<Button
								key={id}
								variant={isCurrent ? "solid" : "soft"}
								color={isSelected ? "green" : undefined}
								onClick={() => onSelect(id)}
							>
								<Flex
									direction="row"
									align="center"
									justify="between"
									style={{ width: "100%" }}
								>
									<Text>{id}</Text>
									{isSelected && (
										<Text size="1" weight="medium">
											{isCurrent
												? t("ncm.selectId.current", "当前")
												: t("ncm.selectId.selected", "已选择过")}
										</Text>
									)}
								</Flex>
							</Button>
						);
					})}
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
