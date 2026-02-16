/*
 * Copyright 2023-2025 Steve Xiao (stevexmh@qq.com) and contributors.
 *
 * 本源代码文件是属于 AMLL TTML Tool 项目的一部分。
 * This source code file is a part of AMLL TTML Tool project.
 * 本项目的源代码的使用受到 GNU GENERAL PUBLIC LICENSE version 3 许可证的约束，具体可以参阅以下链接。
 * Use of this source code is governed by the GNU GPLv3 license that can be found through the following link.
 *
 * https://github.com/Steve-xmh/amll-ttml-tool/blob/main/LICENSE
 */

import {
	Button,
	Checkbox,
	Flex,
	Grid,
	IconButton,
	RadioGroup,
	Select,
	Text,
	TextField,
} from "@radix-ui/themes";
import { Add16Regular } from "@fluentui/react-icons";
import { atom, useAtom, useAtomValue, useSetAtom, useStore } from "jotai";
import { useSetImmerAtom } from "jotai-immer";
import {
	type FC,
	forwardRef,
	useCallback,
	useEffect,
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
	LayoutMode,
	layoutModeAtom,
	showLineRomanizationAtom,
	showLineTranslationAtom,
	showWordRomanizationInputAtom,
} from "$/modules/settings/states";
import {
	editingTimeFieldAtom,
	lyricLinesAtom,
	requestFocusAtom,
	selectedLinesAtom,
	selectedWordsAtom,
	showEndTimeAsDurationAtom,
} from "$/states/main.ts";
import { addLanguageDialogAtom } from "$/states/dialogs";
import { type LyricLine, type LyricWord, newLyricLine } from "$/types/ttml";
import { msToTimestamp, parseTimespan } from "$/utils/timestamp.ts";
import { RibbonFrame, RibbonSection } from "./common";

const MULTIPLE_VALUES = Symbol("multiple-values");

function EditField<
	L extends Word extends true ? LyricWord : LyricLine,
	F extends keyof L,
	Word extends boolean | undefined = undefined,
