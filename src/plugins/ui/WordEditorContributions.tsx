import { useSyncExternalStore, type ComponentType } from "react";
import type { TrustedJsWordEditorPropsV0 } from "@amll-ttml-tool/plugin-sdk-js";
import { extensionRegistry } from "../adapters/extension-host";
import { toPluginWord } from "../adapters/plugin-document";
import type { LyricWord } from "$/types/ttml";

const subscribe = (listener: () => void) => {
	const sub = extensionRegistry.contributions.subscribe(listener);
	return () => sub.dispose();
};
let revision = -1;
let snapshot = extensionRegistry.contributions.getTrustedViews("word-editor");
const getSnapshot = () => {
	const next = extensionRegistry.contributions.getRevision();
	if (next !== revision) {
		revision = next;
		snapshot = extensionRegistry.contributions.getTrustedViews("word-editor");
	}
	return snapshot;
};

/** The host owns the word; plugins receive a detached public projection, never its atom. */
export function WordEditorContributions({
	word,
	layout,
}: {
	word: LyricWord;
	layout: TrustedJsWordEditorPropsV0["layout"];
}) {
	const views = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
	return views.map((record) => {
		const View = record.view as ComponentType<TrustedJsWordEditorPropsV0>;
		const pluginId =
			record.owner.kind === "plugin" ? record.owner.pluginId : record.owner.id;
		return (
			<span key={record.id} data-amll-plugin-scope={pluginId}>
				<View word={toPluginWord(word)} layout={layout} />
			</span>
		);
	});
}
