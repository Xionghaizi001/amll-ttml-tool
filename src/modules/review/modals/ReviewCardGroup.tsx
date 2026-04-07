import {
	ArrowSquareUpRight20Regular,
	Checkmark20Regular,
	Clock20Regular,
	Comment20Regular,
	MusicNote220Regular,
	PersonCircle20Regular,
	Record20Regular,
	Stack20Regular,
} from "@fluentui/react-icons";
import { Box, Button, Flex, Spinner, Text } from "@radix-ui/themes";
import {
	AppleMusicIcon,
	NeteaseIcon,
	QQMusicIcon,
	SpotifyIcon,
} from "$/modules/project/modals/PlatformIcons";
import { useCallback, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
	extractMentions,
	formatTimeAgo,
	getLabelTextColor,
	isGitHubPullRequest,
	isLyricsSiteSubmission,
	parseReviewMetadata,
	renderMetaValues,
	type ReviewItem,
	type ReviewPullRequest,
} from "$/modules/review/services/card-service";
import type { LyricsSiteSubmission } from "$/modules/lyrics-site";

type PlatformItem = {
	ids: string[];
	label: string;
	icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
	url: string | null;
};

const buildPlatformItems = (ids: {
	ncmId?: string | string[];
	qqId?: string | string[];
	spotifyId?: string | string[];
	amId?: string | string[];
}): PlatformItem[] => {
	const toIds = (id: string | string[] | undefined): string[] => {
		if (!id) return [];
		if (Array.isArray(id)) return id.filter(Boolean);
		return id ? [id] : [];
	};

	const ncmIds = toIds(ids.ncmId);
	const qqIds = toIds(ids.qqId);
	const spotifyIds = toIds(ids.spotifyId);
	const amIds = toIds(ids.amId);

	return [
		{
			ids: ncmIds,
			label: "网易云音乐",
			icon: NeteaseIcon,
			url: ncmIds[0]
				? `https://music.163.com/#/song?id=${ncmIds[0]}`
				: null,
		},
		{
			ids: qqIds,
			label: "QQ音乐",
			icon: QQMusicIcon,
			url: qqIds[0]
				? `https://y.qq.com/n/ryqq/songDetail/${qqIds[0]}`
				: null,
		},
		{
			ids: spotifyIds,
			label: "Spotify",
			icon: SpotifyIcon,
			url: spotifyIds[0]
				? `https://open.spotify.com/track/${spotifyIds[0]}`
				: null,
		},
		{
			ids: amIds,
			label: "Apple Music",
			icon: AppleMusicIcon,
			url: amIds[0]
				? `https://music.apple.com/song/${amIds[0]}`
				: null,
		},
	].filter((item) =>
		item.ids.length > 0 && (item.label === "网易云音乐" || item.url),
	);
};

type GitHubExpandedContentProps = {
	item: ReviewPullRequest;
	hiddenLabelSet: Set<string>;
	audioLoadPendingId: string | null;
	lastNeteaseIdByPr: Record<number, string>;
	onOpenFile: (item: ReviewPullRequest, ids: string[]) => void | Promise<void>;
	reviewedByUser?: boolean;
	repoOwner: string;
	repoName: string;
	styles: Record<string, string>;
};

