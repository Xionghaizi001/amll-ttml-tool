import { Badge, Box, Button, Card, Flex, Text } from "@radix-ui/themes";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AppNotification } from "$/states/notifications";
import { notificationCenterStyles } from "./notification-center.styles";
import { NotificationEntry } from "./notification-entry";

type PendingUpdateGroupProps = {
	items: AppNotification[];
	onOpenUpdate: (payload: { prNumber: number; prTitle: string }) => void;
	onClearGroup: () => void;
	defaultOpen: boolean;
	formatTime: (value: string) => string;
	getAccentColor: (
		level: AppNotification["level"],
	) => "blue" | "yellow" | "red" | "green";
};

export const PendingUpdateGroup = ({
	items,
	onOpenUpdate,
	onClearGroup,
	defaultOpen,
	formatTime,
	getAccentColor,
}: PendingUpdateGroupProps) => {
	const { t } = useTranslation();
	const [open, setOpen] = useState(defaultOpen);
	const latestCreatedAt = useMemo(() => {
		if (items.length === 0) return "";
		return items
			.map((item) => item.createdAt)
			.sort((a, b) => b.localeCompare(a))[0];
	}, [items]);
	const accentColor = getAccentColor("info");
	return (
		<details
			open={open}
			onToggle={(event) => {
				setOpen(event.currentTarget.open);
			}}
			style={notificationCenterStyles.detailsRoot}
		>
			<summary style={notificationCenterStyles.detailsSummary}>
				<Card style={notificationCenterStyles.pendingGroupCard(accentColor)}>
					<Flex align="start" justify="between" gap="3">
						<Flex
							align="center"
							gap="2"
							style={notificationCenterStyles.flexGrowMinWidth}
						>
							<Text size="2" style={notificationCenterStyles.groupArrow(open)}>
								▸
							</Text>
							<Flex
								direction="column"
								gap="1"
								style={notificationCenterStyles.flexGrowMinWidth}
							>
								<Flex align="center" gap="2" wrap="wrap">
									<Badge size="1" color={accentColor}>
										{t("notificationCenter.level.info", "信息")}
									</Badge>
									<Text size="1" color="gray" wrap="nowrap">
										{t("notificationCenter.pendingUpdateGroup", "待更新PR")}
									</Text>
								</Flex>
								<Flex align="center" gap="2" wrap="wrap">
									<Text size="2" weight="bold">
										{t("notificationCenter.pendingUpdateGroup", "待更新PR")}
									</Text>
									<Text size="1" color="gray" wrap="nowrap">
										{t(
											"notificationCenter.pendingUpdateCount",
											"{count} 条",
											{ count: items.length },
										)}
									</Text>
								</Flex>
							</Flex>
						</Flex>
						<Flex direction="column" align="end" gap="2">
							<Text size="1" color="gray" wrap="nowrap">
								{latestCreatedAt ? formatTime(latestCreatedAt) : ""}
							</Text>
							<Button
								size="1"
								variant="soft"
								color={accentColor}
								onClick={(event) => {
									event.preventDefault();
									event.stopPropagation();
									onClearGroup();
								}}
							>
								{t("notificationCenter.clearGroup", "清除该组")}
							</Button>
						</Flex>
					</Flex>
				</Card>
			</summary>
			<Box mt="2" style={notificationCenterStyles.groupListOffset}>
				<Flex direction="column" gap="2">
					{items.map((item) => (
						<NotificationEntry
							key={item.id}
							item={item}
							onOpenUpdate={onOpenUpdate}
							formatTime={formatTime}
							getAccentColor={getAccentColor}
						/>
					))}
				</Flex>
			</Box>
		</details>
	);
};
