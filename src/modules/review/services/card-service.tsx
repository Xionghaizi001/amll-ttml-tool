import {
	Checkmark20Regular,
	Clock20Regular,
	Person20Regular,
} from "@fluentui/react-icons";
import { Box, Button, Flex, Text } from "@radix-ui/themes";
import type { LyricsSiteSubmission } from "$/modules/lyrics-site";

export type ReviewLabel = {
	name: string;
	color: string;
};

export type ReviewPullRequest = {
	number: number;
	title: string;
	body: string;
	createdAt: string;
	labels: ReviewLabel[];
	source: "github";
};

export type ReviewItem = ReviewPullRequest | LyricsSiteSubmission;

export const isLyricsSiteSubmission = (
	item: ReviewItem,
): item is LyricsSiteSubmission => {
	return item.source === "lyrics-site";
};

export const isGitHubPullRequest = (
	item: ReviewItem,
): item is ReviewPullRequest => {
	return item.source === "github";
};

export const getReviewItemId = (item: ReviewItem): string | number => {
	return isLyricsSiteSubmission(item) ? item.id : item.number;
};

export const getReviewItemTitle = (item: ReviewItem): string => {
	return item.title;
};

export const getReviewItemCreatedAt = (item: ReviewItem): string => {
	if (isLyricsSiteSubmission(item)) {
		return new Date(item.createdAt).toISOString();
	}
	return item.createdAt;
};

type ReviewMetadata = {
	musicName: string[];
	artists: string[];
	album: string[];
	ncmId: string[];
	qqMusicId: string[];
	spotifyId: string[];
	appleMusicId: string[];
	remark: string[];
};

type ReviewMetadataKey = keyof ReviewMetadata;
type ReviewValueMetadataKey = Exclude<ReviewMetadataKey, "remark">;

type ReviewMetadataSection = {
	title: string;
	lines: string[];
};

const splitMarkdownSections = (input: string): ReviewMetadataSection[] => {
	const sections: ReviewMetadataSection[] = [];
	let currentSection: ReviewMetadataSection | null = null;
	const lines = input.split(/\r?\n/);
	for (const rawLine of lines) {
		const headingMatch = rawLine.trim().match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
		if (headingMatch) {
			currentSection = {
				title: (headingMatch[1] ?? "").trim(),
				lines: [],
			};
			sections.push(currentSection);
			continue;
		}
		if (currentSection) {
			currentSection.lines.push(rawLine);
		}
	}
	return sections;
};

