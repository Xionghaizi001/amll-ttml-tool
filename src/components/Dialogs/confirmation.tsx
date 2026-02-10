import { Button, Dialog, Flex, Text, TextField } from "@radix-ui/themes";
import { useAtom } from "jotai";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { confirmDialogAtom } from "$/states/dialogs";

export const ConfirmationDialog = () => {
	const [dialogState, setDialogState] = useAtom(confirmDialogAtom);
	const { t } = useTranslation();
	const [inputValue, setInputValue] = useState("");
	const [inputError, setInputError] = useState("");

	useEffect(() => {
		if (!dialogState.open) return;
		setInputValue(dialogState.input?.defaultValue ?? "");
		setInputError("");
	}, [dialogState.open, dialogState.input?.defaultValue]);

	const handleConfirm = () => {
		if (dialogState.input) {
			const error = dialogState.input.validate?.(inputValue) ?? null;
			if (error) {
				setInputError(error);
				return;
			}
			dialogState.onConfirm?.(inputValue);
		} else {
			dialogState.onConfirm?.();
		}
		setDialogState({ ...dialogState, open: false });
	};

	const handleCancel = () => {
		dialogState.onCancel?.();
		setDialogState({ ...dialogState, open: false });
	};

	return (
		<Dialog.Root open={dialogState.open} onOpenChange={handleCancel}>
			<Dialog.Content>
				<Dialog.Title>{dialogState.title}</Dialog.Title>
				<Dialog.Description>{dialogState.description}</Dialog.Description>
				{dialogState.input && (
					<Flex direction="column" gap="2" mt="3">
						<TextField.Root
							value={inputValue}
							placeholder={dialogState.input.placeholder}
							onChange={(event) => {
								setInputValue(event.currentTarget.value);
								setInputError("");
							}}
						/>
						{inputError ? (
							<Text size="1" color="red">
								{inputError}
							</Text>
						) : null}
					</Flex>
				)}
				<Flex gap="3" mt="4" justify="end">
					<Button variant="soft" color="gray" onClick={handleCancel}>
						{t("confirmDialog.cancel", "取消")}
					</Button>
					<Button onClick={handleConfirm}>
						{t("confirmDialog.confirm", "确认")}
					</Button>
				</Flex>
			</Dialog.Content>
		</Dialog.Root>
	);
};
