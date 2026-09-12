import type { EditSource, PluginSelectionV0 } from "@amll-ttml-tool/plugin-api";
import type { DocumentChangeSource } from "$/kernel/editor/EditorDocumentService";
import { IndexedDbPluginKvStorage } from "$/platform/storage/IndexedDbPluginKvStorage";
import { selectedLinesAtom, selectedWordsAtom } from "$/states/main";
import { globalStore } from "$/states/store";
import { editorDocumentAdapter } from "./editor-document";
import { PluginDocumentGateway } from "./plugin-document";

/**
 * Host services shared by every plugin tier (WASM turn host and trusted-js
 * host). Sharing the instances, not just the classes, is what makes the two
 * tiers agree on document semantics: one gateway means one revision-conflict
 * rule, one transaction path and one provenance label format; one kv storage
 * means one `amll-plugin-kv` namespace per plugin id regardless of tier.
 */

export const pluginDocumentGateway = new PluginDocumentGateway(
	editorDocumentAdapter,
);

export const pluginKvStorage = new IndexedDbPluginKvStorage();

export const toEditSource = (source: DocumentChangeSource): EditSource => {
	switch (source) {
		case "plugin":
			return "plugin";
		case "system":
			return "host";
		default:
			return "user";
	}
};

export const getHostSelection = (): PluginSelectionV0 => ({
	lineIds: [...globalStore.get(selectedLinesAtom)],
	wordIds: [...globalStore.get(selectedWordsAtom)],
});

export interface HostDocumentChange {
	revision: number;
	source: EditSource;
	changedLineIds: string[];
	changedWordIds: string[];
	sourcePluginId?: string;
}

/** Document transactions as protocol-shaped change records, any tier. */
export const subscribeHostDocumentChanges = (
	listener: (change: HostDocumentChange) => void,
): (() => void) =>
	editorDocumentAdapter.service.subscribe((event) => {
		listener({
			revision: event.revision,
			source: toEditSource(event.transaction.source),
			changedLineIds: [...event.changedLineIds],
			changedWordIds: [...event.changedWordIds],
			...(event.transaction.pluginId === undefined
				? {}
				: { sourcePluginId: event.transaction.pluginId }),
		});
	});
