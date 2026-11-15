import { type DefaultTreeAdapterTypes, parse, parseFragment } from "parse5";
import { GENIUS_ORIGIN, parseGeniusLink } from "./urls";

type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;

type Run = { text: string; style: number };
type SourceLine = Run[];

export type GeniusResult = {
	title: string;
	artist?: string;
	album?: string;
	path: string;
	kind: "song" | "album";
};

export type AnnotatedLine = {
	text: string;
	background?: string[];
	songPart?: string;
	singers: string[];
};

const elements = (
	root: Node,
	predicate: (node: Element) => boolean,
): Element[] => {
	const found: Element[] = [];
	const visit = (node: Node) => {
		if ("tagName" in node && predicate(node)) found.push(node);
		if ("childNodes" in node) node.childNodes.forEach(visit);
	};
	visit(root);
	return found;
};

const attr = (node: Element, name: string) =>
	node.attrs.find((attribute) => attribute.name === name)?.value;
const hasClass = (node: Element, pattern: RegExp) =>
	(attr(node, "class") ?? "").split(/\s+/).some((name) => pattern.test(name));
const excluded = (node: Element) =>
	["script", "style", "noscript", "svg", "button"].includes(node.tagName) ||
	attr(node, "data-exclude-from-selection") === "true" ||
	hasClass(node, /^LyricsHeader__|^Lyrics__Footer/);

function sourceLines(root: Node, omit = excluded): SourceLine[] {
	const lines: SourceLine[] = [[]];
	const newline = () => lines.push([]);
	const visit = (node: Node, style: number) => {
		if ("value" in node) {
			// Genius breaks lyric lines with <br>. Also accept literal line breaks
			// from the clipboard or older page markup.
			node.value.split(/\r?\n/).forEach((text, index) => {
				if (index) newline();
				if (text) lines[lines.length - 1].push({ text, style });
			});
		}
		if ("tagName" in node) {
			if (omit(node)) return;
			if (node.tagName === "br") {
				newline();
				return;
			}
			const inlineStyle = attr(node, "style") ?? "";
			if (
				["i", "em"].includes(node.tagName) ||
				/font-style:\s*(italic|oblique)/i.test(inlineStyle)
			)
				style |= 1;
			if (
				["b", "strong"].includes(node.tagName) ||
				/font-weight:\s*(bold|[6-9]00)/i.test(inlineStyle)
			)
				style |= 2;
		}
		if ("childNodes" in node) {
			const isBlock =
				"tagName" in node && ["div", "p", "li"].includes(node.tagName);
			if (isBlock && lines[lines.length - 1].length) newline();
			for (const child of node.childNodes) visit(child, style);
			if (isBlock && lines[lines.length - 1].length) newline();
		}
	};
	visit(root, 0);
	return lines;
}

const lineText = (runs: SourceLine) =>
	runs
		.map(({ text }) => text)
		.join("")
		.trim();

function splitBackground(line: SourceLine) {
	const full = line.map(({ text }) => text).join("");
	const stack: string[] = [];
	const groups: { start: number; end: number; text: string }[] = [];
	let start = 0;
	for (let index = 0; index < full.length; index++) {
		const char = full[index];
		if (char === "(" || char === "（") {
			if (!stack.length) start = index;
			stack.push(char === "(" ? ")" : "）");
		} else if (char === ")" || char === "）") {
			if (stack.pop() !== char) {
				stack.length = 0;
				continue;
			}
			if (stack.length) continue;
			const text = full
				.slice(start + 1, index)
				.replace(/[()（）]/g, "")
				.trim();
			if (text) groups.push({ start, end: index + 1, text });
		}
	}
	if (!groups.length) return { text: full.trim(), lead: line };

	// Preserve the style of text outside parentheses for lead singer detection.
	let offset = 0;
	const lead = line.map(({ text, style }) => {
		const end = offset + text.length;
		let cursor = offset;
		let retained = "";
		for (const group of groups) {
			if (group.end <= cursor || group.start >= end) continue;
			retained += full.slice(cursor, Math.max(cursor, group.start));
			cursor = Math.min(end, group.end);
		}
		retained += full.slice(cursor, end);
		offset = end;
		return { text: retained, style };
	});
	return {
		text: lineText(lead)
			.replace(/[ \t]{2,}/g, " ")
			.replace(/ +([,.;!?，。！？、；：])/g, "$1"),
		background: groups.map((group) => group.text),
		lead,
	};
}