const normalizeMetadataTitle = (text: string) => {
	return text
		.replace(/[\\`*_~|#[\]()（）【】]/g, "")
		.replace(/\s/g, "")
		.replace(/[：:]+$/, "")
		.toLowerCase();
};

const getTitleParts = (title: string) => {
	const inlineMatch = title.match(/^(.+?)\s*[:：]\s*(.+)$/);
	if (!inlineMatch) {
		return {
			title: title,
			inlineValue: null,
		};
	}
	return {
		title: inlineMatch[1] ?? "",
		inlineValue: inlineMatch[2] ?? "",
	};
};

const isLyricsAuthorTitle = (title: string) => {
	const normalized = normalizeMetadataTitle(title);
	return /^(?:原)?歌词作者(?:github(?:id|用户名|用户|账号|账户)?)?$/.test(
		normalized,
	);
};

const getInlineLyricsAuthorValues = (body: string) => {
	const values: string[] = [];
	for (const rawLine of body.split(/\r?\n/)) {
		const line = rawLine
			.trim()
			.replace(/^[-*]\s+/, "")
			.replace(/^\[[ xX]\]\s*/, "")
			.replace(/^>\s*/, "")
			.trim();
		if (!line) continue;
		const tableCells = line
			.split("|")
			.map((cell) => cell.trim())
			.filter(Boolean);
		if (tableCells.length >= 2 && isLyricsAuthorTitle(tableCells[0] ?? "")) {
			values.push(tableCells.slice(1).join(" "));
			continue;
		}
		const fieldMatch = line.match(/^(.+?)\s*[:：]\s*(.*)$/);
		if (!fieldMatch) continue;
		if (!isLyricsAuthorTitle(fieldMatch[1] ?? "")) continue;
		values.push(fieldMatch[2] ?? "");
	}
	return values;
};

export const extractMentions = (body: string | undefined | null) => {
	if (!body) return [];
	const lyricsAuthorContent = splitMarkdownSections(body)
		.flatMap((section) => {
			const { title, inlineValue } = getTitleParts(section.title);
			if (!isLyricsAuthorTitle(title)) return [];
			return [inlineValue, ...section.lines].filter(
				(value): value is string => typeof value === "string",
			);
		})
		.join("\n");
	const content =
		lyricsAuthorContent || getInlineLyricsAuthorValues(body).join("\n");
	if (!content) return [];
	const matches = [...content.matchAll(/@([a-zA-Z0-9-]+)/g)];
	const names = matches.map((match) => match[1]).filter(Boolean);
	return Array.from(new Set(names));
};

export function parseReviewMetadata(body: string): ReviewMetadata {
	const result: ReviewMetadata = {
		musicName: [],
		artists: [],
		album: [],
		ncmId: [],
		qqMusicId: [],
		spotifyId: [],
		appleMusicId: [],
		remark: [],
	};
	const pushValues = (key: ReviewValueMetadataKey, value: string) => {
		const cleaned = value
			.replace(/^[-*]\s+/, "")
			.replace(/^\[[ xX]\]\s*/, "")
			.replace(/^>\s*/, "")
			.replace(/`/g, "")
			.trim();
		if (!cleaned) return;
		const values = cleaned
			.split(/[，,]/)
			.map((item) => item.trim())
			.filter(Boolean);
		result[key].push(...values);
	};
	const pushRemark = (value: string) => {
		const cleaned = value.trimEnd();
		if (!cleaned) return;
		result.remark.push(cleaned);
	};
	const getKeyFromText = (text: string) => {
		const normalized = normalizeMetadataTitle(text);
		if (/^(?:音乐名称|歌曲名称|歌名)$/.test(normalized)) {
			return "musicName" as const;
		}
		if (
			/^(?:音乐作者|音乐艺术家|歌曲艺术家|歌曲作者|歌手|艺术家)$/.test(
				normalized,
			)
		) {
			return "artists" as const;
		}
		if (/^(?:音乐专辑(?:名称)?|专辑(?:名称)?)$/.test(normalized)) {
			return "album" as const;
		}
		if (/^(?:歌曲关联)?网易云音乐(?:音乐)?id$/.test(normalized)) {
			return "ncmId" as const;
		}
		if (/^(?:歌曲关联)?qq音乐(?:音乐)?id$/.test(normalized)) {
			return "qqMusicId" as const;
		}
		if (/^(?:歌曲关联)?spotify(?:音乐)?id$/.test(normalized)) {
			return "spotifyId" as const;
		}
		if (/^(?:歌曲关联)?applemusic(?:音乐)?id$/.test(normalized)) {
			return "appleMusicId" as const;
		}
		if (/^备注$/.test(normalized)) {
			return "remark" as const;
		}
		return null;
	};

	for (const section of splitMarkdownSections(body)) {
		const { title, inlineValue } = getTitleParts(section.title);
		const key = getKeyFromText(title);
		if (!key) continue;
		if (inlineValue) {
			if (key === "remark") {
				pushRemark(inlineValue);
			} else {
				pushValues(key, inlineValue);
			}
		}
		for (const rawLine of section.lines) {
			const line = rawLine.trim();
			if (!line) {
				if (key === "remark") {
					result.remark.push("");
				}
				continue;
			}
			if (key === "remark") {
				pushRemark(line);
			} else {
				pushValues(key, line);
			}
		}
	}
	return result;
}

export const formatTimeAgo = (iso: string) => {
	const target = new Date(iso).getTime();
	const now = Date.now();
	const diff = Math.max(0, now - target);
	const minutes = Math.floor(diff / 60000);
	if (minutes < 1) return "刚刚";
	if (minutes < 60) return `${minutes}分钟前`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}小时前`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}天前`;
	const months = Math.floor(days / 30);
	if (months < 12) return `${months}个月前`;
	const years = Math.floor(months / 12);
	return `${years}年前`;
};

export const getLabelTextColor = (hex: string) => {
	const cleaned = hex.replace("#", "");
	const r = Number.parseInt(cleaned.slice(0, 2), 16) || 0;
	const g = Number.parseInt(cleaned.slice(2, 4), 16) || 0;
	const b = Number.parseInt(cleaned.slice(4, 6), 16) || 0;
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	return luminance > 0.6 ? "#1f1f1f" : "#ffffff";
};

export const renderMetaValues = (
	values: string[],
	styles: Record<string, string>,
) => {
	if (values.length === 0) {
		return (
			<Text size="2" color="gray">
				（这里什么都没有……）
			</Text>
		);
	}
	return values.map((value) => (
		<Text key={value} size="2" className={styles.metaChip}>
			{value}
		</Text>
	));
};

