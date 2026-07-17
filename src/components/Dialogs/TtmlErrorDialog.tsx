import { Copy16Regular, Dismiss24Regular } from "@fluentui/react-icons";
import {
	Badge,
	Button,
	Callout,
	Dialog,
	Flex,
	Heading,
	ScrollArea,
	Text,
} from "@radix-ui/themes";
import { useAtom } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { generateRustcStyleLog } from "$/modules/ttml-processor/message";
import { ttmlErrorDialogAtom } from "$/states/dialogs.ts";
import styles from "./TtmlErrorDialog.module.css";

export const TtmlErrorDialog = () => {
	const [dialogState, setDialogState] = useAtom(ttmlErrorDialogAtom);
	const { t } = useTranslation();
	const [copyStatus, setCopyStatus] = useState<"success" | "error" | null>(
		null,
	);

	const error = dialogState?.error;
	const rawText = dialogState?.rawText;

	const localizedKindMsg = useMemo(() => {
		if (!error) return "";
		switch (error.kind) {
			case "AttrError":
				return t("error.ttml.kind.AttrError", "XML 属性解析错误");
			case "EntityError":
				return t("error.ttml.kind.EntityError", "未知的 XML 实体");
			case "InvalidTimestamp":
				return t("error.ttml.kind.InvalidTimestamp", "时间戳格式无效");
			case "MissingAttribute":
				return t("error.ttml.kind.MissingAttribute", "缺失必需的属性");
			case "UnexpectedEof":
				return t("error.ttml.kind.UnexpectedEof", "文件意外结束");
			case "XmlError":
				return t("error.ttml.kind.XmlError", "XML 语法错误");
			default:
				return t("error.ttml.kind.ParseError", "常规解析错误");
		}
	}, [error, t]);

	const localizedSuggestion = useMemo(() => {
		if (!error) return "";
		switch (error.kind) {
			case "AttrError":
				return t(
					"error.ttml.suggestion.AttrError",
					"请检查 XML 属性的格式是否正确。",
				);
			case "EntityError":
				return t(
					"error.ttml.suggestion.EntityError",
					"检查使用的 XML 预定义实体引用是否有效",
				);
			case "InvalidTimestamp":
				return t(
					"error.ttml.suggestion.InvalidTimestamp",
					"允许的时间戳格式为 'hh:mm:ss.sss'，前导零可以省略。例如 '1:03:36.120'。",
				);
			case "MissingAttribute":
				return t(
					"error.ttml.suggestion.MissingAttribute",
					"请检查上方的提示并补充需要的属性。",
				);
			case "UnexpectedEof":
				return t(
					"error.ttml.suggestion.UnexpectedEof",
					"请确保所有打开的标签（如 </tt>、</body>）都已正确闭合。",
				);
			case "XmlError":
				return t(
					"error.ttml.suggestion.XmlError",
					"请检查文件是否存在 XML 语法错误。",
				);
			default:
				return t(
					"error.ttml.suggestion.ParseError",
					"请参考上方提示请检查文件格式是否正确。",
				);
		}
	}, [error, t]);

	const displayLog = useMemo(
		() => (error ? generateRustcStyleLog(error, rawText) : ""),
		[error, rawText],
	);

	const handleClose = useCallback(() => {
		setCopyStatus(null);
		setDialogState(null);
	}, [setDialogState]);

	const handleCopy = useCallback(() => {
		if (!error) return;

		const clipboardLog = generateRustcStyleLog(
			error,
			rawText,
			localizedSuggestion,
		);

		navigator.clipboard
			.writeText(clipboardLog)
			.then(() => setCopyStatus("success"))
			.catch(() => setCopyStatus("error"));
	}, [error, rawText, localizedSuggestion, t]);

	if (!error) return null;

	return (
		<Dialog.Root open={!!error} onOpenChange={(open) => !open && handleClose()}>
			<Dialog.Content maxWidth="800px">
				<Flex direction="column" gap="4">
					<Flex gap="3" align="start">
						<div className={styles.iconContainer}>
							<Dismiss24Regular color="var(--red-9)" />
						</div>
						<Flex direction="column" gap="1">
							<Heading size="5" color="red">
								{t("error.ttml.title", "TTML 处理失败")}
							</Heading>
							<Text size="2" color="gray">
								{t("error.ttml.subtitle", "处理 TTML 文件时发生了一个错误")}
							</Text>
						</Flex>
					</Flex>

					<Callout.Root color="red" variant="soft" size="1">
						<Callout.Icon>
							<Badge color="red" variant="solid">
								{error.kind}
							</Badge>
						</Callout.Icon>
						<Callout.Text weight="bold" ml="2">
							{localizedKindMsg}
						</Callout.Text>
					</Callout.Root>

					<ScrollArea type="auto" scrollbars="horizontal">
						<pre className={styles.codeBlock}>{displayLog}</pre>
					</ScrollArea>

					<Flex direction="column" gap="1" mt="1">
						<Text color="gray">{localizedSuggestion}</Text>
					</Flex>

					{copyStatus && (
						<Callout.Root
							color={copyStatus === "success" ? "green" : "red"}
							variant="soft"
							size="1"
						>
							<Callout.Text>
								{copyStatus === "success"
									? t("error.ttml.copied", "复制成功")
									: t("error.ttml.copyFailed", "复制失败")}
							</Callout.Text>
						</Callout.Root>
					)}

					<Flex gap="3" mt="4" justify="end">
						<Button variant="soft" color="gray" onClick={handleClose}>
							{t("error.ttml.close", "关闭")}
						</Button>
						<Button variant="solid" onClick={handleCopy}>
							<Copy16Regular />
							{t("error.ttml.copyError", "复制日志")}
						</Button>
					</Flex>
				</Flex>
			</Dialog.Content>
		</Dialog.Root>
	);
};