const parts: Record<string, string> = {
	intro: "Intro",
	verse: "Verse",
	prechorus: "PreChorus",
	chorus: "Chorus",
	postchorus: "PostChorus",
	bridge: "Bridge",
	outro: "Outro",
	refrain: "Refrain",
	hook: "Hook",
	instrumental: "Instrumental",
	interlude: "Interlude",
	reprise: "Reprise",
	transition: "Transition",
	falsechorus: "FalseChorus",
	breakdown: "Breakdown",
	break: "Break",
	guitarsolo: "GuitarSolo",
	solo: "Solo",
};

const uniqueNames = (names: string[]) => [
	...new Map(names.map((name) => [name.toLowerCase(), name])).values(),
];
const singerNames = (text: string) =>
	uniqueNames(
		text
			.split(/\s*(?:&|\+|\/|\band\b|\bwith\b)\s*/i)
			.map((name) => name.trim())
			.filter(Boolean),
	);

function parseHeader(runs: SourceLine) {
	const text = lineText(runs);
	const bracket = /^\[([^\]]+)\]$/.exec(text);
	if (!bracket || bracket[1].includes("[")) return;
	const colon = text.search(/[:：]/);
	const label = (colon < 0 ? bracket[1] : text.slice(1, colon)).trim();
	const key = label
		.toLowerCase()
		.replace(/\s*\d+$/, "")
		.replace(/[-\s]/g, "");
	const part = Object.hasOwn(parts, key) ? parts[key] : undefined;
	if (colon < 0) return { label, part, singers: [], styles: undefined };

	// Genius can distinguish comma-separated vocalists with italics, bold
	// and their combination. An ampersand joins names sung in the same style.
	const groups: SourceLine[] = [[]];
	let prefix = true;
	for (const { text: runText, style } of runs) {
		let chunk = runText;
		if (prefix) {
			const index = chunk.search(/[:：]/);
			if (index < 0) continue;
			prefix = false;
			chunk = chunk.slice(index + 1);
		}
		chunk.split(",").forEach((segment, index) => {
			if (index) groups.push([]);
			groups[groups.length - 1].push({
				text: segment.replace(/\]\s*$/, ""),
				style,
			});
		});
	}

	const styles = new Map<number, string[]>();
	const singers: string[] = [];
	for (const group of groups) {
		const names = singerNames(lineText(group));
		singers.push(...names);
		const marks = new Set(
			group
				.filter(({ text }) => /[\p{L}\p{N}]/u.test(text))
				.map(({ style }) => style),
		);
		if (marks.size !== 1 || names.length === 0) continue;
		const mark = [...marks][0];
		if (!styles.has(mark)) styles.set(mark, names);
	}
	return {
		label,
		part,
		singers: uniqueNames(singers),
		styles:
			groups.length > 1 && styles.size === groups.length ? styles : undefined,
	};
}

