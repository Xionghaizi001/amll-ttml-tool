import { Box, Button, Dialog, Flex, Text } from "@radix-ui/themes";
import { useAtom } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import { riskConfirmDialogAtom } from "$/states/dialogs";

const RISK_CONFIRM_PHRASES = [
	"我确定我要登录该应用"
];

const CONSOLE_HANDLER_KEY = "amllRiskConfirm";

export const RiskConfirmationDialog = () => {
	const [dialogState, setDialogState] = useAtom(riskConfirmDialogAtom);
	const [progressIndex, setProgressIndex] = useState(0);
	const progressRef = useRef(0);

	const progressText = useMemo(
		() => `${Math.min(progressIndex, RISK_CONFIRM_PHRASES.length)}/${RISK_CONFIRM_PHRASES.length}`,
		[progressIndex],
	);

	useEffect(() => {
		if (!dialogState.open) return;
		progressRef.current = 0;
		setProgressIndex(0);
		const handler = (input: string) => {
			const expected = RISK_CONFIRM_PHRASES[progressRef.current];
			if (input !== expected) {
				console.warn("确认语句不匹配，请按弹窗中的顺序逐条输入。");
				return false;
			}
			progressRef.current += 1;
			setProgressIndex(progressRef.current);
			if (progressRef.current >= RISK_CONFIRM_PHRASES.length) {
				dialogState.onConfirmed?.();
				setDialogState({ open: false });
				return true;
			}

			return true;
		};

		(window as unknown as Record<string, unknown>)[CONSOLE_HANDLER_KEY] =
			handler;

		console.info(
			`请在控制台依次输入以下确认语句，输入方式：window.${CONSOLE_HANDLER_KEY}("确认语句")`,
		);
		RISK_CONFIRM_PHRASES.forEach((phrase, index) => {
			console.info(`${index + 1}. ${phrase}`);
		});
		console.info(`当前确认语句：${RISK_CONFIRM_PHRASES[0]}`);

		return () => {
			const target = window as unknown as Record<string, unknown>;
			if (target[CONSOLE_HANDLER_KEY] === handler) {
				delete target[CONSOLE_HANDLER_KEY];
			}
		};
	}, [dialogState.open, dialogState.onConfirmed, setDialogState]);

	return (
		<Dialog.Root open={dialogState.open}>
			<Dialog.Content style={{ maxWidth: "560px" }}>
				<Dialog.Title>风险确认</Dialog.Title>
				<Dialog.Description>
					请打开控制台，输入以下确认语句。完成后将自动继续登录流程。
				</Dialog.Description>
				<Flex direction="column" gap="3" mt="4">
					<Flex direction="column" gap="2">
						{RISK_CONFIRM_PHRASES.map((phrase, index) => (
							<Flex key={phrase} gap="2" align="start">
								<Text size="2" color="gray">
									{index + 1}.
								</Text>
								<Text size="2">{phrase}</Text>
							</Flex>
						))}
					</Flex>
					<Box>
						<Text size="2" color="gray">
							控制台输入示例：window.{CONSOLE_HANDLER_KEY}("确认语句")
						</Text>
					</Box>
					<Text size="2" color="gray">
						已完成：{progressText}
					</Text>
					<Flex justify="end">
						<Button
							variant="soft"
							color="gray"
							onClick={() => setDialogState({ open: false })}
						>
							取消
						</Button>
					</Flex>
				</Flex>
			</Dialog.Content>
		</Dialog.Root>
	);
};