>({
	label,
	isWordField,
	fieldName,
	formatter,
	parser,
	textFieldStyle,
}: {
	label: string;
	isWordField?: Word;
	fieldName: F;
	formatter: (v: L[F]) => string;
	parser: (v: string) => L[F];
	textFieldStyle?: React.CSSProperties;
}) {
	const [fieldInput, setFieldInput] = useState<string | undefined>(undefined);
	const [fieldPlaceholder, setFieldPlaceholder] = useState<string>("");
	const [durationInputInvalid, setDurationInputInvalid] = useState(false);
	const [showDurationInput, setShowDurationInput] = useAtom(
		showEndTimeAsDurationAtom,
	);
	const itemAtom = useMemo(
		() => (isWordField ? selectedWordsAtom : selectedLinesAtom),
		[isWordField],
	);

	const editLyricLines = useSetImmerAtom(lyricLinesAtom);
	const { t } = useTranslation();
	const setEditingTimeField = useSetAtom(editingTimeFieldAtom);

	const [requestFocus, setRequestFocus] = useAtom(requestFocusAtom);
	const inputRef = useRef<HTMLInputElement>(null);
	const durationInvalidTimerRef = useRef<number | null>(null);

	useEffect(() => {
		if (requestFocus === fieldName && !isWordField && inputRef.current) {
			inputRef.current.focus();
			setRequestFocus(null);
		}
	}, [requestFocus, fieldName, isWordField, setRequestFocus]);
	useEffect(
		() => () => {
			if (durationInvalidTimerRef.current !== null) {
				window.clearTimeout(durationInvalidTimerRef.current);
			}
		},
		[],
	);

	const hasErrorAtom = useMemo(
		() =>
			atom((get) => {
				if (fieldName !== "startTime" && fieldName !== "endTime") {
					return false;
				}

				const selectedItems = get(itemAtom);
				if (selectedItems.size === 0) return false;

				const lyricLines = get(lyricLinesAtom);

				if (isWordField) {
					const selectedWords = selectedItems;
					for (const line of lyricLines.lyricLines) {
						for (const word of line.words) {
							if (selectedWords.has(word.id)) {
								if (word.startTime > word.endTime) {
									return true;
								}
							}
						}
					}
				} else {
					const selectedLines = selectedItems;
					for (const line of lyricLines.lyricLines) {
						if (selectedLines.has(line.id)) {
							if (line.startTime > line.endTime) {
								return true;
							}
						}
					}
				}
				return false;
			}),
		[fieldName, isWordField, itemAtom],
	);
	const hasError = useAtomValue(hasErrorAtom);

	const currentValueAtom = useMemo(
		() =>
			atom((get) => {
				const selectedItems = get(itemAtom);
				const lyricLines = get(lyricLinesAtom);
				if (selectedItems.size === 0) return undefined;

				if (isWordField) {
					const selectedWords = selectedItems as Set<string>;
					const values = new Set();
					for (const line of lyricLines.lyricLines) {
						for (const word of line.words) {
							if (selectedWords.has(word.id)) {
								values.add(word[fieldName as keyof LyricWord]);
							}
						}
					}
					if (values.size === 1)
						return formatter(values.values().next().value as L[F]);
					return MULTIPLE_VALUES;
				}
				const selectedLines = selectedItems as Set<string>;
				const values = new Set();
				for (const line of lyricLines.lyricLines) {
					if (selectedLines.has(line.id)) {
						values.add(line[fieldName as keyof LyricLine]);
					}
				}
				if (values.size === 1)
					return formatter(values.values().next().value as L[F]);
				return MULTIPLE_VALUES;
			}),
		[fieldName, formatter, isWordField, itemAtom],
	);
	const currentValue = useAtomValue(currentValueAtom);
	const store = useStore();
	const durationValueAtom = useMemo(
		() =>
			atom((get) => {
				if (fieldName !== "endTime") return undefined;
				const selectedItems = get(itemAtom);
				const lyricLines = get(lyricLinesAtom);
				if (selectedItems.size === 0) return undefined;
				const durations = new Set<number>();
				if (isWordField) {
					const selectedWords = selectedItems as Set<string>;
					for (const line of lyricLines.lyricLines) {
						for (const word of line.words) {
							if (selectedWords.has(word.id)) {
								durations.add(word.endTime - word.startTime);
							}
						}
					}
				} else {
					const selectedLines = selectedItems as Set<string>;
					for (const line of lyricLines.lyricLines) {
						if (selectedLines.has(line.id)) {
							durations.add(line.endTime - line.startTime);
						}
					}
				}
				if (durations.size === 1) return durations.values().next().value;
				return MULTIPLE_VALUES;
			}),
		[fieldName, isWordField, itemAtom],
	);
	const durationValue = useAtomValue(durationValueAtom);
	const compareValue = useMemo(() => {
		if (fieldName === "endTime" && showDurationInput) {
			if (durationValue === MULTIPLE_VALUES) return "";
			if (typeof durationValue === "number") return String(durationValue);
			return "";
		}
		if (typeof currentValue === "string") return currentValue;
		return "";
	}, [currentValue, durationValue, fieldName, showDurationInput]);
	const flashInvalidDurationInput = useCallback(() => {
		setFieldInput("");
		setDurationInputInvalid(true);
		if (durationInvalidTimerRef.current !== null) {
			window.clearTimeout(durationInvalidTimerRef.current);
		}
		durationInvalidTimerRef.current = window.setTimeout(() => {
			setDurationInputInvalid(false);
		}, 300);
		inputRef.current?.animate(
			[
				{ backgroundColor: "var(--red-a5)" },
				{ backgroundColor: "var(--red-a3)" },
				{ backgroundColor: "transparent" },
			],
			{ duration: 300 },
		);
	}, []);

	const onInputFinished = useCallback(
		(rawValue: string) => {
			try {
				const selectedItems = store.get(itemAtom);
				if (fieldName === "endTime" && showDurationInput) {
					const trimmedValue = rawValue.trim();
					if (!/^\d+$/.test(trimmedValue)) {
						flashInvalidDurationInput();
						return;
					}
					const durationValue = Number(trimmedValue);
					if (!Number.isFinite(durationValue) || durationValue <= 0) {
						flashInvalidDurationInput();
						return;
					}
					editLyricLines((state) => {
						for (const line of state.lyricLines) {
							if (isWordField) {
								for (let wordIndex = 0; wordIndex < line.words.length; wordIndex++) {
									const word = line.words[wordIndex];
									if (!selectedItems.has(word.id)) continue;
									const nextWord = line.words[wordIndex + 1];
									const nextStartTime = nextWord?.startTime;
									const newEndTime = word.startTime + durationValue;
									if (
										typeof nextStartTime === "number" &&
										newEndTime < nextStartTime
									) {
										continue;
									}
									word.endTime = newEndTime;
								}
							} else if (selectedItems.has(line.id)) {
								line.endTime = line.startTime + durationValue;
							}
						}
						return state;
					});
					return;
				}
				const value = parser(rawValue);
				editLyricLines((state) => {
					for (const line of state.lyricLines) {
						if (isWordField) {
							for (const word of line.words) {
								if (selectedItems.has(word.id)) {
									(word as L)[fieldName] = value;
								}
							}
						} else {
							if (selectedItems.has(line.id)) {
								(line as L)[fieldName] = value;
							}
						}
					}
					return state;
				});
			} catch (err) {
				if (compareValue) setFieldInput(compareValue);
			}
		},
		[
			itemAtom,
			store,
			editLyricLines,
			compareValue,
			fieldName,
			isWordField,
			parser,
			showDurationInput,
			flashInvalidDurationInput,
		],
	);

	useLayoutEffect(() => {
		if (fieldName === "endTime" && showDurationInput) {
			if (durationValue === MULTIPLE_VALUES) {
				setFieldInput("");
				setFieldPlaceholder(
					t("ribbonBar.editMode.multipleValues", "多个值..."),
				);
				return;
			}
			if (typeof durationValue === "number") {
				setFieldInput(String(durationValue));
				setFieldPlaceholder("");
				return;
			}
			setFieldInput(undefined);
			setFieldPlaceholder("");
			return;
		}
		if (currentValue === MULTIPLE_VALUES) {
			setFieldInput("");
			setFieldPlaceholder(t("ribbonBar.editMode.multipleValues", "多个值..."));
			return;
		}
		setFieldInput(currentValue);
		setFieldPlaceholder("");
	}, [currentValue, durationValue, fieldName, showDurationInput, t]);

	return (
		<>
			{fieldName === "endTime" ? (
				<Button
					size="1"
					variant="ghost"
					onClick={() => setShowDurationInput((v) => !v)}
				>
					{showDurationInput
						? t("ribbonBar.editMode.duration", "持续时间")
						: label}
				</Button>
			) : (
				<Text wrap="nowrap" size="1">
					{label}
				</Text>
			)}
			<TextField.Root
				ref={inputRef}
				size="1"
				color={durationInputInvalid || hasError ? "red" : undefined}
				variant={durationInputInvalid || hasError ? "soft" : undefined}
				style={{ width: "8em", ...textFieldStyle }}
				value={fieldInput ?? ""}
				placeholder={fieldPlaceholder}
				disabled={fieldInput === undefined}
				onChange={(evt) => setFieldInput(evt.currentTarget.value)}
				onKeyDown={(evt) => {
					if (evt.key !== "Enter") return;
					onInputFinished(evt.currentTarget.value);
				}}
				onFocus={() => {
					if (
						!isWordField &&
						(fieldName === "startTime" || fieldName === "endTime")
					) {
						setEditingTimeField({
							isWord: false,
							field: fieldName as "startTime" | "endTime",
						});
					}
				}}
				onBlur={(evt) => {
					setEditingTimeField(null);

					if (evt.currentTarget.value === compareValue) return;
					onInputFinished(evt.currentTarget.value);
				}}
			/>
		</>
	);
}

