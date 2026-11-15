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
import { useEffect, useMemo, useRef, useState } from "react";
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

type LookupView =
	| { kind: "loading" }
	| { kind: "error"; code: GeniusError; link?: GeniusResult }
	| GeniusSong;

function GeniusForm({ close }: { close: () => void }) {
	const { t } = useTranslation();
	const store = useStore();
	const confirm = useSetAtom(confirmDialogAtom);
	const request = useRef<AbortController | null>(null);
	const [input, setInput] = useState("");
	const [listing, setListing] = useState<GeniusResults>();
	const [view, setView] = useState<LookupView>();
	const [paste, setPaste] = useState<{ text: string; html?: string }>();
	const loading = view?.kind === "loading";
	const song = view?.kind === "song" ? view : undefined;
	const error = view?.kind === "error" ? view.code : undefined;
	const failedLink = view?.kind === "error" ? view.link : undefined;
	const previewLines = useMemo(
		() => (song ? resolveGeniusLines(song.lyrics, song) : []),
		[song],
	);

	useEffect(() => () => request.current?.abort(), []);

	async function load(
		query: { q: string } | { path: string },
		selected?: GeniusResult,
	) {
		request.current?.abort();
		const controller = new AbortController();
		request.current = controller;
		setView({ kind: "loading" });
		setPaste(undefined);
		try {
			const response = await lookupGenius(query, controller.signal);
			if (controller.signal.aborted) return;
			if (response.kind === "song") {
				setView({
					...response,
					title: response.title || selected?.title,
					artist: response.artist || selected?.artist,
					album: response.album || selected?.album,
				});
			} else {
				setListing(response);
				setView(undefined);
			}
		} catch (cause) {
			if (controller.signal.aborted) return;
			setView({
				kind: "error",
				code:
					cause instanceof GeniusRequestError ? cause.code : "connectionFailed",
				link: selected,
			});
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
			setView({ kind: "error", code: "invalidInput" });
			setPaste(undefined);
		} else {
			void load({ q: query });
		}
	}

	function importSong() {
		if (!song) return;
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
		if (!paste) return;
		const lyrics = parsePastedLyrics(paste.text, paste.html);
		if (!lyrics.length) {
			setView({ kind: "error", code: "noLyrics", link: failedLink });
			return;
		}
		setView({
			kind: "song",
			title: failedLink?.kind === "song" ? failedLink.title : undefined,
			artist: failedLink?.kind === "song" ? failedLink.artist : undefined,
			album: failedLink?.album,
			lyrics,
		});
		setPaste(undefined);
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
					{errors[error] ?? errors.connectionFailed}
				</Text>
			)}
			{error && error !== "invalidInput" && !paste && (
				<Flex gap="2" mb="3" wrap="wrap">
					{failedLink && (
						<Button
							variant="soft"
							onClick={() => {
								const url = GENIUS_ORIGIN + failedLink.path;
								if (isTauri())
									void openExternal(url).catch(() =>
										setView({
											kind: "error",
											code: "connectionFailed",
											link: failedLink,
										}),
									);
								else window.open(url, "_blank", "noopener,noreferrer");
							}}
						>
							{t("genius.openOriginal", "在浏览器中打开 Genius")}
						</Button>
					)}
					<Button variant="soft" onClick={() => setPaste({ text: "" })}>
						{t("genius.pasteLyrics", "粘贴歌词作为备用")}
					</Button>
				</Flex>
			)}
			{paste && (
				<Flex direction="column" gap="2" mb="3">
					<TextArea
						aria-label={t("genius.pasteLyrics", "粘贴歌词作为备用")}
						placeholder={t(
							"genius.pastePlaceholder",
							"粘贴歌词，并保留 [Verse: 演唱者] 等标题",
						)}
						value={paste.text}
						onChange={(event) => setPaste({ text: event.target.value })}
						onPaste={(event) => {
							const html = event.clipboardData.getData("text/html");
							if (!html) return;
							event.preventDefault();
							setPaste({
								text: event.clipboardData.getData("text/plain"),
								html,
							});
						}}
					/>
					<Button
						variant="soft"
						disabled={!paste.text.trim()}
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
									<Text
										size="2"
										color={line.isBG ? "gray" : undefined}
										ml={line.isBG ? "3" : undefined}
									>
										{(line.isBG || line.singers.length > 0) && (
											<Text color="gray" size="1">
												{line.isBG
													? t("genius.backgroundVocal", "背景人声")
													: line.singers.join(" & ")}{" "}
												·{" "}
											</Text>
										)}
										{line.text}
									</Text>
								</Flex>
							))}
						</Flex>
					</ScrollArea>
				</Flex>
			)}
			<Flex justify="end" gap="2" mt="4">
				{song && listing && (
					<Button variant="soft" onClick={() => setView(undefined)}>
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
