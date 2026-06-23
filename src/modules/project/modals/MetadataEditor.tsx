import {
	Add16Regular,
	AlbumRegular,
	Delete16Regular,
	GlobeSearch20Regular,
	Info16Regular,
	MusicNote1Regular,
	NumberSymbol16Regular,
	Open16Regular,
	Person16Regular,
	Sparkle20Regular,
} from "@fluentui/react-icons";
import {
	Button,
	Dialog,
	Flex,
	Heading,
	IconButton,
	Spinner,
	Text,
	TextField,
} from "@radix-ui/themes";
import { AnimatePresence, motion } from "framer-motion";
import { useAtom } from "jotai";
import { useImmerAtom } from "jotai-immer";
import {
	memo,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
	getMeatdataSuggestion,
	type MetaSuggestionResult,
} from "$/modules/project/logic/meatdata-suggestion";
import {
	fetchNeteaseSongMeta,
	type NeteaseSongMeta,
} from "$/modules/ncm/services/meta-service";
import { fetchGithubUserProfile } from "$/modules/github/services/identity-service";
import { githubLoginAtom, githubPatAtom } from "$/modules/settings/states";
import { metadataEditorDialogAtom } from "$/states/dialogs.ts";
import { lyricLinesAtom } from "$/states/main.ts";
import type { TTMLLyric, TTMLMetadata } from "$/types/ttml";
import styles from "./MetadataEditor.module.css";
import {
	AppleMusicIcon,
	GithubIcon,
	NeteaseIcon,
	QQMusicIcon,
	SpotifyIcon,
} from "./PlatformIcons";

interface SelectOption {
	label: string;
	value: string;
	icon: ReactNode;
	isLinkable?: true;
	urlFormatter?: (value: string) => string | null;
	suggestion?: true;
	validation?: {
		verifier: (value: string) => boolean;
		message: string;
		/** red for true, orange for false */
		severe?: boolean;
	};
}

interface MetadataItemEditorProps {
	entry: TTMLMetadata | null;
	option: SelectOption;
	setLyricLines: (args: (prev: TTMLLyric) => void) => void;
	requestNeteaseMeta: (id: string) => Promise<void>;
}

const contentTransition = {
	duration: 0.3,
	ease: [0.2, 0.8, 0.2, 1],
} as const;

const contentVariants = {
	initial: { opacity: 0, y: 4, filter: "blur(4px)" },
	animate: { opacity: 1, y: 0, filter: "blur(0px)" },
	exit: { opacity: 0, y: -4, filter: "blur(4px)" },
} as const;

const splitDroppedValues = (text: string) =>
	text
		.split(/[\n,;/，；、|\\]/)
		.map((s) => s.trim())
		.filter((s) => s !== "");

interface MetadataValueEditorRowProps {
	value: string;
	valueIndex: number;
	values: string[];
	option: SelectOption;
	validation?: SelectOption["validation"];
	entryAutoSuggested?: boolean;
	inputRef: (el: HTMLInputElement | null) => void;
	isDragOver: boolean;
	setDragInputIndex: (value: number | null) => void;
	setIsDraggingCategory: (value: boolean) => void;
	updateValue: (index: number, value: string) => void;
	addValue: () => void;
	removeValue: (index: number) => void;
	setFocusIndex: (value: number) => void;
	applySuggestionValues: (suggestions: string[]) => void;
	requestNeteaseMeta: (id: string) => Promise<void>;
}

