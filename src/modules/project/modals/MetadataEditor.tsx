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
	DropdownMenu,
	Flex,
	IconButton,
	Spinner,
	Text,
	TextField,
} from "@radix-ui/themes";
import { useAtom } from "jotai";
import { useImmerAtom } from "jotai-immer";
import {
	memo,
	type MutableRefObject,
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

interface MetadataEntryProps {
	entry: TTMLMetadata;
	index: number;
	setLyricLines: (args: (prev: TTMLLyric) => void) => void;
	option: SelectOption | null;
	focusAddKeyButton: () => void;
	requestNeteaseMeta: (id: string) => Promise<void>;
}

interface MetadataValueRowProps {
	entry: TTMLMetadata;
	value: string;
	valueIndex: number;
	index: number;
	option: SelectOption | null;
	validation?: SelectOption["validation"];
	inputRefs: MutableRefObject<(HTMLInputElement | null)[]>;
	dragInputIndex: number | null;
	setDragInputIndex: (value: number | null) => void;
	setIsDraggingCategory: (value: boolean) => void;
	setLyricLines: (args: (prev: TTMLLyric) => void) => void;
	setFocusIndex: (value: number) => void;
	focusAddKeyButton: () => void;
	applySuggestionValues: (suggestions: string[]) => void;
	requestNeteaseMeta: (id: string) => Promise<void>;
}

const MetadataValueRow = ({
	entry,
	value,
	valueIndex,
	index,
	option,
	validation,
	inputRefs,
	dragInputIndex,
	setDragInputIndex,
	setIsDraggingCategory,
	setLyricLines,
	setFocusIndex,
	focusAddKeyButton,
	applySuggestionValues,
	requestNeteaseMeta,
}: MetadataValueRowProps) => {
	const { t } = useTranslation();
	const itemHasError = validation
		? value.trim() !== "" && !validation.verifier(value)
		: false;
	const isDuplicate =
		value.trim() !== "" && entry.value.filter((v) => v === value).length > 1;
	const hasAnyError = itemHasError || isDuplicate;

	const url = option?.urlFormatter?.(value);
	const isLinkable = !!option?.isLinkable;
	const isValid = validation ? validation.verifier(value) : true;
	const isButtonEnabled = !!url && isValid;

	const [suggestions, setSuggestions] = useState<MetaSuggestionResult[]>([]);
	const [isFocused, setIsFocused] = useState(false);
	const [isFetchingMeta, setIsFetchingMeta] = useState(false);

	useEffect(() => {
		let active = true;
		if (!option?.suggestion || entry.autoSuggested) {
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
						setLyricLines((prev) => {
							prev.metadata[index].value[valueIndex] = matchedValue;
						});
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
	}, [entry.autoSuggested, index, option?.suggestion, setLyricLines, value, valueIndex]);

	const hasSuggestion = suggestions.length > 0;
	const canFetchNeteaseMeta =
		entry.key === "ncmMusicId" && !isFocused && value.trim() !== "";

	return (
		<tr key={`metadata-${entry.key}-${valueIndex}`}>
			<td>
				{valueIndex === 0 && (
					<Flex
						align="center"
						gap="2"
						style={{
							width: "100%",
						}}
					>
						<span
							style={{
								display: "flex",
								color: "var(--gray-12)",
							}}
						>
							{option?.icon || <Info16Regular />}
						</span>

						<Text
							style={{
								whiteSpace: "normal",
								wordBreak: "break-word",
							}}
						>
							{option?.label || entry.key}
						</Text>
					</Flex>
				)}
			</td>
			<td>
				<Flex gap="1" ml="2" mt="1">
					<TextField.Root
						data-metadata-input="true"
						ref={(el) => {
							inputRefs.current[valueIndex] = el;
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								setLyricLines((prev) => {
									prev.metadata[index].value.splice(valueIndex + 1, 0, "");
								});
								setFocusIndex(valueIndex + 1);
							} else if (e.key === "Backspace" && e.currentTarget.value === "") {
								if (e.repeat) return;

								e.preventDefault();

								if (valueIndex > 0) {
									setLyricLines((prev) => {
										prev.metadata[index].value.splice(valueIndex, 1);
									});
									setFocusIndex(valueIndex - 1);
								} else {
									setLyricLines((prev) => {
										prev.metadata[index].value.splice(valueIndex, 1);
										if (prev.metadata[index].value.length === 0) {
											prev.metadata.splice(index, 1);
										}
									});
								}
							} else if (e.key === "Tab" && !e.shiftKey) {
								const allInputs = Array.from(
									document.querySelectorAll<HTMLInputElement>(
										'[data-metadata-input="true"]',
									),
								);
								const currentIndex = allInputs.indexOf(e.currentTarget);
								const nextInput =
									currentIndex >= 0 ? allInputs[currentIndex + 1] : null;

								e.preventDefault();
								if (nextInput) {
									nextInput.focus();
									const len = nextInput.value.length;
									nextInput.setSelectionRange(len, len);
								} else {
									focusAddKeyButton();
								}
							}
						}}
						value={value}
						className={`${styles.metadataInput} ${
							dragInputIndex === valueIndex ? styles.dragOverInput : ""
						}`}
						onFocus={() => setIsFocused(true)}
						onBlur={() => setIsFocused(false)}
						onChange={(e) => {
							const newValue = e.currentTarget.value;
							setLyricLines((prev) => {
								const currentItem = prev.metadata[index];
								currentItem.value[valueIndex] = newValue;
								currentItem.autoSuggested = false;
							});
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
							if (text) {
								setLyricLines((prev) => {
									const currentItem = prev.metadata[index];
									currentItem.value[valueIndex] = text;
									currentItem.autoSuggested = false;
								});
							}
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
						(suggestions.length === 1 ? (
							<IconButton
								variant="soft"
								title={suggestions[0]?.title ?? ""}
								onClick={() => {
									applySuggestionValues(suggestions[0]?.values ?? []);
								}}
							>
								<Sparkle20Regular />
							</IconButton>
						) : (
							<DropdownMenu.Root>
								<DropdownMenu.Trigger>
									<IconButton
										variant="soft"
										title={t("metadataDialog.pickSuggestion", "选择匹配项")}
									>
										<Sparkle20Regular />
									</IconButton>
								</DropdownMenu.Trigger>
								<DropdownMenu.Content
									style={{
										maxWidth: "min(520px, 80vw)",
										maxHeight: "60vh",
										overflowY: "auto",
										whiteSpace: "nowrap",
									}}
								>
									{suggestions.map((suggestion, suggestionIndex) => (
										<DropdownMenu.Item
											key={`${suggestion.title}-${suggestionIndex}`}
											onSelect={() => {
												applySuggestionValues(suggestion.values);
											}}
											style={{
												display: "block",
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
												lineHeight: "1.4",
											}}
										>
											{suggestion.title}
										</DropdownMenu.Item>
									))}
								</DropdownMenu.Content>
							</DropdownMenu.Root>
						))}
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
						>
							{isFetchingMeta ? <Spinner size="1" /> : <GlobeSearch20Regular />}
						</IconButton>
					)}
					{isLinkable && (
						<IconButton
							disabled={!isButtonEnabled}
							asChild={isButtonEnabled}
							variant="soft"
							title={t("metadataDialog.openLink", "打开链接")}
						>
							{isButtonEnabled ? (
								<a
									href={url || ""}
									target="_blank"
									rel="noopener noreferrer"
								>
									<Open16Regular />
								</a>
							) : (
								<Open16Regular />
							)}
						</IconButton>
					)}
					<IconButton
						variant="soft"
						onClick={() => {
							setLyricLines((prev) => {
								prev.metadata[index].value.splice(valueIndex, 1);
								if (prev.metadata[index].value.length === 0) {
									prev.metadata.splice(index, 1);
								}
							});
						}}
					>
						<Delete16Regular />
					</IconButton>
				</Flex>
			</td>
		</tr>
	);
};

