/**
 * @description “平移时间” 模态框
 */
import { ArrowLeftRegular, ArrowRightRegular } from "@fluentui/react-icons";
import {
	Button,
	Dialog,
	Flex,
	IconButton,
	RadioGroup,
	Text,
	TextField,
} from "@radix-ui/themes";
import { useAtom } from "jotai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { shiftLyricTimes } from "$/application/time-shift";
import {
	DialogScopeSelector,
	useDialogScope,
} from "$/hooks/useDialogScope.tsx";
import { editorDocumentAdapter } from "$/plugins/adapters/editor-document.ts";
import { timeShiftDialogAtom } from "$/states/dialogs.ts";

type ShiftDirection = "delay" | "advance";

export const TimeShiftDialog = () => {
	const { t } = useTranslation();
	const [open, setOpen] = useAtom(timeShiftDialogAtom);
	const scopeState = useDialogScope(open);

	const [offsetStr, setOffsetStr] = useState("100");
	const [direction, setDirection] = useState<ShiftDirection>("delay");

	const adjustOffset = (delta: number) => {
		const current = parseInt(offsetStr, 10);
		const val = Number.isNaN(current) ? 0 : current;
		setOffsetStr(Math.max(0, val + delta).toString());
	};

	const handleConfirm = () => {
		const amount = parseInt(offsetStr, 10);
		if (Number.isNaN(amount) || amount === 0) {
			setOpen(false);
			return;
		}

		const finalOffset = direction === "delay" ? amount : -amount;
		const snapshot = editorDocumentAdapter.readSnapshot();
		const targetLineIds = [...scopeState.getTargetLineIndices()]
			.map((index) => snapshot.lyricLines[index]?.id)
			.filter((id): id is string => id !== undefined);

		shiftLyricTimes(editorDocumentAdapter, {
			offsetMs: finalOffset,
			lineIds: targetLineIds,
			expectedRevision: editorDocumentAdapter.getRevision(),
		});

		setOpen(false);
	};

	return (
		<Dialog.Root open={open} onOpenChange={setOpen}>
			<Dialog.Content maxWidth="450px">
				<Dialog.Title>{t("timeShiftDialog.title", "平移时间")}</Dialog.Title>
				<Flex direction="column" gap="4">
					<Flex direction="column" gap="1">
						<Text size="2" weight="bold">
							{t("timeShiftDialog.amount", "偏移量 (ms)")}
						</Text>
						<Flex gap="2" align="center">
							<IconButton
								variant="soft"
								onClick={() => adjustOffset(-50)}
								title="- 50ms"
							>
								<ArrowLeftRegular />
							</IconButton>
							<TextField.Root
								type="number"
								min="0"
								value={offsetStr}
								onChange={(e) => setOffsetStr(e.target.value)}
								placeholder="100"
								style={{ flexGrow: 1 }}
							/>
							<IconButton
								variant="soft"
								onClick={() => adjustOffset(50)}
								title="+ 50ms"
							>
								<ArrowRightRegular />
							</IconButton>
						</Flex>
					</Flex>

					<Flex direction="column" gap="1">
						<Text size="2" weight="bold">
							{t("timeShiftDialog.direction", "方向")}
						</Text>
						<RadioGroup.Root
							value={direction}
							onValueChange={(v) => setDirection(v as ShiftDirection)}
							style={{ flexDirection: "row", gap: "16px" }}
						>
							<RadioGroup.Item value="advance">
								{t("timeShiftDialog.advance", "提前 (-)")}
							</RadioGroup.Item>
							<RadioGroup.Item value="delay">
								{t("timeShiftDialog.delay", "延后 (+)")}
							</RadioGroup.Item>
						</RadioGroup.Root>
					</Flex>

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