const MetadataValueEditorRow = memo(
	({
		value,
		valueIndex,
		values,
		option,
		validation,
		entryAutoSuggested,
		inputRef,
		isDragOver,
		setDragInputIndex,
		setIsDraggingCategory,
		updateValue,
		addValue,
		removeValue,
		setFocusIndex,
		applySuggestionValues,
		requestNeteaseMeta,
	}: MetadataValueEditorRowProps) => {
		const { t } = useTranslation();
		const [suggestions, setSuggestions] = useState<MetaSuggestionResult[]>([]);
		const [isFocused, setIsFocused] = useState(false);
		const [isFetchingMeta, setIsFetchingMeta] = useState(false);

		useEffect(() => {
			let active = true;
			if (!option.suggestion || entryAutoSuggested) {
				setSuggestions([]);
				return () => {
					active = false;
				};
			}

			const currentValue = value.trim();
			if (!currentValue) {
				setSuggestions([]);
				return () => {
					active = false;
				};
			}

			getMeatdataSuggestion(currentValue)
				.then((results) => {
					if (!active) return;
					if (results.length === 1) {
						const matchedValue = results[0]?.matchedValue;
						if (
							matchedValue &&
							currentValue.toLowerCase() === matchedValue.toLowerCase() &&
							currentValue !== matchedValue
						) {
							updateValue(valueIndex, matchedValue);
						}
					}
					setSuggestions(results);
				})
				.catch(() => {
					if (!active) return;
					setSuggestions([]);
				});

			return () => {
				active = false;
			};
		}, [entryAutoSuggested, option.suggestion, updateValue, value, valueIndex]);

		const itemHasError = validation
			? value.trim() !== "" && !validation.verifier(value)
			: false;
		const isDuplicate =
			value.trim() !== "" && values.filter((item) => item === value).length > 1;
		const hasAnyError = itemHasError || isDuplicate;
		const url = option.urlFormatter?.(value);
		const isValid = validation ? validation.verifier(value) : true;
		const isButtonEnabled = !!url && isValid;
		const hasSuggestion = suggestions.length > 0;
		const canFetchNeteaseMeta =
			option.value === "ncmMusicId" && !isFocused && value.trim() !== "";

		return (
			<Flex gap="2" align="center" className={styles.valueRow}>
				<TextField.Root
					data-metadata-input="true"
					ref={inputRef}
					value={value}
					className={`${styles.metadataInput} ${
						isDragOver ? styles.dragOverInput : ""
					}`}
					onFocus={() => setIsFocused(true)}
					onBlur={() => setIsFocused(false)}
					onChange={(e) => updateValue(valueIndex, e.currentTarget.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							addValue();
						} else if (e.key === "Backspace" && e.currentTarget.value === "") {
							if (e.repeat) return;

							e.preventDefault();
							removeValue(valueIndex);
							setFocusIndex(valueIndex > 0 ? valueIndex - 1 : 0);
						}
					}}
					onDragOver={(e) => {
						e.preventDefault();
						e.stopPropagation();
						setDragInputIndex(valueIndex);
					}}
					onDragLeave={() => setDragInputIndex(null)}
					onDrop={(e) => {
						e.preventDefault();
						e.stopPropagation();
						setDragInputIndex(null);
						setIsDraggingCategory(false);
						const text = e.dataTransfer.getData("text");
						if (text) updateValue(valueIndex, text);
					}}
					variant={hasAnyError ? "soft" : "surface"}
					color={
						itemHasError
							? validation?.severe
								? "red"
								: "orange"
							: isDuplicate
								? "red"
								: undefined
					}
				/>
				{hasSuggestion &&
					suggestions.length === 1 &&
					suggestions[0]?.matchedValue !== value && (
						<IconButton
							variant="soft"
							onClick={() => {
								applySuggestionValues(suggestions[0]?.values ?? []);
								setSuggestions([]);
							}}
							title={t("metadataDialog.applySuggestion", "应用建议")}
						>
							<Sparkle20Regular />
						</IconButton>
					)}
				{hasSuggestion && suggestions.length > 1 && (
					<Dialog.Root>
						<Dialog.Trigger>
							<IconButton
								variant="soft"
								title={t("metadataDialog.pickSuggestion", "选择匹配项")}
							>
								<Sparkle20Regular />
							</IconButton>
						</Dialog.Trigger>
						<Dialog.Content>
							<Dialog.Title>
								{t("metadataDialog.pickSuggestion", "选择匹配项")}
							</Dialog.Title>
							<Flex direction="column" gap="2">
								{suggestions.map((suggestion) => (
									<Dialog.Close key={suggestion.title}>
										<Button
											variant="soft"
											onClick={() => {
												applySuggestionValues(suggestion.values);
												setSuggestions([]);
											}}
										>
											{suggestion.title}
										</Button>
									</Dialog.Close>
								))}
							</Flex>
						</Dialog.Content>
					</Dialog.Root>
				)}
				{canFetchNeteaseMeta && (
					<IconButton
						variant="soft"
						disabled={isFetchingMeta}
						onClick={async () => {
							if (isFetchingMeta) return;
							const trimmed = value.trim();
							if (!trimmed) return;
							setIsFetchingMeta(true);
							try {
								await requestNeteaseMeta(trimmed);
							} finally {
								setIsFetchingMeta(false);
							}
						}}
						title={t("metadataDialog.fetchNeteaseMeta", "从网易云获取元数据")}
					>
						{isFetchingMeta ? <Spinner size="1" /> : <GlobeSearch20Regular />}
					</IconButton>
				)}
				{option.isLinkable && (
					<IconButton
						disabled={!isButtonEnabled}
						asChild={isButtonEnabled}
						variant="soft"
						title={t("metadataDialog.openLink", "打开链接")}
					>
						{isButtonEnabled ? (
							<a href={url || ""} target="_blank" rel="noopener noreferrer">
								<Open16Regular />
							</a>
						) : (
							<Open16Regular />
						)}
					</IconButton>
				)}
				<IconButton variant="soft" onClick={() => removeValue(valueIndex)}>
					<Delete16Regular />
				</IconButton>
			</Flex>
		);
	},
);

