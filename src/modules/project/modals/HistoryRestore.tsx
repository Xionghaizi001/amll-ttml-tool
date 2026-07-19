import {
	ClockRegular,
	DeleteRegular,
	DocumentRegular,
	HistoryRegular,
} from "@fluentui/react-icons";
import {
	Badge,
	Box,
	Button,
	Card,
	Dialog,
	Flex,
	Heading,
	IconButton,
	ScrollArea,
	SegmentedControl,
	Table,
	Text,
} from "@radix-ui/themes";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	DetailPlaceholder,
	MasterColumn,
	MasterDetailLayout,
	MasterListEmpty,
	MasterListItem,
} from "$/components/MasterDetail";
import { useConfirmedAction } from "$/hooks/useConfirmedAction";
import { useRelativeTime } from "$/hooks/useRelativeTime";
import {
	deleteProject,
	deleteVersion,
	getProjectLatestState,
	getProjectList,
	getProjectVersions,
	type ProjectInfo,
	type ProjectVersion,
} from "$/modules/project/autosave/autosave";
import { ReviewHistoryPanel } from "$/modules/review/components/ReviewHistoryPanel";
import {
	githubAmlldbAccessAtom,
	githubLoginAtom,
	githubPatAtom,
} from "$/modules/settings/states";
import { historyRestoreDialogAtom } from "$/states/dialogs";
import { newLyricLinesAtom, projectIdAtom } from "$/states/main";
import { pushNotificationAtom } from "$/states/notifications";
import { error as logError } from "$/utils/logging";

const NOTIFICATION_SOURCE = "HistoryRestore";

