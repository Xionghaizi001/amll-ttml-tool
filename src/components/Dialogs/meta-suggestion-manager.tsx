import { Button, Card, Dialog, Flex, Text, Box } from "@radix-ui/themes";
import JSZip from "jszip";
import { useAtom, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import saveFile from "save-file";
import {
	formatFileTitle,
	getUserMetaSuggestionFiles,
	parseJsonlWithWarnings,
	setUserMetaSuggestionFiles,
	type UserMetaSuggestionFile,
} from "$/modules/project/logic/meatdata-suggestion";
import { metaSuggestionManagerDialogAtom } from "$/states/dialogs";
import { pushNotificationAtom } from "$/states/notifications";

const loadBuiltinIndex = async (): Promise<string[]> => {
	const response = await fetch("/metaSuggestion/index.json", {
		cache: "no-cache",
	});
	if (!response.ok) return [];
	const raw = (await response.json()) as unknown;
	if (!Array.isArray(raw)) return [];
	return raw.filter((item) => typeof item === "string");
};

const resolveZipFile = (zip: JSZip, fileName: string) => {
	const direct = zip.file(fileName);
	if (direct) return direct;
	const altPath = Object.keys(zip.files).find((path) =>
		path.endsWith(`/${fileName}`),
	);
	return altPath ? zip.file(altPath) : null;
};

export const MetaSuggestionManagerDialog = () => {
	const { t } = useTranslation();
	const [open, setOpen] = useAtom(metaSuggestionManagerDialogAtom);
	const setPushNotification = useSetAtom(pushNotificationAtom);
	const [builtinFiles, setBuiltinFiles] = useState<string[]>([]);
	const [userFiles, setUserFiles] = useState<UserMetaSuggestionFile[]>([]);
	const [loading, setLoading] = useState(false);

	const refreshData = useCallback(async () => {
		setLoading(true);
		try {
			const [builtin, user] = await Promise.all([
				loadBuiltinIndex(),
				getUserMetaSuggestionFiles(),
			]);
			setBuiltinFiles(builtin);
			setUserFiles(user);
		} catch {
			setBuiltinFiles([]);
			setUserFiles([]);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (open) {
			refreshData();
		}
	}, [open, refreshData]);

	const builtinDisplayItems = useMemo(
		() =>
			builtinFiles.map((fileName) => ({
				fileName,
				title: formatFileTitle(fileName),
			})),
		[builtinFiles],
	);

	const handleImport = useCallback(() => {
		const input = document.createElement("input");
		input.type = "file";
		input.multiple = false;
		input.accept = ".zip,application/zip";
		input.addEventListener(
			"change",
			async () => {
				const file = input.files?.[0];
				if (!file) return;
				if (!file.name.toLowerCase().endsWith(".zip")) {
					setPushNotification({
						title: t("metaSuggestion.importInvalidZip", "请选择 zip 文件"),
						level: "error",
						source: "MetaSuggestion",
					});
					return;
				}

				let zip: JSZip;
				try {
					const data = await file.arrayBuffer();
					zip = await JSZip.loadAsync(data);
				} catch {
					setPushNotification({
						title: t("metaSuggestion.importZipFailed", "解包失败"),
						level: "error",
						source: "MetaSuggestion",
					});
					return;
				}

				const indexEntry = resolveZipFile(zip, "index.json");
				if (!indexEntry) {
					setPushNotification({
						title: t("metaSuggestion.importMissingIndex", "缺少 index.json"),
						level: "error",
						source: "MetaSuggestion",
					});
					return;
				}

				let indexEntries: string[] = [];
				try {
					const indexText = await indexEntry.async("text");
					const raw = JSON.parse(indexText) as unknown;
					if (Array.isArray(raw)) {
						indexEntries = raw.filter((item) => typeof item === "string");
					}
				} catch {
					indexEntries = [];
				}

				if (indexEntries.length === 0) {
					setPushNotification({
						title: t("metaSuggestion.importEmptyIndex", "index.json 内容无效"),
						level: "error",
						source: "MetaSuggestion",
					});
					return;
				}

				const importedItems: UserMetaSuggestionFile[] = [];
				let warningCount = 0;
				for (const fileName of indexEntries) {
					const matched = resolveZipFile(zip, fileName);
					if (!matched) continue;
					const text = await matched.async("text");
					const { nodes, warnings } = parseJsonlWithWarnings(text);
					if (warnings > 0) {
						warningCount += warnings;
					}
					if (nodes.length === 0) continue;
					importedItems.push({
						fileName,
						title: formatFileTitle(fileName),
						raw: text,
						nodes,
						updatedAt: Date.now(),
					});
				}

				if (importedItems.length === 0) {
					setPushNotification({
						title: t("metaSuggestion.importEmptyItems", "没有可导入的建议项"),
						level: "warning",
						source: "MetaSuggestion",
					});
					return;
				}

				const existing = await getUserMetaSuggestionFiles();
				const next = [...existing];
				for (const item of importedItems) {
					const idx = next.findIndex((existingItem) => {
						return existingItem.fileName === item.fileName;
					});
					if (idx >= 0) {
						next[idx] = item;
					} else {
						next.push(item);
					}
				}
				await setUserMetaSuggestionFiles(next);
				setUserFiles(next);
				setPushNotification({
					title: t("metaSuggestion.importSuccess", "导入完成"),
					level: "success",
					source: "MetaSuggestion",
				});
				if (warningCount > 0) {
					setPushNotification({
						title: t(
							"metaSuggestion.importWarning",
							"导入完成，但已跳过 {count} 处空值",
							{ count: warningCount },
						),
						level: "warning",
						source: "MetaSuggestion",
					});
				}
			},
			{ once: true },
		);
		input.click();
	}, [setPushNotification, t]);

	const handleExport = useCallback(async () => {
		const items = await getUserMetaSuggestionFiles();
		if (items.length === 0) {
			setPushNotification({
				title: t("metaSuggestion.exportEmpty", "没有可导出的建议项"),
				level: "warning",
				source: "MetaSuggestion",
			});
			return;
		}
		const indexPayload = items.map((item) => item.fileName);
		const zip = new JSZip();
		zip.file("index.json", JSON.stringify(indexPayload, null, 2));
		for (const item of items) {
			zip.file(item.fileName, item.raw);
		}
		const zipBlob = await zip.generateAsync({ type: "blob" });
		await saveFile(zipBlob, "metaSuggestion.zip");
		setPushNotification({
			title: t("metaSuggestion.exportSuccess", "导出完成"),
			level: "success",
			source: "MetaSuggestion",
		});
	}, [setPushNotification, t]);

	const handleRemove = useCallback(
		async (fileName: string) => {
			const next = userFiles.filter((item) => item.fileName !== fileName);
			await setUserMetaSuggestionFiles(next);
			setUserFiles(next);
			setPushNotification({
				title: t("metaSuggestion.removeSuccess", "已移除建议项"),
				level: "success",
				source: "MetaSuggestion",
			});
		},
		[setPushNotification, t, userFiles],
	);

	return (
		<Dialog.Root open={open} onOpenChange={setOpen}>
			<Dialog.Content maxWidth="720px">
				<Dialog.Title>
					{t("metaSuggestion.dialogTitle", "元数据编辑器")}
				</Dialog.Title>
				<Flex direction="column" gap="3">
					<Card>
						<Flex direction="column" gap="2">
							<Flex align="center" justify="between">
								<Text weight="bold">
									{t("metaSuggestion.builtinTitle", "内置建议项")}
								</Text>
								<Text size="3" color="gray">
									{t("metaSuggestion.builtinCount", "共 {count} 项", {
										count: builtinDisplayItems.length,
									})}
								</Text>
							</Flex>
							<Box style={{ maxHeight: 200, overflow: "auto" }}>
								{loading ? (
									<Text size="1" color="gray">
										{t("metaSuggestion.loading", "加载中...")}
									</Text>
								) : builtinDisplayItems.length === 0 ? (
									<Text size="1" color="gray">
										{t("metaSuggestion.emptyBuiltin", "未找到内置建议项")}
									</Text>
								) : (
									<Flex direction="column" gap="2">
										{builtinDisplayItems.map((item) => (
											<Flex
												key={item.fileName}
												justify="between"
												align="center"
											>
												<Flex direction="column" gap="1">
													<Text size="2">{item.title}</Text>
												</Flex>
											</Flex>
										))}
									</Flex>
								)}
							</Box>
						</Flex>
					</Card>
					<Card>
						<Flex direction="column" gap="2">
							<Flex align="center" justify="between">
								<Text weight="bold">
									{t("metaSuggestion.userTitle", "用户导入项")}
								</Text>
								<Flex gap="2">
									<Button variant="soft" onClick={handleImport}>
										{t("metaSuggestion.import", "导入")}
									</Button>
									<Button
										variant="soft"
										disabled={userFiles.length === 0}
										onClick={handleExport}
									>
										{t("metaSuggestion.export", "导出")}
									</Button>
								</Flex>
							</Flex>
							<Box style={{ maxHeight: 240, overflow: "auto" }}>
								{loading ? (
									<Text size="1" color="gray">
										{t("metaSuggestion.loading", "加载中...")}
									</Text>
								) : userFiles.length === 0 ? (
									<Text size="1" color="gray">
										{t("metaSuggestion.emptyUser", "尚未导入建议项")}
									</Text>
								) : (
									<Flex direction="column" gap="2">
										{userFiles.map((item) => (
											<Flex
												key={item.fileName}
												align="center"
												justify="between"
												gap="2"
											>
												<Flex direction="column" gap="1">
													<Text size="1">{item.title}</Text>
													<Text size="1" color="gray">
														{item.fileName}
													</Text>
												</Flex>
												<Button
													variant="soft"
													color="red"
													onClick={() => handleRemove(item.fileName)}
												>
													{t("metaSuggestion.remove", "移除")}
												</Button>
											</Flex>
										))}
									</Flex>
								)}
							</Box>
						</Flex>
					</Card>
				</Flex>
			</Dialog.Content>
		</Dialog.Root>
	);
};