const MetadataItemEditor = memo(
	({
		entry,
		option,
		setLyricLines,
		requestNeteaseMeta,
	}: MetadataItemEditorProps) => {
		const { t } = useTranslation();
		const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
		const [focusIndex, setFocusIndex] = useState<number | null>(null);
		const [isDraggingCategory, setIsDraggingCategory] = useState(false);
		const [dragInputIndex, setDragInputIndex] = useState<number | null>(null);
		const values = entry?.value ?? [];
		const validation = option.validation;

		useEffect(() => {
			if (focusIndex === null) return;

			const targetInput = inputRefs.current[focusIndex];
			if (targetInput) {
				targetInput.focus();
				const len = targetInput.value.length;
				targetInput.setSelectionRange(len, len);
			}
			setFocusIndex(null);
		}, [focusIndex]);

		const editEntry = useCallback(
			(editor: (metadata: TTMLMetadata) => void) => {
				setLyricLines((prev) => {
					let metadata = prev.metadata.find(
						(item) => item.key === option.value,
					);
					if (!metadata) {
						metadata = { key: option.value, value: [] };
						prev.metadata.push(metadata);
					}
					editor(metadata);
				});
			},
			[option.value, setLyricLines],
		);

		const updateValue = useCallback(
			(index: number, value: string) => {
				editEntry((metadata) => {
					metadata.value[index] = value;
					metadata.autoSuggested = false;
				});
			},
			[editEntry],
		);

		const addValue = useCallback(
			(value = "") => {
				editEntry((metadata) => {
					metadata.value.push(value);
				});
				setFocusIndex(values.length);
			},
			[editEntry, values.length],
		);

		const removeValue = useCallback(
			(index: number) => {
				setLyricLines((prev) => {
					const metadataIndex = prev.metadata.findIndex(
						(item) => item.key === option.value,
					);
					if (metadataIndex === -1) return;

					prev.metadata[metadataIndex].value.splice(index, 1);
					if (prev.metadata[metadataIndex].value.length === 0) {
						prev.metadata.splice(metadataIndex, 1);
					}
				});
			},
			[option.value, setLyricLines],
		);

		const appendDroppedValues = useCallback(
			(text: string) => {
				const parts = splitDroppedValues(text);
				if (parts.length === 0) return;

				editEntry((metadata) => {
					const existingSet = new Set<string>();
					const emptyIndices: number[] = [];

					metadata.value.forEach((val, i) => {
						if (val.trim() === "") {
							emptyIndices.push(i);
						} else {
							existingSet.add(val);
						}
					});

					for (const part of parts) {
						if (existingSet.has(part)) continue;

						if (emptyIndices.length > 0) {
							const slotIndex = emptyIndices.shift();
							if (slotIndex !== undefined) metadata.value[slotIndex] = part;
						} else {
							metadata.value.push(part);
						}
						existingSet.add(part);
					}
					metadata.autoSuggested = false;
				});
			},
			[editEntry],
		);

		const applySuggestionValues = useCallback(
			(suggestions: string[]) => {
				const normalized = suggestions
					.map((item) => item.trim())
					.filter((item) => item !== "");
				if (normalized.length === 0) return;

				editEntry((metadata) => {
					const existingSet = new Set<string>();
					const emptyIndices: number[] = [];
					metadata.value.forEach((val, i) => {
						if (val.trim() === "") {
							emptyIndices.push(i);
						} else {
							existingSet.add(val);
						}
					});

					for (const suggestion of normalized) {
						if (existingSet.has(suggestion)) continue;
						if (emptyIndices.length > 0) {
							const slotIndex = emptyIndices.shift();
							if (slotIndex === undefined) {
								metadata.value.push(suggestion);
							} else {
								metadata.value[slotIndex] = suggestion;
							}
						} else {
							metadata.value.push(suggestion);
						}
						existingSet.add(suggestion);
					}
					metadata.autoSuggested = true;
				});
			},
			[editEntry],
		);

		const rowHasError = validation
			? values.some((val) => val.trim() !== "" && !validation.verifier(val))
			: false;
		const rowHasDuplicate = useMemo(() => {
			const filledValues = values.filter((v) => v.trim() !== "");
			return new Set(filledValues).size !== filledValues.length;
		}, [values]);

		return (
			<div
				className={`${styles.editorPanel} ${
					isDraggingCategory ? styles.dragOverCategory : ""
				}`}
				onDragOver={(e) => {
					e.preventDefault();
					setIsDraggingCategory(true);
				}}
				onDragLeave={(e) => {
					if (!e.currentTarget.contains(e.relatedTarget as Node)) {
						setIsDraggingCategory(false);
					}
				}}
				onDrop={(e) => {
					e.preventDefault();
					setIsDraggingCategory(false);
					appendDroppedValues(e.dataTransfer.getData("text"));
				}}
			>
				<div className={styles.valueList}>
					{values.length === 0 && (
						<div className={styles.emptyState}>
							<Text color="gray">
								{t("metadataDialog.emptyItem", "此项尚未添加任何条目")}
							</Text>
						</div>
					)}
					{values.map((value, index) => (
						<MetadataValueEditorRow
							key={`${option.value}-${index}`}
							value={value}
							valueIndex={index}
							values={values}
							option={option}
							validation={validation}
							entryAutoSuggested={entry?.autoSuggested}
							inputRef={(el) => {
								inputRefs.current[index] = el;
							}}
							isDragOver={dragInputIndex === index}
							setDragInputIndex={setDragInputIndex}
							setIsDraggingCategory={setIsDraggingCategory}
							updateValue={updateValue}
							addValue={addValue}
							removeValue={removeValue}
							setFocusIndex={setFocusIndex}
							applySuggestionValues={applySuggestionValues}
							requestNeteaseMeta={requestNeteaseMeta}
						/>
					))}
				</div>

				{validation && rowHasError && (
					<Text
						color={validation.severe ? "red" : "orange"}
						size="1"
						wrap="wrap"
					>
						{validation.message}
					</Text>
				)}
				{rowHasDuplicate && (
					<Text color="red" size="1" wrap="wrap">
						{t("metadataDialog.duplicateMsg", "存在重复的元数据值")}
					</Text>
				)}
				<Button variant="soft" onClick={() => addValue()}>
					<Add16Regular />
					{t("metadataDialog.addValue", "添加")}
				</Button>
			</div>
		);
	},
);

