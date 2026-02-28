/*
 * Copyright 2023-2025 Steve Xiao (stevexmh@qq.com) and contributors.
 *
 * 本源代码文件是属于 AMLL TTML Tool 项目的一部分。
 * This source code file is a part of AMLL TTML Tool project.
 * 本项目的源代码的使用受到 GNU GENERAL PUBLIC LICENSE version 3 许可证的约束，具体可以参阅以下链接。
 * Use of this source code is governed by the GNU GPLv3 license that can be found through the following link.
 *
 * https://github.com/Steve-xmh/amll-ttml-tool/blob/main/LICENSE
 */

/**
 * @fileoverview
 * 解析 TTML 歌词文档到歌词数组的解析器
 * 用于解析从 Apple Music 来的歌词文件，且扩展并支持翻译和音译文本。
 * @see https://www.w3.org/TR/2018/REC-ttml1-20181108/
 */

import { uid } from "uid";
import type {
	LyricLine,
	LyricWord,
	LyricWordBase,
	TTMLLyric,
	TTMLMetadata,
	TTMLRomanWord,
	TTMLVocalTag,
} from "../../../types/ttml.ts";
import { log } from "../../../utils/logging.ts";
import { parseTimespan } from "../../../utils/timestamp.ts";

interface LineMetadata {
	main: string;
	bg: string;
}

interface WordRomanMetadata {
	main: TTMLRomanWord[];
	bg: TTMLRomanWord[];
}

interface SpanNode {
	text: string;
	begin: string | null;
	end: string | null;
	role: string | null;
	lang: string | null;
	emptyBeat: string | null;
	ruby: string | null;
	children: SpanNode[];
	tail: string;
}

function localName(el: Element): string {
	return el.localName || el.tagName.split(":").pop() || el.tagName;
}

function getAttr(el: Element, target: string): string | null {
	const direct = el.getAttribute(target);
	if (direct !== null) {
		return direct;
	}
	for (const attr of Array.from(el.attributes)) {
		if (
			attr.localName === target ||
			attr.name === target ||
			attr.name.endsWith(`:${target}`)
		) {
			return attr.value;
		}
	}
	return null;
}

function parseSpan(spanEl: Element): SpanNode {
	const span: SpanNode = {
		text: "",
		begin: getAttr(spanEl, "begin"),
		end: getAttr(spanEl, "end"),
		role: getAttr(spanEl, "role"),
		lang: getAttr(spanEl, "lang"),
		emptyBeat: getAttr(spanEl, "empty-beat"),
		ruby: getAttr(spanEl, "ruby"),
		children: [],
		tail: "",
	};
	let lastChild: SpanNode | null = null;
	for (const node of Array.from(spanEl.childNodes)) {
		if (node.nodeType === Node.TEXT_NODE) {
			const text = node.textContent ?? "";
			if (lastChild) {
				lastChild.tail += text;
			} else {
				span.text += text;
			}
		} else if (node.nodeType === Node.ELEMENT_NODE) {
			const childEl = node as Element;
			if (localName(childEl) === "span") {
				const child = parseSpan(childEl);
				span.children.push(child);
				lastChild = child;
			}
		}
	}
	return span;
}

function flattenSpanText(span: SpanNode, skipRoles?: Set<string>): string {
	const skipCurrent = span.role ? skipRoles?.has(span.role) : false;
	let text = "";
	if (!skipCurrent) {
		text += span.text || "";
		for (const child of span.children) {
			text += flattenSpanText(child, skipRoles);
		}
	}
	text += span.tail || "";
	return text;
}

function flattenSpanInnerText(span: SpanNode, skipRoles?: Set<string>): string {
	const skipCurrent = span.role ? skipRoles?.has(span.role) : false;
	let text = "";
	if (!skipCurrent) {
		text += span.text || "";
		for (const child of span.children) {
			text += flattenSpanText(child, skipRoles);
		}
	}
	return text;
}

function collectRubyTextSpans(span: SpanNode): SpanNode[] {
	const results: SpanNode[] = [];
	if (span.ruby === "text") {
		results.push(span);
	}
	for (const child of span.children) {
		results.push(...collectRubyTextSpans(child));
	}
	return results;
}

