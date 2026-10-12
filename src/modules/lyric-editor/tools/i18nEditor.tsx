import { Add16Regular } from "@fluentui/react-icons";
import { Grid, IconButton, Select, Text } from "@radix-ui/themes";
import { useAtomValue, useSetAtom } from "jotai";
import { useSetImmerAtom } from "jotai-immer";
import { type FC, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { addLanguageDialogAtom } from "$/states/dialogs";
import { lyricLinesAtom } from "$/states/main.ts";

export const I18nEditor: FC = () => {
	const { t } = useTranslation();
	const lyricLines = useAtomValue(lyricLinesAtom);
	const editLyricLines = useSetImmerAtom(lyricLinesAtom);
	const setAddLanguageDialog = useSetAtom(addLanguageDialogAtom);
	const placeholder = t(
		"ribbonBar.editMode.multilingualPlaceholder",
		"请选择语言",
	);
	const [selectedTranslationLang, setSelectedTranslationLang] = useState<
		string | undefined
	>();
	const [selectedRomanizationLang, setSelectedRomanizationLang] = useState<
		string | undefined
	>();
	const [selectedWordRomanizationLang, setSelectedWordRomanizationLang] =
		useState<string | undefined>();

	const translationLanguages = useMemo(() => {
		const languages = new Set<string>();
		let hasUndFallback = false;
		for (const line of lyricLines.lyricLines) {
			if (!line.translatedLyricByLang) continue;
			const entries = Object.entries(line.translatedLyricByLang);
			if (entries.length === 1 && entries[0][0] === "und") {
				hasUndFallback = true;
				continue;
			}
			for (const lang of Object.keys(line.translatedLyricByLang)) {
				languages.add(lang);
			}
		}
		if (languages.size === 0 && hasUndFallback) {
			languages.add("und");
		}
		return Array.from(languages);
	}, [lyricLines]);

	const romanizationLanguages = useMemo(() => {
		const languages = new Set<string>();
		let hasUndFallback = false;
		for (const line of lyricLines.lyricLines) {
			if (!line.romanLyricByLang) continue;
			const entries = Object.entries(line.romanLyricByLang);
			if (entries.length === 1 && entries[0][0] === "und") {
				hasUndFallback = true;
				continue;
			}
			for (const lang of Object.keys(line.romanLyricByLang)) {
				languages.add(lang);
			}
		}
		if (languages.size === 0 && hasUndFallback) {
			languages.add("und");
		}
		return Array.from(languages);
	}, [lyricLines]);

	const wordRomanizationLanguages = useMemo(() => {
		const languages = new Set<string>();
		let hasUndFallback = false;
		for (const line of lyricLines.lyricLines) {
			if (line.wordRomanizationLang === "und") {
				hasUndFallback = true;
			}
			if (!line.wordRomanizationByLang) continue;
			for (const lang of Object.keys(line.wordRomanizationByLang)) {
				languages.add(lang);
			}
		}
		if (languages.size === 0 && hasUndFallback) {
			languages.add("und");
		}
		return Array.from(languages);
	}, [lyricLines]);

	const currentTranslationLang = useMemo(() => {
		let matchedLang: string | undefined;
		for (const line of lyricLines.lyricLines) {
			const byLang = line.translatedLyricByLang;
			if (!byLang) continue;
			const keys = Object.keys(byLang);
			if (keys.length === 1 && keys[0] === "und") {
				if (matchedLang && matchedLang !== "und") return undefined;
				matchedLang = "und";
				continue;
			}
			const matched = Object.entries(byLang).find(([, value]) => {
				const nextValue = value.trim().length > 0 ? value : "";
				return nextValue === line.translatedLyric && value.trim().length > 0;
			})?.[0];
			if (!matched) return undefined;
			if (matchedLang && matchedLang !== matched) return undefined;
			matchedLang = matched;
		}
		return matchedLang;
	}, [lyricLines]);

	const currentRomanizationLang = useMemo(() => {
		let matchedLang: string | undefined;
		for (const line of lyricLines.lyricLines) {
			const byLang = line.romanLyricByLang;
			if (!byLang) continue;
			const keys = Object.keys(byLang);
			if (keys.length === 1 && keys[0] === "und") {
				if (matchedLang && matchedLang !== "und") return undefined;
				matchedLang = "und";
				continue;
			}
			const matched = Object.entries(byLang).find(([, value]) => {
				const nextValue = value.trim().length > 0 ? value : "";
				return nextValue === line.romanLyric && value.trim().length > 0;
			})?.[0];
			if (!matched) return undefined;
			if (matchedLang && matchedLang !== matched) return undefined;
			matchedLang = matched;
		}
		return matchedLang;
	}, [lyricLines]);

	const currentWordRomanizationLang = useMemo(() => {
		let matchedLang: string | undefined;
		for (const line of lyricLines.lyricLines) {
			if (line.wordRomanizationLang === "und") {
				if (matchedLang && matchedLang !== "und") return undefined;
				matchedLang = "und";
				continue;
			}
			const byLang = line.wordRomanizationByLang;
			if (!byLang) continue;
			let lineMatched: string | undefined;
			for (const [lang, romans] of Object.entries(byLang)) {
				if (romans.length === 0) continue;
				let matches = true;
				for (const word of line.words) {
					if (word.word.trim().length === 0) continue;
					const match = romans.find(
						(r) => r.startTime === word.startTime && r.endTime === word.endTime,
					);
					const roman = match?.text ?? "";
					if (roman.trim().length === 0) continue;
					if (word.romanWord !== roman) {
						matches = false;
						break;
					}
				}
				if (matches) {
					lineMatched = lang;
					break;
				}
			}
			if (!lineMatched) return undefined;
			if (matchedLang && matchedLang !== lineMatched) return undefined;
			matchedLang = lineMatched;
		}
		return matchedLang;
	}, [lyricLines]);

	const applyTranslationLang = useCallback(
		function applyTranslationLangInner(lang: string) {
			const previousLang = selectedTranslationLang ?? currentTranslationLang;
			if (lang === "und") {
				if (previousLang && previousLang !== lang) {
					editLyricLines((state) => {
						for (const line of state.lyricLines) {
							line.translatedLyricByLang ??= {};
							line.translatedLyricByLang[previousLang] =
								line.translatedLyric ?? "";
						}
					});
				}
				setAddLanguageDialog({
					open: true,
					target: "translation",
					onSubmit: (nextLang) => {
						editLyricLines((state) => {
							for (const line of state.lyricLines) {
								const byLang = line.translatedLyricByLang;
								if (!byLang || !byLang.und) continue;
								byLang[nextLang] = byLang.und;
								delete byLang.und;
							}
						});
						applyTranslationLangInner(nextLang);
					},
				});
				return;
			}
			setSelectedTranslationLang(lang);
			editLyricLines((state) => {
				for (const line of state.lyricLines) {
					if (
						previousLang &&
						previousLang !== lang &&
						(previousLang !== "und" ||
							line.translatedLyricByLang?.und !== undefined)
					) {
						line.translatedLyricByLang ??= {};
						line.translatedLyricByLang[previousLang] =
							line.translatedLyric ?? "";
					}
					line.translatedLyric = line.translatedLyricByLang?.[lang] ?? "";
				}
			});
		},
		[
			currentTranslationLang,
			editLyricLines,
			selectedTranslationLang,
			setAddLanguageDialog,
		],
	);

	const applyRomanizationLang = useCallback(
		function applyRomanizationLangInner(lang: string) {
			const previousLang = selectedRomanizationLang ?? currentRomanizationLang;
			if (lang === "und") {
				if (previousLang && previousLang !== lang) {
					editLyricLines((state) => {
						for (const line of state.lyricLines) {
							line.romanLyricByLang ??= {};
							line.romanLyricByLang[previousLang] = line.romanLyric ?? "";
						}
					});
				}
				setAddLanguageDialog({
					open: true,
					target: "romanization",
					onSubmit: (nextLang) => {
						editLyricLines((state) => {
							for (const line of state.lyricLines) {
								const byLang = line.romanLyricByLang;
								if (!byLang || !byLang.und) continue;
								byLang[nextLang] = byLang.und;
								delete byLang.und;
							}
						});
						applyRomanizationLangInner(nextLang);
					},
				});
				return;
			}
			setSelectedRomanizationLang(lang);
			editLyricLines((state) => {
				for (const line of state.lyricLines) {
					if (
						previousLang &&
						previousLang !== lang &&
						(previousLang !== "und" || line.romanLyricByLang?.und !== undefined)
					) {
						line.romanLyricByLang ??= {};
						line.romanLyricByLang[previousLang] = line.romanLyric ?? "";
					}
					line.romanLyric = line.romanLyricByLang?.[lang] ?? "";
				}
			});
		},
		[
			currentRomanizationLang,
			editLyricLines,
			selectedRomanizationLang,
			setAddLanguageDialog,
		],
	);

	const applyWordRomanizationLang = useCallback(
		function applyWordRomanizationLangInner(lang: string) {
			const previousLang =
				selectedWordRomanizationLang ?? currentWordRomanizationLang;
			setSelectedWordRomanizationLang(lang);
			editLyricLines((state) => {
				for (const line of state.lyricLines) {
					if (previousLang) {
						line.wordRomanizationByLang ??= {};
						line.wordRomanizationByLang[previousLang] = line.words
							.filter((word) => word.romanWord.trim().length > 0)
							.map((word) => ({
								startTime: word.startTime,
								endTime: word.endTime,
								text: word.romanWord,
							}));
					}
					const romanWords = line.wordRomanizationByLang?.[lang] ?? [];
					line.wordRomanizationLang = lang;
					if (romanWords.length === 0) {
						for (const word of line.words) {
							word.romanWord = "";
						}
						continue;
					}
					for (const word of line.words) {
						if (word.word.trim().length === 0) {
							word.romanWord = "";
							continue;
						}
						const match = romanWords.find(
							(r) =>
								r.startTime === word.startTime && r.endTime === word.endTime,
						);
						word.romanWord = match?.text ?? "";
					}
				}
			});
		},
		[currentWordRomanizationLang, editLyricLines, selectedWordRomanizationLang],
	);

	const openAddTranslationDialog = useCallback(() => {
		setAddLanguageDialog({
			open: true,
			target: "translation",
			onSubmit: (lang) => {
				editLyricLines((state) => {
					const hasLanguageMap = state.lyricLines.some(
						(line) => Object.keys(line.translatedLyricByLang ?? {}).length > 0,
					);
					for (const line of state.lyricLines) {
						line.translatedLyricByLang ??= {};
						if (!(lang in line.translatedLyricByLang)) {
							line.translatedLyricByLang[lang] = hasLanguageMap
								? ""
								: (line.translatedLyric ?? "");
						}
					}
				});
				applyTranslationLang(lang);
			},
		});
	}, [applyTranslationLang, editLyricLines, setAddLanguageDialog]);

	const openAddRomanizationDialog = useCallback(() => {
		setAddLanguageDialog({
			open: true,
			target: "romanization",
			onSubmit: (lang) => {
				editLyricLines((state) => {
					const hasLanguageMap = state.lyricLines.some(
						(line) => Object.keys(line.romanLyricByLang ?? {}).length > 0,
					);
					for (const line of state.lyricLines) {
						line.romanLyricByLang ??= {};
						if (!(lang in line.romanLyricByLang)) {
							line.romanLyricByLang[lang] = hasLanguageMap
								? ""
								: (line.romanLyric ?? "");
						}
					}
				});
				applyRomanizationLang(lang);
			},
		});
	}, [applyRomanizationLang, editLyricLines, setAddLanguageDialog]);

	const openAddWordRomanizationDialog = useCallback(() => {
		setAddLanguageDialog({
			open: true,
			target: "word-romanization",
			onSubmit: (lang) => {
				editLyricLines((state) => {
					const hasLanguageMap = state.lyricLines.some(
						(line) => Object.keys(line.wordRomanizationByLang ?? {}).length > 0,
					);
					for (const line of state.lyricLines) {
						line.wordRomanizationByLang ??= {};
						if (!(lang in line.wordRomanizationByLang)) {
							line.wordRomanizationByLang[lang] = hasLanguageMap
								? []
								: line.words
										.filter((word) => word.romanWord.trim().length > 0)
										.map((word) => ({
											startTime: word.startTime,
											endTime: word.endTime,
											text: word.romanWord,
										}));
						}
					}
				});
				applyWordRomanizationLang(lang);
			},
		});
	}, [applyWordRomanizationLang, editLyricLines, setAddLanguageDialog]);

	return (
		<Grid columns="0fr 1fr auto" gap="2" gapY="1" flexGrow="1" align="center">
			<Text wrap="nowrap" size="1">
				{t("ribbonBar.editMode.translation", "翻译")}
			</Text>
			<Select.Root
				value={
					selectedTranslationLang &&
					translationLanguages.includes(selectedTranslationLang)
						? selectedTranslationLang
						: currentTranslationLang
				}
				onValueChange={applyTranslationLang}
				disabled={translationLanguages.length === 0}
				size="1"
			>
				<Select.Trigger placeholder={placeholder} />
				<Select.Content>
					{translationLanguages.map((lang) => (
						<Select.Item key={lang} value={lang}>
							{lang}
						</Select.Item>
					))}
				</Select.Content>
			</Select.Root>
			<IconButton
				variant="soft"
				size="1"
				onClick={openAddTranslationDialog}
				aria-label={t("addLanguageDialog.addTranslation", "新增翻译语言")}
			>
				<Add16Regular />
			</IconButton>
			<Text wrap="nowrap" size="1">
				{t("ribbonBar.editMode.romanization", "音译")}
			</Text>
			<Select.Root
				value={
					selectedRomanizationLang &&
					romanizationLanguages.includes(selectedRomanizationLang)
						? selectedRomanizationLang
						: currentRomanizationLang
				}
				onValueChange={applyRomanizationLang}
				disabled={romanizationLanguages.length === 0}
				size="1"
			>
				<Select.Trigger placeholder={placeholder} />
				<Select.Content>
					{romanizationLanguages.map((lang) => (
						<Select.Item key={lang} value={lang}>
							{lang}
						</Select.Item>
					))}
				</Select.Content>
			</Select.Root>
			<IconButton
				variant="soft"
				size="1"
				onClick={openAddRomanizationDialog}
				aria-label={t("addLanguageDialog.addRomanization", "新增音译语言")}
			>
				<Add16Regular />
			</IconButton>
			<Text wrap="nowrap" size="1">
				{t("ribbonBar.editMode.wordRomanization", "逐字音译")}
			</Text>
			<Select.Root
				value={
					selectedWordRomanizationLang &&
					wordRomanizationLanguages.includes(selectedWordRomanizationLang)
						? selectedWordRomanizationLang
						: currentWordRomanizationLang
				}
				onValueChange={applyWordRomanizationLang}
				disabled={wordRomanizationLanguages.length === 0}
				size="1"
			>
				<Select.Trigger placeholder={placeholder} />
				<Select.Content>
					{wordRomanizationLanguages.map((lang) => (
						<Select.Item key={lang} value={lang}>
							{lang}
						</Select.Item>
					))}
				</Select.Content>
			</Select.Root>
			<IconButton
				variant="soft"
				size="1"
				onClick={openAddWordRomanizationDialog}
				aria-label={t(
					"addLanguageDialog.addWordRomanization",
					"新增逐字音译语言",
				)}
			>
				<Add16Regular />
			</IconButton>
		</Grid>
	);
};
