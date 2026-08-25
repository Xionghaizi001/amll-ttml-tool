import { useMemo } from "react";

export const useWordBlank = (word: string) =>
	useMemo(
		() => word.length === 0 || (word.length > 0 && word.trim().length === 0),
		[word],
	);

export const parseRubyShortcut = (value: string) => {
	if (value.endsWith("|")) {
		return { word: value.slice(0, -1), enableRuby: true };
	}
	return { word: value, enableRuby: false };
};

export const getDisplayWordText = (
	t: (
		key: string,
		defaultValue: string,
		options?: { count?: number },
	) => string,
	word: string,
	isWordBlank: boolean,
	romanWord?: string,
	displayRomanizationInSync?: boolean,
) => {
	if (displayRomanizationInSync && romanWord?.trim()) return romanWord;
	if (word === "") return t("lyricWordView.empty", "空白");
	if (isWordBlank)
		return t("lyricWordView.spaceCount", "空格 x{count}", {
			count: word.length,
		});
	return word;
};
