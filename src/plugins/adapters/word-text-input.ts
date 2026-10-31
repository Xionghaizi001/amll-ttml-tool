import {
	LYRICS_APPLY_EDIT_SCHEMA,
	validate,
} from "@amll-ttml-tool/plugin-api/schema";
import { extensionRegistry } from "./extension-host";
import { patchWord, toPluginWord } from "./plugin-document";
import type { LyricWord } from "$/types/ttml";

/** Called inside the existing host transaction, so the shortcut and text edit undo together. */
export function applyWordTextInput(
	word: LyricWord,
	text: string,
	context: "insert" | "edit" = "edit",
) {
	for (const view of extensionRegistry.contributions.getTrustedViews(
		"word-editor",
	)) {
		const patch = view.transformTextInput?.(text, toPluginWord(word), context);
		if (patch === undefined) continue;
		const checked = validate(LYRICS_APPLY_EDIT_SCHEMA, {
			expectedRevision: -1,
			label: "Word text input",
			ops: [{ op: "updateWord", wordId: word.id, patch }],
		});
		if (!checked.ok)
			throw new Error(`Invalid word input patch from ${view.id}`);
		word.word = text;
		patchWord(word, patch);
		return;
	}
	word.word = text;
}