function CheckboxField<
	L extends Word extends true ? LyricWord : LyricLine,
	F extends keyof L,
	V extends L[F] extends boolean ? boolean : never,
	Word extends boolean | undefined = undefined,
>({
	label,
	isWordField,
	fieldName,
	defaultValue,
}: {
	label: string;
	isWordField: Word;
	fieldName: F;
	defaultValue: V;
}) {
	const itemAtom = useMemo(
		() => (isWordField ? selectedWordsAtom : selectedLinesAtom),
		[isWordField],
	);

	const editLyricLines = useSetImmerAtom(lyricLinesAtom);
	const store = useStore();

	const currentValueAtom = useMemo(
		() =>
			atom((get) => {
				const selectedItems = get(itemAtom);
				const lyricLines = get(lyricLinesAtom);
				if (selectedItems.size) {
					if (isWordField) {
						const selectedWords = selectedItems as Set<string>;
						const values = new Set();
						for (const line of lyricLines.lyricLines) {
							for (const word of line.words) {
								if (selectedWords.has(word.id)) {
									values.add(word[fieldName as keyof LyricWord]);
								}
							}
						}
						if (values.size === 1) return values.values().next().value as L[F];
						return MULTIPLE_VALUES;
					}
					const selectedLines = selectedItems as Set<string>;
					const values = new Set();
					for (const line of lyricLines.lyricLines) {
						if (selectedLines.has(line.id)) {
							values.add(line[fieldName as keyof LyricLine]);
						}
					}
					if (values.size === 1) return values.values().next().value as L[F];
					return MULTIPLE_VALUES;
				}
				return undefined;
			}),
		[itemAtom, fieldName, isWordField],
	);
	const currentValue = useAtomValue(currentValueAtom);
	const isDisabledAtom = useMemo(
		() => atom((get) => get(itemAtom).size === 0),
		[itemAtom],
	);
	const isDisabled = useAtomValue(isDisabledAtom);
	const checkboxId = useId();

	return (
		<>
			<Text wrap="nowrap" size="1">
				<label htmlFor={checkboxId}>{label}</label>
			</Text>
			<Checkbox
				disabled={isDisabled}
				id={checkboxId}
				checked={
					currentValue
						? currentValue === MULTIPLE_VALUES
							? "indeterminate"
							: (currentValue as boolean)
						: defaultValue
				}
				onCheckedChange={(value) => {
					if (value === "indeterminate") return;
					editLyricLines((state) => {
						const selectedItems = store.get(itemAtom);
						for (const line of state.lyricLines) {
							if (isWordField) {
								for (const word of line.words) {
									if (selectedItems.has(word.id)) {
										(word as L)[fieldName] = value as L[F];
									}
								}
							} else {
								if (selectedItems.has(line.id)) {
									(line as L)[fieldName] = value as L[F];
								}
							}
						}
						return state;
					});
				}}
			/>
		</>
	);
}

