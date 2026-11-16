import type { AnnotatedLine, GeniusResult } from "./parser";

export type GeniusSong = {
	kind: "song";
	title?: string;
	artist?: string;
	artistNames?: string[];
	album?: string;
	lyrics: AnnotatedLine[];
};

export type GeniusResults = {
	kind: "search" | "album";
	results: GeniusResult[];
};

export type GeniusResponse = GeniusSong | GeniusResults;

export type GeniusError =
	| "invalidInput"
	| "connectionFailed"
	| "unavailable"
	| "noLyrics";
