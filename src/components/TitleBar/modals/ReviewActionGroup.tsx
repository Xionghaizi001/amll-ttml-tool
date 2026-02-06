import {
	AddCircle20Regular,
	Checkmark20Regular,
	Dismiss20Regular,
	MusicNote2Filled,
} from "@fluentui/react-icons";
import { Button, Flex, Text } from "@radix-ui/themes";

export type ReviewActionGroupProps = {
	className?: string;
	showStash?: boolean;
	stashEnabled?: boolean;
	onOpenStash?: () => void;
	showSwitchAudio?: boolean;
	switchAudioEnabled?: boolean;
	onSwitchAudio?: () => void;
	onComplete: () => void;
	onCancel: () => void;
};

export const ReviewActionGroup = ({
	className,
	showStash = false,
	stashEnabled = false,
	onOpenStash,
	showSwitchAudio = false,
	switchAudioEnabled = false,
	onSwitchAudio,
	onComplete,
	onCancel,
}: ReviewActionGroupProps) => {
	return (
		<Flex align="center" gap="1" className={className}>
			{showStash && (
				<Button
					size="1"
					variant="solid"
					color="orange"
					onClick={onOpenStash}
					disabled={!stashEnabled}
				>
					<Flex align="center" gap="1">
						<AddCircle20Regular />
						<Text size="1">暂存</Text>
					</Flex>
				</Button>
			)}
			{showSwitchAudio && (
				<Button
					size="1"
					variant="soft"
					color="blue"
					onClick={onSwitchAudio}
					disabled={!switchAudioEnabled}
				>
					<Flex align="center" gap="1">
						<MusicNote2Filled />
						<Text size="1">切换音频</Text>
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