function EditModeField({
	simpleModeLabel = "简单模式",
	advanceModeLabel = "高级模式",
}) {
	const [layoutMode, setLayoutMode] = useAtom(layoutModeAtom);
	return (
		<RadioGroup.Root
			value={layoutMode}
			onValueChange={(v) => setLayoutMode(v as LayoutMode)}
			size="1"
		>
			<Flex gapY="3" direction="column">
				<Text wrap="nowrap" size="1">
					<RadioGroup.Item value={LayoutMode.Simple}>
						{simpleModeLabel}
					</RadioGroup.Item>
				</Text>
				<Text wrap="nowrap" size="1">
					<RadioGroup.Item value={LayoutMode.Advance}>
						{advanceModeLabel}
					</RadioGroup.Item>
				</Text>
			</Flex>
		</RadioGroup.Root>
	);
}
// function DropdownField<
// 	L extends Word extends true ? LyricWord : LyricLine,
// 	F extends keyof L,
// 	Word extends boolean | undefined = undefined,
// >({
// 	label,
// 	isWordField,
// 	fieldName,
// 	children,
// 	defaultValue,
// }: {
// 	label: string;
// 	isWordField: Word;
// 	fieldName: F;
// 	defaultValue: L[F];
// 	children?: ReactNode | undefined;
// }) {
// 	const itemAtom = useMemo(
// 		() => (isWordField ? selectedWordsAtom : selectedLinesAtom),
// 		[isWordField],
// 	);
// 	const selectedItems = useAtomValue(itemAtom);

// 	const [lyricLines, editLyricLines] = useAtom(currentLyricLinesAtom);

// 	const currentValue = useMemo(() => {
// 		if (selectedItems.size) {
// 			if (isWordField) {
// 				const selectedWords = selectedItems as Set<string>;
// 				const values = new Set();
// 				for (const line of lyricLines.lyricLines) {
// 					for (const word of line.words) {
// 						if (selectedWords.has(word.id)) {
// 							values.add(word[fieldName as keyof LyricWord]);
// 						}
// 					}
// 				}
// 				if (values.size === 1)
// 					return {
// 						multiplieValues: false,
// 						value: values.values().next().value as L[F],
// 					} as const;
// 				return {
// 					multiplieValues: true,
// 					value: "",
// 				} as const;
// 			}
// 			const selectedLines = selectedItems as Set<string>;
// 			const values = new Set();
// 			for (const line of lyricLines.lyricLines) {
// 				if (selectedLines.has(line.id)) {
// 					values.add(line[fieldName as keyof LyricLine]);
// 				}
// 			}
// 			if (values.size === 1)
// 				return {
// 					multiplieValues: false,
// 					value: values.values().next().value as L[F],
// 				} as const;
// 			return {
// 				multiplieValues: true,
// 				value: "",
// 			} as const;
// 		}
// 		return undefined;
// 	}, [selectedItems, fieldName, isWordField, lyricLines]);

