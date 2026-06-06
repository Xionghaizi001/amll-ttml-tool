import {
	ArrowReset20Regular,
	DocumentArrowDown20Regular,
	DocumentArrowUp20Regular,
	TextBold20Regular,
	TextHeader120Regular,
	TextHeader220Regular,
	TextHeader320Regular,
	TextItalic20Regular,
	TextLineSpacing20Regular,
} from "@fluentui/react-icons";
import { Box, Button, Flex, Switch, Text, TextArea } from "@radix-ui/themes";
import { useAtom, useSetAtom } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import saveFile from "save-file";
import {
	DEFAULT_REVIEW_REPORT_FORMAT,
	normalizeReviewReportFormat,
	parseReviewReportFormatText,
	type ReviewReportBlockKind,
	type ReviewReportFormat,
	resetReviewReportBlockFormat,
	reviewReportFormatAtom,
	reviewReportFormatBlockDefinitions,
	serializeReviewReportFormat,
	serializeReviewReportFormatJsonl,
	updateReviewReportBlockFormat,
} from "$/modules/review/services/report-format-service";
import {
	type ReviewReport,
	renderReviewReport,
} from "$/modules/review/services/report-service";
import { pushNotificationAtom } from "$/states/notifications";
import styles from "./ReviewReportDialog.module.css";

export type ReviewReportFomatterProps = {
	report: ReviewReport;
	onDirtyChange?: (dirty: boolean) => void;
};

const isBlockFormatChanged = (
	format: ReviewReportFormat,
	baseline: ReviewReportFormat,
	kind: ReviewReportBlockKind,
) =>
	format.blocks[kind].template !== baseline.blocks[kind].template ||
	format.blocks[kind].listItem !== baseline.blocks[kind].listItem;

