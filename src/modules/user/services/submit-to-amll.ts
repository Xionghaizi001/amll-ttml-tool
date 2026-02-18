import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import exportTTMLText from "$/modules/project/logic/ttml-writer";
import {
	githubPatAtom,
	hideSubmitAMLLDBWarningAtom,
} from "$/modules/settings/states";
import { confirmDialogAtom, submitToAMLLDBDialogAtom } from "$/states/dialogs.ts";
import { lyricLinesAtom } from "$/states/main";
import { pushNotificationAtom } from "$/states/notifications";
import type { TTMLMetadata } from "$/types/ttml";
import { log } from "$/utils/logging.ts";
import { createGithubGist } from "$/modules/github/services/gist-service";
import { buildSubmitLyricIssueContent } from "$/modules/user/services/issue-builder";
import { createGithubIssue } from "$/modules/github/services/issue-service";

export type NameFieldKey = "artists" | "musicName" | "album" | "remark";
export type NameFieldItem = {
	key: NameFieldKey;
	label: string;
	value: string;
	options: string[];
	onChange: (value: string) => void;
};

const metadataAtom = atom((get) => get(lyricLinesAtom).metadata);
const issuesAtom = atom((get) => {
	const result: string[] = [];
	const metadatas = get(metadataAtom);

	if (
		metadatas.findIndex((m) => m.key === "musicName" && m.value.length > 0) ===
		-1
	)
		result.push("元数据缺少音乐名称");

	if (
		metadatas.findIndex((m) => m.key === "artists" && m.value.length > 0) === -1
	)
		result.push("元数据缺少音乐作者");

	if (
		metadatas.findIndex((m) => m.key === "album" && m.value.length > 0) === -1
	)
		result.push("元数据缺少音乐专辑名称");

	const platforms = new Set([
		"ncmMusicId",
		"qqMusicId",
		"spotifyId",
		"appleMusicId",
	]);

	if (
		metadatas.findIndex((m) => platforms.has(m.key) && m.value.length > 0) ===
		-1
	)
		result.push("元数据缺少音乐平台对应歌曲 ID");

	return result;
});

const defaultNameOrder: NameFieldKey[] = [
	"artists",
	"musicName",
	"album",
	"remark",
];

const normalizeMetaValues = (metadatas: TTMLMetadata[], key: NameFieldKey) => {
	const raw = metadatas.find((m) => m.key === key)?.value ?? [];
	return raw.map((value) => value.trim()).filter((value) => value.length > 0);
};


const sanitizeFileName = (value: string) => {
	const sanitized = value.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ");
	const trimmed = sanitized.trim();
	return trimmed.length > 0 ? trimmed : "lyric";
};

const sleep = (ms: number) =>
	new Promise<void>((resolve) => {
		setTimeout(resolve, ms);
	});

const isHttpsUrl = (value: string) => {
	if (typeof value !== "string") return false;
	const trimmed = value.trim();
	if (!trimmed) return false;
	try {
		const url = new URL(trimmed);
		return url.protocol === "https:";
	} catch {
		return false;
	}
};

const buildGistFileName = (value: string) => {
	const base = sanitizeFileName(value);
	return base.toLowerCase().endsWith(".ttml") ? base : `${base}.ttml`;
};

const resolveUploadReason = (value: string) =>
	value === "修正已有歌词" ? "修正已有歌词" : "新歌词提交";