const MetadataEntry = memo(
	({
		entry,
		index,
		setLyricLines,
		option,
		focusAddKeyButton,
		requestNeteaseMeta,
	}: MetadataEntryProps) => {
		const validation = option?.validation;
		const rowHasError = validation
			? entry.value.some(
					(val) => val.trim() !== "" && !validation.verifier(val),
				)
			: false;

		const rowHasDuplicate = useMemo(() => {
			const values = entry.value.filter((v) => v.trim() !== "");
			return new Set(values).size !== values.length;
		}, [entry.value]);

		const { t } = useTranslation();

		const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

		const [focusIndex, setFocusIndex] = useState<number | null>(null);

		useEffect(() => {
			if (focusIndex !== null) {
				const targetInput = inputRefs.current[focusIndex];
				if (targetInput) {
					targetInput.focus();
					const len = targetInput.value.length;
					targetInput.setSelectionRange(len, len);
				}
				setFocusIndex(null);
			}
		}, [focusIndex]);

		const [isDraggingCategory, setIsDraggingCategory] = useState(false);
		const [dragInputIndex, setDragInputIndex] = useState<number | null>(null);

		const applySuggestionValues = useCallback(
			(suggestions: string[]) => {
				setLyricLines((prev) => {
					const currentItem = prev.metadata[index];
					const currentList = currentItem.value;
					const existingSet = new Set<string>();
					const emptyIndices: number[] = [];

					currentList.forEach((val, i) => {
						const trimmed = val.trim();
						if (trimmed === "") {
							emptyIndices.push(i);
						} else {
							existingSet.add(trimmed);
						}
					});

					for (const suggestion of suggestions) {
						const trimmed = suggestion.trim();
						if (!trimmed) continue;
						if (existingSet.has(trimmed)) continue;

						if (emptyIndices.length > 0) {
							const slotIndex = emptyIndices.shift();
							if (slotIndex === undefined) {
								currentList.push(trimmed);
							} else {
								currentList[slotIndex] = trimmed;
							}
						} else {
							currentList.push(trimmed);
						}
						existingSet.add(trimmed);
					}
					currentItem.autoSuggested = true;
				});
			},
			[index, setLyricLines],
		);

		const handleCategoryDrop = useCallback(
			(e: React.DragEvent) => {
				e.preventDefault();
				setIsDraggingCategory(false);
				const text = e.dataTransfer.getData("text");
				if (!text) return;

				const parts = text
					.split(/[\n,;/，；、|\\]/)
					.map((s) => s.trim())
					.filter((s) => s !== "");

				if (parts.length === 0) return;

				setLyricLines((prev) => {
					const currentList = prev.metadata[index].value;
					const existingSet = new Set<string>();
					const emptyIndices: number[] = [];

					currentList.forEach((val, i) => {
						if (val.trim() === "") {
							emptyIndices.push(i);
						} else {
							existingSet.add(val);
						}
					});

					for (const part of parts) {
						if (existingSet.has(part)) continue;

						if (emptyIndices.length > 0) {
							// biome-ignore lint/style/noNonNullAssertion: 肯定有
							const slotIndex = emptyIndices.shift()!;
							currentList[slotIndex] = part;
						} else {
							currentList.push(part);
						}
						existingSet.add(part);
					}
				});
			},
			[index, setLyricLines],
		);

		return (
			<tbody
				className={isDraggingCategory ? styles.dragOverCategory : undefined}
				onDragOver={(e) => {
					e.preventDefault();
					setIsDraggingCategory(true);
				}}
				onDragLeave={(e) => {
					if (!e.currentTarget.contains(e.relatedTarget as Node)) {
						setIsDraggingCategory(false);
					}
				}}
				onDrop={handleCategoryDrop}
			>
				{entry.value.map((vv, ii) => {
					return (
						<MetadataValueRow
							key={`metadata-${entry.key}-${ii}`}
							entry={entry}
							value={vv}
							valueIndex={ii}
							index={index}
							option={option}
							validation={validation}
							inputRefs={inputRefs}
							dragInputIndex={dragInputIndex}
							setDragInputIndex={setDragInputIndex}
							setIsDraggingCategory={setIsDraggingCategory}
							setLyricLines={setLyricLines}
							setFocusIndex={setFocusIndex}
							focusAddKeyButton={focusAddKeyButton}
							applySuggestionValues={applySuggestionValues}
							requestNeteaseMeta={requestNeteaseMeta}
						/>
					);
				})}
				<tr className={styles.newItemLine}>
					<td />
					<td className={styles.newItemBtnRow}>
						<Flex direction="column">
							{validation && rowHasError && (
								<Text
									color={validation.severe ? "red" : "orange"}
									size="1"
									mb="1"
									mt="1"
									wrap="wrap"
								>
									{validation.message}
								</Text>
							)}
							{rowHasDuplicate && (
								<Text color="red" size="1" mb="1" mt="1" wrap="wrap">
									{t("metadataDialog.duplicateMsg", "存在重复的元数据值")}
								</Text>
							)}
							<Button
								variant="soft"
								my="1"
								onClick={() => {
									setLyricLines((prev) => {
										prev.metadata[index].value.push("");
									});
								}}
							>
								{t("metadataDialog.addValue", "添加")}
							</Button>
						</Flex>
					</td>
				</tr>
			</tbody>
		);
	},
);

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

