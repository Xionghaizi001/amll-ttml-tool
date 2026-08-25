import { type LyricLine, newLyricLine, newLyricWord } from "$/types/ttml";

interface ParsedEvent {
	time: number;
	text: string;
	index: number;
}

/**
 * 支持丢弃空行、trim 歌词，以及把同时间戳的后两行识别为翻译和音译。
 */
export function parseLrc(lrcContent: string): LyricLine[] {
	const lines = lrcContent.split(/\r?\n/);
	const parsedEvents: ParsedEvent[] = [];
	const timeTagRegex = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
	let globalIndex = 0;

	for (const line of lines) {
		const text = line.replace(timeTagRegex, "").trim();
		for (const match of line.matchAll(timeTagRegex)) {
			const minutes = Number.parseInt(match[1], 10);
			const seconds = Number.parseInt(match[2], 10);
			const fraction = Number.parseFloat(match[3] ? `0.${match[3]}` : "0");
			parsedEvents.push({
				time: Math.round((minutes * 60 + seconds + fraction) * 1000),
				text,
				index: globalIndex++,
			});
		}
	}

	parsedEvents.sort(
		(left, right) => left.time - right.time || left.index - right.index,
	);
	const lyricLines: LyricLine[] = [];
	let index = 0;
	while (index < parsedEvents.length) {
		const currentTime = parsedEvents[index].time;
		const group: ParsedEvent[] = [];
		while (
			index < parsedEvents.length &&
			parsedEvents[index].time === currentTime
		)
			group.push(parsedEvents[index++]);

		const textEvents = group.filter((event) => event.text.length > 0);
		if (textEvents.length === 0) continue;
		const endTime = parsedEvents[index]?.time ?? currentTime + 10000;
		const createLine = (text: string) => {
			const line = newLyricLine();
			const word = newLyricWord();
			word.word = text;
			word.startTime = currentTime;
			word.endTime = endTime;
			line.words = [word];
			line.startTime = currentTime;
			line.endTime = endTime;
			return line;
		};

		const mainLine = createLine(textEvents[0].text);
		mainLine.translatedLyric = textEvents[1]?.text ?? "";
		mainLine.romanLyric = textEvents[2]?.text ?? "";
		lyricLines.push(mainLine);
		for (const extraEvent of textEvents.slice(3))
			lyricLines.push(createLine(extraEvent.text));
	}

	return lyricLines;
}