const GitHubExpandedContent = (options: GitHubExpandedContentProps) => {
	const [openFilePending, setOpenFilePending] = useState(false);
	const mentions = extractMentions(options.item.body);
	const mention = mentions[0];
	const visibleLabels = options.item.labels.filter(
		(label) => !options.hiddenLabelSet.has(label.name.toLowerCase()),
	);
	const metadata = parseReviewMetadata(options.item.body);
	const remarkText = metadata.remark.join("\n").trim();
	const neteaseIds = metadata.ncmId.filter(Boolean);
	const handleOpenFile = useCallback(async () => {
		if (openFilePending) return;
		setOpenFilePending(true);
		try {
			await options.onOpenFile(options.item, neteaseIds);
		} finally {
			setOpenFilePending(false);
		}
	}, [neteaseIds, openFilePending, options]);

	const platformItems = buildPlatformItems({
		ncmId: metadata.ncmId,
		qqId: metadata.qqMusicId,
		spotifyId: metadata.spotifyId,
		amId: metadata.appleMusicId,
	});

	const prUrl = `https://github.com/${options.repoOwner}/${options.repoName}/pull/${options.item.number}`;
	const mentionUrl = mention ? `https://github.com/${mention}` : null;
	return (
		<Flex direction="column" className={options.styles.overlayCardInner}>
			<Flex
				align="center"
				justify="between"
				className={options.styles.overlayHeader}
			>
				<Flex
					align="center"
					gap="2"
					className={options.styles.overlayHeaderLeft}
				>
					<Text asChild size="2" weight="medium">
						<a
							href={prUrl}
							target="_blank"
							rel="noreferrer"
							className={options.styles.linkMuted}
						>
							#{options.item.number}
						</a>
					</Text>
					<Box
						className={options.styles.sourceLabel}
						style={{ backgroundColor: "#238636" }}
					>
						<Text size="1">GitHub</Text>
					</Box>
					{mentionUrl ? (
						<Flex align="center" gap="1">
							<Text asChild size="2">
								<a
									href={mentionUrl}
									target="_blank"
									rel="noreferrer"
									className={options.styles.linkMuted}
								>
									{mention}
								</a>
							</Text>
							<ArrowSquareUpRight20Regular className={options.styles.icon} />
						</Flex>
					) : (
						<Text size="2" color="gray">
							未提到用户
						</Text>
					)}
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
				<Flex align="center" gap="1" className={options.styles.meta}>
					{options.reviewedByUser && (
						<Checkmark20Regular className={options.styles.icon} />
					)}
					<Clock20Regular className={options.styles.icon} />
					<Text size="1" color="gray" className={options.styles.timeText}>
						{formatTimeAgo(options.item.createdAt)}
					</Text>
				</Flex>
			</Flex>
			<Box className={options.styles.overlayBody}>
				<Text size="4" weight="medium" className={options.styles.overlayTitle}>
					{options.item.title}
				</Text>
				<Box
					className={`${options.styles.metaBlock} ${options.styles.metaBlockPanel}`}
				>
					<Text size="2" weight="medium">
						基础元数据
					</Text>
					<Flex direction="column" gap="2">
						<Flex
							direction="column"
							gap="1"
							className={options.styles.metaSection}
						>
							<Flex
								align="center"
								gap="2"
								className={options.styles.metaRow}
							>
								<Record20Regular className={options.styles.icon} />
								<Text size="2" weight="bold" className={options.styles.metaLabel}>
									音乐名称
								</Text>
							</Flex>
							<Flex wrap="wrap" gap="2" className={options.styles.metaValuesRow}>
								{renderMetaValues(metadata.musicName, options.styles)}
							</Flex>
						</Flex>
						<Flex
							direction="column"
							gap="1"
							className={options.styles.metaSection}
						>
							<Flex
								align="center"
								gap="2"
								className={options.styles.metaRow}
							>
								<PersonCircle20Regular className={options.styles.icon} />
								<Text size="2" weight="bold" className={options.styles.metaLabel}>
									音乐作者
								</Text>
							</Flex>
							<Flex wrap="wrap" gap="2" className={options.styles.metaValuesRow}>
								{renderMetaValues(metadata.artists, options.styles)}
							</Flex>
						</Flex>
						<Flex
							direction="column"
							gap="1"
							className={options.styles.metaSection}
						>
							<Flex
								align="center"
								gap="2"
								className={options.styles.metaRow}
							>
								<Stack20Regular className={options.styles.icon} />
								<Text size="2" weight="bold" className={options.styles.metaLabel}>
									音乐专辑
								</Text>
							</Flex>
							<Flex wrap="wrap" gap="2" className={options.styles.metaValuesRow}>
								{renderMetaValues(metadata.album, options.styles)}
							</Flex>
						</Flex>
					</Flex>
				</Box>
				{platformItems.length > 0 && (
					<Box
						className={`${options.styles.contentBlock} ${options.styles.metaBlockPanel}`}
					>
						<Text size="2" weight="medium" className={options.styles.blockTitle}>
							平台关联ID
						</Text>
						<Flex
							direction="column"
							gap="2"
							className={options.styles.platformList}
						>
							{platformItems.map((item) => {
								const Icon = item.icon;
								const isNetease = item.label === "网易云音乐";
								const idText = item.ids[0] ?? "";
								return (
									<Flex
										key={item.label}
										align="center"
										justify="between"
										className={options.styles.platformItem}
									>
										<Flex align="center" gap="2">
											<Icon className={options.styles.platformIcon} />
											<Text size="2" weight="bold">
												{item.label}
											</Text>
										</Flex>
										{isNetease ? (
											<Flex wrap="wrap" gap="2">
												{item.ids.map((id) => {
													const isLoading = options.audioLoadPendingId === id;
													const isLastOpened =
														options.lastNeteaseIdByPr[options.item.number] === id;
													return (
														<Button
															key={id}
															size="1"
															onClick={() =>
																options.onOpenFile(options.item, [id])
															}
															disabled={isLoading}
															{...(isLastOpened
																? { variant: "soft", color: "blue" }
																: {})}
														>
															{isLoading ? "加载中..." : id}
														</Button>
													);
												})}
											</Flex>
										) : (
											<Button asChild size="1" variant="soft" color="gray">
												<a
													href={item.url ?? undefined}
													target="_blank"
													rel="noreferrer"
												>
													{idText}
												</a>
											</Button>
										)}
									</Flex>
								);
							})}
						</Flex>
					</Box>
				)}
				{remarkText.length > 0 && (
					<Box
						className={`${options.styles.contentBlock} ${options.styles.metaBlockPanel}`}
					>
						<Flex align="center" gap="2" className={options.styles.remarkHeader}>
							<Comment20Regular className={options.styles.icon} />
							<Text size="2" weight="medium">
								备注
							</Text>
						</Flex>
						<Box className={options.styles.remarkText}>
							<ReactMarkdown
								remarkPlugins={[remarkGfm]}
								components={{
									a: (props) => (
										<a {...props} target="_blank" rel="noreferrer noopener" />
									),
								}}
							>
								{remarkText}
							</ReactMarkdown>
						</Box>
					</Box>
				)}
				<Flex
					align="center"
					justify="end"
					gap="2"
					className={options.styles.overlayFooter}
				>
					<Button onClick={handleOpenFile} size="2" disabled={openFilePending}>
						<Flex align="center" gap="2">
							{openFilePending ? (
								<Spinner size="1" />
							) : (
								<ArrowSquareUpRight20Regular
									className={options.styles.icon}
								/>
							)}
							<Text size="2">{openFilePending ? "打开中..." : "打开文件"}</Text>
						</Flex>
					</Button>
				</Flex>
			</Box>
		</Flex>
	);
};

