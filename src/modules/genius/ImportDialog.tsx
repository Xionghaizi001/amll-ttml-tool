import {
	Button,
	Dialog,
	Flex,
	ScrollArea,
	Spinner,
	Text,
	TextArea,
	TextField,
} from "@radix-ui/themes";
import { isTauri } from "@tauri-apps/api/core";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { useAtom, useSetAtom, useStore } from "jotai";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { uid } from "uid";
import {
	confirmDialogAtom,
	importFromGeniusDialogAtom,
} from "$/states/dialogs";
import {
	isDirtyAtom,
	newLyricLinesAtom,
	projectIdAtom,
	saveFileNameAtom,
	sourceFileContentAtom,
} from "$/states/main";
import { GeniusRequestError, lookupGenius } from "./client";
import { type GeniusResult, parsePastedLyrics } from "./parser";
import { resolveGeniusLines, toGeniusProject } from "./project";
import type { GeniusError, GeniusResults, GeniusSong } from "./types";
import { GENIUS_ORIGIN, parseGeniusLink } from "./urls";

export function ImportFromGenius() {
	const [isOpen, setIsOpen] = useAtom(importFromGeniusDialogAtom);
	return (
		<Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
			{isOpen && <GeniusForm close={() => setIsOpen(false)} />}
		</Dialog.Root>
	);
}