// 	return (
// 		<>
// 			<Text wrap="nowrap" size="1">
// 				{label}
// 			</Text>
// 			<Select.Root
// 				size="1"
// 				disabled={selectedItems.size === 0}
// 				defaultValue={defaultValue as string}
// 				value={(currentValue?.value as string) ?? ""}
// 				onValueChange={(value) => {
// 					editLyricLines((state) => {
// 						for (const line of state.lyricLines) {
// 							if (isWordField) {
// 								for (const word of line.words) {
// 									if (selectedItems.has(word.id)) {
// 										(word as L)[fieldName] = value as L[F];
// 									}
// 								}
// 							} else {
// 								if (selectedItems.has(line.id)) {
// 									(line as L)[fieldName] = value as L[F];
// 								}
// 							}
// 						}
// 						return state;
// 					});
// 				}}
// 			>
// 				<Select.Trigger
// 					placeholder={selectedItems.size > 0 ? "多个值..." : undefined}
// 				/>
// 				<Select.Content>{children}</Select.Content>
// 			</Select.Root>
// 		</>
// 	);
// }

const AuxiliaryDisplayField: FC = () => {
	const [showTranslation, setShowTranslation] = useAtom(
		showLineTranslationAtom,
	);
	const [showRomanization, setShowRomanization] = useAtom(
		showLineRomanizationAtom,
	);
	const [showWordRomanizationInput, setShowWordRomanizationInput] = useAtom(
		showWordRomanizationInputAtom,
	);
	const { t } = useTranslation();

	const idTranslation = useId();
	const idRomanization = useId();
	const idPerWord = useId();

	return (
		<Grid columns="1fr auto" gapX="4" gapY="1" flexGrow="1" align="center">
			<Text size="1" asChild>
				<label htmlFor={idTranslation}>
					{t("ribbonBar.editMode.showTranslation", "显示翻译行")}
				</label>
			</Text>
			<Checkbox
				id={idTranslation}
				checked={showTranslation}
				onCheckedChange={(c) => setShowTranslation(Boolean(c))}
			/>
			<Text size="1" asChild>
				<label htmlFor={idRomanization}>
					{t("ribbonBar.editMode.showRomanization", "显示音译行")}
				</label>
			</Text>
			<Checkbox
				id={idRomanization}
				checked={showRomanization}
				onCheckedChange={(c) => setShowRomanization(Boolean(c))}
			/>
			<Text size="1" asChild>
				<label htmlFor={idPerWord}>
					{t("ribbonBar.editMode.showWordRomanizationInput", "显示逐字音译")}
				</label>
			</Text>
			<Checkbox
				id={idPerWord}
				checked={showWordRomanizationInput}
				onCheckedChange={(c) => setShowWordRomanizationInput(Boolean(c))}
			/>
		</Grid>
	);
};

