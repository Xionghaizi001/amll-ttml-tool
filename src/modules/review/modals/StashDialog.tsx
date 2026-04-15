import type { TFunction } from "i18next";
import {
	Box,
	Button,
	Dialog,
	DropdownMenu,
	Flex,
	Text,
} from "@radix-ui/themes";
import {
	Checkmark20Regular,
	Delete20Regular,
	DeleteDismiss20Regular,
	Dismiss20Regular,
	SelectAllOn20Regular,
} from "@fluentui/react-icons";

type StashCard = {
	line: number;
	items: Array<{ label: string; wordId: string }>;
};

export type StashDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	stashCards: StashCard[];
	selectedIds: Map<string, "startTime" | "endTime">;
	stashItemsCount: number;
	onToggleItem: (wordId: string, field: "startTime" | "endTime") => void;
	onSelectAll: (field: "startTime" | "endTime") => void;
	onClose: () => void;
	onRemoveSelected: () => void;
	onClear: () => void;
	onConfirm: () => void;
	t: TFunction;
};

export const StashDialog = ({
	open,
	onOpenChange,
	stashCards,
	selectedIds,
	stashItemsCount,
	onToggleItem,
	onSelectAll,
	onClose,
	onRemoveSelected,
	onClear,
	onConfirm,
	t,
}: StashDialogProps) => {
	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<Dialog.Content maxWidth="520px">
				<Flex align="center" gap="3" mb="3">
					<Dialog.Title mb="0" size="6">
						{t("review.TimingStash.title", "暂存时间轴结果")}
					</Dialog.Title>
					<Flex direction="column" gap="1">
						<Text size="1" color="blue">
							{t("review.TimingStash.hintLeft", "左键 = 标记起始时间")}
						</Text>
						<Text size="1" color="green">
							{t("review.TimingStash.hintRight", "右键 = 标记结束时间")}
						</Text>
					</Flex>
				</Flex>
				<Flex direction="row" gap="3" align="start" wrap="wrap">
					{stashCards.length === 0 ? (
						<Text size="2" color="gray">
							{t("review.TimingStash.empty", "暂无暂存结果")}
						</Text>
					) : (
						stashCards.map((card) => {
							const key = `line-${card.line}`;
							return (
								<Box
									key={key}
									style={{
										borderRadius: "12px",
										border: "1px solid var(--gray-a6)",
										padding: "10px 12px",
										backgroundColor: "var(--gray-a2)",
									}}
								>
									<Text
										size="2"
										weight="bold"
										style={{ display: "block", marginBottom: "6px" }}
									>
										{`第 ${card.line} 行`}
									</Text>
									<Flex align="center" wrap="wrap" gap="1">
										{card.items.map((item, index) => {
											const field = selectedIds.get(item.wordId);
											const checked = field !== undefined;
											const color =
												field === "startTime"
													? "blue"
													: field === "endTime"
														? "green"
														: "gray";
											return (
												<Flex
													key={`${item.wordId}-${index}`}
													align="center"
													gap="1"
												>
													<Button
														size="1"
														variant={checked ? "solid" : "soft"}
														color={color}
														onClick={() =>
															onToggleItem(item.wordId, "startTime")
														}
														onContextMenu={(e) => {
															e.preventDefault();
															onToggleItem(item.wordId, "endTime");
														}}
														asChild
													>
														<span>{item.label}</span>
													</Button>
													{index < card.items.length - 1 ? (
														<Text size="2" color="gray" asChild>
															<span
																style={{
																	display: "inline-flex",
																	alignItems: "center",
																}}
															>
																|
															</span>
														</Text>
													) : null}
												</Flex>
											);
										})}
									</Flex>
								</Box>
							);
						})
					)}
				</Flex>
				<Flex gap="3" mt="4" justify="end">
					<DropdownMenu.Root>
						<DropdownMenu.Trigger disabled={stashItemsCount === 0}>
							<Button
								variant="soft"
								color="gray"
								disabled={stashItemsCount === 0}
							>
								<SelectAllOn20Regular />
								{t("common.selectAll", "全选")}
							</Button>
						</DropdownMenu.Trigger>
						<DropdownMenu.Content>
							<DropdownMenu.Item
								color="blue"
								onClick={() => onSelectAll("startTime")}
							>
								{t("review.TimingStash.selectAllStart", "全选起始时间")}
							</DropdownMenu.Item>
							<DropdownMenu.Item
								color="green"
								onClick={() => onSelectAll("endTime")}
							>
								{t("review.TimingStash.selectAllEnd", "全选结束时间")}
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
					<Button variant="soft" color="gray" onClick={onClose}>
						<Dismiss20Regular />
						{t("common.close", "关闭")}
					</Button>
					<Button
						variant="soft"
						color="red"
						onClick={onRemoveSelected}
						disabled={selectedIds.size === 0}
					>
						<Delete20Regular />
						{t("review.TimingStash.removeSelected", "删除选中")}
					</Button>
					<Button
						variant="soft"
						color="orange"
						onClick={onClear}
						disabled={stashItemsCount === 0}
					>
						<DeleteDismiss20Regular />
						{t("review.TimingStash.clear", "清空")}
					</Button>
					<Button onClick={onConfirm} disabled={selectedIds.size === 0}>
						<Checkmark20Regular />
						{t("common.confirm", "确认")}
					</Button>
				</Flex>
			</Dialog.Content>
		</Dialog.Root>
	);
};
