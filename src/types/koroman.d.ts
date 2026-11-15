// These exports are present in Koroman's ESM entry but are missing from its types
import "koroman";

declare module "koroman" {
	export function splitHangulToJamos(text: string): { jamoString: string };
	export function applyPronunciationRules(jamo: string): string;
	export function applyRomanMapping(jamo: string): string;
}
