import type { Result } from "$/application/lyrics/TtmlFormatService";
import {
	createTtmlFormatService,
	ttmlLyricToAmllResult as toAmllResult,
} from "$/application/lyrics/TtmlFormatService";
import {
	TranslationOutputMode,
	translationOutputModeAtom,
} from "$/modules/settings/states";
import { globalStore } from "$/states/store.ts";
import type { TTMLLyric } from "$/types/ttml";
import type {
	AmllLyricResult,
	AmllToTtmlOptions,
	GeneratorConfig,
	JsError,
	TtmlToAmllOptions,
} from "./types";
import {
	amllToTtml as rawAmllToTtml,
	amllToTtmlResult as rawAmllToTtmlResult,
	generateTtml as rawGenerateTtml,
	parseTtml as rawParseTtml,
	ttmlResultToAmll as rawTtmlResultToAmll,
	ttmlToAmll as rawTtmlToAmll,
} from "./wasm/ttml_processor_wasm";

export type { Result } from "$/application/lyrics/TtmlFormatService";
export type {
	AmllLyricResult,
	AmllToTtmlOptions,
	GeneratorConfig,
	TtmlToAmllOptions,
} from "./types";

const createService = (defaultConfig: Partial<GeneratorConfig> = {}) =>
	createTtmlFormatService(
		{
			parseTtml: rawParseTtml,
			generateTtml: rawGenerateTtml,
			ttmlToAmll: rawTtmlToAmll,
			amllToTtml: rawAmllToTtml,
			ttmlResultToAmll: rawTtmlResultToAmll,
			amllToTtmlResult: rawAmllToTtmlResult,
		},
		defaultConfig,
	);

const service = createService();

export function getDefaultGeneratorConfig(): Partial<GeneratorConfig> {
	return {
		useAppleFormatRules:
			globalStore.get(translationOutputModeAtom) ===
			TranslationOutputMode.AppleMusic,
	};
}

export const parseTTML = service.parseTTML as (
	content: string,
) => Result<unknown, JsError>;
export const generateTTML = service.generateTTML as (
	result: unknown,
	config?: Partial<GeneratorConfig>,
) => Result<string, JsError>;
export const ttmlToAmll = service.ttmlToAmll as (
	content: string,
	options?: Partial<TtmlToAmllOptions>,
) => Result<AmllLyricResult, JsError>;
export const amllToTTML = ((
	result: AmllLyricResult,
	options?: Partial<AmllToTtmlOptions>,
	config?: Partial<GeneratorConfig>,
) =>
	createService(getDefaultGeneratorConfig()).amllToTTML(
		result,
		options,
		config,
	) as Result<string, JsError>) as (
	result: AmllLyricResult,
	options?: Partial<AmllToTtmlOptions>,
	config?: Partial<GeneratorConfig>,
) => Result<string, JsError>;
export const ttmlResultToAmll = service.ttmlResultToAmll as (
	result: unknown,
	options?: Partial<TtmlToAmllOptions>,
) => Result<AmllLyricResult, JsError>;
export const amllToTTMLResult = service.amllToTTMLResult as (
	result: AmllLyricResult,
	options?: Partial<AmllToTtmlOptions>,
) => Result<unknown, JsError>;
export const ttmlLyricToAmllResult = toAmllResult as (
	ttmlLyric: TTMLLyric,
) => AmllLyricResult;