export const ReviewReportFomatter = ({
	report,
	onDirtyChange,
}: ReviewReportFomatterProps) => {
	const [format, setFormat] = useAtom(reviewReportFormatAtom);
	const setPushNotification = useSetAtom(pushNotificationAtom);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const templateInputRef = useRef<HTMLTextAreaElement>(null);
	const [baselineFormat, setBaselineFormat] = useState(() =>
		normalizeReviewReportFormat(format),
	);
	const [selectedKind, setSelectedKind] =
		useState<ReviewReportBlockKind>("wordText");
	const selectedDefinition =
		reviewReportFormatBlockDefinitions.find(
			(definition) => definition.kind === selectedKind,
		) ?? reviewReportFormatBlockDefinitions[0];
	const selectedFormat = format.blocks[selectedDefinition.kind];
	const renderedPreview = useMemo(
		() => renderReviewReport(report, format),
		[report, format],
	);
	const changedKinds = useMemo(
		() =>
			new Set(
				reviewReportFormatBlockDefinitions
					.filter((definition) =>
						isBlockFormatChanged(format, baselineFormat, definition.kind),
					)
					.map((definition) => definition.kind),
			),
		[format, baselineFormat],
	);
	const hasFormatChanges =
		changedKinds.size > 0 || format.emptyText !== baselineFormat.emptyText;

	useEffect(() => {
		onDirtyChange?.(hasFormatChanges);
	}, [hasFormatChanges, onDirtyChange]);

	const updateSelectedFormat = (
		patch: Partial<(typeof format.blocks)[ReviewReportBlockKind]>,
	) => {
		setFormat((current) =>
			updateReviewReportBlockFormat(current, selectedDefinition.kind, patch),
		);
	};

	const getTemplateSelection = () => {
		const input = templateInputRef.current;
		const template = selectedFormat.template;
		const start = input?.selectionStart ?? template.length;
		const end = input?.selectionEnd ?? start;
		return { template, start, end };
	};

	const replaceTemplateRange = (
		nextTemplate: string,
		selectionStart: number,
		selectionEnd = selectionStart,
		patch: Partial<(typeof format.blocks)[ReviewReportBlockKind]> = {},
	) => {
		updateSelectedFormat({ ...patch, template: nextTemplate });
		window.requestAnimationFrame(() => {
			templateInputRef.current?.focus();
			templateInputRef.current?.setSelectionRange(selectionStart, selectionEnd);
		});
	};

	const insertTemplateText = (text: string) => {
		const { template, start, end } = getTemplateSelection();
		const nextTemplate = `${template.slice(0, start)}${text}${template.slice(
			end,
		)}`;
		replaceTemplateRange(nextTemplate, start + text.length);
	};

	const wrapTemplateSelection = (prefix: string, suffix: string) => {
		const { template, start, end } = getTemplateSelection();
		const selectedText = template.slice(start, end);
		const nextTemplate = `${template.slice(0, start)}${prefix}${selectedText}${suffix}${template.slice(end)}`;
		const nextStart = start + prefix.length;
		replaceTemplateRange(
			nextTemplate,
			nextStart,
			nextStart + selectedText.length,
		);
	};

	const applyHeadingLevel = (level: 1 | 2 | 3) => {
		const { template, start, end } = getTemplateSelection();
		const prefix = `${"#".repeat(level)} `;
		const lineStart = template.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
		const currentLineEnd = template.indexOf("\n", start);
		const rangeEnd =
			end > start
				? end
				: currentLineEnd === -1
					? template.length
					: currentLineEnd;
		const selectedLines = template.slice(lineStart, rangeEnd);
		const nextLines = selectedLines
			.split("\n")
			.map((line) => `${prefix}${line.replace(/^#{1,6}\s*/, "")}`)
			.join("\n");
		const nextTemplate = `${template.slice(0, lineStart)}${nextLines}${template.slice(rangeEnd)}`;
		replaceTemplateRange(
			nextTemplate,
			lineStart + prefix.length,
			lineStart + nextLines.length,
			{ listItem: false },
		);
	};

	const insertVariable = (name: string) => {
		insertTemplateText(`{{${name}}}`);
	};

	const exportFormat = async (type: "json" | "jsonl") => {
		try {
			const content =
				type === "json"
					? serializeReviewReportFormat(format)
					: serializeReviewReportFormatJsonl(format);
			const blob = new Blob([content], {
				type: type === "json" ? "application/json" : "application/x-ndjson",
			});
			await saveFile(blob, `review-report-format.${type}`);
			setBaselineFormat(normalizeReviewReportFormat(format));
			setPushNotification({
				title: "已导出审阅报告格式",
				level: "success",
				source: "Review",
			});
		} catch {
			setPushNotification({
				title: "导出审阅报告格式失败",
				level: "error",
				source: "Review",
			});
		}
	};

	const importFormat = async (file: File | undefined) => {
		if (!file) return;
		try {
			const text = await file.text();
			const nextFormat = parseReviewReportFormatText(text);
			const normalizedFormat = normalizeReviewReportFormat(nextFormat);
			setFormat(nextFormat);
			setBaselineFormat(normalizedFormat);
			setPushNotification({
				title: "已导入审阅报告格式",
				level: "success",
				source: "Review",
			});
		} catch (error) {
			setPushNotification({
				title: `导入审阅报告格式失败：${
					error instanceof Error ? error.message : "文件格式不正确"
				}`,
				level: "error",
				source: "Review",
			});
		}
	};

	return (
		<Flex direction="column" gap="3" className={styles.formatterPane}>
			<Flex align="center" justify="between" gap="2" wrap="wrap">
				<Flex align="center" gap="2" wrap="wrap">
					<Button
						size="1"
						variant="soft"
						onClick={() => fileInputRef.current?.click()}
					>
						<DocumentArrowUp20Regular />
						导入
					</Button>
					<Button size="1" variant="soft" onClick={() => exportFormat("json")}>
						<DocumentArrowDown20Regular />
						导出 JSON
					</Button>
					<Button size="1" variant="soft" onClick={() => exportFormat("jsonl")}>
						<DocumentArrowDown20Regular />
						导出 JSONL
					</Button>
					<input
						ref={fileInputRef}
						type="file"
						accept=".json,.jsonl,application/json,application/x-ndjson"
						hidden
						onChange={(event) => {
							void importFormat(event.currentTarget.files?.[0]);
							event.currentTarget.value = "";
						}}
					/>
				</Flex>
				<Button
					size="1"
					variant="soft"
					color="gray"
					onClick={() => {
						setFormat(DEFAULT_REVIEW_REPORT_FORMAT);
						setBaselineFormat(
							normalizeReviewReportFormat(DEFAULT_REVIEW_REPORT_FORMAT),
						);
					}}
				>
					<ArrowReset20Regular />
					恢复默认
				</Button>
			</Flex>
			<Box className={styles.formatterLayout}>
				<Box className={styles.formatterKindList}>
					{reviewReportFormatBlockDefinitions.map((definition) => (
						<button
							key={definition.kind}
							type="button"
							className={`${styles.formatterKindButton} ${
								changedKinds.has(definition.kind)
									? styles.formatterKindButtonChanged
									: ""
							} ${
								selectedDefinition.kind === definition.kind
									? styles.formatterKindButtonActive
									: ""
							}`}
							onClick={() => setSelectedKind(definition.kind)}
						>
							<Text size="2" weight="medium">
								{definition.label}
							</Text>
							<Text size="1" color="gray">
								{definition.description}
							</Text>
						</button>
					))}
				</Box>
				<Flex
					direction="column"
					gap="3"
					minWidth="0"
					className={styles.formatterEditorPane}
				>
					<Flex align="center" justify="between" gap="2">
						<Box>
							<Text size="3" weight="medium">
								{selectedDefinition.label}
							</Text>
							<Text as="p" size="1" color="gray" mb="0">
								使用双大括号引用变量，例如 {"{{lineLabel}}"}。
							</Text>
						</Box>
						<Button
							size="1"
							variant="soft"
							color="gray"
							onClick={() =>
								setFormat((current) =>
									resetReviewReportBlockFormat(
										current,
										selectedDefinition.kind,
									),
								)
							}
						>
							<ArrowReset20Regular />
							重置此项
						</Button>
					</Flex>
					<TextArea
						ref={templateInputRef}
						value={selectedFormat.template}
						onChange={(event) =>
							updateSelectedFormat({ template: event.currentTarget.value })
						}
						placeholder="报告条目模板"
						className={styles.formatterTemplateInput}
					/>
					<Flex
						align="center"
						gap="1"
						wrap="wrap"
						className={styles.formatterToolbar}
					>
						<Button
							size="1"
							variant="soft"
							title="加粗"
							aria-label="加粗"
							onClick={() => wrapTemplateSelection("**", "**")}
						>
							<TextBold20Regular />
						</Button>
						<Button
							size="1"
							variant="soft"
							title="倾斜"
							aria-label="倾斜"
							onClick={() => wrapTemplateSelection("_", "_")}
						>
							<TextItalic20Regular />
						</Button>
						<Button
							size="1"
							variant="soft"
							title="一级大纲"
							aria-label="一级大纲"
							onClick={() => applyHeadingLevel(1)}
						>
							<TextHeader120Regular />
						</Button>
						<Button
							size="1"
							variant="soft"
							title="二级大纲"
							aria-label="二级大纲"
							onClick={() => applyHeadingLevel(2)}
						>
							<TextHeader220Regular />
						</Button>
						<Button
							size="1"
							variant="soft"
							title="三级大纲"
							aria-label="三级大纲"
							onClick={() => applyHeadingLevel(3)}
						>
							<TextHeader320Regular />
						</Button>
						<Button
							size="1"
							variant="soft"
							title="插入换行符"
							aria-label="插入换行符"
							onClick={() => insertTemplateText("\n")}
						>
							<TextLineSpacing20Regular />
						</Button>
					</Flex>
					<Flex align="center" gap="2">
						<Switch
							checked={selectedFormat.listItem}
							onCheckedChange={(checked) =>
								updateSelectedFormat({ listItem: checked })
							}
						/>
						<Text size="2">作为 Markdown 列表项输出</Text>
					</Flex>
					<Flex direction="column" gap="2">
						<Text size="2" weight="medium">
							可用变量
						</Text>
						<Box className={styles.formatterVariableGrid}>
							{selectedDefinition.variables.map((variable) => (
								<button
									key={variable.name}
									type="button"
									className={styles.formatterVariable}
									onClick={() => insertVariable(variable.name)}
									title={`插入 {{${variable.name}}}`}
								>
									<Text size="1" weight="medium">
										{"{{"}
										{variable.name}
										{"}}"}
									</Text>
									<Text size="1" color="gray">
										{variable.label}：{variable.description}
									</Text>
								</button>
							))}
						</Box>
					</Flex>
					<Flex direction="column" gap="2">
						<Text size="2" weight="medium">
							空报告文本
						</Text>
						<TextArea
							value={format.emptyText}
							onChange={(event) =>
								setFormat((current) => ({
									...current,
									emptyText: event.currentTarget.value,
								}))
							}
							style={{ minHeight: "48px" }}
						/>
					</Flex>
					<Flex direction="column" gap="2">
						<Text size="2" weight="medium">
							当前报告预览
						</Text>
						<TextArea
							readOnly
							value={renderedPreview}
							className={styles.formatterPreview}
						/>
					</Flex>
				</Flex>
			</Box>
		</Flex>
	);
};

export default ReviewReportFomatter;
