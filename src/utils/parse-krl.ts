import {
	type LyricLine,
	type LyricWord,
	newLyricLine,
	newLyricWord,
} from "../types/ttml";

const TIME = /\[(\d{2,}):(\d{2}):(\d{2})\]/g;

function parseTime(tag: string): number {
	const [minutes, seconds, hundredths] = tag
		.slice(1, -1)
		.split(":")
		.map(Number);
	const time = minutes * 60000 + seconds * 1000 + hundredths * 10;
	if (seconds >= 60 || !Number.isSafeInteger(time)) {
		throw new Error(`Invalid KRL timestamp: ${tag}`);
	}
	return time;
}

function parseSyllables(text: string) {
	const matches = [...text.matchAll(TIME)];
	if (!matches.length || matches[0].index !== 0) {
		throw new Error("KRL syllables must start with a timestamp");
	}
	return matches.map((match, index) => {
		const word = text.slice(
			match.index + match[0].length,
			matches[index + 1]?.index,
		);
		if (!word || /[[\]{}|>]/.test(word)) {
			throw new Error("Invalid KRL syllable");
		}
		return { word, startTime: parseTime(match[0]) };
	});
}

export function parseKrl(content: string): LyricLine[] {
	const lines: LyricLine[] = [];
	for (const [index, source] of content
		.replace(/^\uFEFF/, "")
		.split(/\r?\n/)
		.entries()) {
		if (!source.trim()) continue;
		try {
			const line = newLyricLine();
			let time: number | undefined;
			let pending: LyricWord | undefined;
			let prefix = "";
			const close = (endTime: number) => {
				if (time !== undefined && endTime < time) {
					throw new Error("KRL timestamps must be in order");
				}
				if (pending) {
					pending.endTime = endTime;
					const lastRuby = pending.ruby?.at(-1);
					if (lastRuby) lastRuby.endTime = endTime;
				}
				pending = undefined;
				time = endTime;
			};
			const add = (text: string) => {
				if (time === undefined) throw new Error("Missing KRL start timestamp");
				pending = { ...newLyricWord(), word: prefix + text, startTime: time };
				prefix = "";
				line.words.push(pending);
				return pending;
			};

			const tokens =
				source.match(/\[\d{2,}:\d{2}:\d{2}\]|\{[^{}]*\}|[^[\]{}]+/g) ?? [];
			if (tokens.join("") !== source) throw new Error("Malformed KRL syntax");
			for (const token of tokens) {
				if (token.startsWith("[")) {
					close(parseTime(token));
				} else if (token.startsWith("{")) {
					const match = /^\{([^|]+)\|([^>]*)?(?:>([^>]+))?\}$/.exec(token);
					if (!match) throw new Error("Invalid KRL annotation");
					const ruby = match[2] ? parseSyllables(match[2]) : [];
					const kana = match[3] ? parseSyllables(match[3]) : [];
					if (!ruby.length && !kana.length)
						throw new Error("Empty KRL annotation");
					if (
						ruby.length &&
						kana.length &&
						(ruby.length !== kana.length ||
							ruby.some((part, i) => part.startTime !== kana[i].startTime))
					) {
						throw new Error("KRL ruby/kana timestamps do not match");
					}
					const parts = ruby.length ? ruby : kana;
					close(parts[0].startTime);
					const word = add(match[1]);
					word.romanWord = kana.map((part) => part.word).join("");
					if (ruby.length) {
						word.ruby = ruby.map((part, i) => ({
							...part,
							endTime: ruby[i + 1]?.startTime ?? 0,
						}));
					}
					for (const part of parts) {
						if (time !== undefined && part.startTime < time) {
							throw new Error("KRL timestamps must be in order");
						}
						time = part.startTime;
					}
				} else if (pending) {
					pending.word += token;
				} else if (time !== undefined) {
					add(token);
				} else {
					prefix += token;
				}
			}
			if (pending || prefix || !line.words.length)
				throw new Error("Missing KRL closing timestamp");
			line.startTime = line.words[0].startTime;
			line.endTime = line.words[line.words.length - 1].endTime;
			lines.push(line);
		} catch (error) {
			throw new Error(
				`KRL line ${index + 1}: ${error instanceof Error ? error.message : error}`,
			);
		}
	}
	if (!lines.length) throw new Error("No KRL lyrics found");
	return lines;
}
