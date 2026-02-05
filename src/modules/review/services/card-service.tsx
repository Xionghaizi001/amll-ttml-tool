import { Clock20Regular, Person20Regular } from "@fluentui/react-icons";
import { Box, Flex, Text } from "@radix-ui/themes";

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

export const extractMentions = (body: string) => {
	const matches = [...body.matchAll(/@([a-zA-Z0-9-]+)/g)];
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
	const pushValues = (
		key:
			| "musicName"
			| "artists"
			| "album"
			| "ncmId"
			| "qqMusicId"
			| "spotifyId"
			| "appleMusicId",
		value: string,
	) => {
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
		const cleaned = value
			.replace(/^[-*]\s+/, "")
			.replace(/^\[[ xX]\]\s*/, "")
			.replace(/^>\s*/, "")
			.replace(/`/g, "")
			.trim();
		if (!cleaned) return;
		result.remark.push(cleaned);
	};
	const getKeyFromText = (text: string) => {
		const normalized = text.replace(/\s/g, "").toLowerCase();
		if (normalized.includes("音乐名称") || normalized.includes("歌名")) {
			return "musicName" as const;
		}
		if (
			normalized.includes("音乐作者") ||
			normalized.includes("歌手") ||
			normalized.includes("艺术家")
		) {
			return "artists" as const;
		}
		if (normalized.includes("音乐专辑") || normalized.includes("专辑")) {
			return "album" as const;
		}
		if (
			normalized.includes("网易云音乐id") ||
			(normalized.includes("网易云音乐") && normalized.includes("id"))
		) {
			return "ncmId" as const;
		}
		if (
			normalized.includes("qq音乐id") ||
			(normalized.includes("qq音乐") && normalized.includes("id"))
		) {
			return "qqMusicId" as const;
		}
		if (normalized.includes("spotifyid")) {
			return "spotifyId" as const;
		}
		if (normalized.includes("applemusicid")) {
			return "appleMusicId" as const;
		}
		if (normalized.includes("备注")) {
			return "remark" as const;
		}
		return null;
	};
	let currentKey:
		| "musicName"
		| "artists"
		| "album"
		| "ncmId"
		| "qqMusicId"
		| "spotifyId"
		| "appleMusicId"
		| "remark"
		| null = null;
	const lines = body.split(/\r?\n/);
	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line) continue;
		const inlineMatch = line.match(
			/^(?:[-*]\s*)?(?:#+\s*)?(?:\*\*)?(.+?)(?:\*\*)?\s*[:：]\s*(.+)$/,
		);
		if (inlineMatch) {
			const key = getKeyFromText(inlineMatch[1] ?? "");
			if (key) {
				currentKey = key;
				if (key === "remark") {
					pushRemark(inlineMatch[2] ?? "");
				} else {
					pushValues(key, inlineMatch[2] ?? "");
				}
				continue;
			}
		}
		const headingMatch = line.match(
			/^(?:[-*]\s*)?(?:#+\s*)?(?:\*\*)?(.+?)(?:\*\*)?$/,
		);
		if (headingMatch) {
			const key = getKeyFromText(headingMatch[1] ?? "");
			if (key) {
				currentKey = key;
				continue;
			}
			if (/^#+\s+/.test(line)) {
				currentKey = null;
				continue;
			}
		}
		if (currentKey) {
			if (currentKey === "remark") {
				pushRemark(line);
			} else {
				pushValues(currentKey, line);
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
	pr: ReviewPullRequest;
	hiddenLabelSet: Set<string>;
	styles: Record<string, string>;
}) => {
	const mentions = extractMentions(options.pr.body);
	const visibleLabels = options.pr.labels.filter(
		(label) => !options.hiddenLabelSet.has(label.name.toLowerCase()),
	);
	return (
		<Flex direction="column" gap="2">
			<Flex align="center" justify="between">
				<Text size="2" weight="medium">
					#{options.pr.number}
				</Text>
				<Flex align="center" gap="1" className={options.styles.meta}>
					<Clock20Regular className={options.styles.icon} />
					<Text size="1" color="gray" className={options.styles.timeText}>
						{formatTimeAgo(options.pr.createdAt)}
					</Text>
				</Flex>
			</Flex>
			<Text
				size="3"
				className={options.styles.title}
				title={options.pr.title}
			>
				{options.pr.title}
			</Text>
			<Flex align="center" gap="2" className={options.styles.mentions}>
				<Person20Regular className={options.styles.icon} />
				<Text size="2" color="gray">
					{mentions.length > 0
						? mentions.map((name) => `@${name}`).join(" ")
						: "未提到用户"}
				</Text>
			</Flex>
			<Flex wrap="wrap" gap="2">
				{visibleLabels.length > 0 ? (
					visibleLabels.map((label) => (
						<Box
							key={label.name}
							className={options.styles.label}
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
		</Flex>
	);
};
