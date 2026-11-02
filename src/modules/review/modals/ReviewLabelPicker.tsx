import {
	Add20Regular,
	Checkmark20Regular,
	Dismiss20Regular,
} from "@fluentui/react-icons";
import {
	Box,
	Button,
	Flex,
	Popover,
	Spinner,
	Text,
	TextField,
} from "@radix-ui/themes";
import { useAtomValue, useSetAtom } from "jotai";
import { useLayoutEffect, useRef, useState } from "react";
import { savePullRequestLabels } from "$/modules/github/services/label-services";
import { githubPatAtom, reviewLabelsAtom } from "$/modules/settings/states";
import { pushNotificationAtom } from "$/states/notifications";
import {
	getLabelTextColor,
	type ReviewLabel,
	type ReviewPullRequest,
} from "../services/card-service";
import styles from "./ReviewLabelPicker.module.css";

const LABEL_GROUPS = [
	{
		title: "审核流程",
		hint: "接手审核时打「审核中」，反馈后打「待更新」",
		names: [
			"审核中",
			"待更新",
			"快速审核",
			"慢速审核队列",
			"暂停审核",
			"陈年投稿",
			"已完成",
		],
	},
	{
		title: "音源",
		hint: "拿不到播放链接、没法核对时间轴时使用",
		names: ["缺少音源"],
	},
	{
		title: "内容特性",
		names: [
			"多语言翻译",
			"逐字翻译/音译",
			"多版本提交",
			"集合投稿",
			"首次投稿",
			"不支持的平台",
			"实验性歌词提交/修正",
			"歌词制作占位",
		],
	},
	{
		title: "语言",
		names: [
			"语言：汉语",
			"语言：日语",
			"语言：英语",
			"语言：韩语",
			"语言：其它",
		],
	},
];
const normalizeName = (name: string) =>
	name.replace(/[\s:：]/g, "").toLowerCase();

