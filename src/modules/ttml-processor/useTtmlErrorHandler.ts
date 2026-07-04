import { useSetAtom } from "jotai";
import { useCallback } from "react";
import type { JsError } from "$/modules/ttml-processor/types";
import { ttmlErrorDialogAtom } from "$/states/dialogs.ts";

export const useTtmlErrorHandler = () => {
	const setTtmlErrorDialog = useSetAtom(ttmlErrorDialogAtom);

	const handleTtmlError = useCallback(
		(
			error: JsError,
			contextInfo = "Failed to process TTML",
			rawText?: string,
		) => {
			console.error(contextInfo, error);
			setTtmlErrorDialog({ error, rawText });
		},
		[setTtmlErrorDialog],
	);

	return handleTtmlError;
};
