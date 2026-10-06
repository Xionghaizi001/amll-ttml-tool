import { atomWithStorage } from "jotai/utils";

// 与 AMLL 0.6.0 默认优化保持一致，避免关闭时间戳修正和提前开始后行尾高亮滞留。
export const amllNormalizeSpacesAtom = atomWithStorage(
	"amllOptimizeNormalizeSpaces",
	true,
);
export const amllResetLineTimestampsAtom = atomWithStorage(
	"amllOptimizeResetLineTimestamps",
	true,
);
export const amllConvertExcessiveBackgroundLinesAtom = atomWithStorage(
	"amllOptimizeConvertExcessiveBackgroundLines",
	false,
);
export const amllSyncMainAndBackgroundLinesAtom = atomWithStorage(
	"amllOptimizeSyncMainAndBackgroundLines",
	true,
);
export const amllCleanUnintentionalOverlapsAtom = atomWithStorage(
	"amllOptimizeCleanUnintentionalOverlaps",
	true,
);
export const amllTryAdvanceStartTimeAtom = atomWithStorage(
	"amllOptimizeTryAdvanceStartTime",
	true,
);