export const HistoryRestoreDialog = () => {
	const [isOpen, setIsOpen] = useAtom(historyRestoreDialogAtom);
	const [projects, setProjects] = useState<ProjectInfo[]>([]);
	const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
		null,
	);
	const [versions, setVersions] = useState<ProjectVersion[]>([]);
	const [historyMode, setHistoryMode] = useState<"projects" | "reviews">(
		"projects",
	);
	const githubLogin = useAtomValue(githubLoginAtom);
	const githubPat = useAtomValue(githubPatAtom);
	const githubHasAccess = useAtomValue(githubAmlldbAccessAtom);
	const canViewReviewHistory = Boolean(
		githubPat.trim() && githubLogin.trim() && githubHasAccess,
	);

	const setNewLyrics = useSetAtom(newLyricLinesAtom);
	const setProjectId = useSetAtom(projectIdAtom);
	const confirmAction = useConfirmedAction();
	const formatRelativeTime = useRelativeTime();
	const { t } = useTranslation();
	const setPushNotification = useSetAtom(pushNotificationAtom);

	const loadProjects = useCallback(async () => {
		try {
			const list = await getProjectList();
			setProjects(list);
			if (list.length > 0) {
				setSelectedProjectId((prev) => prev || list[0].id);
			}
		} catch (e) {
			logError("Failed to load project list", e);
			setPushNotification({
				title: t("historyRestoreDialog.loadError", "加载历史记录失败"),
				level: "error",
				source: NOTIFICATION_SOURCE,
			});
		}
	}, [t, setPushNotification]);

	const loadVersions = useCallback(async (projectId: string) => {
		try {
			const list = await getProjectVersions(projectId);
			setVersions(list);
		} catch (e) {
			logError("Failed to load versions:", e);
		}
	}, []);

	const getProjectDisplayName = (project: ProjectInfo) => {
		if (project.id === "legacy_autosave_archive") {
			return t("autosave.legacyProjectName", "旧版本快照");
		}
		if (project.id === "untitled_project") {
			return t("autosave.untitledProjectName", "未命名项目");
		}

		if (project.name === "Untitled Project") {
			return t("autosave.untitledProjectName", "未命名项目");
		}

		return project.name;
	};

	const confirmRestore = (run: () => void | Promise<void>) => {
		confirmAction({
			title: t("historyRestoreDialog.confirm.title", "确认恢复"),
			description: t(
				"historyRestoreDialog.confirm.description",
				"此操作将覆盖当前编辑器中的所有内容，确定要恢复此快照吗？",
			),
			source: NOTIFICATION_SOURCE,
			successTitle: t("common.success", "恢复成功"),
			run,
		});
	};

	const confirmDelete = (
		titleKey: string,
		titleFallback: string,
		descriptionKey: string,
		descriptionFallback: string,
		run: () => void | Promise<void>,
	) => {
		confirmAction({
			title: t(titleKey, titleFallback),
			description: t(descriptionKey, descriptionFallback),
			source: NOTIFICATION_SOURCE,
			successTitle: t("common.deleteSuccess", "删除成功"),
			run,
		});
	};

	const handleRestoreLatest = (project: ProjectInfo) => {
		confirmRestore(async () => {
			const latestLyric = await getProjectLatestState(project.id);
			if (!latestLyric) {
				throw new Error(t("common.error", "数据已损坏或丢失"));
			}
			setProjectId(project.id);
			setNewLyrics(latestLyric);
			setIsOpen(false);
		});
	};

	const handleRestoreVersion = (version: ProjectVersion) => {
		confirmRestore(() => {
			setProjectId(version.projectId);
			setNewLyrics(version.data);
			setIsOpen(false);
		});
	};

	const handleDeleteProject = (e: React.MouseEvent, projectId: string) => {
		e.stopPropagation();
		confirmDelete(
			"historyRestoreDialog.deleteProject.title",
			"删除项目记录",
			"historyRestoreDialog.deleteProject.description",
			"确定要删除该项目的所有自动保存记录吗？此操作无法撤销。",
			async () => {
				await deleteProject(projectId);
				await loadProjects();
				if (selectedProjectId === projectId) {
					setSelectedProjectId(null);
				}
			},
		);
	};

	const handleDeleteVersion = (version: ProjectVersion) => {
		confirmDelete(
			"historyRestoreDialog.deleteVersion.title",
			"删除版本",
			"historyRestoreDialog.deleteVersion.description",
			"确定要删除此历史版本吗？此操作无法撤销。",
			async () => {
				if (!version.id) return;
				await deleteVersion(version.id);
				await loadVersions(version.projectId);
			},
		);
	};

	const handleDeleteLatestVersion = () => {
		if (!currentProject) return;
		const projectId = currentProject.id;
		confirmDelete(
			"historyRestoreDialog.deleteLatest.title",
			"删除最新版本",
			"historyRestoreDialog.deleteLatest.description",
			"确定要删除此最新版本吗？此操作无法撤销。",
			async () => {
				await deleteProject(projectId);
				await loadProjects();
				setSelectedProjectId(null);
			},
		);
	};

	useEffect(() => {
		if (isOpen) {
			loadProjects();
		} else {
			setHistoryMode("projects");
			setSelectedProjectId(null);
			setVersions([]);
		}
	}, [isOpen, loadProjects]);

	useEffect(() => {
		if (!canViewReviewHistory && historyMode === "reviews") {
			setHistoryMode("projects");
		}
	}, [canViewReviewHistory, historyMode]);

	useEffect(() => {
		if (selectedProjectId) {
			loadVersions(selectedProjectId);
		} else {
			setVersions([]);
		}
	}, [selectedProjectId, loadVersions]);

	const currentProject = projects.find((p) => p.id === selectedProjectId);

	return (
		<Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
			<Dialog.Content
				style={{
					width: 800,
					maxWidth: "90vw",
					height: 700,
					padding: 0,
				}}
			>
				<Flex direction="column" style={{ height: "100%", minHeight: 0 }}>
					{canViewReviewHistory && (
						<Flex
							p="3"
							justify="center"
							style={{ borderBottom: "1px solid var(--gray-5)" }}
						>
							<SegmentedControl.Root
								value={historyMode}
								onValueChange={(value) =>
									setHistoryMode(value as "projects" | "reviews")
								}
							>
								<SegmentedControl.Item value="projects">
									{t("historyRestoreDialog.mode.projects", "普通项目")}
								</SegmentedControl.Item>
								<SegmentedControl.Item value="reviews">
									{t("historyRestoreDialog.mode.reviews", "审阅记录")}
								</SegmentedControl.Item>
							</SegmentedControl.Root>
						</Flex>
					)}
					{historyMode === "reviews" && canViewReviewHistory ? (
						<Box flexGrow="1" style={{ minHeight: 0 }}>
							<ReviewHistoryPanel onRestored={() => setIsOpen(false)} />
						</Box>
					) : (
						<MasterDetailLayout
							master={
								<MasterColumn
									title={t("historyRestoreDialog.projects", "最近项目")}
								>
									{projects.length === 0 ? (
										<MasterListEmpty>
											{t("historyRestoreDialog.noProjects", "暂无自动保存记录")}
										</MasterListEmpty>
									) : (
										projects.map((project) => (
											<MasterListItem
												key={project.id}
												selected={selectedProjectId === project.id}
												onSelect={() => setSelectedProjectId(project.id)}
											>
												<Flex justify="between" align="start" gap="2">
													<Flex
														direction="column"
														gap="1"
														style={{ flex: 1, minWidth: 0 }}
													>
														<Text
															weight="bold"
															size="2"
															wrap="wrap"
															style={{ wordBreak: "break-all" }}
														>
															{getProjectDisplayName(project)}
														</Text>
														<Flex gap="2" align="center">
															<IconButton
																size="1"
																variant="ghost"
																color="red"
																onClick={(e) =>
																	handleDeleteProject(e, project.id)
																}
															>
																<DeleteRegular />
															</IconButton>
															<ClockRegular fontSize={12} />
															<Text size="1" color="gray">
																{formatRelativeTime(project.lastModified)}
															</Text>
														</Flex>
													</Flex>
												</Flex>
											</MasterListItem>
										))
									)}
								</MasterColumn>
							}
							detail={
								currentProject ? (
									<>
										<Box
											p="4"
											style={{ borderBottom: "1px solid var(--gray-5)" }}
										>
											<Flex justify="between" align="start" mb="3">
												<Heading size="4">
													{getProjectDisplayName(currentProject)}
												</Heading>
											</Flex>

											<Card variant="surface">
												<Flex align="center" gap="3">
													<Box>
														<DocumentRegular fontSize={24} />
													</Box>
													<Flex direction="column" flexGrow="1">
														<Text weight="bold">
															{t(
																"historyRestoreDialog.latestState",
																"最新版本",
															)}
														</Text>
														<Text size="1" color="gray">
															{new Date(
																currentProject.lastModified,
															).toLocaleString()}
														</Text>
													</Flex>
													<Flex gap="2">
														<Button
															variant="soft"
															color="red"
															onClick={handleDeleteLatestVersion}
														>
															{t(
																"historyRestoreDialog.deleteLatest.button",
																"删除此版本",
															)}
														</Button>
														<Button
															onClick={() =>
																handleRestoreLatest(currentProject)
															}
														>
															{t(
																"historyRestoreDialog.restoreLatest",
																"恢复此版本",
															)}
														</Button>
													</Flex>
												</Flex>
											</Card>
											{currentProject.latestState.metadata &&
												currentProject.latestState.metadata.length > 0 && (
													<Box mt="2">
														<Text size="2" weight="bold" mb="2" as="div">
															{t("metadata.title", "元数据信息")}
														</Text>
														<ScrollArea type="auto" scrollbars="vertical">
															<Flex gap="2" wrap="wrap" pb="1" pr="3">
																{currentProject.latestState.metadata.map(
																	(meta) => (
																		<Badge
																			key={meta.key}
																			variant="soft"
																			color="gray"
																			style={{
																				maxWidth: "100%",
																				whiteSpace: "normal",
																				wordBreak: "break-all",
																			}}
																		>
																			{meta.key}: {meta.value[0]}
																		</Badge>
																	),
																)}
															</Flex>
														</ScrollArea>
													</Box>
												)}
										</Box>

										<Box p="4" flexGrow="1" style={{ overflow: "hidden" }}>
											<Flex align="center" gap="2" mb="4">
												<HistoryRegular />
												<Text weight="bold" size="2">
													{t(
														"historyRestoreDialog.historyVersions",
														"其它版本",
													)}
												</Text>
											</Flex>

											<ScrollArea
												type="auto"
												scrollbars="vertical"
												style={{ height: "calc(100% - 30px)" }}
											>
												<Table.Root variant="surface">
													<Table.Header>
														<Table.Row>
															<Table.ColumnHeaderCell>
																{t("common.time", "时间")}
															</Table.ColumnHeaderCell>
															<Table.ColumnHeaderCell width="140px" />
														</Table.Row>
													</Table.Header>
													<Table.Body>
														{versions.length === 0 ? (
															<Table.Row>
																<Table.Cell colSpan={2} align="center">
																	<Text color="gray" size="2">
																		{t(
																			"historyRestoreDialog.noHistory",
																			"没有可用的历史记录",
																		)}
																	</Text>
																</Table.Cell>
															</Table.Row>
														) : (
															versions.map((version) => (
																<Table.Row key={version.id}>
																	<Table.RowHeaderCell>
																		<Flex direction="column">
																			<Text size="2">
																				{new Date(
																					version.timestamp,
																				).toLocaleTimeString()}
																			</Text>
																			<Text size="1" color="gray">
																				{new Date(
																					version.timestamp,
																				).toLocaleDateString()}
																			</Text>
																		</Flex>
																	</Table.RowHeaderCell>
																	<Table.Cell justify="end">
																		<Flex gap="2">
																			<Button
																				size="2"
																				variant="soft"
																				color="red"
																				onClick={() =>
																					handleDeleteVersion(version)
																				}
																			>
																				{t("common.delete", "删除")}
																			</Button>
																			<Button
																				size="2"
																				variant="soft"
																				onClick={() =>
																					handleRestoreVersion(version)
																				}
																			>
																				{t("common.restore", "恢复")}
																			</Button>
																		</Flex>
																	</Table.Cell>
																</Table.Row>
															))
														)}
													</Table.Body>
												</Table.Root>
											</ScrollArea>
										</Box>
									</>
								) : (
									<DetailPlaceholder>
										{t(
											"historyRestoreDialog.selectProject",
											"请从左侧选择一个项目",
										)}
									</DetailPlaceholder>
								)
							}
						/>
					)}
				</Flex>
			</Dialog.Content>
		</Dialog.Root>
	);
};
