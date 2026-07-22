import { useAtomValue, useSetAtom, useStore } from "jotai";
import { useEffect, useRef } from "react";
import { uid } from "uid";
import {
	lyricLinesAtom,
	projectIdAtom,
	reviewFreezeAtom,
	reviewOperationLogAtom,
	reviewOperationRedoStackAtom,
	reviewSessionAtom,
	saveFileNameAtom,
} from "$/states/main";
import type { TTMLLyric } from "$/types/ttml";
import { log, error as logError } from "$/utils/logging";
import { queryTtmlByContentHash } from "$/utils/ttml-content-hash";
import ReviewPage from "./services/page-service";
import {
	getReviewHistoryByHash,
	saveReviewHistory,
} from "./services/review-history-db";
import {
	createReviewStructuredSnapshot,
	rebindReviewStructuredSnapshot,
} from "./services/structured-snapshot";

const cloneLyric = (data: TTMLLyric): TTMLLyric => {
	return JSON.parse(JSON.stringify(data)) as TTMLLyric;
};

export const useReviewSessionLifecycle = () => {
	const store = useStore();
	const reviewSession = useAtomValue(reviewSessionAtom);
	const lyricLines = useAtomValue(lyricLinesAtom);
	const saveFileName = useAtomValue(saveFileNameAtom);
	const projectId = useAtomValue(projectIdAtom);
	const setReviewFreeze = useSetAtom(reviewFreezeAtom);
	const setReviewOperationLog = useSetAtom(reviewOperationLogAtom);
	const setReviewOperationRedoStack = useSetAtom(reviewOperationRedoStackAtom);
	const reviewPendingRef = useRef(false);
	const reviewProjectIdRef = useRef(projectId);
	const reviewPendingLyricRef = useRef(lyricLines);
	const reviewSessionKeyRef = useRef<string | null>(null);

	useEffect(() => {
		if (!reviewSession) {
			reviewPendingRef.current = false;
			reviewSessionKeyRef.current = null;
			setReviewFreeze(null);
			setReviewOperationLog([]);
			setReviewOperationRedoStack([]);
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
		setReviewOperationLog([]);
		setReviewOperationRedoStack([]);
		log("[review]", "session set", {
			prNumber: reviewSession.prNumber,
			fileName: reviewSession.fileName,
			projectId,
		});
	}, [
		projectId,
		reviewSession,
		setReviewFreeze,
		setReviewOperationLog,
		setReviewOperationRedoStack,
		store,
	]);

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
		const sessionKey = reviewSessionKeyRef.current;
		reviewPendingRef.current = false;
		const captureSnapshot = async () => {
			try {
				const { contentHash, matches } = await queryTtmlByContentHash(
					snapshot,
					getReviewHistoryByHash,
				);
				if (reviewSessionKeyRef.current !== sessionKey) return;
				const structure = matches[0]
					? rebindReviewStructuredSnapshot(matches[0].structure, snapshot)
					: createReviewStructuredSnapshot(snapshot, contentHash);
				setReviewFreeze({
					prNumber: reviewSession.prNumber,
					fileName: reviewSession.fileName,
					data: snapshot,
					structure,
				});
				await saveReviewHistory({
					id: uid(20),
					prNumber: reviewSession.prNumber,
					prTitle: reviewSession.prTitle,
					fileName: reviewSession.fileName,
					source: reviewSession.source,
					createdAt: Date.now(),
					contentHash,
					data: snapshot,
					structure,
				});
				log("[review]", "freeze set", {
					prNumber: reviewSession.prNumber,
					fileName: reviewSession.fileName,
					contentHash,
					matchedHistory: matches.length > 0,
				});
			} catch (cause) {
				logError("[review] failed to capture structured snapshot", cause);
				if (reviewSessionKeyRef.current === sessionKey) {
					reviewPendingRef.current = true;
				}
			}
		};
		void captureSnapshot();
	}, [lyricLines, projectId, reviewSession, saveFileName, setReviewFreeze]);
};

export default ReviewPage;
