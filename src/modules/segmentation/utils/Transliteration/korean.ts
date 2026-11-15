import {
	applyPronunciationRules,
	applyRomanMapping,
	splitHangulToJamos,
} from "koroman";
import type { LyricLine } from "$/types/ttml";

const koreanLanguage = "ko-Latn";

function romanizeSyllables(run: string): string[] {
	const { jamoString } = splitHangulToJamos(run);
	// Koroman also inserts ㄴ before a final 잎 when the preceding syllable has a coda.
	const pronunciation = applyPronunciationRules(
		jamoString.replace(/(?<=[ᆨ-ᇂ])잎$/, "닢"),
	);
	// A vowel survives for each source syllable, even when a consonant moves.
	// Koroman writes the two consonants of ㄹ assimilation as literal "ll".
	return Array.from(
		pronunciation.matchAll(/[ᄀ-ᄒl]?[ᅡ-ᅵ][ᆨ-ᇂl]?-?/g),
		([syllable]) => applyRomanMapping(syllable),
	);
}

function romanizeWords(words: LyricLine["words"]): string[] | undefined {
	const source = words.map(({ word }) => word.normalize("NFC"));
	const text = source.join("");
	const readings = words.map(() => "");
	let owner = 0;
	let wordEnd = source[0]?.length ?? 0;
	let hasReading = false;

	for (const { 0: run, index } of text.matchAll(/[가-힣]+/g)) {
		romanizeSyllables(run).forEach((syllable, offset) => {
			while (index + offset >= wordEnd) wordEnd += source[++owner].length;
			readings[owner] += (!offset && hasReading ? " " : "") + syllable;
		});
		hasReading = true;
	}
	return hasReading ? readings : undefined;
}

export function fillKoreanRomanization(line: LyricLine): boolean {
	const readings = romanizeWords(line.words);
	if (!readings) return false;

	const reading = readings.join("");
	const storedReading = line.romanLyricByLang?.[koreanLanguage]?.trim();
	if (!line.romanLyric.trim() && !storedReading) {
		line.romanLyric = reading;
		line.romanLyricByLang ??= {};
		line.romanLyricByLang[koreanLanguage] = reading;
	}

	// The TTML writer prefers timed words over line text for the same language.
	if (
		(storedReading && storedReading !== reading) ||
		line.wordRomanizationByLang?.[koreanLanguage]?.length
	)
		return true;

	const wordLanguage = line.wordRomanizationLang;
	if (
		wordLanguage
			? wordLanguage !== koreanLanguage
			: line.words.some(({ romanWord }) => romanWord.trim())
	) {
		return true;
	}
	line.wordRomanizationLang = koreanLanguage;
	line.words.forEach((word, index) => {
		if (!word.romanWord.trim()) word.romanWord = readings[index];
	});
	return true;
}