function GeniusForm({ close }: { close: () => void }) {
	const { t } = useTranslation();
	const store = useStore();
	const confirm = useSetAtom(confirmDialogAtom);
	const request = useRef<AbortController | null>(null);
	const [input, setInput] = useState("");
	const [loading, setLoading] = useState(false);
	const [listing, setListing] = useState<GeniusResults>();
	const [song, setSong] = useState<GeniusSong>();
	const [error, setError] = useState<GeniusError>();
	const [failedLink, setFailedLink] = useState<GeniusResult | undefined>();
	const [showPaste, setShowPaste] = useState(false);
	const [pasted, setPasted] = useState("");
	const [pastedHtml, setPastedHtml] = useState<string>();
	const previewLines = song ? resolveGeniusLines(song.lyrics, song) : [];

	useEffect(() => () => request.current?.abort(), []);

	async function load(
		query: { q: string } | { path: string },
		selected?: GeniusResult,
	) {
		request.current?.abort();
		const controller = new AbortController();
		request.current = controller;
		setLoading(true);
		setSong(undefined);
		setError(undefined);
		setFailedLink(undefined);
		setShowPaste(false);
		setPasted("");
		setPastedHtml(undefined);
		try {
			const response = await lookupGenius(query, controller.signal);
			if (controller.signal.aborted) return;
			if (response.kind === "song") {
				setSong({
					...response,
					title: response.title || selected?.title,
					artist: response.artist || selected?.artist,
					album: response.album || selected?.album,
				});
			} else {
				setListing(response);
			}
		} catch (cause) {
			if (controller.signal.aborted) return;
			setError(
				cause instanceof GeniusRequestError ? cause.code : "connectionFailed",
			);
			setFailedLink(selected);
		} finally {
			if (!controller.signal.aborted) setLoading(false);
		}
	}

	function submit() {
		const query = input.trim();
		if (!query || loading) return;
		setListing(undefined);
		const link = parseGeniusLink(query);
		if (link) {
			void load({ path: link.path }, { ...link, title: "" });
		} else if (
			/^(?:[\w+.-]+:\/\/|(?:www\.)?genius\.com(?:\/|$))/i.test(query)
		) {
			setSong(undefined);
			setFailedLink(undefined);
			setShowPaste(false);
			setError("invalidInput");
		} else {
			void load({ q: query });
		}
	}

	function importSong() {
		if (!song?.lyrics.length) return;
		const project = toGeniusProject(song.lyrics, song);
		const name = [song.artist, song.title]
			.filter(Boolean)
			.join(" - ")
			.replace(/[\\/:*?"<>|]/g, "_");
		const apply = () => {
			store.set(projectIdAtom, uid());
			store.set(newLyricLinesAtom, project);
			store.set(sourceFileContentAtom, null);
			store.set(saveFileNameAtom, `${name || "lyric"}.ttml`);
			close();
		};
		if (store.get(isDirtyAtom)) {
			confirm({
				open: true,
				title: t("confirmDialog.importFile.title", "确认导入歌词"),
				description: t(
					"confirmDialog.importFile.description",
					"当前文件有未保存的更改。如果继续，这些更改将会丢失。确定要导入歌词吗？",
				),
				onConfirm: apply,
			});
		} else {
			apply();
		}
	}

	const errors = {
		invalidInput: t(
			"genius.invalidInput",
			"请输入关键词，或粘贴有效的 Genius 歌曲／专辑链接。",
		),
		connectionFailed: t(
			"genius.connectionFailed",
			"无法连接 Genius，请稍后重试。",
		),
		unavailable: t(
			"genius.unavailable",
			"Genius 暂时限制了自动访问。请在浏览器中打开链接，或粘贴歌词。",
		),
		noLyrics: t("genius.noLyrics", "未找到可导入的歌词。"),
	};

	function usePastedLyrics() {
		const lyrics = parsePastedLyrics(pasted, pastedHtml);
		if (!lyrics.length) {
			setError("noLyrics");
			return;
		}
		setSong({
			kind: "song",
			title: failedLink?.kind === "song" ? failedLink.title : undefined,
			artist: failedLink?.kind === "song" ? failedLink.artist : undefined,
			album: failedLink?.album,
			lyrics,
		});
		setShowPaste(false);
		setError(undefined);
	}

	return (
		<Dialog.Content maxWidth="680px">
			<Dialog.Title>{t("genius.title", "从 Genius 导入歌词")}</Dialog.Title>
			<Dialog.Description size="2" color="gray" mb="3">
				{t(
					"genius.description",
					"搜索歌名与歌手，或粘贴 Genius 的歌曲或专辑链接。",
				)}
			</Dialog.Description>
			<form
				onSubmit={(event) => {
					event.preventDefault();
					submit();
				}}
			>
				<Flex gap="2" mb="3">
					<TextField.Root
						style={{ flex: 1 }}
						aria-label={t("genius.input", "歌名、歌手或 Genius 链接")}
						placeholder={t("genius.placeholder", "如 XG DEPENDS，或粘贴链接")}
						value={input}
						maxLength={600}
						onChange={(event) => setInput(event.target.value)}
					/>
					<Button disabled={loading || !input.trim()} type="submit">
						{t("genius.lookup", "搜索／打开")}
					</Button>
				</Flex>
			</form>
			{loading && (
				<Flex gap="2" align="center" role="status">
					<Spinner />
					{t("genius.loading", "正在读取 Genius…")}
				</Flex>
			)}
			{error && (
				<Text as="p" size="2" mb="2" color="red" role="alert">
					{errors[error]}
				</Text>
			)}
			{error && error !== "invalidInput" && !showPaste && (
				<Flex gap="2" mb="3" wrap="wrap">
					{failedLink && (
						<Button
							variant="soft"
							onClick={() => {
								const url = GENIUS_ORIGIN + failedLink.path;
								if (isTauri())
									void openExternal(url).catch(() =>
										setError("connectionFailed"),
									);
								else window.open(url, "_blank", "noopener,noreferrer");
							}}
						>
							{t("genius.openOriginal", "在浏览器中打开 Genius")}
						</Button>
					)}
					<Button variant="soft" onClick={() => setShowPaste(true)}>
						{t("genius.pasteLyrics", "粘贴歌词作为备用")}
					</Button>
				</Flex>
			)}
			{showPaste && (
				<Flex direction="column" gap="2" mb="3">
					<TextArea
						aria-label={t("genius.pasteLyrics", "粘贴歌词作为备用")}
						placeholder={t(
							"genius.pastePlaceholder",
							"粘贴歌词，并保留 [Verse: 演唱者] 等标题",
						)}
						value={pasted}
						onChange={(event) => {
							setPasted(event.target.value);
							setPastedHtml(undefined);
						}}
						onPaste={(event) => {
							const html = event.clipboardData.getData("text/html");
							if (!html) return;
							event.preventDefault();
							setPasted(event.clipboardData.getData("text/plain"));
							setPastedHtml(html);
						}}
					/>
					<Button
						variant="soft"
						disabled={!pasted.trim()}
						onClick={usePastedLyrics}
					>
						{t("genius.preview", "预览歌词")}
					</Button>
				</Flex>
			)}
			{!loading && !song && listing && (
				<>
					<Text as="p" weight="bold" size="2" mb="2">
						{listing.kind === "album"
							? t("genius.albumTracks", "选择专辑曲目")
							: t("genius.results", "搜索结果")}
					</Text>
					{listing.results.length ? (
						<ScrollArea style={{ maxHeight: "45vh" }}>
							<Flex direction="column" align="stretch" gap="2" pr="3">
								{listing.results.map((result) => (
									<Button
										key={result.path}
										variant="soft"
										style={{
											justifyContent: "start",
											height: "auto",
											minHeight: "var(--space-6)",
											whiteSpace: "normal",
										}}
										onClick={() => void load({ path: result.path }, result)}
									>
										{[
											result.title,
											result.artist,
											result.kind === "album"
												? t("genius.album", "专辑")
												: undefined,
										]
											.filter(Boolean)
											.join(" · ")}
									</Button>
								))}
							</Flex>
						</ScrollArea>
					) : (
						<Text size="2" color="gray">
							{listing.kind === "album"
								? t("genius.noTracks", "未找到有歌词链接的曲目。")
								: t("genius.noResults", "未找到歌曲或专辑。")}
						</Text>
					)}
				</>
			)}
			{song && (
				<Flex direction="column" gap="2">
					<Text weight="bold">
						{[song.title, song.artist].filter(Boolean).join(" · ") ||
							t("genius.preview", "预览歌词")}
					</Text>
					<Text size="2" color="gray">
						{t(
							"genius.unsynced",
							"Genius 歌词没有时间轴。请检查段落及演唱者，再进行打轴。",
						)}
					</Text>
					<ScrollArea style={{ maxHeight: "44vh" }}>
						<Flex direction="column" gap="1" pr="3">
							{previewLines.map((line, index) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: the preview is an immutable line sequence
								<Flex direction="column" gap="1" key={index}>
									{line.songPart && (
										<Text size="2" weight="bold" mt="2">
											{line.songPart}
										</Text>
									)}
									{!line.isBG ? (
										<Text size="2">
											{line.singers.length > 0 && (
												<Text color="gray" size="1">
													{line.singers.join(" & ")} ·{" "}
												</Text>
											)}
											{line.text}
										</Text>
									) : (
										<Text size="2" color="gray" ml="3">
											<Text size="1" weight="bold">
												{t("genius.backgroundVocal", "背景人声")} ·{" "}
											</Text>
											{line.text}
										</Text>
									)}
								</Flex>
							))}
						</Flex>
					</ScrollArea>
				</Flex>
			)}
			<Flex justify="end" gap="2" mt="4">
				{song && listing && (
					<Button variant="soft" onClick={() => setSong(undefined)}>
						{t("genius.back", "返回列表")}
					</Button>
				)}
				<Dialog.Close>
					<Button variant="soft" color="gray">
						{t("common.close", "关闭")}
					</Button>
				</Dialog.Close>
				{song && (
					<Button onClick={importSong}>{t("genius.import", "导入歌词")}</Button>
				)}
			</Flex>
		</Dialog.Content>
	);
}
