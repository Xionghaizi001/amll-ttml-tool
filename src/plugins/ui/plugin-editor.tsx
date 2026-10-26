import type { TrustedJsEditorV0 } from "@amll-ttml-tool/plugin-sdk-js";
import { ContextMenu } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { LyricLineMenu } from "$/components/Menus/lyric-line-menu";
import { useLyricListDrag } from "$/modules/lyric-drag/useLyricListDrag";
import {
	dragSourceAtom,
	isDraggingGlobalAtom,
	lyricLinesAtom,
	selectedLinesAtom,
	selectedWordsAtom,
	ToolMode,
	toolModeAtom,
} from "$/states/main";
import { revealLineActionAtom } from "$/states/sidebar";
import { globalStore } from "$/states/store";

export function createPluginEditor(
	pluginId: string,
	signal: AbortSignal,
): TrustedJsEditorV0 {
	const lineIndex = (id: string) =>
		globalStore
			.get(lyricLinesAtom)
			.lyricLines.findIndex((line) => line.id === id);
	return {
		revealLine(id) {
			if (signal.aborted) throw new Error("Plugin editor is disposed");
			if (lineIndex(id) < 0) throw new Error("Unknown lyric line");
			globalStore.set(selectedLinesAtom, new Set([id]));
			globalStore.set(selectedWordsAtom, new Set());
			globalStore.set(revealLineActionAtom, { id, ts: Date.now() });
		},
		useLineList(containerRef) {
			const mode = useAtomValue(toolModeAtom);
			const isDragging = useAtomValue(isDraggingGlobalAtom);
			const source = useAtomValue(dragSourceAtom);
			const drag = useLyricListDrag({
				containerRef,
				source: pluginId,
				disableDrag: mode !== ToolMode.Edit,
				signal,
			});
			return {
				isDragging,
				isDraggingSource: isDragging && source === pluginId,
				onPointerDown(event, id) {
					const index = lineIndex(id);
					if (index >= 0 && !signal.aborted)
						drag.onPointerDown(event, id, index);
				},
			};
		},
		LineContextMenu({ lineId, children }) {
			const mode = useAtomValue(toolModeAtom);
			const { lyricLines } = useAtomValue(lyricLinesAtom);
			const index = lyricLines.findIndex((line) => line.id === lineId);
			return (
				<ContextMenu.Root
					onOpenChange={(open) => {
						if (
							!open ||
							signal.aborted ||
							globalStore.get(isDraggingGlobalAtom)
						)
							return;
						if (!globalStore.get(selectedLinesAtom).has(lineId))
							globalStore.set(selectedLinesAtom, new Set([lineId]));
					}}
				>
					<ContextMenu.Trigger
						disabled={signal.aborted || index < 0 || mode !== ToolMode.Edit}
					>
						{children}
					</ContextMenu.Trigger>
					<ContextMenu.Content>
						{index >= 0 && !signal.aborted && (
							<LyricLineMenu lineIndex={index} />
						)}
					</ContextMenu.Content>
				</ContextMenu.Root>
			);
		},
	};
}
