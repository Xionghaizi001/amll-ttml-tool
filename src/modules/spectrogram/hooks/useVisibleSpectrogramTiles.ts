import { useCallback, useEffect, useState } from "react";
import type { TileComponentProps } from "$/modules/spectrogram/components/TileComponent";
import type { TileEntry } from "$/modules/spectrogram/hooks/useSpectrogramWorker";
import type { LRUCache } from "$/modules/spectrogram/utils/lru-cache";
import type { TileGenerationParams } from "$/modules/spectrogram/workers/types";

const TILE_DURATION_S = 5;
const LOD_WIDTHS = [512, 1024, 2048, 4096, 8192];

export function useVisibleSpectrogramTiles({
	pcmDataReady,
	currentDurationMs,
	containerWidth,
	gain,
	dataHeight,
	paletteId,
	zoom,
	scrollLeft,
	lastTileTimestamp,
	tileCache,
	requestTileIfNeeded,
	container,
}: {
	pcmDataReady: boolean;
	currentDurationMs: number;
	containerWidth: number;
	gain: number;
	dataHeight: number;
	paletteId: string;
	zoom: number;
	scrollLeft: number;
	lastTileTimestamp: number;
	tileCache: React.RefObject<LRUCache<string, TileEntry>>;
	requestTileIfNeeded(params: TileGenerationParams): Promise<void>;
	container: HTMLDivElement | null;
}) {
	const [visibleTiles, setVisibleTiles] = useState<TileComponentProps[]>([]);

	const updateVisibleTiles = useCallback(() => {
		if (!pcmDataReady || currentDurationMs <= 0 || !container) return;
		const tileDisplayWidthPx = TILE_DURATION_S * zoom;
		const totalTiles = Math.ceil(currentDurationMs / 1000 / TILE_DURATION_S);
		const firstVisibleIndex = Math.floor(scrollLeft / tileDisplayWidthPx);
		const lastVisibleIndex = Math.ceil(
			(scrollLeft + containerWidth) / tileDisplayWidthPx,
		);
		const nextTiles: TileComponentProps[] = [];
		for (
			let tileIndex = firstVisibleIndex - 2;
			tileIndex <= lastVisibleIndex + 2;
			tileIndex += 1
		) {
			if (tileIndex < 0 || tileIndex >= totalTiles) continue;
			const tileId = `tile-${tileIndex}`;
			const tileWidthPx =
				LOD_WIDTHS.find((width) => width >= tileDisplayWidthPx) ??
				LOD_WIDTHS[LOD_WIDTHS.length - 1];
			void requestTileIfNeeded({
				tileIndex,
				startTime: tileIndex * TILE_DURATION_S,
				endTime: (tileIndex + 1) * TILE_DURATION_S,
				gain,
				height: dataHeight,
				tileWidthPx,
				paletteId,
			});
			const bitmap = tileCache.current?.get(tileId)?.bitmap;
			nextTiles.push({
				tileId,
				left: tileIndex * tileDisplayWidthPx,
				width: tileDisplayWidthPx,
				height: dataHeight,
				canvasWidth: bitmap?.width ?? tileWidthPx,
				bitmap,
			});
		}
		setVisibleTiles(nextTiles);
	}, [
		pcmDataReady,
		currentDurationMs,
		container,
		zoom,
		scrollLeft,
		containerWidth,
		requestTileIfNeeded,
		gain,
		dataHeight,
		paletteId,
		tileCache,
	]);

	// lastTileTimestamp 用来在 Worker 返回新瓦片后重新读取缓存。
	// biome-ignore lint/correctness/useExhaustiveDependencies: Worker 时间戳用于主动触发缓存重读
	useEffect(() => {
		updateVisibleTiles();
	}, [updateVisibleTiles, lastTileTimestamp]);

	return { visibleTiles, updateVisibleTiles };
}
