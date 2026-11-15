import { recalculateDuetStates } from "$/modules/ttml-processor";
import {
	newLyricLine,
	newLyricWord,
	type TTMLAgent,
	type TTMLLyric,
} from "$/types/ttml";
import type { AnnotatedLine } from "./parser";

type ArtistCredit = { artist?: string; artistNames?: string[] };
const isEnsemble = (name: string) => /^all$/i.test(name);

export function resolveGeniusLines(
	lines: AnnotatedLine[],
	credit: ArtistCredit,
) {
	const creditedNames = credit.artistNames?.length
		? credit.artistNames
		: credit.artist
			? [credit.artist]
			: [];
	const defaultSingers = lines.every((line) => line.singers.length === 0)
		? creditedNames
		: [];
	type ResolvedLine = {
		text: string;
		songPart?: string;
		singers: string[];
		type: TTMLAgent["type"];
		isBG: boolean;
		standaloneBackground?: boolean;
	};
	const rows: ResolvedLine[] = [];
	let pending: ResolvedLine[] = [];
	const flushPending = () => {
		rows.push(...pending);
		pending = [];
	};

	for (const line of lines) {
		if (line.songPart) flushPending();

		const names = line.singers.length ? line.singers : defaultSingers;
		const type =
			names.length > 1 || names.some(isEnsemble) ? "group" : "person";
		const singers = [
			...new Set(
				names.map((name) => (isEnsemble(name) ? credit.artist || name : name)),
			),
		];
		const background = (line.background ?? []).map(
			(text): ResolvedLine => ({
				text,
				singers,
				type,
				isBG: true,
				standaloneBackground: true,
			}),
		);
		if (!line.text) {
			// Lines already independent in the source keep their own place.
			if (background.length) background[0].songPart = line.songPart;
			rows.push(...background);
			continue;
		}

		rows.push({
			text: line.text,
			songPart: line.songPart,
			singers,
			type,
			isBG: false,
		});
		// A lead paragraph can attach one phrase. Give earlier phrases priority.
		pending.push(...background);
		const next = pending.shift();
		if (next) rows.push({ ...next, standaloneBackground: undefined });
	}
	flushPending();
	return rows;
}

export function toGeniusProject(
	lines: AnnotatedLine[],
	info: ArtistCredit & { title?: string; album?: string },
): TTMLLyric {
	const agents = new Map<string, TTMLAgent>();
	const lyricLines = resolveGeniusLines(lines, info).map(
		({ text, songPart, singers: names, type, isBG, standaloneBackground }) => {
			let agent: TTMLAgent | undefined;
			if (names.length && (!isBG || standaloneBackground)) {
				const key = JSON.stringify([
					type,
					names.map((name) => name.toLowerCase()).sort(),
				]);
				agent = agents.get(key);
				if (!agent) {
					agent = {
						id: `v${agents.size + 1}`,
						type,
						names: [names.join(" & ")],
					};
					agents.set(key, agent);
				}
			}
			return {
				...newLyricLine(),
				words: [{ ...newLyricWord(), word: text }],
				isBG,
				standaloneBackground,
				songPart,
				agent: agent?.id,
			};
		},
	);
	const metadata = Object.entries({
		musicName: info.title,
		artists: info.artist,
		album: info.album,
	}).flatMap(([key, value]) => (value ? [{ key, value: [value] }] : []));
	const project = {
		lyricLines,
		metadata,
		agents: [...agents.values()],
		vocalTags: [],
	};
	recalculateDuetStates(project);
	return project;
}
