import { useEffect, useRef } from "react";
import { useAtomValue, useSetAtom, useStore } from "jotai";
import { log } from "$/utils/logging";
import {
	lyricLinesAtom,
	projectIdAtom,
	reviewFreezeAtom,
	reviewSessionAtom,
	reviewStagedAtom,
	saveFileNameAtom,
} from "$/states/main";
import type { TTMLLyric } from "$/types/ttml";
import ReviewPage from "./services/page-service";

const cloneLyric = (data: TTMLLyric): TTMLLyric => {
	return JSON.parse(JSON.stringify(data)) as TTMLLyric;
};

export const useReviewSessionLifecycle = () => {
	const store = useStore();
	const reviewSession = useAtomValue(reviewSessionAtom);
	const lyricLines = useAtomValue(lyricLinesAtom);
	const saveFileName = useAtomValue(saveFileNameAtom);
	const projectId = useAtomValue(projectIdAtom);
	const reviewFreeze = useAtomValue(reviewFreezeAtom);
	const setReviewFreeze = useSetAtom(reviewFreezeAtom);
	const setReviewStaged = useSetAtom(reviewStagedAtom);
	const reviewPendingRef = useRef(false);
	const reviewProjectIdRef = useRef(projectId);
	const reviewPendingLyricRef = useRef(lyricLines);
	const reviewSessionKeyRef = useRef<string | null>(null);

	useEffect(() => {
		if (!reviewSession) {
			reviewPendingRef.current = false;
			reviewSessionKeyRef.current = null;
			setReviewFreeze(null);
			setReviewStaged(null);
			log("[review]", "session cleared");
			return;
		}
		const nextKey = `${reviewSession.prNumber}:${reviewSession.fileName}`;
		if (reviewSessionKeyRef.current === nextKey) return;
		reviewSessionKeyRef.current = nextKey;
		reviewPendingRef.current = true;
		reviewProjectIdRef.current = projectId;
		reviewPendingLyricRef.current = store.get(lyricLinesAtom);
		setReviewFreeze(null);
		setReviewStaged(null);
		log("[review]", "session set", {
			prNumber: reviewSession.prNumber,
			fileName: reviewSession.fileName,
			projectId,
		});
	}, [projectId, reviewSession, setReviewFreeze, setReviewStaged, store]);

	useEffect(() => {
		if (!reviewSession || !reviewPendingRef.current) return;
		const lyricUpdated = lyricLines !== reviewPendingLyricRef.current;
		const fileReady =
			saveFileName === reviewSession.fileName ||
			projectId !== reviewProjectIdRef.current ||
			lyricUpdated;
		log("[review]", "pending check", {
			fileReady,
			saveFileName,
			sessionFileName: reviewSession.fileName,
			projectId,
			pendingProjectId: reviewProjectIdRef.current,
			lyricUpdated,
		});
		if (!fileReady) return;
		const snapshot = cloneLyric(lyricLines);
		setReviewFreeze({
			prNumber: reviewSession.prNumber,
			fileName: reviewSession.fileName,
			data: snapshot,
		});
		setReviewStaged(snapshot);
		log("[review]", "freeze and staged set", {
			prNumber: reviewSession.prNumber,
			fileName: reviewSession.fileName,
		});
		reviewPendingRef.current = false;
	}, [
		lyricLines,
		projectId,
		reviewSession,
		saveFileName,
		setReviewFreeze,
		setReviewStaged,
	]);

	useEffect(() => {
		if (!reviewSession || !reviewFreeze) return;
		if (reviewFreeze.prNumber !== reviewSession.prNumber) return;
		setReviewStaged(cloneLyric(lyricLines));
		log("[review]", "staged updated", {
			prNumber: reviewSession.prNumber,
			projectId,
		});
	}, [lyricLines, projectId, reviewFreeze, reviewSession, setReviewStaged]);
};

export default ReviewPage;
