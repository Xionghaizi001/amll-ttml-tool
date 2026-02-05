import {
	ArrowSquareUpRight20Regular,
	Clock20Regular,
	Comment20Regular,
	PersonCircle20Regular,
	Record20Regular,
	Stack20Regular,
} from "@fluentui/react-icons";
import { Box, Button, Flex, Text } from "@radix-ui/themes";
import {
	AppleMusicIcon,
	NeteaseIcon,
	QQMusicIcon,
	SpotifyIcon,
} from "$/modules/project/modals/PlatformIcons";
import {
	extractMentions,
	formatTimeAgo,
	getLabelTextColor,
	parseReviewMetadata,
	renderMetaValues,
	type ReviewPullRequest,
} from "$/modules/review/services/review-card-service";

export const renderExpandedContent = (options: {
	pr: ReviewPullRequest;
	hiddenLabelSet: Set<string>;
	audioLoadPendingId: string | null;
	lastNeteaseIdByPr: Record<number, string>;
	onLoadNeteaseAudio: (prNumber: number, id: string) => void;
	onOpenFile: (pr: ReviewPullRequest) => void;
	repoOwner: string;
	repoName: string;
	styles: Record<string, string>;
}) => {
	const mentions = extractMentions(options.pr.body);
	const mention = mentions[0];
	const visibleLabels = options.pr.labels.filter(
		(label) => !options.hiddenLabelSet.has(label.name.toLowerCase()),
	);
	const metadata = parseReviewMetadata(options.pr.body);
	const remarkText = metadata.remark.join(" ").trim();
	const platformItems = [
		{
			id: metadata.ncmId[0],
			label: "网易云音乐",
			icon: NeteaseIcon,
			url: metadata.ncmId[0]
				? `https://music.163.com/#/song?id=${metadata.ncmId[0]}`
				: null,
		},
		{
			id: metadata.qqMusicId[0],
			label: "QQ音乐",
			icon: QQMusicIcon,
			url: metadata.qqMusicId[0]
				? `https://y.qq.com/n/ryqq/songDetail/${metadata.qqMusicId[0]}`
				: null,
		},
		{
			id: metadata.spotifyId[0],
			label: "Spotify",
			icon: SpotifyIcon,
			url: metadata.spotifyId[0]
				? `https://open.spotify.com/track/${metadata.spotifyId[0]}`
				: null,
		},
		{
			id: metadata.appleMusicId[0],
			label: "Apple Music",
			icon: AppleMusicIcon,
			url: metadata.appleMusicId[0]
				? `https://music.apple.com/song/${metadata.appleMusicId[0]}`
				: null,
		},
	].filter((item) => item.id && item.url);
	const prUrl = `https://github.com/${options.repoOwner}/${options.repoName}/pull/${options.pr.number}`;
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
							#{options.pr.number}
						</a>
					</Text>
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
					<Clock20Regular className={options.styles.icon} />
					<Text size="1" color="gray" className={options.styles.timeText}>
						{formatTimeAgo(options.pr.createdAt)}
					</Text>
				</Flex>
			</Flex>
			<Box className={options.styles.overlayBody}>
				<Text size="4" weight="medium" className={options.styles.overlayTitle}>
					{options.pr.title}
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
								const idText = item.id ?? "";
								const isNetease = item.label === "网易云音乐";
								const isLoading = options.audioLoadPendingId === idText;
								const isLastOpened =
									options.lastNeteaseIdByPr[options.pr.number] === idText;
								return (
									<details key={item.label} className={options.styles.treeItem}>
										<summary className={options.styles.treeSummary}>
											<Flex
												align="center"
												gap="2"
												className={options.styles.platformItem}
											>
												<Icon className={options.styles.platformIcon} />
												<Text size="2" weight="bold">
													{item.label}
												</Text>
											</Flex>
										</summary>
										<Box className={options.styles.treeContent}>
											{isNetease ? (
												<Button
													size="1"
													onClick={() =>
														options.onLoadNeteaseAudio(
															options.pr.number,
															idText,
														)
													}
													disabled={isLoading}
													{...(isLastOpened
														? { variant: "soft", color: "blue" }
														: {})}
												>
													{isLoading ? "加载中..." : idText}
												</Button>
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
										</Box>
									</details>
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
						<Text size="2" className={options.styles.remarkText}>
							{remarkText}
						</Text>
					</Box>
				)}
				<Flex
					align="center"
					justify="end"
					gap="2"
					className={options.styles.overlayFooter}
				>
					<Button onClick={() => options.onOpenFile(options.pr)} size="2">
						<Flex align="center" gap="2">
							<ArrowSquareUpRight20Regular className={options.styles.icon} />
							<Text size="2">打开文件</Text>
						</Flex>
					</Button>
				</Flex>
			</Box>
		</Flex>
	);
};
