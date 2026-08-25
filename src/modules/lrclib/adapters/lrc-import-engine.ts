import type { LrcLibImportPorts, LrcParserPort } from "$/application/lyrics";
import { convertLrcLibTrackToTTML } from "$/modules/lrclib/utils/converter";
import { extractParenthesesToBg } from "$/modules/lrclib/utils/extractParenthesesToBg";
import { parseLrc } from "$/modules/lrclib/utils/parse-lrc";
import { segmentationEngine } from "$/modules/segmentation/adapters/segmentation-engine";
import type { SegmentationConfig } from "$/modules/segmentation/types";

export const lrcParserEngine: LrcParserPort = { parse: parseLrc };

export const lrcLibImportEngine: LrcLibImportPorts<SegmentationConfig> = {
	convert: (track) => convertLrcLibTrackToTTML(track, parseLrc),
	extractBackground: extractParenthesesToBg,
	segment: segmentationEngine.segmentLines,
};