function computeWordTiming(words: LyricWordBase[]): [number, number] {
	const filtered = words.filter((v) => v.word.trim().length > 0);
	const start =
		filtered.reduce(
			(pv, cv) => Math.min(pv, cv.startTime),
			Number.POSITIVE_INFINITY,
		) ?? 0;
	const end = filtered.reduce((pv, cv) => Math.max(pv, cv.endTime), 0);
	return [start === Number.POSITIVE_INFINITY ? 0 : start, end];
}

function createWordFromSpanElement(wordEl: Element): LyricWord | null {
	const begin = getAttr(wordEl, "begin");
	const end = getAttr(wordEl, "end");
	const spanNode = parseSpan(wordEl);
	const skipRoles = new Set(["x-translation", "x-roman"]);
	if (spanNode.ruby === "container") {
		const baseSpan = spanNode.children.find((child) => child.ruby === "base");
		const baseText = baseSpan
			? flattenSpanInnerText(baseSpan, skipRoles)
			: flattenSpanInnerText(spanNode, skipRoles);
		const rubyTextSpans = collectRubyTextSpans(spanNode);
		const containerStart = begin ? parseTimespan(begin) : null;
		const containerEnd = end ? parseTimespan(end) : null;
		const rubyWords: LyricWordBase[] = rubyTextSpans.map((rubySpan) => {
			const rubyBegin = rubySpan.begin
				? parseTimespan(rubySpan.begin)
				: containerStart ?? 0;
			const rubyEnd = rubySpan.end
				? parseTimespan(rubySpan.end)
				: containerEnd ?? 0;
			return {
				word: flattenSpanInnerText(rubySpan, skipRoles),
				startTime: rubyBegin,
				endTime: rubyEnd,
			};
		});
		const [rubyStart, rubyEnd] = computeWordTiming(rubyWords);
		const word: LyricWord = {
			id: uid(),
			word: baseText,
			startTime: containerStart ?? rubyStart,
			endTime: containerEnd ?? rubyEnd,
			obscene: false,
			emptyBeat: 0,
			romanWord: "",
			ruby: rubyWords.length > 0 ? rubyWords : undefined,
		};
		const emptyBeat = getAttr(wordEl, "empty-beat");
		if (emptyBeat) {
			word.emptyBeat = Number(emptyBeat);
		}
		const obscene = getAttr(wordEl, "obscene");
		if (obscene === "true") {
			word.obscene = true;
		}
		return word;
	}
	if (!begin || !end) {
		return null;
	}
	const wordText = flattenSpanInnerText(spanNode, skipRoles);
	const word: LyricWord = {
		id: uid(),
		word: wordText,
		startTime: parseTimespan(begin),
		endTime: parseTimespan(end),
		obscene: false,
		emptyBeat: 0,
		romanWord: "",
	};
	const emptyBeat = getAttr(wordEl, "empty-beat");
	if (emptyBeat) {
		word.emptyBeat = Number(emptyBeat);
	}
	const obscene = getAttr(wordEl, "obscene");
	if (obscene === "true") {
		word.obscene = true;
	}
	return word;
}