export const ReviewLabelPicker = (props: {
	item: ReviewPullRequest;
	repoOwner: string;
	repoName: string;
	onLabelsUpdated: (prNumber: number, labels: ReviewLabel[]) => void;
}) => {
	const token = useAtomValue(githubPatAtom);
	const labels = useAtomValue(reviewLabelsAtom);
	const notify = useSetAtom(pushNotificationAtom);
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState(props.item.labels);
	const originalRef = useRef(props.item.labels);
	const [panel, setPanel] = useState<HTMLDivElement | null>(null);
	const [alignOffset, setAlignOffset] = useState(0);
	useLayoutEffect(() => {
		if (!panel) return;
		const observer = new ResizeObserver(() =>
			setAlignOffset(12 - panel.getBoundingClientRect().height / 3),
		);
		observer.observe(panel);
		return () => observer.disconnect();
	}, [panel]);
	const [pending, setPending] = useState(false);
	const pendingRef = useRef(false);
	const [error, setError] = useState("");
	const [search, setSearch] = useState("");
	const selected = new Set(draft.map((label) => label.name.toLowerCase()));
	const matches = labels.filter((label) =>
		`${label.name} ${label.description ?? ""}`
			.toLowerCase()
			.includes(search.trim().toLowerCase()),
	);
	const changeLabel = (label: ReviewLabel) => {
		setDraft((prev) =>
			prev.some((item) => item.name.toLowerCase() === label.name.toLowerCase())
				? prev.filter(
						(item) => item.name.toLowerCase() !== label.name.toLowerCase(),
					)
				: [...prev, label],
		);
	};
	const save = async () => {
		if (pendingRef.current) return;
		const original = originalRef.current.map((label) => label.name);
		if (
			original.length === draft.length &&
			original.every((name) => selected.has(name.toLowerCase()))
		)
			return;
		pendingRef.current = true;
		setPending(true);
		setError("");
		try {
			const updated = await savePullRequestLabels({
				token,
				repoOwner: props.repoOwner,
				repoName: props.repoName,
				prNumber: props.item.number,
				original,
				selected: draft.map((label) => label.name),
			});
			props.onLabelsUpdated(props.item.number, updated);
			originalRef.current = updated;
			setDraft(updated);
		} catch (cause) {
			const message =
				cause instanceof Error ? cause.message : "保存标签失败，请重试";
			setError(message);
			notify({
				title: `PR #${props.item.number} 标签保存失败`,
				description: `${message}。重新打开标签面板可重试。`,
				level: "error",
			});
		} finally {
			pendingRef.current = false;
			setPending(false);
		}
	};
	const handleOpenChange = (next: boolean) => {
		if (next && pendingRef.current) return;
		if (next && !error) {
			originalRef.current = props.item.labels;
			setDraft(props.item.labels);
		}
		setOpen(next);
		if (!next) void save();
	};
	const renderLabel = (
		label: ReviewLabel,
		mode: "selected" | "category" | "all",
	) => {
		const added = selected.has(label.name.toLowerCase());
		const Icon =
			mode === "selected"
				? Dismiss20Regular
				: added
					? Checkmark20Regular
					: Add20Regular;
		return (
			<Button
				key={label.name}
				size="1"
				variant="outline"
				color="gray"
				className={styles.chip}
				data-selected={added}
				data-filled={mode === "selected"}
				style={
					mode === "selected"
						? {
								backgroundColor: `#${label.color}`,
								color: getLabelTextColor(label.color),
							}
						: undefined
				}
				title={
					label.description ? `${label.name}：${label.description}` : label.name
				}
				aria-label={`${added ? "移除" : "添加"}标签 ${label.name}`}
				aria-pressed={added}
				disabled={pending || !token.trim()}
				onClick={() => void changeLabel(label)}
			>
				{mode === "all" ? (
					<span
						className={styles.dot}
						style={{ backgroundColor: `#${label.color}` }}
					/>
				) : mode === "category" ? (
					<Icon className={styles.icon} />
				) : null}
				<Text truncate className={styles.chipText}>
					{label.name}
				</Text>
				{mode === "selected" && <Icon className={styles.icon} />}
			</Button>
		);
	};
	return (
		<Popover.Root open={open} onOpenChange={handleOpenChange} modal>
			<Popover.Trigger>
				<Button
					size="1"
					variant="soft"
					color="gray"
					aria-label="选择标签"
					title={pending ? "正在保存标签" : "选择标签"}
					disabled={pending}
				>
					{pending ? <Spinner size="1" /> : <Add20Regular />}
				</Button>
			</Popover.Trigger>
			<Popover.Content
				ref={setPanel}
				alignOffset={alignOffset}
				width="460px"
				size="1"
				side="right"
				align="start"
				sideOffset={8}
				collisionPadding={12}
				className={styles.panel}
				aria-label="选择标签"
				onEscapeKeyDown={(event) => event.stopPropagation()}
			>
				<Flex direction="column" gap="3">
					<Flex wrap="wrap" gap="2" className={styles.selected}>
						{draft.length ? (
							draft.map((label) => renderLabel(label, "selected"))
						) : (
							<Text size="2" color="gray">
								尚未选择标签
							</Text>
						)}
					</Flex>
					{!token.trim() && (
						<Text size="2" color="gray">
							请先登录 GitHub
						</Text>
					)}
					{error && (
						<Text size="2" color="red" role="alert">
							{error}
						</Text>
					)}
					<Text size="1" color="gray">
						关闭面板后统一保存
					</Text>
					{LABEL_GROUPS.map((group) => {
						const groupLabels = group.names.flatMap((name) => {
							const label = labels.find(
								(item) => normalizeName(item.name) === normalizeName(name),
							);
							return label ? [label] : [];
						});
						if (!groupLabels.length) return null;
						return (
							<Flex key={group.title} direction="column" gap="1">
								<Text size="2" color="gray">
									{group.title}
									{group.hint && (
										<span className={styles.hint}>{group.hint}</span>
									)}
								</Text>
								<Flex wrap="wrap" gap="1">
									{groupLabels.map((label) => renderLabel(label, "category"))}
								</Flex>
							</Flex>
						);
					})}
					<Flex direction="column" gap="1">
						<Text size="2" color="gray">
							全部标签{" "}
							<span className={styles.hint}>共 {labels.length} 个</span>
						</Text>
						<TextField.Root
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder="搜索标签名或说明，回车添加第一个匹配项"
							aria-label="搜索标签"
							onKeyDown={(event) => {
								if (event.key !== "Enter" || event.nativeEvent.isComposing)
									return;
								event.preventDefault();
								const first = matches.find(
									(label) => !selected.has(label.name.toLowerCase()),
								);
								if (first && token.trim()) void changeLabel(first);
							}}
						/>
						<Box className={styles.allLabels}>
							<Flex wrap="wrap" gap="1">
								{matches.map((label) => renderLabel(label, "all"))}
								{!matches.length && (
									<Text size="2" color="gray">
										{labels.length
											? "没有匹配的标签"
											: "暂无标签，请刷新审核列表后重试"}
									</Text>
								)}
							</Flex>
						</Box>
					</Flex>
				</Flex>
			</Popover.Content>
		</Popover.Root>
	);
};
