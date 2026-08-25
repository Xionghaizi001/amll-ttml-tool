import type { LyricLine, TTMLLyric } from "../../types/ttml";

export interface LrcLibTrackInput {
	name: string;
	artistName: string;
	albumName: string;
	plainLyrics: string | null;
	syncedLyrics: string | null;
}

export interface LrcLibImportOptions {
	extractBackground: boolean;
	autoSegment: boolean;
}

export interface LrcLibImportPorts<TConfig> {
	convert(track: LrcLibTrackInput): TTMLLyric;
	extractBackground(line: LyricLine): LyricLine[];
	segment(lines: LyricLine[], config: TConfig): LyricLine[];
}

export interface LrcParserPort {
	parse(content: string): LyricLine[];
}

export const parseLrcLyrics = (content: string, parser: LrcParserPort) =>
	parser.parse(content);

export function sanitizeTtmlFileName(name: string) {
	return `${name}.ttml`.replace(/[\\/:*?"<>|]/g, "_");
}

export function prepareLrcLibImport<TConfig>(
	track: LrcLibTrackInput,
	options: LrcLibImportOptions,
	segmentationConfig: TConfig,
	ports: LrcLibImportPorts<TConfig>,
) {
	let document = ports.convert(track);
	if (options.extractBackground) {
		document = {
			...document,
			lyricLines: document.lyricLines.flatMap(ports.extractBackground),
		};
	}
	if (options.autoSegment) {
		document = {
			...document,
			lyricLines: ports.segment(document.lyricLines, segmentationConfig),
		};
	}
	return {
		document,
		fileName: sanitizeTtmlFileName(`${track.artistName} - ${track.name}`),
	};
}