export const renderCardContent = (options: {
	item: ReviewItem;
	hiddenLabelSet: Set<string>;
	styles: Record<string, string>;
	reviewedByUser?: boolean;
	onSelectUser?: (user: string) => void;
}) => {
	const { item, hiddenLabelSet, styles, reviewedByUser, onSelectUser } =
		options;
	const isLyricsSite = isLyricsSiteSubmission(item);
	const id = getReviewItemId(item);
	const createdAt = getReviewItemCreatedAt(item);

	const visibleLabels = isGitHubPullRequest(item)
		? item.labels.filter(
				(label) => !hiddenLabelSet.has(label.name.toLowerCase()),
			)
		: [];

	const mentions = isGitHubPullRequest(item) ? extractMentions(item.body) : [];
	const submitter = isLyricsSite ? item.submitter : null;

	return (
		<Flex direction="column" gap="2">
			<Flex align="center" justify="between">
				<Flex align="center" gap="1">
					<Text size="2" weight="medium">
						{isLyricsSite ? `#${id}` : `#${id}`}
					</Text>
					<Box
						className={styles.sourceLabel}
						style={{
							backgroundColor: isLyricsSite ? "#8b5cf6" : "#238636",
						}}
					>
						<Text size="1">{isLyricsSite ? "歌词站" : "GitHub"}</Text>
					</Box>
					{reviewedByUser && <Checkmark20Regular className={styles.icon} />}
				</Flex>
				<Flex align="center" gap="1" className={styles.meta}>
					<Clock20Regular className={styles.icon} />
					<Text size="1" color="gray" className={styles.timeText}>
						{formatTimeAgo(createdAt)}
					</Text>
				</Flex>
			</Flex>
			<Text size="3" className={styles.title} title={item.title}>
				{item.title}
			</Text>
			{isLyricsSite && item.artist && (
				<Text size="2" color="gray" className={styles.artistText}>
					{item.artist}
					{item.album && ` - ${item.album}`}
				</Text>
			)}
			<Flex align="center" gap="2" className={styles.mentions}>
				<Person20Regular className={styles.icon} />
				{submitter ? (
					onSelectUser ? (
						<Button
							size="1"
							variant="soft"
							color="gray"
							onClick={(event) => {
								event.stopPropagation();
								onSelectUser(submitter);
							}}
							asChild
						>
							<span>@{submitter}</span>
						</Button>
					) : (
						<Text size="2" color="gray">
							@{submitter}
						</Text>
					)
				) : mentions.length > 0 ? (
					<Flex align="center" gap="1" wrap="wrap">
						{mentions.map((name) =>
							onSelectUser ? (
								<Button
									key={name}
									size="1"
									variant="soft"
									color="gray"
									onClick={(event) => {
										event.stopPropagation();
										onSelectUser(name);
									}}
									asChild
								>
									<span>@{name}</span>
								</Button>
							) : (
								<Text key={name} size="2" color="gray" asChild>
									<span>@{name}</span>
								</Text>
							),
						)}
					</Flex>
				) : (
					<Text size="2" color="gray">
						未提到用户
					</Text>
				)}
			</Flex>
			{isGitHubPullRequest(item) && (
				<Flex wrap="wrap" gap="2">
					{visibleLabels.length > 0 ? (
						visibleLabels.map((label) => (
							<Box
								key={label.name}
								className={styles.label}
								style={{
									backgroundColor: `#${label.color}`,
									color: getLabelTextColor(label.color),
								}}
							>
								<Text size="1">{label.name}</Text>
							</Box>
						))
					) : (
						<Text size="1" color="gray">
							无标签
						</Text>
					)}
				</Flex>
			)}
			{isLyricsSite && item.audio && (
				<Flex align="center" gap="1" className={styles.audioIndicator}>
					<Text size="1" color="green">
						已上传音频
					</Text>
				</Flex>
			)}
			{isLyricsSite &&
				(item.language || (item.tags && item.tags.length > 0)) && (
					<Flex wrap="wrap" gap="1" align="center">
						{item.language && (
							<Text size="1" color="gray">
								语言：
								{item.language === "ja"
									? "日语"
									: item.language === "zh"
										? "中文"
										: item.language === "en"
											? "英语"
											: item.language === "ko"
												? "韩语"
												: item.language}
							</Text>
						)}
						{item.tags && item.tags.length > 0 && item.language && (
							<Text size="1" color="gray">
								|
							</Text>
						)}
						{item.tags?.map((tag) => (
							<Box
								key={tag}
								className={styles.label}
								style={{ backgroundColor: "#3b82f6", color: "#fff" }}
							>
								<Text size="1">{tag}</Text>
							</Box>
						))}
					</Flex>
				)}
		</Flex>
	);
};