function annotate(lines: SourceLine[]): AnnotatedLine[] {
	const parsed = lines.map((line) => ({ line, header: parseHeader(line) }));
	const knownSingers = new Set(
		parsed
			.flatMap(({ header }) => header?.singers ?? [])
			.map((name) => name.toLowerCase()),
	);
	const result: AnnotatedLine[] = [];
	let songPart: string | undefined;
	let singers: string[] = [];
	let styles: Map<number, string[]> | undefined;
	for (const { line, header } of parsed) {
		const text = lineText(line);
		if (!text) continue;
		if (header?.part) {
			songPart = header.part;
			singers = header.singers;
			styles = header.styles;
			continue;
		}
		if (header && !header.singers.length) {
			const names = singerNames(header.label.replaceAll(",", " & "));
			if (
				names.length &&
				names.every(
					(name) => knownSingers.has(name.toLowerCase()) || /^all$/i.test(name),
				)
			) {
				singers = names;
				styles = undefined;
				continue;
			}
		}
		const vocals = splitBackground(line);
		const marks = new Set(
			(vocals.text ? vocals.lead : line)
				.filter(({ text }) => /[\p{L}\p{N}]/u.test(text))
				.map(({ style }) => style),
		);
		const styledNames = [...marks].flatMap((mark) => styles?.get(mark) ?? []);
		result.push({
			text: vocals.text,
			background: vocals.background,
			songPart,
			singers:
				styledNames.length && [...marks].every((mark) => styles?.has(mark))
					? uniqueNames(styledNames)
					: singers,
		});
		songPart = undefined;
	}
	return result;
}

export function parsePastedLyrics(
	text: string,
	html?: string,
): AnnotatedLine[] {
	const rich = html ? annotate(sourceLines(parseFragment(html))) : [];
	return rich.length
		? rich
		: annotate(text.split(/\r?\n/).map((text) => [{ text, style: 0 }]));
}

export function parseGeniusSong(html: string) {
	const root = parse(html);
	const containers = elements(
		root,
		(node) => attr(node, "data-lyrics-container") === "true",
	);
	const lyrics = annotate(containers.flatMap((node) => sourceLines(node)));
	let title: string | undefined;
	let artistNames: string[] | undefined;
	let album: string | undefined;
	for (const node of elements(
		root,
		(node) =>
			node.tagName === "script" && attr(node, "type") === "application/ld+json",
	)) {
		try {
			const data = JSON.parse(lineText(sourceLines(node, () => false).flat()));
			if (data?.["@type"] !== "MusicRecording") continue;
			const list = (value: unknown) => (Array.isArray(value) ? value : [value]);
			const names = (value: unknown) =>
				list(value).flatMap((item) =>
					typeof item?.name === "string" ? [item.name] : [],
				);
			title = typeof data.name === "string" ? data.name : undefined;
			artistNames = names(data.byArtist);
			album = names(data.inAlbum)[0];
			break;
		} catch {
			// Lyrics can still be imported if the page lacks structured metadata.
		}
	}
	title ??= elements(root, (node) => node.tagName === "h1").map((node) =>
		lineText(sourceLines(node).flat()),
	)[0];
	return {
		lyrics,
		title,
		artist: artistNames?.join(", ") || undefined,
		artistNames,
		album,
	};
}

export function parseGeniusAlbum(html: string): GeniusResult[] {
	const root = parse(html);
	const album = elements(root, (node) => node.tagName === "h1").map((node) =>
		lineText(sourceLines(node).flat()),
	)[0];
	const rows = elements(root, (node) =>
		hasClass(node, /^(?:chart_row|AlbumTracklist__TrackRow.*)$/),
	);
	const seen = new Set<string>();
	return rows
		.flatMap((row) => elements(row, (node) => node.tagName === "a"))
		.flatMap((link) => {
			const href = attr(link, "href") ?? "";
			const target = parseGeniusLink(
				href.startsWith("/") ? GENIUS_ORIGIN + href : href,
			);
			const titleNode =
				elements(link, (node) =>
					hasClass(
						node,
						/^(?:chart_row-content-title|AlbumTracklist__TrackTitle.*)$/,
					),
				)[0] ?? link;
			const title = lineText(
				sourceLines(
					titleNode,
					(node) =>
						excluded(node) ||
						hasClass(node, /^chart_row-content-title-subtitle$/),
				).flat(),
			);
			if (!title || target?.kind !== "song" || seen.has(target.path)) return [];
			seen.add(target.path);
			return [{ title, album, path: target.path, kind: target.kind }];
		});
}
