import {
	AlbumRegular,
	Info16Regular,
	MusicNote1Regular,
	NumberSymbol16Regular,
	Person16Regular,
} from "@fluentui/react-icons";
import { Button, Checkbox, Dialog, Flex, Text, TextField } from "@radix-ui/themes";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	AppleMusicIcon,
	GithubIcon,
	NeteaseIcon,
	QQMusicIcon,
	SpotifyIcon,
} from "$/modules/project/modals/PlatformIcons";
import {
	metadataEditorDialogAtom,
	metadataRenameDialogAtom,
} from "$/states/dialogs";
import { lyricLinesAtom, saveFileNameAtom } from "$/states/main";
import type { TTMLMetadata } from "$/types/ttml";
import styles from "./MetadataRenameDialog.module.css";

interface MetadataKeyOption {
	key: string;
	label: string;
	icon: ReactNode;
}

export const MetadataRenameDialog = () => {
	const [open, setOpen] = useAtom(metadataRenameDialogAtom);
	const setFilename = useSetAtom(saveFileNameAtom);
	const metadata = useAtomValue(lyricLinesAtom).metadata;
	const setMetadataEditorDialog = useSetAtom(metadataEditorDialogAtom);
	const { t } = useTranslation();

	const suffix = ".ttml";
	const [draftName, setDraftName] = useState("");
	const [splayerEnabled, setSplayerEnabled] = useState(false);

	const hasNcmMusicId = useMemo(
		() =>
			metadata.some(
				(entry) =>
					entry.key === "ncmMusicId" &&
					entry.value.some((v) => v.trim() !== ""),
			),
		[metadata],
	);

	const metadataKeyOptions: MetadataKeyOption[] = useMemo(
		() => [
			{
				key: "musicName",
				label: t("metadataDialog.builtinOptions.musicName", "歌曲名称"),
				icon: <MusicNote1Regular />,
			},
			{
				key: "artists",
				label: t("metadataDialog.builtinOptions.artists", "歌曲的艺术家"),
				icon: <Person16Regular />,
			},
			{
				key: "songwriter",
				label: t("metadataDialog.builtinOptions.songwriter", "词曲作者"),
				icon: <Person16Regular />,
			},
			{
				key: "album",
				label: t("metadataDialog.builtinOptions.album", "歌曲的专辑名"),
				icon: <AlbumRegular />,
			},
			{
				key: "ncmMusicId",
				label: t("metadataDialog.builtinOptions.ncmMusicId", "网易云音乐 ID"),
				icon: <NeteaseIcon />,
			},
			{
				key: "qqMusicId",
				label: t("metadataDialog.builtinOptions.qqMusicId", "QQ 音乐 ID"),
				icon: <QQMusicIcon />,
			},
			{
				key: "spotifyId",
				label: t("metadataDialog.builtinOptions.spotifyId", "Spotify 音乐 ID"),
				icon: <SpotifyIcon />,
			},
			{
				key: "appleMusicId",
				label: t(
					"metadataDialog.builtinOptions.appleMusicId",
					"Apple Music 音乐 ID",
				),
				icon: <AppleMusicIcon />,
			},
			{
				key: "isrc",
				label: t("metadataDialog.builtinOptions.isrc", "歌曲的 ISRC 号码"),
				icon: <NumberSymbol16Regular />,
			},
			{
				key: "ttmlAuthorGithub",
				label: t(
					"metadataDialog.builtinOptions.ttmlAuthorGithub",
					"歌词作者 GitHub ID",
				),
				icon: <GithubIcon />,
			},
			{
				key: "ttmlAuthorGithubLogin",
				label: t(
					"metadataDialog.builtinOptions.ttmlAuthorGithubLogin",
					"歌词作者 GitHub 用户名",
				),
				icon: <GithubIcon />,
			},
		],
		[t],
	);

	const findOption = useCallback(
		(key: string) => metadataKeyOptions.find((o) => o.key === key),
		[metadataKeyOptions],
	);

	const handleOpenChange = useCallback(
		(isOpen: boolean) => {
			setOpen(isOpen);
			if (isOpen) {
				setDraftName("");
				setSplayerEnabled(false);
			}
		},
		[setOpen],
	);

	const handleMetadataClick = useCallback(
		(entry: TTMLMetadata, value: string) => {
			const trimmed = value.trim();
			if (!trimmed) return;
			if (splayerEnabled && entry.key === "ncmMusicId") {
				setDraftName((prev) => prev + "." + trimmed);
			} else {
				setDraftName((prev) => prev + trimmed);
			}
		},
		[splayerEnabled],
	);

	const handleApply = useCallback(() => {
		const trimmed = draftName.trim();
		if (trimmed.length > 0) {
			setFilename(`${trimmed}${suffix}`);
		}
		setOpen(false);
	}, [draftName, setFilename, setOpen]);

	const handleGoToMetadataEditor = useCallback(() => {
		setOpen(false);
		setMetadataEditorDialog(true);
	}, [setOpen, setMetadataEditorDialog]);

	const filteredMetadata = useMemo(
		() =>
			metadata.filter((entry) => entry.value.some((v) => v.trim() !== "")),
		[metadata],
	);

	return (
		<Dialog.Root open={open} onOpenChange={handleOpenChange}>
			<Dialog.Content className={styles.dialogContent}>
				<div className={styles.dialogHeader}>
					<Dialog.Title style={{ margin: 0 }}>
						{t("metadataRenameDialog.title", "从元数据重命名")}
					</Dialog.Title>
				</div>

				<div className={styles.dialogBody}>
					{filteredMetadata.length === 0 && (
						<Text
							color="gray"
							style={{
								textAlign: "center",
								display: "block",
								padding: "2em 0",
							}}
						>
							{t("metadataRenameDialog.empty", "无任何元数据")}
						</Text>
					)}
					{filteredMetadata.map((entry) => {
						const option = findOption(entry.key);
						const nonEmptyValues = entry.value.filter(
							(v) => v.trim() !== "",
						);
						return (
							<div key={entry.key} className={styles.metadataGroup}>
								<Flex align="center" gap="1" mb="1">
									<span
										style={{ display: "flex", color: "var(--gray-12)" }}
									>
										{option?.icon || <Info16Regular />}
									</span>
									<Text size="2" weight="bold">
										{option?.label || entry.key}
									</Text>
								</Flex>
								<Flex gap="1" wrap="wrap">
									{nonEmptyValues.map((value, index) => (
										<Button
											key={`${entry.key}-${index}`}
											variant="soft"
											size="1"
											onClick={() =>
												handleMetadataClick(entry, value)
											}
										>
											{value}
										</Button>
									))}
								</Flex>
							</div>
						);
					})}
					<Flex direction="column" gap="2" mt="3">
						<Flex align="center" gap="2">
							<Checkbox
								checked={splayerEnabled}
								onCheckedChange={(v) =>
									setSplayerEnabled(v === true)
								}
								disabled={!hasNcmMusicId}
							/>
							<Text
								size="2"
								color={!hasNcmMusicId ? "gray" : undefined}
							>
								{t(
									"metadataRenameDialog.splayerSupport",
									"启用 SPlayer 本地歌词支持",
								)}
							</Text>
						</Flex>
						<Button
							variant="soft"
							onClick={handleGoToMetadataEditor}
						>
							{t(
								"metadataRenameDialog.goToMetadataEditor",
								"前往编辑元数据",
							)}
						</Button>
					</Flex>
				</div>

				<Flex align="center" gap="2" className={styles.dialogFooter}>
					<TextField.Root
						size="2"
						value={draftName}
						onChange={(e) => setDraftName(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								handleApply();
							}
						}}
						placeholder={t(
							"metadataRenameDialog.filenamePlaceholder",
							"文件名",
						)}
						style={{ flex: 1 }}
					/>
					<Text size="2">{suffix}</Text>
					<Button onClick={handleApply}>
						{t("metadataRenameDialog.apply", "应用")}
					</Button>
				</Flex>
			</Dialog.Content>
		</Dialog.Root>
	);
};
