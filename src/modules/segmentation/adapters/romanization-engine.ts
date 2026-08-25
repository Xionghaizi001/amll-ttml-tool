import type { RomanizationEnginePort } from "$/application/lyrics";
import { predictLineRomanization } from "$/modules/segmentation/utils/Transliteration/distributor";
import { applyRomanizationWarnings } from "$/modules/segmentation/utils/Transliteration/roman-warning";

export const romanizationEngine: RomanizationEnginePort = {
	predict: predictLineRomanization,
	applyWarnings: applyRomanizationWarnings,
};