const MultilingualField: FC = () => {
	const { t } = useTranslation();
	const lyricLines = useAtomValue(lyricLinesAtom);
	const editLyricLines = useSetImmerAtom(lyricLinesAtom);
	const setAddLanguageDialog = useSetAtom(addLanguageDialogAtom);
	const placeholder = t(
		"ribbonBar.editMode.multilingualPlaceholder",
		"请选择语言",
	);

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
			for (const [lang, value] of entries) {
				if (value.trim().length > 0) {
					languages.add(lang);
				}
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
			for (const [lang, value] of entries) {
				if (value.trim().length > 0) {
					languages.add(lang);
				}
			}
		}
		if (languages.size === 0 && hasUndFallback) {
			languages.add("und");
		}
		return Array.from(languages);
	}, [lyricLines]);

	const wordRomanizationLanguages = useMemo(() => {
		const languages = new Set<string>();
		for (const line of lyricLines.lyricLines) {
			if (!line.wordRomanizationByLang) continue;
			for (const [lang, words] of Object.entries(
				line.wordRomanizationByLang,
			)) {
				if (words.length > 0) {
					languages.add(lang);
				}
			}
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
			if (lang === "und") {
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
			editLyricLines((state) => {
				for (const line of state.lyricLines) {
					line.translatedLyric = line.translatedLyricByLang?.[lang] ?? "";
				}
			});
		},
		[editLyricLines, setAddLanguageDialog],
	);

	const applyRomanizationLang = useCallback(
		function applyRomanizationLangInner(lang: string) {
			if (lang === "und") {
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
			editLyricLines((state) => {
				for (const line of state.lyricLines) {
					line.romanLyric = line.romanLyricByLang?.[lang] ?? "";
				}
			});
		},
		[editLyricLines, setAddLanguageDialog],
	);

	const applyWordRomanizationLang = useCallback(
		function applyWordRomanizationLangInner(lang: string) {
			if (lang === "und") {
				setAddLanguageDialog({
					open: true,
					target: "word-romanization",
					onSubmit: (nextLang) => {
						editLyricLines((state) => {
							for (const line of state.lyricLines) {
								const byLang = line.wordRomanizationByLang;
								if (!byLang || !byLang.und) continue;
								byLang[nextLang] = byLang.und;
								delete byLang.und;
							}
						});
						applyWordRomanizationLangInner(nextLang);
					},
				});
				return;
			}
			editLyricLines((state) => {
				for (const line of state.lyricLines) {
					const romanWords = line.wordRomanizationByLang?.[lang] ?? [];
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
							(r) => r.startTime === word.startTime && r.endTime === word.endTime,
						);
						word.romanWord = match?.text ?? "";
					}
				}
			});
		},
		[editLyricLines, setAddLanguageDialog],
	);

	const openAddTranslationDialog = useCallback(() => {
		setAddLanguageDialog({
			open: true,
			target: "translation",
			onSubmit: (lang) => {
				editLyricLines((state) => {
					for (const line of state.lyricLines) {
						line.translatedLyricByLang ??= {};
						line.translatedLyricByLang[lang] = line.translatedLyric ?? "";
						line.translatedLyric = line.translatedLyricByLang[lang] ?? "";
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
					for (const line of state.lyricLines) {
						line.romanLyricByLang ??= {};
						line.romanLyricByLang[lang] = line.romanLyric ?? "";
						line.romanLyric = line.romanLyricByLang[lang] ?? "";
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
					for (const line of state.lyricLines) {
						line.wordRomanizationByLang ??= {};
						const romanWords = line.words
							.filter((word) => word.romanWord.trim().length > 0)
							.map((word) => ({
								startTime: word.startTime,
								endTime: word.endTime,
								text: word.romanWord,
							}));
						line.wordRomanizationByLang[lang] = romanWords;
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
				value={currentTranslationLang}
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
				value={currentRomanizationLang}
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
				value={currentWordRomanizationLang}
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
				aria-label={t("addLanguageDialog.addWordRomanization", "新增逐字音译语言")}
			>
				<Add16Regular />
			</IconButton>
		</Grid>
	);
};

export const EditModeRibbonBar: FC = forwardRef<HTMLDivElement>(
	(_props, ref) => {
		const editLyricLines = useSetImmerAtom(lyricLinesAtom);
		const { t } = useTranslation();

		return (
			<RibbonFrame ref={ref}>
				<RibbonSection label={t("ribbonBar.editMode.new", "新建")}>
					<Grid columns="1" gap="1" gapY="1" flexGrow="1" align="center">
						<Button
							size="1"
							variant="soft"
							onClick={() =>
								editLyricLines((draft) => {
									draft.lyricLines.push(newLyricLine());
								})
							}
						>
							{t("ribbonBar.editMode.lyricLine", "歌词行")}
						</Button>
					</Grid>
				</RibbonSection>
				<RibbonSection label={t("ribbonBar.editMode.lineTiming", "行时间戳")}>
					<Grid columns="0fr 1fr" gap="2" gapY="1" flexGrow="1" align="center">
						<EditField
							label={t("ribbonBar.editMode.startTime", "起始时间")}
							fieldName="startTime"
							parser={parseTimespan}
							formatter={msToTimestamp}
						/>
						<EditField
							label={t("ribbonBar.editMode.endTime", "结束时间")}
							fieldName="endTime"
							parser={parseTimespan}
							formatter={msToTimestamp}
						/>
					</Grid>
				</RibbonSection>
				<RibbonSection label={t("ribbonBar.editMode.lineProperties", "行属性")}>
					<Grid columns="0fr 0fr" gap="4" gapY="1" flexGrow="1" align="center">
						<CheckboxField
							label={t("ribbonBar.editMode.bgLyric", "背景歌词")}
							defaultValue={false}
							isWordField={false}
							fieldName="isBG"
						/>
						<CheckboxField
							label={t("ribbonBar.editMode.duetLyric", "对唱歌词")}
							isWordField={false}
							fieldName="isDuet"
							defaultValue={false}
						/>
						<CheckboxField
							label={t("ribbonBar.editMode.ignoreSync", "忽略打轴")}
							isWordField={false}
							fieldName="ignoreSync"
							defaultValue={false}
						/>
					</Grid>
				</RibbonSection>
				<RibbonSection label={t("ribbonBar.editMode.wordTiming", "词时间戳")}>
					<Grid columns="0fr 1fr" gap="2" gapY="1" flexGrow="1" align="center">
						<EditField
							label={t("ribbonBar.editMode.startTime", "起始时间")}
							fieldName="startTime"
							isWordField
							parser={parseTimespan}
							formatter={msToTimestamp}
						/>
						<EditField
							label={t("ribbonBar.editMode.endTime", "结束时间")}
							fieldName="endTime"
							isWordField
							parser={parseTimespan}
							formatter={msToTimestamp}
						/>
						<EditField
							label={t("ribbonBar.editMode.emptyBeatCount", "空拍数量")}
							fieldName="emptyBeat"
							isWordField
							parser={(v) => {
								const parsed = Number.parseInt(v, 10);
								return Number.isNaN(parsed) ? 0 : parsed;
							}}
							formatter={String}
						/>
					</Grid>
				</RibbonSection>
				<RibbonSection
					label={t("ribbonBar.editMode.wordProperties", "单词属性")}
				>
					<Grid columns="0fr 1fr" gap="2" gapY="1" flexGrow="1" align="center">
						<EditField
							label={t("ribbonBar.editMode.wordContent", "单词内容")}
							fieldName="word"
							isWordField
							parser={(v) => v}
							formatter={(v) => v}
						/>
						<EditField
							label={t("ribbonBar.editMode.romanWord", "单词音译")}
							fieldName="romanWord"
							isWordField
							parser={(v) => v}
							formatter={(v) => v || ""}
						/>
						<CheckboxField
							label={t("ribbonBar.editMode.obscene", "不雅用语")}
							isWordField
							fieldName="obscene"
							defaultValue={false}
						/>
					</Grid>
				</RibbonSection>
				<RibbonSection
					label={t("ribbonBar.editMode.secondaryContent", "次要内容")}
				>
					<Grid columns="0fr 1fr" gap="2" gapY="1" flexGrow="1" align="center">
						<EditField
							label={t("ribbonBar.editMode.translatedLyric", "翻译歌词")}
							fieldName="translatedLyric"
							parser={(v) => v}
							formatter={(v) => v}
							textFieldStyle={{ width: "20em" }}
						/>
						<EditField
							label={t("ribbonBar.editMode.romanLyric", "音译歌词")}
							fieldName="romanLyric"
							parser={(v) => v}
							formatter={(v) => v}
							textFieldStyle={{ width: "20em" }}
						/>
					</Grid>
				</RibbonSection>
				<RibbonSection label={t("ribbonBar.editMode.multilingual", "多语言")}>
					<MultilingualField />
				</RibbonSection>
				<RibbonSection label={t("ribbonBar.editMode.layoutMode", "布局模式")}>
					<EditModeField
						simpleModeLabel={t(
							"settings.common.layoutModeOptions.simple",
							"简单模式",
						)}
						advanceModeLabel={t(
							"settings.common.layoutModeOptions.advance",
							"高级模式",
						)}
					/>
				</RibbonSection>
				<RibbonSection
					label={t("ribbonBar.editMode.auxiliaryLineDisplay", "辅助行显示")}
				>
					<AuxiliaryDisplayField />
				</RibbonSection>
			</RibbonFrame>
		);
	},
);

export default EditModeRibbonBar;
