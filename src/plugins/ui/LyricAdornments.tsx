import type { TrustedJsLyricAdornmentPropsV0 } from "@amll-ttml-tool/plugin-sdk-js";
import { type ComponentType, useSyncExternalStore } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { extensionRegistry } from "../adapters/extension-host";

const registry = extensionRegistry.contributions;
const subscribe = (listener: () => void) => {
	const sub = registry.subscribe(listener);
	return () => sub.dispose();
};

function createAdornments(kind: "word-adornment" | "line-adornment") {
	let revision = -1;
	let snapshot = registry.getTrustedViews(kind);
	const getSnapshot = () => {
		if (revision !== registry.getRevision()) {
			revision = registry.getRevision();
			snapshot = registry.getTrustedViews(kind);
		}
		return snapshot;
	};
	return function LyricAdornments({
		targetId,
	}: TrustedJsLyricAdornmentPropsV0) {
		const views = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
		return views.map((record) => {
			const View = record.view as ComponentType<TrustedJsLyricAdornmentPropsV0>;
			const owner = record.owner;
			return (
				<ErrorBoundary key={record.id} fallback={null}>
					<span
						style={{ display: "inline-flex", alignItems: "center" }}
						data-amll-plugin-scope={
							owner.kind === "plugin" ? owner.pluginId : owner.id
						}
					>
						<View targetId={targetId} />
					</span>
				</ErrorBoundary>
			);
		});
	};
}

export const WordAdornments = createAdornments("word-adornment");
export const LineAdornments = createAdornments("line-adornment");
