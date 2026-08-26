import type { EnablementContext } from "@amll-ttml-tool/plugin-api";
import { loadedAudioAtom } from "$/modules/audio/states";
import {
	lyricLinesAtom,
	selectedLinesAtom,
	selectedWordsAtom,
	toolModeAtom,
} from "$/states/main";
import { globalStore } from "$/states/store";
import { editorDocumentAdapter } from "./editor-document";
import { extensionRegistry } from "./extension-host";

/**
 * Host values backing the protocol's enablement identifiers (`when` clauses
 * and command `enablement` expressions). Unknown identifiers stay undefined,
 * which `evaluateEnablement` treats as fail-closed.
 *
 * `mode` carries the resolved active mode id (dynamic, namespaced ids
 * included). Resolution already applies the edit fail-safe, so an expression
 * comparing against a mode that is no longer registered evaluates false.
 */
export const getHostEnablementContext = (): EnablementContext => {
	const selectedLines = globalStore.get(selectedLinesAtom);
	const selectedWords = globalStore.get(selectedWordsAtom);
	return {
		mode: extensionRegistry.contributions.resolveActiveModeId(
			globalStore.get(toolModeAtom),
		),
		hasLineSelection: selectedLines.size > 0,
		hasWordSelection: selectedWords.size > 0,
		hasSelection: selectedLines.size > 0 || selectedWords.size > 0,
		documentEmpty: globalStore.get(lyricLinesAtom).lyricLines.length === 0,
		audioLoaded: globalStore.get(loadedAudioAtom).size > 0,
		canUndo: editorDocumentAdapter.canUndo(),
		canRedo: editorDocumentAdapter.canRedo(),
	};
};