export const MetadataEditor = () => {
	const [metadataEditorDialog, setMetadataEditorDialog] = useAtom(
		metadataEditorDialogAtom,
	);
	const [githubPat] = useAtom(githubPatAtom);
	const [githubLogin] = useAtom(githubLoginAtom);
	const [customKey, setCustomKey] = useState("");
	const [lyricLines, setLyricLines] = useImmerAtom(lyricLinesAtom);
	const neteaseMetaCacheRef = useRef<Map<string, NeteaseSongMeta>>(new Map());

	const { t } = useTranslation();
	const appendMetadataValues = useCallback(
		(key: string, values: string[]) => {
			const normalized = values
				.map((value) => value.trim())
				.filter((value) => value !== "");
			if (normalized.length === 0) return;
			setLyricLines((prev) => {
				let entry = prev.metadata.find((item) => item.key === key);
				if (!entry) {
					entry = { key, value: [] };
					prev.metadata.push(entry);
				}
				const existingSet = new Set<string>();
				const emptyIndices: number[] = [];
				entry.value.forEach((val, i) => {
					const trimmed = val.trim();
					if (!trimmed) {
						emptyIndices.push(i);
					} else {
						existingSet.add(trimmed);
					}
				});
				for (const value of normalized) {
					if (existingSet.has(value)) continue;
					if (emptyIndices.length > 0) {
						const slotIndex = emptyIndices.shift();
						if (slotIndex === undefined) {
							entry.value.push(value);
						} else {
							entry.value[slotIndex] = value;
						}
					} else {
						entry.value.push(value);
					}
					existingSet.add(value);
				}
				entry.autoSuggested = false;
			});
		},
		[setLyricLines],
	);

	const hasMetadataValue = useCallback(
		(key: string) =>
			lyricLines.metadata
				.find((item) => item.key === key)
				?.value.some((value) => value.trim() !== "") ?? false,
		[lyricLines.metadata],
	);

	const fillMetadataValuesIfEmpty = useCallback(
		(key: string, values: string[]) => {
			const normalized = values
				.map((value) => value.trim())
				.filter((value) => value !== "");
			if (normalized.length === 0) return;
			setLyricLines((prev) => {
				let entry = prev.metadata.find((item) => item.key === key);
				if (entry?.value.some((value) => value.trim() !== "")) return;
				if (!entry) {
					entry = { key, value: [] };
					prev.metadata.push(entry);
				}
				entry.value = normalized;
				entry.autoSuggested = false;
			});
		},
		[setLyricLines],
	);

	const requestNeteaseMeta = useCallback(
		async (id: string) => {
			const trimmed = id.trim();
			if (!trimmed) return;
			const cached = neteaseMetaCacheRef.current.get(trimmed);
			const meta =
				cached ?? (await fetchNeteaseSongMeta(trimmed).catch(() => null));
			if (!meta) return;
			if (!cached) {
				neteaseMetaCacheRef.current.set(trimmed, meta);
			}
			appendMetadataValues("musicName", [
				meta.name,
				...meta.aliases,
				...meta.translations,
			]);
			appendMetadataValues("artists", meta.artists);
			if (meta.album) {
				appendMetadataValues("album", [meta.album]);
			}
			for (const [key, values] of Object.entries(meta.lyricMetadata)) {
				appendMetadataValues(key, values);
			}
		},
		[appendMetadataValues],
	);

	useEffect(() => {
		if (!metadataEditorDialog) return;
		const trimmedLogin = githubLogin.trim();
		const trimmedPat = githubPat.trim();
		if (!trimmedLogin && !trimmedPat) return;
		const hasGithubId = hasMetadataValue("ttmlAuthorGithub");
		const hasGithubLogin = hasMetadataValue("ttmlAuthorGithubLogin");
		if (hasGithubId && hasGithubLogin) return;
		let active = true;
		const loadGithubIdentity = async () => {
			if (trimmedLogin && !hasGithubLogin) {
				fillMetadataValuesIfEmpty("ttmlAuthorGithubLogin", [trimmedLogin]);
			}
			if (!trimmedPat || (hasGithubId && hasGithubLogin)) return;
			const result = await fetchGithubUserProfile(trimmedPat);
			if (!active) return;
			if (result.status !== "ok") return;
			if (result.profile.login.trim() && !hasGithubLogin) {
				fillMetadataValuesIfEmpty("ttmlAuthorGithubLogin", [
					result.profile.login.trim(),
				]);
			}
			if (typeof result.profile.id === "number" && !hasGithubId) {
				fillMetadataValuesIfEmpty("ttmlAuthorGithub", [
					String(result.profile.id),
				]);
			}
		};
		void loadGithubIdentity();
		return () => {
			active = false;
		};
	}, [
		fillMetadataValuesIfEmpty,
		githubLogin,
		githubPat,
		hasMetadataValue,
		metadataEditorDialog,
	]);

	const builtinOptions: SelectOption[] = useMemo(() => {
		const numeric = (value: string) => /^\d+$/.test(value);
		const alphanumeric = (value: string) => /^[a-zA-Z0-9]+$/.test(value);

		const getPlatformUrl = (key: string, value: string) => {
			if (!value || !value.trim()) return null;

			switch (key) {
				case "ncmMusicId":
					return `https://music.163.com/#/song?id=${value}`;
				case "qqMusicId":
					return `https://y.qq.com/n/ryqq/songDetail/${value}`;
				case "spotifyId":
					return `https://open.spotify.com/track/${value}`;
				case "appleMusicId":
					return `https://music.apple.com/song/${value}`;
				case "ttmlAuthorGithubLogin":
					return `https://github.com/${value}`;
				case "isrc":
					return `https://isrcsearch.ifpi.org/?tab=%22code%22&isrcCode=%22${value}%22`;
				default:
					return null;
			}
		};
		return [
			// 歌词所匹配的歌曲名
			{
				label: t("metadataDialog.builtinOptions.musicName", "歌曲名称"),
				value: "musicName",
				icon: <MusicNote1Regular />,
			},
			// 歌词所匹配的歌手名
			{
				label: t("metadataDialog.builtinOptions.artists", "歌曲的艺术家"),
				value: "artists",
				icon: <Person16Regular />,
				suggestion: true,
				validation: {
					verifier: (value: string) => !/^.+[,;&，；、].+$/.test(value),
					message: t(
						"metadataDialog.builtinOptions.artistsInvalidMsg",
						"如果有多个艺术家，请多次添加该键值，避免使用分隔符",
					),
				},
			},
			// 歌词所匹配的词曲作者
			{
				label: t("metadataDialog.builtinOptions.songwriter", "词曲作者"),
				value: "songwriter",
				icon: <Person16Regular />,
				validation: {
					verifier: (value: string) => !/^.+[,;&，；、].+$/.test(value),
					message: t(
						"metadataDialog.builtinOptions.songwriterInvalidMsg",
						"如果有多个词曲作者，请多次添加该键值，避免使用分隔符",
					),
				},
			},
			// 歌词所匹配的专辑名
			{
				label: t("metadataDialog.builtinOptions.album", "歌曲的专辑名"),
				value: "album",
				icon: <AlbumRegular />,
			},
			// 歌词所匹配的网易云音乐 ID
			{
				label: t("metadataDialog.builtinOptions.ncmMusicId", "网易云音乐 ID"),
				value: "ncmMusicId",
				icon: <NeteaseIcon />,
				isLinkable: true,
				urlFormatter: (val) => getPlatformUrl("ncmMusicId", val),
				validation: {
					verifier: numeric,
					message: t(
						"metadataDialog.builtinOptions.ncmMusicIdInvalidMsg",
						"网易云音乐 ID 应为纯数字",
					),
					severe: true,
				},
			},
			// 歌词所匹配的 QQ 音乐 ID
			{
				label: t("metadataDialog.builtinOptions.qqMusicId", "QQ 音乐 ID"),
				value: "qqMusicId",
				icon: <QQMusicIcon />,
				isLinkable: true,
				urlFormatter: (val) => getPlatformUrl("qqMusicId", val),
				validation: {
					verifier: alphanumeric,
					message: t(
						"metadataDialog.builtinOptions.qqMusicIdInvalidMsg",
						"QQ 音乐 ID 应为字母或数字",
					),
					severe: true,
				},
			},
			// 歌词所匹配的 Spotify 音乐 ID
			{
				label: t("metadataDialog.builtinOptions.spotifyId", "Spotify 音乐 ID"),
				value: "spotifyId",
				icon: <SpotifyIcon />,
				isLinkable: true,
				urlFormatter: (val) => getPlatformUrl("spotifyId", val),
				validation: {
					verifier: alphanumeric,
					message: t(
						"metadataDialog.builtinOptions.spotifyIdInvalidMsg",
						"Spotify ID 应为字母或数字",
					),
					severe: true,
				},
			},
			// 歌词所匹配的 Apple Music 音乐 ID
			{
				label: t(
					"metadataDialog.builtinOptions.appleMusicId",
					"Apple Music 音乐 ID",
				),
				value: "appleMusicId",
				icon: <AppleMusicIcon />,
				isLinkable: true,
				urlFormatter: (val) => getPlatformUrl("appleMusicId", val),
				validation: {
					verifier: numeric,
					message: t(
						"metadataDialog.builtinOptions.appleMusicIdInvalidMsg",
						"Apple Music ID 应为纯数字",
					),
					severe: true,
				},
			},
			// 歌词所匹配的 ISRC 编码
			{
				label: t("metadataDialog.builtinOptions.isrc", "歌曲的 ISRC 号码"),
				value: "isrc",
				icon: <NumberSymbol16Regular />,
				isLinkable: true,
				urlFormatter: (val) => getPlatformUrl("isrc", val),
				validation: {
					verifier: (value: string) =>
						/^[A-Z]{2}-?[A-Z0-9]{3}-?\d{2}-?\d{5}$/.test(value),
					message: t(
						"metadataDialog.builtinOptions.isrcInvalidMsg",
						"ISRC 编码格式应为 CC-XXX-YY-NNNNN",
					),
					severe: true,
				},
			},
			// 逐词歌词作者 GitHub ID，例如 39523898
			{
				label: t(
					"metadataDialog.builtinOptions.ttmlAuthorGithub",
					"歌词作者 GitHub ID",
				),
				value: "ttmlAuthorGithub",
				icon: <GithubIcon />,
				validation: {
					verifier: numeric,
					message: t(
						"metadataDialog.builtinOptions.ttmlAuthorGithubInvalidMsg",
						"GitHub ID 应为纯数字",
					),
					severe: true,
				},
			},
			// 逐词歌词作者 GitHub 用户名，例如 Steve-xmh
			{
				label: t(
					"metadataDialog.builtinOptions.ttmlAuthorGithubLogin",
					"歌词作者 GitHub 用户名",
				),
				value: "ttmlAuthorGithubLogin",
				icon: <GithubIcon />,
				isLinkable: true,
				urlFormatter: (val) => getPlatformUrl("ttmlAuthorGithubLogin", val),
				validation: {
					verifier: (value: string) =>
						/^(?!.*--)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(
							value,
						),
					message: t(
						"metadataDialog.builtinOptions.ttmlAuthorGithubLoginInvalidMsg",
						"GitHub username should be alphanumeric or hyphens, up to 39 characters",
					),
					severe: true,
				},
			},
		];
	}, [t]);

	const customOptions: SelectOption[] = useMemo(
		() =>
			lyricLines.metadata
				.filter(
					(metadata) =>
						!builtinOptions.some((option) => option.value === metadata.key),
				)
				.map((metadata) => ({
					label: metadata.key,
					value: metadata.key,
					icon: <Info16Regular />,
				})),
		[builtinOptions, lyricLines.metadata],
	);
	const navOptions = useMemo(
		() => [...builtinOptions, ...customOptions],
		[builtinOptions, customOptions],
	);
	const [activeKey, setActiveKey] = useState(
		() => builtinOptions[0]?.value ?? "",
	);
	const activeOption =
		navOptions.find((option) => option.value === activeKey) ?? navOptions[0];
	const activeEntry =
		lyricLines.metadata.find(
			(metadata) => metadata.key === activeOption?.value,
		) ?? null;

	useEffect(() => {
		if (activeOption) return;
		setActiveKey(builtinOptions[0]?.value ?? "");
	}, [activeOption, builtinOptions]);

	const addCustomKey = useCallback(() => {
		const nextKey = customKey.trim();
		if (!nextKey) return;

		setLyricLines((prev) => {
			if (!prev.metadata.some((metadata) => metadata.key === nextKey)) {
				prev.metadata.push({ key: nextKey, value: [] });
			}
		});
		setActiveKey(nextKey);
		setCustomKey("");
	}, [customKey, setLyricLines]);

	const clearAllMetadata = useCallback(() => {
		setLyricLines((prev) => {
			prev.metadata = [];
		});
		setActiveKey(builtinOptions[0]?.value ?? "");
	}, [builtinOptions, setLyricLines]);

	return (
		<Dialog.Root
			open={metadataEditorDialog}
			onOpenChange={(open) => {
				setMetadataEditorDialog(open);
				if (!open) {
					// 弹窗关闭时清理 trim 后为空的元数据
					setLyricLines((prev) => {
						// 清理每个元数据条目中的空值
						prev.metadata = prev.metadata
							.map((entry) => ({
								...entry,
								value: entry.value.filter((v) => v.trim() !== ""),
							}))
							.filter((entry) => entry.value.length > 0);
					});
				}
			}}
		>
			<Dialog.Content className={styles.dialogContent}>
				<Dialog.Title className={styles.srOnly}>
					{t("metadataDialog.title", "元数据编辑器")}
				</Dialog.Title>

				<aside className={styles.sidebar}>
					<Text as="div" weight="bold" size="2" className={styles.sidebarTitle}>
						{t("metadataDialog.title", "元数据编辑器")}
					</Text>
					<nav className={styles.navList}>
						{navOptions.map((option) => {
							const selected = activeOption?.value === option.value;
							const entry = lyricLines.metadata.find(
								(metadata) => metadata.key === option.value,
							);
							const valueCount =
								entry?.value.filter((value) => value.trim() !== "").length ?? 0;

							return (
								<button
									key={option.value}
									type="button"
									className={styles.navItem}
									data-active={selected || undefined}
									onClick={() => setActiveKey(option.value)}
								>
									<span className={styles.navIcon}>{option.icon}</span>
									<span className={styles.navItemText}>{option.label}</span>
									{valueCount > 0 && (
										<span className={styles.navBadge}>{valueCount}</span>
									)}
								</button>
							);
						})}
					</nav>
					<div className={styles.customKeyForm}>
						<TextField.Root
							placeholder={t("metadataDialog.customKey", "自定义键名")}
							value={customKey}
							onChange={(e) => setCustomKey(e.currentTarget.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									addCustomKey();
								}
							}}
						/>
						<IconButton variant="soft" onClick={addCustomKey}>
							<Add16Regular />
						</IconButton>
					</div>
				</aside>

				<section className={styles.mainPane}>
					<header className={styles.header}>
						<div className={styles.titleBlock}>
							<Heading size="7" className={styles.pageTitle}>
								{activeOption?.label}
							</Heading>
							{activeOption && (
								<Text size="2" color="gray" className={styles.titleMeta}>
									{activeOption.value}
								</Text>
							)}
						</div>
					</header>

					<div className={styles.scrollContent}>
						<AnimatePresence mode="wait" initial={false}>
							{activeOption && (
								<motion.div
									key={activeOption.value}
									className={styles.contentTransition}
									variants={contentVariants}
									initial="initial"
									animate="animate"
									exit="exit"
									transition={contentTransition}
								>
									<MetadataItemEditor
										entry={activeEntry}
										option={activeOption}
										setLyricLines={setLyricLines}
										requestNeteaseMeta={requestNeteaseMeta}
									/>
								</motion.div>
							)}
						</AnimatePresence>
					</div>

					<Flex
						gap="2"
						direction={{
							sm: "row",
							initial: "column",
						}}
						className={styles.dialogFooter}
					>
						<Button
							style={{ flex: "1 0 auto" }}
							color="red"
							variant="solid"
							onClick={clearAllMetadata}
						>
							<Delete16Regular />
							{t("metadataDialog.clear", "清空")}
						</Button>
						<Button asChild variant="soft">
							<a
								target="_blank"
								rel="noreferrer"
								href="https://github.com/amll-dev/amll-ttml-tool/wiki/%E6%AD%8C%E8%AF%8D%E5%85%83%E6%95%B0%E6%8D%AE"
							>
								<Info16Regular />
								{t("metadataDialog.info", "了解详情")}
							</a>
						</Button>
					</Flex>
				</section>
			</Dialog.Content>
		</Dialog.Root>
	);
};
