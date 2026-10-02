import type { EditSource, PluginSelectionV0 } from "@amll-ttml-tool/plugin-api";
import type { TrustedJsProjectInfoV0 } from "@amll-ttml-tool/plugin-sdk-js";
import type { DocumentChangeSource } from "$/kernel/editor/EditorDocumentService";
import { IndexedDbPluginKvStorage } from "$/platform/storage/IndexedDbPluginKvStorage";
import {
	projectIdAtom,
	saveFileNameAtom,
	selectedLinesAtom,
	selectedWordsAtom,
} from "$/states/main";
import { pluginNetworkOfflineAtom } from "$/states/plugins";
import { globalStore } from "$/states/store";
import { editorDocumentAdapter } from "./editor-document";
import { PluginDocumentGateway } from "./plugin-document";
import {
	createPluginNetworkPort,
	fetchPluginNetworkTransport,
} from "./plugin-network";

/** Shared document, selection, project, network and KV ports for trusted-js plugins. */

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

/** Selection changes as protocol selections, for `selection.onChanged`. */
export const subscribeHostSelectionChanges = (
	listener: (selection: PluginSelectionV0) => void,
): (() => void) => {
	const notify = () => listener(getHostSelection());
	const unsubscribeLines = globalStore.sub(selectedLinesAtom, notify);
	const unsubscribeWords = globalStore.sub(selectedWordsAtom, notify);
	return () => {
		unsubscribeLines();
		unsubscribeWords();
	};
};

/** Read-only project identity exposed as `project.getInfo()`. */
export const getHostProjectInfo = (): TrustedJsProjectInfoV0 => ({
	projectId: globalStore.get(projectIdAtom),
	fileName: globalStore.get(saveFileNameAtom),
});

/**
 * The plugin network port, shared by every tier that gets a network surface
 * (trusted-js today). One port means one URL/header policy, one offline
 * switch and one "no credentials" transport for all plugins.
 */
export const pluginNetworkPort = createPluginNetworkPort({
	transport: fetchPluginNetworkTransport,
	isOffline: () => globalStore.get(pluginNetworkOfflineAtom),
	log: (pluginId, message) =>
		console.warn(`[plugins] network ${pluginId}: ${message}`),
});
