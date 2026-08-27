import type { LocalizedText } from "@amll-ttml-tool/plugin-api";

/** Resolves a protocol LocalizedText against a BCP-47 locale with base-language fallback. */
export const localizeText = (text: LocalizedText, locale: string): string => {
	if (typeof text === "string") return text;
	return text[locale] ?? text[locale.split("-")[0]] ?? text.default;
};
