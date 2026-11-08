import { atom } from "jotai";
import type { JsError } from "$/modules/ttml-processor/types";

export const settingsDialogAtom = atom(false);
export const settingsTabAtom = atom("common");
export const latencyTestDialogAtom = atom(false);
export const pluginStoreDialogAtom = atom(false);
/** Plugin manager page: a host section or a plugin `settings-view` id. */
export const pluginStoreSectionAtom = atom("available");
export const submitToAMLLDBDialogAtom = atom(false);
export const confirmDialogAtom = atom<{
	open: boolean;
	title: string;
	description: string;
	onConfirm?: () => void;
	onCancel?: () => void;
}>({
	open: false,
	title: "",
	description: "",
});
export const historyRestoreDialogAtom = atom(false);
export const importFromLRCLIBDialogAtom = atom(false);
export const ttmlErrorDialogAtom = atom<{
	error: JsError;
	rawText?: string;
} | null>(null);
