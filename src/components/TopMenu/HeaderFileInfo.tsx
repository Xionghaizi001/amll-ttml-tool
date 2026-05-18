import { HistoryRegular } from "@fluentui/react-icons";
import {
	Box,
	Button,
	DropdownMenu,
	Flex,
	ScrollArea,
	Text,
	TextField,
} from "@radix-ui/themes";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useImmerAtom } from "jotai-immer";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { historyRestoreDialogAtom, metadataEditorDialogAtom } from "$/states/dialogs";
import {
	lastSavedTimeAtom,
	lyricLinesAtom,
	saveFileNameAtom,
} from "$/states/main";
import { getSuggestedTtmlFileName } from "$/modules/project/logic/metadata-filename";

const METADATA_LABELS: Record<string, { key: string; fallback: string }> = {
	musicName: { key: "metadataDialog.builtinOptions.musicName", fallback: "歌曲名称" },
	artists: { key: "metadataDialog.builtinOptions.artists", fallback: "歌曲的艺术家" },
	album: { key: "metadataDialog.builtinOptions.album", fallback: "歌曲的专辑名" },
	songwriter: { key: "metadataDialog.builtinOptions.songwriter", fallback: "词曲作者" },
};

export const HeaderFileInfo = () => {
	const { t } = useTranslation();
	const [filename, setFilename] = useAtom(saveFileNameAtom);
	const lastSavedTime = useAtomValue(lastSavedTimeAtom);
	const setHistoryDialogOpen = useSetAtom(historyRestoreDialogAtom);
	const setMetadataEditorOpen = useSetAtom(metadataEditorDialogAtom);
	const [lyricLines, setLyricLines] = useImmerAtom(lyricLinesAtom);
	const metadata = lyricLines.metadata;
	const [isEditing, setIsEditing] = useState(false);
	const [draftName, setDraftName] = useState("");
	const [autoSaveExpanded, setAutoSaveExpanded] = useState(false);
	const [autoSaveTimeLabel, setAutoSaveTimeLabel] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	const lastSavedTimeRef = useRef<number | null>(null);
	const suffix = ".ttml";
	const suggestedFile = getSuggestedTtmlFileName(metadata);

	const getBaseName = useCallback(
		(value: string) =>
			value.toLowerCase().endsWith(suffix)
				? value.slice(0, -suffix.length)
				: value,
		[],
	);

	const finishEditing = useCallback(
		({ commit }: { commit: boolean }) => {
			if (commit) {
				const trimmed = draftName.trim();
				if (trimmed.length > 0) {
					setFilename(`${trimmed}${suffix}`);
				} else {
					setDraftName(getBaseName(filename));
				}
			}
			setIsEditing(false);
		},
		[draftName, filename, getBaseName, setFilename],
	);

	useEffect(() => {
		if (!isEditing) return;
		setDraftName(getBaseName(filename));
		inputRef.current?.focus();
		inputRef.current?.select();
	}, [filename, getBaseName, isEditing]);

	useEffect(() => {
		if (!lastSavedTime) return;
		if (lastSavedTimeRef.current === lastSavedTime) return;
		lastSavedTimeRef.current = lastSavedTime;
		setAutoSaveTimeLabel(new Date(lastSavedTime).toLocaleTimeString());
		setAutoSaveExpanded(true);
		const timer = window.setTimeout(() => {
			setAutoSaveExpanded(false);
		}, 4000);
		return () => window.clearTimeout(timer);
	}, [lastSavedTime]);

	const handleApplyMetadataName = useCallback(() => {
		if (suggestedFile) {
			setFilename(suggestedFile.fileName);
		}
	}, [setFilename, suggestedFile]);

	const handleGoToMetadataEditor = useCallback(() => {
		setMetadataEditorOpen(true);
	}, [setMetadataEditorOpen]);

	const updateMetadataValue = useCallback(
		(key: string, valueIndex: number, newValue: string) => {
			setLyricLines((prev) => {
				const entry = prev.metadata.find((m) => m.key === key);
				if (entry && entry.value[valueIndex] !== undefined) {
					entry.value[valueIndex] = newValue;
					entry.autoSuggested = false;
				}
			});
		},
		[setLyricLines],
	);

	return (
		<Flex align="center" gap="2" style={{ maxWidth: "100%" }}>
			<Button
				variant="soft"
				onClick={() => setHistoryDialogOpen(true)}
				style={{
					justifyContent: "start",
					overflow: "hidden",
					whiteSpace: "nowrap",
					maxWidth: autoSaveExpanded ? 220 : 36,
					transition: "max-width 0.3s ease",
				}}
			>
				<Flex align="center" gap="1">
					<Text size="1" style={{ display: "flex" }}>
						<HistoryRegular />
					</Text>
					{autoSaveExpanded && (
						<Text size="1" color="gray">
							{t("header.status.autoSavedAt", "已自动保存于 {time}", {
								time: autoSaveTimeLabel,
							})}
						</Text>
					)}
				</Flex>
			</Button>

			<Box>
				{isEditing ? (
					<Flex align="center" gap="1">
						<TextField.Root
							ref={inputRef}
							size="1"
							value={draftName}
							onChange={(e) => setDraftName(e.target.value)}
							placeholder="example"
							style={{ width: "10rem" }}
							onBlur={() => finishEditing({ commit: true })}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									finishEditing({ commit: true });
								}
								if (event.key === "Escape") {
									finishEditing({ commit: false });
								}
							}}
						/>
						<Text size="2">{suffix}</Text>
					</Flex>
				) : (
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							<Button
								variant="ghost"
								color="gray"
								style={{
									height: "auto",
									padding: "6px 10px",
									fontWeight: "normal",
									color: "var(--gray-12)",
									maxWidth: "100%",
								}}
							>
								<Flex align="center" gap="2" style={{ maxWidth: "100%" }}>
									<Flex
										align="center"
										style={{
											maxWidth: "10rem",
											overflow: "hidden",
											whiteSpace: "nowrap",
										}}
									>
										<Text
											weight="bold"
											size="2"
											style={{
												overflow: "hidden",
												textOverflow: "ellipsis",
											}}
										>
											{getBaseName(filename)}
										</Text>
										<Text size="2">{suffix}</Text>
									</Flex>
								</Flex>
							</Button>
						</DropdownMenu.Trigger>
						<DropdownMenu.Content>
							<DropdownMenu.Item onClick={() => setIsEditing(true)}>
								{t("header.rename", "重命名")}
							</DropdownMenu.Item>
							<DropdownMenu.Sub>
								<DropdownMenu.SubTrigger>
									{t("header.renameFromMetadata", "从元数据重命名")}
								</DropdownMenu.SubTrigger>
								<DropdownMenu.SubContent
									style={{
										maxHeight: "60vh",
										overflowY: "auto",
										minWidth: "280px",
										padding: "12px",
									}}
								>
									{metadata.length === 0 ? (
										<Flex direction="column" gap="2" align="center" py="4">
											<Text size="2" color="gray">
												{t("header.noMetadata", "无元数据")}
											</Text>
											<Button
												variant="soft"
												size="1"
												onClick={handleGoToMetadataEditor}
											>
												{t("header.goToMetadataEditor", "前往编辑元数据")}
											</Button>
										</Flex>
									) : (
										<Flex direction="column" gap="3">
											<ScrollArea style={{ maxHeight: "40vh" }}>
												<Flex direction="column" gap="2">
													{metadata.map((entry) => {
														const labelConfig = METADATA_LABELS[entry.key];
														const label = labelConfig
															? t(labelConfig.key, labelConfig.fallback)
															: entry.key;
														return (
															<Flex
																key={entry.key}
																direction="column"
																gap="1"
															>
																<Text size="1" weight="bold" color="gray">
																	{label}
																</Text>
																{entry.value.map((val, vi) => (
																	<TextField.Root
																		key={`${entry.key}-${vi}`}
																		size="1"
																		value={val}
																		onChange={(e) =>
																			updateMetadataValue(
																				entry.key,
																				vi,
																				e.currentTarget.value,
																			)
																		}
																	/>
																))}
															</Flex>
														);
													})}
												</Flex>
											</ScrollArea>
											<Flex
												direction="column"
												gap="2"
												pt="2"
												style={{
													borderTop: "1px solid var(--gray-5)",
												}}
											>
												{suggestedFile ? (
													<>
														<Text size="1" color="gray">
															{t("header.previewFileName", "预览文件名")}
														</Text>
														<Text size="2" weight="bold">
															{suggestedFile.fileName}
														</Text>
														<Button size="1" onClick={handleApplyMetadataName}>
															{t("common.apply", "应用")}
														</Button>
													</>
												) : (
													<Text size="1" color="orange">
														{t("header.insufficientMetadata", "元数据不足，需要歌曲名称和艺术家")}
													</Text>
												)}
											</Flex>
										</Flex>
									)}
								</DropdownMenu.SubContent>
							</DropdownMenu.Sub>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				)}
			</Box>
		</Flex>
	);
};