export function parseLyric(ttmlText: string): TTMLLyric {
	const domParser = new DOMParser();
	const ttmlDoc: XMLDocument = domParser.parseFromString(
		ttmlText,
		"application/xml",
	);

	log("ttml document parsed", ttmlDoc);

	const parseTranslationTextElement = (textEl: Element): LineMetadata | null => {
		let main = "";
		let bg = "";

		for (const node of Array.from(textEl.childNodes)) {
			if (node.nodeType === Node.TEXT_NODE) {
				main += node.textContent ?? "";
			} else if (node.nodeType === Node.ELEMENT_NODE) {
				if ((node as Element).getAttribute("ttm:role") === "x-bg") {
					bg += node.textContent ?? "";
				}
			}
		}

		main = main.trim();
		bg = bg
			.trim()
			.replace(/^[（(]/, "")
			.replace(/[)）]$/, "")
			.trim();

		if (main.length > 0 || bg.length > 0) {
			return { main, bg };
		}

		return null;
	};

	const parseRomanizationTextElement = (textEl: Element) => {
		const mainWords: TTMLRomanWord[] = [];
		const bgWords: TTMLRomanWord[] = [];
		let lineRomanMain = "";
		let lineRomanBg = "";
		let isWordByWord = false;

		for (const node of Array.from(textEl.childNodes)) {
			if (node.nodeType === Node.TEXT_NODE) {
				lineRomanMain += node.textContent ?? "";
			} else if (node.nodeType === Node.ELEMENT_NODE) {
				const el = node as Element;
				if (el.getAttribute("ttm:role") === "x-bg") {
					const nestedSpans = el.querySelectorAll("span[begin][end]");
					if (nestedSpans.length > 0) {
						isWordByWord = true;
						nestedSpans.forEach((span) => {
							let bgWordText = span.textContent ?? "";
							bgWordText = bgWordText
								.trim()
								.replace(/^[（(]/, "")
								.replace(/[)）]$/, "")
								.trim();

							bgWords.push({
								startTime: parseTimespan(span.getAttribute("begin") ?? ""),
								endTime: parseTimespan(span.getAttribute("end") ?? ""),
								text: bgWordText,
							});
						});
					} else {
						lineRomanBg += el.textContent ?? "";
					}
				} else if (el.hasAttribute("begin") && el.hasAttribute("end")) {
					isWordByWord = true;
					mainWords.push({
						startTime: parseTimespan(el.getAttribute("begin") ?? ""),
						endTime: parseTimespan(el.getAttribute("end") ?? ""),
						text: el.textContent ?? "",
					});
				}
			}
		}

		const wordData = isWordByWord ? { main: mainWords, bg: bgWords } : null;

		lineRomanMain = lineRomanMain.trim();
		lineRomanBg = lineRomanBg
			.trim()
			.replace(/^[（(]/, "")
			.replace(/[)）]$/, "")
			.trim();

		const lineData =
			lineRomanMain.length > 0 || lineRomanBg.length > 0
				? { main: lineRomanMain, bg: lineRomanBg }
				: null;

		return { lineData, wordData };
	};

	const itunesTranslations = new Map<string, LineMetadata>();
	const translationTextElements = ttmlDoc.querySelectorAll(
		"iTunesMetadata > translations > translation > text[for]",
	);

	translationTextElements.forEach((textEl) => {
		const key = textEl.getAttribute("for");
		if (!key) return;
		const parsed = parseTranslationTextElement(textEl);
		if (parsed) {
			itunesTranslations.set(key, parsed);
		}
	});

	const itunesTranslationsByLang = new Map<string, Map<string, LineMetadata>>();
	const itunesTimedTranslationsByLang = new Map<
		string,
		Map<string, LineMetadata>
	>();
	const translationElements = Array.from(
		ttmlDoc.querySelectorAll("iTunesMetadata > translations > translation"),
	);
	const hasLangTranslation = translationElements.some(
		(el) => (el.getAttribute("xml:lang") ?? "").trim().length > 0,
	);
	for (const translationEl of translationElements) {
		const langAttr = (translationEl.getAttribute("xml:lang") ?? "").trim();
		if (!langAttr && hasLangTranslation) continue;
		const lang = langAttr || "und";
		if (!itunesTranslationsByLang.has(lang)) {
			itunesTranslationsByLang.set(lang, new Map());
		}
		if (!itunesTimedTranslationsByLang.has(lang)) {
			itunesTimedTranslationsByLang.set(lang, new Map());
		}
		const langTranslations = itunesTranslationsByLang.get(lang);
		const langTimedTranslations = itunesTimedTranslationsByLang.get(lang);
		if (!langTranslations || !langTimedTranslations) continue;

		for (const textEl of translationEl.querySelectorAll("text[for]")) {
			const key = textEl.getAttribute("for");
			if (!key) continue;
			const parsed = parseTranslationTextElement(textEl);
			if (!parsed) continue;
			if (textEl.querySelector("span")) {
				langTimedTranslations.set(key, parsed);
				langTranslations.delete(key);
			} else {
				langTranslations.set(key, parsed);
			}
		}
	}

	const itunesLineRomanizations = new Map<string, LineMetadata>();
	const parseVocalValue = (value: string | string[] | null | undefined) => {
		if (!value) return [];
		const parts = Array.isArray(value) ? value : value.split(/[\s,]+/);
		return parts.map((v) => v.trim()).filter(Boolean);
	};

	const itunesWordRomanizations = new Map<string, WordRomanMetadata>();

	const romanizationTextElements = ttmlDoc.querySelectorAll(
		"iTunesMetadata > transliterations > transliteration > text[for]",
	);

	romanizationTextElements.forEach((textEl) => {
		const key = textEl.getAttribute("for");
		if (!key) return;
		const { lineData, wordData } = parseRomanizationTextElement(textEl);
		if (wordData) {
			itunesWordRomanizations.set(key, wordData);
		}
		if (lineData) {
			itunesLineRomanizations.set(key, lineData);
		}
	});

	const itunesLineRomanizationsByLang = new Map<string, Map<string, LineMetadata>>();
	const itunesWordRomanizationsByLang = new Map<
		string,
		Map<string, WordRomanMetadata>
	>();
	const transliterationElements = Array.from(
		ttmlDoc.querySelectorAll("iTunesMetadata > transliterations > transliteration"),
	);
	const hasLangTransliteration = transliterationElements.some(
		(el) => (el.getAttribute("xml:lang") ?? "").trim().length > 0,
	);
	const fallbackLineRomanizations = new Map<string, LineMetadata>();
	const fallbackWordRomanizations = new Map<string, WordRomanMetadata>();
	for (const transliterationEl of transliterationElements) {
		const langAttr = (transliterationEl.getAttribute("xml:lang") ?? "").trim();
		const useFallback = !langAttr;
		if (useFallback && hasLangTransliteration) continue;
		const lang = langAttr || "und";
		const lineRomanMap = useFallback
			? fallbackLineRomanizations
			: itunesLineRomanizationsByLang.get(lang) ??
				itunesLineRomanizationsByLang.set(lang, new Map()).get(lang);
		const wordRomanMap = useFallback
			? fallbackWordRomanizations
			: itunesWordRomanizationsByLang.get(lang) ??
				itunesWordRomanizationsByLang.set(lang, new Map()).get(lang);
		if (!lineRomanMap || !wordRomanMap) continue;

		for (const textEl of transliterationEl.querySelectorAll("text[for]")) {
			const key = textEl.getAttribute("for");
			if (!key) continue;
			const { lineData, wordData } = parseRomanizationTextElement(textEl);
			if (wordData) {
				wordRomanMap.set(key, wordData);
			}
			if (lineData) {
				lineRomanMap.set(key, lineData);
			}
		}
	}
	if (
		!hasLangTransliteration &&
		(fallbackWordRomanizations.size > 0 || fallbackLineRomanizations.size > 0)
	) {
		if (fallbackWordRomanizations.size > 0) {
			itunesWordRomanizationsByLang.set("und", fallbackWordRomanizations);
		}
		if (fallbackLineRomanizations.size > 0) {
			itunesLineRomanizationsByLang.set("und", fallbackLineRomanizations);
		}
	}

	const itunesTimedTranslations = new Map<string, LineMetadata>();
	const timedTranslationTextElements = ttmlDoc.querySelectorAll(
		"iTunesMetadata > translations > translation > text[for]",
	);

	timedTranslationTextElements.forEach((textEl) => {
		const key = textEl.getAttribute("for");
		if (!key) return;
		const parsed = parseTranslationTextElement(textEl);
		if (parsed && textEl.querySelector("span")) {
			itunesTimedTranslations.set(key, parsed);
			itunesTranslations.delete(key);
		}
	});

	let mainAgentId = "v1";

	const metadata: TTMLMetadata[] = [];
	for (const meta of ttmlDoc.querySelectorAll("meta")) {
		if (meta.tagName === "amll:meta") {
			const key = meta.getAttribute("key");
			if (key) {
				const value = meta.getAttribute("value");
				if (value) {
					const existing = metadata.find((m) => m.key === key);
					if (existing) {
						existing.value.push(value);
					} else {
						metadata.push({
							key,
							value: [value],
						});
					}
				}
			}
		}
	}

	const vocalTagMap = new Map<string, string>();
	const vocalContainers = ttmlDoc.querySelectorAll(
		"metadata > amll\\:vocals, metadata > vocals, amll\\:vocals, vocals",
	);
	for (const container of vocalContainers) {
		for (const vocal of container.querySelectorAll("vocal")) {
			const key = vocal.getAttribute("key");
			if (!key) continue;
			const value = vocal.getAttribute("value") ?? "";
			vocalTagMap.set(key, value);
		}
	}
	const vocalTags: TTMLVocalTag[] = Array.from(vocalTagMap.entries()).map(
		([key, value]) => ({ key, value }),
	);

	const songwriterElements = ttmlDoc.querySelectorAll(
		"iTunesMetadata > songwriters > songwriter",
	);
	if (songwriterElements.length > 0) {
		const songwriterValues: string[] = [];
		songwriterElements.forEach((el) => {
			const name = el.textContent?.trim();
			if (name) {
				songwriterValues.push(name);
			}
		});
		if (songwriterValues.length > 0) {
			metadata.push({
				key: "songwriter",
				value: songwriterValues,
			});
		}
	}

	for (const agent of ttmlDoc.querySelectorAll("ttm\\:agent")) {
		if (agent.getAttribute("type") === "person") {
			const id = agent.getAttribute("xml:id");
			if (id) {
				mainAgentId = id;
				break;
			}
		}
	}

	const lyricLines: LyricLine[] = [];

	function parseLineElement(
		lineEl: Element,
		isBG = false,
		isDuet = false,
		parentItunesKey: string | null = null,
		parentVocal: string | string[] | null = null,
	) {
		const startTimeAttr = lineEl.getAttribute("begin");
		const endTimeAttr = lineEl.getAttribute("end");

		let parsedStartTime = 0;
		let parsedEndTime = 0;

		if (startTimeAttr && endTimeAttr) {
			parsedStartTime = parseTimespan(startTimeAttr);
			parsedEndTime = parseTimespan(endTimeAttr);
		}

		const lineVocalAttr =
			lineEl.getAttribute("amll:vocal") ?? lineEl.getAttribute("vocal");
		const lineVocal = lineVocalAttr ?? (isBG ? parentVocal : null);
		const parsedLineVocal = parseVocalValue(lineVocal);
		const line: LyricLine = {
			id: uid(),
			words: [],
			translatedLyric: "",
			romanLyric: "",
			isBG,
			isDuet: isBG
				? isDuet
				: !!lineEl.getAttribute("ttm:agent") &&
					lineEl.getAttribute("ttm:agent") !== mainAgentId,
			startTime: parsedStartTime,
			endTime: parsedEndTime,
			ignoreSync: false,
			vocal: parsedLineVocal,
		};
		let haveBg = false;

		const itunesKey = isBG
			? parentItunesKey
			: lineEl.getAttribute("itunes:key");

		const romanWordData = itunesKey
			? itunesWordRomanizations.get(itunesKey)
			: undefined;
		const sourceRomanList = isBG ? romanWordData?.bg : romanWordData?.main;
		const availableRomanWords = sourceRomanList ? [...sourceRomanList] : [];

		if (itunesKey) {
			const timedTrans = itunesTimedTranslations.get(itunesKey);
			const lineTrans = itunesTranslations.get(itunesKey);

			if (isBG) {
				line.translatedLyric = timedTrans?.bg ?? lineTrans?.bg ?? "";
			} else {
				line.translatedLyric = timedTrans?.main ?? lineTrans?.main ?? "";
			}

			const lineRoman = itunesLineRomanizations.get(itunesKey);
			if (isBG) {
				line.romanLyric = lineRoman?.bg ?? "";
			} else {
				line.romanLyric = lineRoman?.main ?? "";
			}

			const translatedLyricByLang: Record<string, string> = {};
			for (const [lang, translations] of itunesTranslationsByLang.entries()) {
				const timedTranslations = itunesTimedTranslationsByLang.get(lang);
				const langTrans =
					timedTranslations?.get(itunesKey) ?? translations.get(itunesKey);
				if (!langTrans) continue;
				translatedLyricByLang[lang] = isBG
					? langTrans.bg ?? ""
					: langTrans.main ?? "";
			}
			if (Object.keys(translatedLyricByLang).length > 0) {
				line.translatedLyricByLang = translatedLyricByLang;
			}

			const romanLyricByLang: Record<string, string> = {};
			for (const [lang, romanizations] of itunesLineRomanizationsByLang.entries()) {
				const langRoman = romanizations.get(itunesKey);
				if (!langRoman) continue;
				romanLyricByLang[lang] = isBG
					? langRoman.bg ?? ""
					: langRoman.main ?? "";
			}
			if (Object.keys(romanLyricByLang).length > 0) {
				line.romanLyricByLang = romanLyricByLang;
			}

			const wordRomanizationByLang: Record<string, TTMLRomanWord[]> = {};
			for (const [lang, romanizations] of itunesWordRomanizationsByLang.entries()) {
				const langRoman = romanizations.get(itunesKey);
				const romanList = isBG ? langRoman?.bg : langRoman?.main;
				if (!romanList || romanList.length === 0) continue;
				wordRomanizationByLang[lang] = romanList;
			}
			if (Object.keys(wordRomanizationByLang).length > 0) {
				line.wordRomanizationByLang = wordRomanizationByLang;
			}
		}

		for (const wordNode of lineEl.childNodes) {
			if (wordNode.nodeType === Node.TEXT_NODE) {
				const word = wordNode.textContent ?? "";
				line.words.push({
					id: uid(),
					word: word,
					startTime: word.trim().length > 0 ? line.startTime : 0,
					endTime: word.trim().length > 0 ? line.endTime : 0,
					obscene: false,
					emptyBeat: 0,
					romanWord: "",
				});
			} else if (wordNode.nodeType === Node.ELEMENT_NODE) {
				const wordEl = wordNode as Element;
				const role = wordEl.getAttribute("ttm:role");

				if (wordEl.nodeName === "span" && role) {
					if (role === "x-bg") {
						parseLineElement(
							wordEl,
							true,
							line.isDuet,
							itunesKey,
							line.vocal?.length ? line.vocal : null,
						);
						haveBg = true;
					} else if (role === "x-translation") {
						// 没有 Apple Music 样式翻译时才使用内嵌翻译
						if (!line.translatedLyric) {
							line.translatedLyric = wordEl.innerHTML;
						}
					} else if (role === "x-roman") {
						if (!line.romanLyric) {
							line.romanLyric = wordEl.innerHTML;
						}
					}
				} else {
					const word = createWordFromSpanElement(wordEl);
					if (!word) continue;
					if (availableRomanWords.length > 0) {
						const matchIndex = availableRomanWords.findIndex(
							(r) =>
								r.startTime === word.startTime && r.endTime === word.endTime,
						);

						if (matchIndex !== -1) {
							word.romanWord = availableRomanWords[matchIndex].text;
							availableRomanWords.splice(matchIndex, 1);
						}
					}

					line.words.push(word);
				}
			}
		}

		if (!startTimeAttr || !endTimeAttr) {
			line.startTime = line.words
				.filter((w) => w.word.trim().length > 0)
				.reduce(
					(pv, cv) => Math.min(pv, cv.startTime),
					Number.POSITIVE_INFINITY,
				);
			line.endTime = line.words
				.filter((w) => w.word.trim().length > 0)
				.reduce((pv, cv) => Math.max(pv, cv.endTime), 0);
		}

		if (line.isBG) {
			const firstWord = line.words[0];
			if (firstWord && /^[（(]/.test(firstWord.word)) {
				firstWord.word = firstWord.word.substring(1);
				if (firstWord.word.length === 0) {
					line.words.shift();
				}
			}

			const lastWord = line.words[line.words.length - 1];
			if (lastWord && /[)）]$/.test(lastWord.word)) {
				lastWord.word = lastWord.word.substring(0, lastWord.word.length - 1);
				if (lastWord.word.length === 0) {
					line.words.pop();
				}
			}
		}

		if (haveBg) {
			const bgLine = lyricLines.pop();
			lyricLines.push(line);
			if (bgLine) lyricLines.push(bgLine);
		} else {
			lyricLines.push(line);
		}
	}

	for (const lineEl of ttmlDoc.querySelectorAll("body p[begin][end]")) {
		parseLineElement(lineEl, false, false, null, null);
	}

	log("finished ttml load", lyricLines, metadata);

	return {
		metadata,
		lyricLines: lyricLines,
		vocalTags,
	};
}
