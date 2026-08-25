import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

export interface PlaybackTimePort {
	readonly musicCurrentTime: number;
	onTimeUpdate(callback: (time: number) => void): void;
	offTimeUpdate(callback: (time: number) => void): void;
}

export function useAudioCursorSync({
	playback,
	zoom,
	scrollLeft,
	containerWidth,
	playheadCursorRef,
	playheadScrubHandleRef,
	auditionCursorRef,
}: {
	playback: PlaybackTimePort;
	zoom: number;
	scrollLeft: number;
	containerWidth: number;
	playheadCursorRef: React.RefObject<HTMLDivElement | null>;
	playheadScrubHandleRef: React.RefObject<HTMLDivElement | null>;
	auditionCursorRef: React.RefObject<HTMLDivElement | null>;
}) {
	const viewStateRef = useRef({ zoom, scrollLeft, containerWidth });

	useLayoutEffect(() => {
		viewStateRef.current = { zoom, scrollLeft, containerWidth };
	}, [zoom, scrollLeft, containerWidth]);

	const syncCursorsToDOM = useCallback(
		(timeInSeconds: number) => {
			const view = viewStateRef.current;
			const cursorPosition = timeInSeconds * view.zoom;
			const handleLeftPosition = cursorPosition - view.scrollLeft;
			if (playheadCursorRef.current)
				playheadCursorRef.current.style.left = `${cursorPosition}px`;
			if (auditionCursorRef.current)
				auditionCursorRef.current.style.left = `${cursorPosition}px`;
			if (playheadScrubHandleRef.current) {
				playheadScrubHandleRef.current.style.left = `${handleLeftPosition}px`;
				playheadScrubHandleRef.current.style.display =
					handleLeftPosition < 0 || handleLeftPosition > view.containerWidth
						? "none"
						: "block";
			}
		},
		[auditionCursorRef, playheadCursorRef, playheadScrubHandleRef],
	);

	useEffect(() => {
		syncCursorsToDOM(playback.musicCurrentTime);
		playback.onTimeUpdate(syncCursorsToDOM);
		return () => playback.offTimeUpdate(syncCursorsToDOM);
	}, [playback, syncCursorsToDOM]);

	// 暂停时不会发射进度，以视口变化作为触发器重新同步游标。
	// biome-ignore lint/correctness/useExhaustiveDependencies: 视口值用于主动触发暂停状态的游标同步
	useEffect(() => {
		syncCursorsToDOM(playback.musicCurrentTime);
	}, [playback, zoom, scrollLeft, containerWidth, syncCursorsToDOM]);
}
