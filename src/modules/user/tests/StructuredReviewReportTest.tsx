import { Button, Flex, Text, TextArea } from "@radix-ui/themes";
import { useRef, useState } from "react";
import { readStructuredReviewReport } from "$/modules/user/services/structured-review-report-reader";

export const StructuredReviewReportTest = () => {
	const [input, setInput] = useState("");
	const [status, setStatus] = useState("尚未读取报告");
	const [summary, setSummary] = useState<string[]>([]);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const readInput = async (value: string) => {
		setInput(value);
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
		} catch (error) {
			setStatus(error instanceof Error ? error.message : "读取失败");
			setSummary([]);
		}
	};

	return (
		<section>
			<Flex direction="column" gap="3">
				<Text weight="bold" size="3">
					结构化审阅报告回读测试
				</Text>
				<Text size="2" color="gray">
					粘贴 JSON 或导入 JSON 文件，验证 TTML 和 contentHash。
				</Text>
				<TextArea
					value={input}
					onChange={(event) => setInput(event.currentTarget.value)}
					placeholder="粘贴结构化审阅报告 JSON"
					style={{ minHeight: 180, fontFamily: "var(--code-font-family)" }}
				/>
				<Flex gap="2" wrap="wrap">
					<Button
						onClick={() => void readInput(input)}
						disabled={!input.trim()}
					>
						读取粘贴内容
					</Button>
					<Button variant="soft" onClick={() => fileInputRef.current?.click()}>
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
