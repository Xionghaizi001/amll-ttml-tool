import type { SegmentationEnginePort } from "$/application/lyrics";
import type { SegmentationConfig } from "$/modules/segmentation/types";
import {
	recalculateWordTime,
	segmentLyricLines,
	segmentWord,
} from "$/modules/segmentation/utils/segmentation";

export const segmentationEngine: SegmentationEnginePort<SegmentationConfig> = {
	segmentLines: segmentLyricLines,
	segmentWord,
	recalculateWordTime,
};
