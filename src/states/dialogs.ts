import { atom } from "jotai";

export const importFromTextDialogAtom = atom(false);
export const metadataEditorDialogAtom = atom(false);
export const vocalTagsEditorDialogAtom = atom(false);
export const metaSuggestionManagerDialogAtom = atom(false);
export const settingsDialogAtom = atom(false);
export const settingsTabAtom = atom("common");
export const latencyTestDialogAtom = atom(false);
export const submitToAMLLDBDialogAtom = atom(false);
export const splitWordDialogAtom = atom(false);
export const replaceWordDialogAtom = atom(false);
export const advancedSegmentationDialogAtom = atom(false);
export const timeShiftDialogAtom = atom(false);
export const distributeRomanizationDialogAtom = atom(false);
export const notificationCenterDialogAtom = atom(false);
export type AddLanguageDialogTarget =
	| "translation"
	| "romanization"
	| "word-romanization";
export const addLanguageDialogAtom = atom<{
	open: boolean;
	target: AddLanguageDialogTarget;
	onSubmit?: (lang: string) => void;
}>({
	open: false,
	target: "translation",
});
export const confirmDialogAtom = atom<{
	open: boolean;
	title: string;
	description: string;
	onConfirm?: (value?: string) => void;
	onCancel?: () => void;
	input?: {
		placeholder?: string;
		defaultValue?: string;
		validate?: (value: string) => string | null;
	};
}>({
	open: false,
	title: "",
	description: "",
});
export const riskConfirmDialogAtom = atom<{
	open: boolean;
	onConfirmed?: () => void;
}>({
	open: false,
});
export const historyRestoreDialogAtom = atom(false);
export const importFromLRCLIBDialogAtom = atom(false);
export const reviewReportDialogAtom = atom<{
	open: boolean;
	prNumber: number | null;
	prTitle: string;
	report: string;
	draftId: string | null;
}>({
	open: false,
	prNumber: null,
	prTitle: "",
	report: "",
	draftId: null,
});