export const MetadataEditor = () => {
	const [metadataEditorDialog, setMetadataEditorDialog] = useAtom(
		metadataEditorDialogAtom,
	);
	const [githubPat] = useAtom(githubPatAtom);
	const [githubLogin] = useAtom(githubLoginAtom);
	const [customKey, setCustomKey] = useState("");
	const [lyricLines, setLyricLines] = useImmerAtom(lyricLinesAtom);
	const addKeyButtonRef = useRef<HTMLButtonElement | null>(null);
	const neteaseMetaCacheRef = useRef<Map<string, NeteaseSongMeta>>(
		new Map(),
	);

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

	const requestNeteaseMeta = useCallback(
		async (id: string) => {
			const trimmed = id.trim();
			if (!trimmed) return;
			const cached = neteaseMetaCacheRef.current.get(trimmed);
			const meta =
				cached ??
				(await fetchNeteaseSongMeta(trimmed).catch(() => null));
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
		let active = true;
		const loadGithubIdentity = async () => {
			if (trimmedLogin) {
				appendMetadataValues("ttmlAuthorGithubLogin", [trimmedLogin]);
			}
			if (!trimmedPat) return;
			const result = await fetchGithubUserProfile(trimmedPat);
			if (!active) return;
			if (result.status !== "ok") return;
			if (result.profile.login.trim()) {
				appendMetadataValues("ttmlAuthorGithubLogin", [
					result.profile.login.trim(),
				]);
			}
			if (typeof result.profile.id === "number") {
				appendMetadataValues("ttmlAuthorGithub", [
					String(result.profile.id),
				]);
			}
		};
		void loadGithubIdentity();
		return () => {
			active = false;
		};
	}, [appendMetadataValues, githubLogin, githubPat, metadataEditorDialog]);

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
			{
				// 歌词所匹配的歌曲名
				label: t("metadataDialog.builtinOptions.musicName", "歌曲名称"),
				value: "musicName",
				icon: <MusicNote1Regular />,
			},
			{
				// 歌词所匹配的歌手名
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
			{
				// 歌词所匹配的专辑名
				label: t("metadataDialog.builtinOptions.album", "歌曲的专辑名"),
				value: "album",
				icon: <AlbumRegular />,
			},
			{
				// 歌词所匹配的网易云音乐 ID
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
			{
				// 歌词所匹配的 QQ 音乐 ID
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
			{
				// 歌词所匹配的 Spotify 音乐 ID
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
			{
				// 歌词所匹配的 Apple Music 音乐 ID
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
			{
				// 歌词所匹配的 ISRC 编码
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
			{
				// 逐词歌词作者 GitHub ID，例如 39523898
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
			{
				// 逐词歌词作者 GitHub 用户名，例如 Steve-xmh
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

	const findOptionByKey = useCallback(
		(key: string) => {
			return builtinOptions.find((v) => v.value === key) || null;
		},
		[builtinOptions],
	);

	const focusAddKeyButton = useCallback(() => {
		addKeyButtonRef.current?.focus();
	}, []);

	return (
		<Dialog.Root
			open={metadataEditorDialog}
			onOpenChange={setMetadataEditorDialog}
		>
			<Dialog.Content className={styles.dialogContent}>
				<div className={styles.dialogHeader}>
					<Dialog.Title style={{ margin: 0 }}>
						{t("metadataDialog.title", "元数据编辑器")}
					</Dialog.Title>
				</div>

				<div className={styles.dialogBody}>
					<table className={styles.metadataTable}>
						<thead>
							<tr>
								<th className={styles.keyColumn}>
									{t("metadataDialog.key", "元数据类型")}
								</th>
								<th>{t("metadataDialog.value", "值")}</th>
							</tr>
						</thead>
						{lyricLines.metadata.length === 0 && (
							<tbody>
								<tr style={{ height: "4em" }}>
									<td
										colSpan={2}
										style={{ color: "var(--gray-9)", textAlign: "center" }}
									>
										{t("metadataDialog.empty", "无任何元数据")}
									</td>
								</tr>
							</tbody>
						)}
						{lyricLines.metadata.map((v, i) => (
							<MetadataEntry
								key={`metadata-${v.key}`}
								entry={v}
								index={i}
								setLyricLines={setLyricLines}
								option={findOptionByKey(v.key)}
								focusAddKeyButton={focusAddKeyButton}
								requestNeteaseMeta={requestNeteaseMeta}
							/>
						))}
					</table>
				</div>
				<Flex
					gap="1"
					direction={{
						sm: "row",
						initial: "column",
					}}
					className={styles.dialogFooter}
				>
					<DropdownMenu.Root>
						<DropdownMenu.Trigger
							style={{
								flex: "1 0 auto",
							}}
						>
							<Button variant="soft" ref={addKeyButtonRef}>
								{t("metadataDialog.addKeyValue", "添加新键值")}
								<DropdownMenu.TriggerIcon />
							</Button>
						</DropdownMenu.Trigger>
						<DropdownMenu.Content>
							<Flex gap="1">
								<TextField.Root
									style={{
										flexGrow: "1",
									}}
									placeholder={t("metadataDialog.customKey", "自定义键名")}
									value={customKey}
									onChange={(e) => setCustomKey(e.currentTarget.value)}
								/>
								<IconButton
									variant="soft"
									onClick={() => {
										setLyricLines((prev) => {
											const existsKey = prev.metadata.find(
												(k) => k.key === customKey,
											);
											if (existsKey) {
												existsKey.value.push("");
											} else {
												prev.metadata.push({
													key: customKey,
													value: [""],
												});
											}
										});
									}}
								>
									<Add16Regular />
								</IconButton>
							</Flex>
							{builtinOptions.map((v) => (
								<DropdownMenu.Item
									key={`builtin-option-${v.value}`}
									shortcut={v.value}
									onClick={() => {
										setLyricLines((prev) => {
											const existsKey = prev.metadata.find(
												(k) => k.key === v.value,
											);
											if (existsKey) {
												existsKey.value.push("");
											} else {
												prev.metadata.push({
													key: v.value,
													value: [""],
												});
											}
										});
									}}
								>
									<Flex gap="2" align="center">
										{v.icon}
										{v.label}
									</Flex>
								</DropdownMenu.Item>
							))}
						</DropdownMenu.Content>
					</DropdownMenu.Root>
					<Button
						style={{
							flex: "1 0 auto",
						}}
						variant="soft"
						onClick={() => {
							setLyricLines((prev) => {
								for (const option of builtinOptions) {
									const existsKey = prev.metadata.find(
										(k) => k.key === option.value,
									);
									if (!existsKey) {
										prev.metadata.push({
											key: option.value,
											value: [""],
										});
									}
								}
							});
						}}
					>
						{t("metadataDialog.addPresets", "一键添加所有预设键")}
					</Button>
					<Button
						style={{ flex: "1 0 auto" }}
						color="red"
						variant="solid"
						onClick={() => {
							setLyricLines((prev) => {
								prev.metadata = [];
							});
						}}
					>
						<Delete16Regular />
						{t("metadataDialog.clear", "清空")}
					</Button>
					<Button asChild variant="soft">
						<a
							target="_blank"
							rel="noreferrer"
							href="https://github.com/Steve-xmh/amll-ttml-tool/wiki/%E6%AD%8C%E8%AF%8D%E5%85%83%E6%95%B0%E6%8D%AE"
						>
							<Info16Regular />
							{t("metadataDialog.info", "了解详情")}
						</a>
					</Button>
				</Flex>
			</Dialog.Content>
		</Dialog.Root>
	);
};