export const useSubmitToAMLLDBDialog = () => {
	const { t } = useTranslation();
	const [dialogOpen, setDialogOpen] = useAtom(submitToAMLLDBDialogAtom);
	const [hideWarning, setHideWarning] = useAtom(hideSubmitAMLLDBWarningAtom);
	const metadatas = useAtomValue(metadataAtom);
	const issues = useAtomValue(issuesAtom);
	const [nameOrder, setNameOrder] = useState<NameFieldKey[]>(defaultNameOrder);
	const [artistSelections, setArtistSelections] = useState<string[]>([]);
	const [musicNameValue, setMusicNameValue] = useState("");
	const [albumValue, setAlbumValue] = useState("");
	const [remarkValue, setRemarkValue] = useState("");
	const [comment, setComment] = useState("");
	const [processing, setProcessing] = useState(false);
	const [name, setName] = useState("");
	const [submitReason, setSubmitReason] = useState(
		t("submitToAMLLDB.defaultReason", "新歌词提交"),
	);
	const emptySelectValue = "__select_empty__";
	const noDataSelectValue = "__select_no_data__";
	const setPushNotification = useSetAtom(pushNotificationAtom);
	const setConfirmDialog = useSetAtom(confirmDialogAtom);
	const pat = useAtomValue(githubPatAtom);
	const lyric = useAtomValue(lyricLinesAtom);

	const artistOptions = useMemo(
		() => normalizeMetaValues(metadatas, "artists"),
		[metadatas],
	);
	const musicNameOptions = useMemo(
		() => normalizeMetaValues(metadatas, "musicName"),
		[metadatas],
	);
	const albumOptions = useMemo(
		() => normalizeMetaValues(metadatas, "album"),
		[metadatas],
	);

	useEffect(() => {
		setArtistSelections((prev) => {
			if (!artistOptions.length) return [];
			const filtered = prev.filter((value) => artistOptions.includes(value));
			if (filtered.length === 0) return [artistOptions[0]];
			return filtered;
		});
	}, [artistOptions]);

	useEffect(() => {
		if (!musicNameOptions.length) {
			if (musicNameValue) setMusicNameValue("");
			return;
		}
		if (!musicNameOptions.includes(musicNameValue)) {
			setMusicNameValue(musicNameOptions[0]);
		}
	}, [musicNameOptions, musicNameValue]);

	useEffect(() => {
		if (!albumOptions.length) {
			if (albumValue && albumValue !== emptySelectValue) setAlbumValue("");
			return;
		}
		if (albumValue === emptySelectValue) return;
		if (!albumOptions.includes(albumValue)) {
			setAlbumValue(albumOptions[0]);
		}
	}, [albumOptions, albumValue]);

	const artistDisplayValue = useMemo(
		() => artistSelections.join(" / "),
		[artistSelections],
	);

	const onArtistSelectionChange = useCallback(
		(value: string, checked: boolean) => {
			setArtistSelections((prev) => {
				if (checked) {
					if (prev.includes(value)) return prev;
					return [...prev, value];
				}
				if (prev.length === 1 && prev[0] === value) return prev;
				return prev.filter((item) => item !== value);
			});
		},
		[],
	);

	const fieldItems: Record<NameFieldKey, NameFieldItem> = useMemo(
		() => ({
			artists: {
				key: "artists",
				label: "歌手",
				value: artistDisplayValue,
				options: artistOptions,
				onChange: () => {},
			},
			musicName: {
				key: "musicName",
				label: "歌曲名",
				value: musicNameValue,
				options: musicNameOptions,
				onChange: setMusicNameValue,
			},
			album: {
				key: "album",
				label: "专辑",
				value: albumValue,
				options: albumOptions,
				onChange: setAlbumValue,
			},
			remark: {
				key: "remark",
				label: "备注",
				value: remarkValue,
				options: [],
				onChange: setRemarkValue,
			},
		}),
		[
			artistDisplayValue,
			artistOptions,
			musicNameValue,
			musicNameOptions,
			albumValue,
			albumOptions,
			remarkValue,
		],
	);

	const orderedFieldKeys = useMemo(() => {
		const filtered = nameOrder.filter((key) => defaultNameOrder.includes(key));
		const missing = defaultNameOrder.filter((key) => !filtered.includes(key));
		return [...filtered, ...missing];
	}, [nameOrder]);

	const orderedFieldItems = useMemo(
		() => orderedFieldKeys.map((key) => fieldItems[key]),
		[orderedFieldKeys, fieldItems],
	);

	useEffect(() => {
		if (!dialogOpen) {
			if (name) setName("");
			return;
		}
		const segments = orderedFieldItems
			.map((item) => item.value)
			.filter((value) => value.length > 0 && value !== emptySelectValue);
		const nextName = segments.join(" - ");
		setName(nextName);
		log("[SubmitToAMLLDB] 拼接结果:", nextName);
	}, [dialogOpen, name, orderedFieldItems]);

	const onNameOrderMove = useCallback(
		(
			fromKey: NameFieldKey,
			toKey: NameFieldKey,
			position: "before" | "after",
		) => {
			if (fromKey === toKey) return;
			setNameOrder((prev) => {
				const next = prev.filter((item) => item !== fromKey);
				const targetIndex = next.indexOf(toKey);
				if (targetIndex < 0) return prev;
				const insertIndex = position === "after" ? targetIndex + 1 : targetIndex;
				next.splice(insertIndex, 0, fromKey);
				return next;
			});
		},
		[],
	);

	//TODO: 接入新的提交流程(.\issue-builder => github\gist-service => github\issue-service => github\api)

	const onSubmit = useCallback(async () => {
		if (processing) return;
		setProcessing(true);
		try {
			if (!pat) {
				setPushNotification({
					title: t(
						"submitToAMLLDB.error.noToken",
						"请先在设置中配置 GitHub Token",
					),
					level: "error",
					source: "SubmitToAMLL",
				});
				return;
			}

			// 1. Generate TTML
			const ttmlContent = exportTTMLText(lyric);
			const fileName = buildGistFileName(name);

			// 2. Upload to Gist
			let gistResult:
				| Awaited<ReturnType<typeof createGithubGist>>
				| undefined;
			for (let attempt = 1; attempt <= 3; attempt += 1) {
				try {
					gistResult = await createGithubGist(pat, {
						description: `AMLL TTML Lyric Submission: ${name}`,
						isPublic: false,
						files: {
							[fileName]: { content: ttmlContent },
						},
					});
					break;
				} catch {
					if (attempt < 3) {
						await sleep(5000);
					}
				}
			}

			let ttmlDownloadUrl =
				gistResult?.files?.[fileName]?.raw_url ??
				Object.values(gistResult?.files ?? {})[0]?.raw_url ??
				null;
			if (!ttmlDownloadUrl) {
				const manualUrl = await new Promise<string | null>((resolve) => {
					setConfirmDialog({
						open: true,
						title: "Gist 上传失败",
						description: "是否填写你自己提供的文件链接？",
						input: {
							placeholder: "https://",
							validate: (value) => {
								if (typeof value !== "string") return "请输入 https 链接";
								return isHttpsUrl(value) ? null : "请输入 https 链接";
							},
						},
						onConfirm: (value) => {
							resolve(typeof value === "string" ? value.trim() : "");
						},
						onCancel: () => resolve(null),
					});
				});
				if (!manualUrl || !isHttpsUrl(manualUrl)) {
					throw new Error("No valid TTML download URL provided");
				}
				ttmlDownloadUrl = manualUrl;
			}

			// 3. Build Issue JSON
			const issueContent = buildSubmitLyricIssueContent({
				title: name,
				ttmlDownloadUrl,
				uploadReason: resolveUploadReason(submitReason),
				comment: comment,
			});

			// 4. Create Issue
			const pushResult = await createGithubIssue({
				token: pat,
				repoOwner: "amll-dev",
				repoName: "amll-ttml-db",
				title: issueContent.title,
				body: issueContent.body,
				labels: issueContent.labels,
				assignees: issueContent.assignees,
			});

			if (!pushResult.ok) {
				const message = pushResult.message
					? ` ${pushResult.message}`
					: "";
				throw new Error(
					`Push failed with status ${pushResult.status ?? "unknown"}${message}`,
				);
			}

			setPushNotification({
				title: t("submitToAMLLDB.success", "提交成功！"),
				level: "success",
				source: "SubmitToAMLL",
			});
			setDialogOpen(false);
			if (pushResult.issueUrl) {
				setConfirmDialog({
					open: true,
					title: t("submitToAMLLDB.success", "提交成功！"),
					description: "是否前往 GitHub 查看？",
					onConfirm: () => {
						window.open(
							pushResult.issueUrl,
							"_blank",
							"noopener,noreferrer",
						);
					},
				});
			}
		} catch (e) {
			log("SubmitToAMLLDB failed", e);
			setPushNotification({
				title: t(
					"submitToAMLLDB.error.failed",
					"提交失败，请检查网络或 Token 权限",
				),
				level: "error",
				source: "SubmitToAMLL",
			});
		} finally {
			setProcessing(false);
		}
	}, [
		processing,
		pat,
		t,
		lyric,
		name,
		submitReason,
		comment,
		setPushNotification,
		setConfirmDialog,
		setDialogOpen,
	]);

	return {
		artistSelections,
		comment,
		dialogOpen,
		emptySelectValue,
		hideWarning,
		issues,
		noDataSelectValue,
		onNameOrderMove,
		onSubmit,
		orderedFieldItems,
		processing,
		remarkValue,
		onArtistSelectionChange,
		setComment,
		setDialogOpen,
		setHideWarning,
		setRemarkValue,
		setSubmitReason,
		submitReason,
	};
};
