import {
	AddCircle20Regular,
	Checkmark20Regular,
	Dismiss20Regular,
} from "@fluentui/react-icons";
import { Button, Flex, Text } from "@radix-ui/themes";

export type ReviewActionGroupProps = {
	className?: string;
	showStash: boolean;
	onOpenStash: () => void;
	onComplete: () => void;
	onCancel: () => void;
};

export const ReviewActionGroup = ({
	className,
	showStash,
	onOpenStash,
	onComplete,
	onCancel,
}: ReviewActionGroupProps) => {
	return (
		<Flex align="center" gap="1" className={className}>
			{showStash && (
				<Button size="1" variant="solid" color="orange" onClick={onOpenStash}>
					<Flex align="center" gap="1">
						<AddCircle20Regular />
						<Text size="1">暂存</Text>
					</Flex>
				</Button>
			)}
			<Button size="1" variant="soft" color="green" onClick={onComplete}>
				<Flex align="center" gap="1">
					<Checkmark20Regular />
					<Text size="1">完成</Text>
				</Flex>
			</Button>
			<Button size="1" variant="soft" color="red" onClick={onCancel}>
				<Flex align="center" gap="1">
					<Dismiss20Regular />
					<Text size="1">取消</Text>
				</Flex>
			</Button>
		</Flex>
	);
};
