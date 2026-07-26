import {
	Button,
	Flex,
	Select,
	Text,
	TextArea,
	TextField,
} from "@radix-ui/themes";
import { useSetAtom } from "jotai";
import { useRef, useState } from "react";
import { readStructuredReviewReport } from "$/modules/user/services/structured-review-report-reader";
import {
	fetchStructuredReviewDiff,
	type StructuredReviewDiffPlatform,
} from "$/modules/user/services/update-service";
import {
	annotationSessionAtom,
	createAnnotationSession,
} from "$/modules/user/states/annotation-session";
import { newLyricLinesAtom, ToolMode, toolModeAtom } from "$/states/main";
import { rightSidebarPanelAtom } from "$/states/sidebar";

export const StructuredReviewReportTest = () => {
	const [input, setInput] = useState("");
	const [status, setStatus] = useState("尚未读取报告");
	const [summary, setSummary] = useState<string[]>([]);
	const [remotePlatform, setRemotePlatform] =
		useState<StructuredReviewDiffPlatform>("github");
	const [remoteId, setRemoteId] = useState("");
	const [remoteLoading, setRemoteLoading] = useState(false);
	const [localLoading, setLocalLoading] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const textAreaRef = useRef<HTMLTextAreaElement>(null);
	const setAnnotationSession = useSetAtom(annotationSessionAtom);
	const setRightPanel = useSetAtom(rightSidebarPanelAtom);
	const setNewLyrics = useSetAtom(newLyricLinesAtom);
	const setToolMode = useSetAtom(toolModeAtom);

	const loadRemote = async () => {
		const id = remoteId.trim();
		if (!id) {
			setStatus("请填写稿件 ID / PR 号");
			return;
		}
		setRemoteLoading(true);
		setStatus("正在从云端读取...");
		try {
			const remote = await fetchStructuredReviewDiff({
				platform: remotePlatform,
				id,
			});
			await readInput(remote);
		} catch (error) {
			setStatus(error instanceof Error ? error.message : "读取失败");
			setSummary([]);
		} finally {
			setRemoteLoading(false);
		}
	};

	const readInput = async (value: string | unknown) => {
		setInput(
			typeof value === "string" ? value : JSON.stringify(value, null, 2),
		);
		try {
			const result = await readStructuredReviewReport(value);
			setStatus(
				result.hashMatches
					? "读取成功，原稿 hash 匹配"
					: "读取成功，但原稿 hash 不匹配",
			);
			setSummary([
				`歌曲：${result.report.metadata.title || "（空）"}`,
				`歌手：${result.report.metadata.artist || "（空）"}`,
				`提交者：${result.report.metadata.submitter || "（空）"}`,
				`变更数：${result.report.updates.changes.blocks.reduce(
					(total, block) => total + block.changes.length,
					0,
				)}`,
				`内容 Hash：${result.report.updates.contentHash}`,
			]);
			// 进入接受端预览：载入原稿并打开批注面板
			setNewLyrics(result.originalLyric);
			setAnnotationSession(
				createAnnotationSession({
					report: result.report,
					originalLyric: result.originalLyric,
				}),
			);
			setRightPanel("annotations");
			setToolMode(ToolMode.Edit);
		} catch (error) {
			setStatus(error instanceof Error ? error.message : "读取失败");
			setSummary([]);
		}
	};

	const readPastedInput = async () => {
		const value = textAreaRef.current?.value ?? input;
		if (!value.trim()) return;
		setLocalLoading(true);
		try {
			await readInput(value);
		} finally {
			setLocalLoading(false);
		}
	};

	return (
		<section>
			<Flex direction="column" gap="3">
				<Text weight="bold" size="3">
					结构化审阅报告回读测试
				</Text>
				<Text size="2" color="gray">
					粘贴 JSON 或导入 JSON 文件，验证 TTML 和
					contentHash；成功后会载入原稿并打开批注面板。
				</Text>
				<Flex gap="2" wrap="wrap" align="center">
					<Select.Root
						value={remotePlatform}
						onValueChange={(value) =>
							setRemotePlatform(value as StructuredReviewDiffPlatform)
						}
					>
						<Select.Trigger aria-label="平台" />
						<Select.Content>
							<Select.Item value="github">GitHub PR</Select.Item>
							<Select.Item value="gcz">歌词站稿件</Select.Item>
						</Select.Content>
					</Select.Root>
					<TextField.Root
						value={remoteId}
						onChange={(event) => setRemoteId(event.currentTarget.value)}
						placeholder="稿件 ID / PR 号"
						style={{ flex: "1 1 180px" }}
					/>
					<Button
						type="button"
						variant="soft"
						onClick={() => void loadRemote()}
						disabled={remoteLoading || !remoteId.trim()}
					>
						{remoteLoading ? "读取中..." : "读取云端 Diff"}
					</Button>
				</Flex>
				<TextArea
					ref={textAreaRef}
					value={input}
					onChange={(event) => setInput(event.currentTarget.value)}
					placeholder="粘贴结构化审阅报告 JSON"
					style={{ minHeight: 180, fontFamily: "var(--code-font-family)" }}
				/>
				<Flex gap="2" wrap="wrap">
					<Button
						type="button"
						onClick={() => void readPastedInput()}
						disabled={localLoading || !input.trim()}
					>
						{localLoading ? "读取中..." : "读取粘贴内容"}
					</Button>
					<Button
						type="button"
						variant="soft"
						onClick={() => fileInputRef.current?.click()}
					>
						导入 JSON 文件
					</Button>
					<input
						ref={fileInputRef}
						type="file"
						accept="application/json,.json"
						hidden
						onChange={async (event) => {
							const file = event.currentTarget.files?.[0];
							if (file) await readInput(await file.text());
							event.currentTarget.value = "";
						}}
					/>
				</Flex>
				<Text size="2" color={status.includes("成功") ? "green" : "gray"}>
					{status}
				</Text>
				{summary.length > 0 && (
					<Flex direction="column" gap="1">
						{summary.map((item) => (
							<Text key={item} size="2">
								{item}
							</Text>
						))}
					</Flex>
				)}
			</Flex>
		</section>
	);
};
