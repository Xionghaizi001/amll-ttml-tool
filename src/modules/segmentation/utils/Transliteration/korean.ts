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

export function fillKoreanRomanization(line: LyricLine): boolean {
	let source = "";
	const owners: number[] = [];
	line.words.forEach(({ word }, index) => {
		const text = word.normalize("NFC");
		source += text;
		for (let offset = 0; offset < text.length; offset++) owners.push(index);
	});

	const readings = line.words.map(() => "");
	let hasKorean = false;
	for (const { 0: run, index } of source.matchAll(/[가-힣]+/g)) {
		const syllables = romanizeSyllables(run);
		syllables.forEach((syllable, offset) => {
			const owner = owners[index + offset];
			readings[owner] += (offset === 0 && hasKorean ? " " : "") + syllable;
		});
		hasKorean = true;
	}
	if (!hasKorean) return false;

	const reading = readings.join("");
	const storedReading = line.romanLyricByLang?.[koreanLanguage]?.trim();
	if (!line.romanLyric.trim() && !storedReading) {
		line.romanLyric = reading;
		line.romanLyricByLang ??= {};
		line.romanLyricByLang[koreanLanguage] = reading;
	}

	const hasManualWords = line.words.some(({ romanWord }) => romanWord.trim());
	const canFillWords =
		line.wordRomanizationLang === koreanLanguage ||
		(!line.wordRomanizationLang && !hasManualWords);
	// The TTML writer prefers timed words over line text for the same language.
	if (
		canFillWords &&
		(!storedReading || storedReading === reading) &&
		!line.wordRomanizationByLang?.[koreanLanguage]?.length
	) {
		line.wordRomanizationLang = koreanLanguage;
		line.words.forEach((word, index) => {
			if (!word.romanWord.trim()) word.romanWord = readings[index];
		});
	}
	return true;
}
