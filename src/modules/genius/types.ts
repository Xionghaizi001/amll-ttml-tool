import type { AnnotatedLine, GeniusResult } from "./parser";

export type GeniusSong = {
	kind: "song";
	url: string;
	title?: string;
	artist?: string;
	artistNames?: string[];
	album?: string;
	lyrics: AnnotatedLine[];
};

export type GeniusResponse =
	| GeniusSong
	| { kind: "search" | "album"; results: GeniusResult[] };

export type GeniusError =
	| "invalidInput"
	| "connectionFailed"
	| "unavailable"
	| "noLyrics";