type LyricsSiteExpandedContentProps = {
	item: LyricsSiteSubmission;
	onOpenFile: (item: LyricsSiteSubmission) => void | Promise<void>;
	styles: Record<string, string>;
};

const LyricsSiteExpandedContent = (options: LyricsSiteExpandedContentProps) => {
	const [openFilePending, setOpenFilePending] = useState(false);

	const handleOpenFile = useCallback(async () => {
		if (openFilePending) return;
		setOpenFilePending(true);
		try {
			await options.onOpenFile(options.item);
		} finally {
			setOpenFilePending(false);
		}
	}, [openFilePending, options]);

	const platformItems = buildPlatformItems({
		ncmId: options.item.ids.ncmId,
		qqId: options.item.ids.qqId,
		spotifyId: options.item.ids.spotifyId,
		amId: options.item.ids.amId,
	});

	return (
		<Flex direction="column" className={options.styles.overlayCardInner}>
			<Flex
				align="center"
				justify="between"
				className={options.styles.overlayHeader}
			>
				<Flex
					align="center"
					gap="2"
					className={options.styles.overlayHeaderLeft}
				>
					<Text size="2" weight="medium">
						#{options.item.id}
					</Text>
					<Box
						className={options.styles.sourceLabel}
						style={{ backgroundColor: "#8b5cf6" }}
					>
						<Text size="1">歌词站</Text>
					</Box>
					<Flex align="center" gap="1">
						<Text size="2" color="gray">
							提交者:
						</Text>
						<Text size="2" weight="medium">
							{options.item.submitterInfo?.displayName || options.item.submitter}
						</Text>
					</Flex>
				</Flex>
				<Flex align="center" gap="1" className={options.styles.meta}>
					<Clock20Regular className={options.styles.icon} />
					<Text size="1" color="gray" className={options.styles.timeText}>
						{formatTimeAgo(new Date(options.item.createdAt).toISOString())}
					</Text>
				</Flex>
			</Flex>
			<Box className={options.styles.overlayBody}>
				<Text size="4" weight="medium" className={options.styles.overlayTitle}>
					{options.item.title}
				</Text>
				<Box
					className={`${options.styles.metaBlock} ${options.styles.metaBlockPanel}`}
				>
					<Text size="2" weight="medium">
						基础信息
					</Text>
					<Flex direction="column" gap="2">
						{options.item.artist && (
							<Flex
								direction="column"
								gap="1"
								className={options.styles.metaSection}
							>
								<Flex
									align="center"
									gap="2"
									className={options.styles.metaRow}
								>
									<PersonCircle20Regular className={options.styles.icon} />
									<Text size="2" weight="bold" className={options.styles.metaLabel}>
										艺术家
									</Text>
								</Flex>
								<Flex wrap="wrap" gap="2" className={options.styles.metaValuesRow}>
									<Text size="2" className={options.styles.metaChip}>
										{options.item.artist}
									</Text>
								</Flex>
							</Flex>
						)}
						{options.item.album && (
							<Flex
								direction="column"
								gap="1"
								className={options.styles.metaSection}
							>
								<Flex
									align="center"
									gap="2"
									className={options.styles.metaRow}
								>
									<Stack20Regular className={options.styles.icon} />
									<Text size="2" weight="bold" className={options.styles.metaLabel}>
										专辑
									</Text>
								</Flex>
								<Flex wrap="wrap" gap="2" className={options.styles.metaValuesRow}>
									<Text size="2" className={options.styles.metaChip}>
										{options.item.album}
									</Text>
								</Flex>
							</Flex>
						)}
						{options.item.language && (
							<Flex
								direction="column"
								gap="1"
								className={options.styles.metaSection}
							>
								<Flex
									align="center"
									gap="2"
									className={options.styles.metaRow}
								>
									<Text size="2" weight="bold" className={options.styles.metaLabel}>
										语言
									</Text>
								</Flex>
								<Flex wrap="wrap" gap="2" className={options.styles.metaValuesRow}>
									<Text size="2" className={options.styles.metaChip}>
										{options.item.language === 'ja' ? '日语' :
										 options.item.language === 'zh' ? '中文' :
										 options.item.language === 'en' ? '英语' :
										 options.item.language === 'ko' ? '韩语' : options.item.language}
									</Text>
								</Flex>
							</Flex>
						)}
						{options.item.tags && options.item.tags.length > 0 && (
							<Flex
								direction="column"
								gap="1"
								className={options.styles.metaSection}
							>
								<Flex
									align="center"
									gap="2"
									className={options.styles.metaRow}
								>
									<Text size="2" weight="bold" className={options.styles.metaLabel}>
										标签
									</Text>
								</Flex>
								<Flex wrap="wrap" gap="2" className={options.styles.metaValuesRow}>
									{options.item.tags.map((tag) => (
										<Text key={tag} size="2" className={options.styles.metaChip}>
											{tag}
										</Text>
									))}
								</Flex>
							</Flex>
						)}
					</Flex>
				</Box>
				{platformItems.length > 0 && (
					<Box
						className={`${options.styles.contentBlock} ${options.styles.metaBlockPanel}`}
					>
						<Text size="2" weight="medium" className={options.styles.blockTitle}>
							平台关联ID
						</Text>
						<Flex
							direction="column"
							gap="2"
							className={options.styles.platformList}
						>
							{platformItems.map((item) => {
							const Icon = item.icon;
							const isNetease = item.label === "网易云音乐";
							const idText = item.ids[0] ?? "";
							return (
								<Flex
									key={item.label}
									align="center"
									justify="between"
									className={options.styles.platformItem}
								>
									<Flex align="center" gap="2">
										<Icon className={options.styles.platformIcon} />
										<Text size="2" weight="bold">
											{item.label}
										</Text>
									</Flex>
									<Button asChild size="1" variant="soft" color="gray">
										<a
											href={item.url ?? undefined}
											target="_blank"
											rel="noreferrer"
										>
											{idText}
										</a>
									</Button>
									{isNetease && (
										<Button
											size="1"
											variant="soft"
											color="blue"
											onClick={() =>
												options.onLoadNeteaseAudio?.(options.item, [idText])
											}
										>
											加载
										</Button>
									)}
								</Flex>
							);
						})}
						</Flex>
					</Box>
				)}
				{options.item.audio && (
					<Box
						className={`${options.styles.contentBlock} ${options.styles.metaBlockPanel}`}
					>
						<Flex align="center" gap="2" className={options.styles.audioHeader}>
							<MusicNote220Regular className={options.styles.icon} />
							<Text size="2" weight="medium">
								用户上传音频
							</Text>
						</Flex>
						<Flex direction="column" gap="2" className={options.styles.audioInfo}>
							{options.item.audio.title && (
								<Text size="2">
									标题: {options.item.audio.title}
								</Text>
							)}
							{options.item.audio.artist && (
								<Text size="2">
									艺术家: {options.item.audio.artist}
								</Text>
							)}
							{options.item.audio.album && (
								<Text size="2">
									专辑: {options.item.audio.album}
								</Text>
							)}
						</Flex>
					</Box>
				)}
				{options.item.notes && (
					<Box
						className={`${options.styles.contentBlock} ${options.styles.metaBlockPanel}`}
					>
						<Flex align="center" gap="2" className={options.styles.remarkHeader}>
							<Comment20Regular className={options.styles.icon} />
							<Text size="2" weight="medium">
								备注
							</Text>
						</Flex>
						<Box className={options.styles.remarkText}>
							<ReactMarkdown
								remarkPlugins={[remarkGfm]}
								components={{
									a: (props) => (
										<a {...props} target="_blank" rel="noreferrer noopener" />
									),
								}}
							>
								{options.item.notes}
							</ReactMarkdown>
						</Box>
					</Box>
				)}
				<Flex
					align="center"
					justify="end"
					gap="2"
					className={options.styles.overlayFooter}
				>
					<Button onClick={handleOpenFile} size="2" disabled={openFilePending}>
						<Flex align="center" gap="2">
							{openFilePending ? (
								<Spinner size="1" />
							) : (
								<ArrowSquareUpRight20Regular
									className={options.styles.icon}
								/>
							)}
							<Text size="2">{openFilePending ? "打开中..." : "打开文件"}</Text>
						</Flex>
					</Button>
				</Flex>
			</Box>
		</Flex>
	);
};

export const ReviewExpandedContent = (options: {
	item: ReviewItem;
	hiddenLabelSet: Set<string>;
	audioLoadPendingId: string | null;
	lastNeteaseIdByPr: Record<number, string>;
	onOpenFile: (item: ReviewItem, ids?: string[]) => void | Promise<void>;
	reviewedByUser?: boolean;
	repoOwner: string;
	repoName: string;
	styles: Record<string, string>;
}) => {
	if (isLyricsSiteSubmission(options.item)) {
		return (
			<LyricsSiteExpandedContent
				item={options.item}
				onOpenFile={(item) => options.onOpenFile(item)}
				styles={options.styles}
			/>
		);
	}

	if (isGitHubPullRequest(options.item)) {
		return (
			<GitHubExpandedContent
				item={options.item}
				hiddenLabelSet={options.hiddenLabelSet}
				audioLoadPendingId={options.audioLoadPendingId}
				lastNeteaseIdByPr={options.lastNeteaseIdByPr}
				onOpenFile={(item, ids) => options.onOpenFile(item, ids)}
				reviewedByUser={options.reviewedByUser}
				repoOwner={options.repoOwner}
				repoName={options.repoName}
				styles={options.styles}
			/>
		);
	}

	return null;
};
