/*
 * Copyright 2023-2025 Steve Xiao (stevexmh@qq.com) and contributors.
 *
 * 本源代码文件是属于 AMLL TTML Tool 项目的一部分。
 * This source code file is a part of AMLL TTML Tool project.
 * 本项目的源代码的使用受到 GNU GENERAL PUBLIC LICENSE version 3 许可证的约束，具体可以参阅以下链接。
 * Use of this source code is governed by the GNU GPLv3 license that can be found through the following link.
 *
 * https://github.com/Steve-xmh/amll-ttml-tool/blob/main/LICENSE
 */

import { Add16Regular, Delete16Regular } from "@fluentui/react-icons";
import { Button, Dialog, Flex, IconButton, Select, Text, TextField } from "@radix-ui/themes";
import { useAtom } from "jotai";
import { useImmerAtom } from "jotai-immer";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { agentManagerDialogAtom } from "$/states/dialogs.ts";
import { lyricLinesAtom } from "$/states/main.ts";
import type { TTMLAgent } from "$/types/ttml";
import { calculateDuetState } from "$/modules/project/logic/ttml-parser";
import styles from "./AgentManager.module.css";

const AGENT_TYPES: Array<{ value: TTMLAgent["type"]; label: string }> = [
	{ value: "person", label: "Person" },
	{ value: "group", label: "Group" },
	{ value: "other", label: "Other" },
];

// Names 编辑器组件
interface NamesEditorProps {
	names: string[];
	onChange: (names: string[]) => void;
}

const NamesEditor = ({ names, onChange }: NamesEditorProps) => {
	const { t } = useTranslation();

	const handleNameChange = (index: number, value: string) => {
		const newNames = [...names];
		newNames[index] = value;
		onChange(newNames);
	};

	const handleAddName = () => {
		onChange([...names, ""]);
	};

	const handleRemoveName = (index: number) => {
		const newNames = names.filter((_, i) => i !== index);
		onChange(newNames);
	};

	return (
		<Flex direction="column" gap="2" style={{ flex: 1 }}>
			{names.map((name, index) => (
				<Flex key={index} gap="2" align="center">
					<TextField.Root
						value={name}
						onChange={(e) => handleNameChange(index, e.target.value)}
						placeholder={t("agentManager.namePlaceholder", "名称")}
						style={{ flex: 1 }}
					/>
					<IconButton
						variant="soft"
						color="red"
						onClick={() => handleRemoveName(index)}
						size="1"
					>
						<Delete16Regular />
					</IconButton>
				</Flex>
			))}
			<Button
				variant="soft"
				onClick={handleAddName}
				size="1"
				style={{ alignSelf: "flex-start" }}
			>
				<Add16Regular />
				{t("agentManager.addName", "添加名称")}
			</Button>
		</Flex>
	);
};

export const AgentManager = () => {
	const [open, setOpen] = useAtom(agentManagerDialogAtom);
	const [lyricLines, setLyricLines] = useImmerAtom(lyricLinesAtom);
	const { t } = useTranslation();

	const agents = lyricLines.agents ?? [];

	const [editingIndex, setEditingIndex] = useState<number | null>(null);
	const [editingAgent, setEditingAgent] = useState<Partial<TTMLAgent>>({});

	const [isAdding, setIsAdding] = useState(false);
	const [newAgent, setNewAgent] = useState<Partial<TTMLAgent>>({
		type: "person",
		names: [],
	});

	// 重新计算所有行的对唱状态
	const recalculateDuetState = (draft: typeof lyricLines) => {
		const agentMap = new Map<string, TTMLAgent>();
		for (const agent of draft.agents) {
			agentMap.set(agent.id, agent);
		}

		// 找到第一个 person 类型的 agent 作为主歌手
		let mainAgentId = "v1";
		for (const agent of draft.agents) {
			if (agent.type === "person") {
				mainAgentId = agent.id;
				break;
			}
		}

		let currentAgentId = mainAgentId;
		let duetToggle = false;

		for (const line of draft.lyricLines) {
			if (line.isBG) {
				continue;
			}

			const result = calculateDuetState(
				line.agent,
				agentMap,
				mainAgentId,
				currentAgentId,
				duetToggle,
			);

			line.isDuet = result.isDuet;
			currentAgentId = result.newCurrentAgentId;
			duetToggle = result.newDuetToggle;
		}
	};

	const handleAdd = () => {
		if (!newAgent.id?.trim()) return;

		setLyricLines((draft) => {
			draft.agents ??= [];
			draft.agents.push({
				id: newAgent.id!.trim(),
				type: newAgent.type ?? "person",
				names: newAgent.names?.filter(Boolean) ?? [],
			});
			recalculateDuetState(draft);
		});

		setIsAdding(false);
		setNewAgent({ type: "person", names: [] });
	};

	const handleUpdate = (index: number) => {
		if (!editingAgent.id?.trim()) return;

		setLyricLines((draft) => {
			draft.agents[index] = {
				id: editingAgent.id!.trim(),
				type: editingAgent.type ?? "person",
				names: editingAgent.names?.filter(Boolean) ?? [],
			};

			// 更新所有引用旧 agent id 的行的 agent
			const oldId = agents[index].id;
			const newId = editingAgent.id!.trim();
			if (oldId !== newId) {
				for (const line of draft.lyricLines) {
					if (line.agent === oldId) {
						line.agent = newId;
					}
				}
			}

			recalculateDuetState(draft);
		});

		setEditingIndex(null);
		setEditingAgent({});
	};

	const handleDelete = (index: number) => {
		setLyricLines((draft) => {
			const deletedId = draft.agents[index].id;
			draft.agents.splice(index, 1);

			// 清除引用该 agent 的行的 agent
			for (const line of draft.lyricLines) {
				if (line.agent === deletedId) {
					line.agent = undefined;
				}
			}

			recalculateDuetState(draft);
		});
	};

	const formatNamesOutput = (names: string[]): string => {
		return names.join(", ");
	};

	return (
		<Dialog.Root open={open} onOpenChange={setOpen}>
			<Dialog.Content className={styles.dialogContent}>
				<div className={styles.dialogHeader}>
					<Dialog.Title style={{ margin: 0 }}>
						{t("agentManager.title", "管理演唱者")}
					</Dialog.Title>
				</div>
				<div className={styles.dialogBody}>
					<section>
						<div className={styles.sectionHeader}>
							<Flex align="center" justify="between">
								<Text size="3" weight="medium">
									{t("agentManager.agentsList", "演唱者列表")}
								</Text>
								<Button
									onClick={() => {
										setIsAdding(true);
										setNewAgent({
											id: `v${agents.length + 1}`,
											type: "person",
											names: [],
										});
									}}
									disabled={isAdding}
								>
									<Add16Regular />
									{t("agentManager.add", "添加")}
								</Button>
							</Flex>
						</div>

						{agents.length === 0 && !isAdding && (
							<Text size="2" color="gray">
								{t("agentManager.empty", "暂无演唱者。")}
							</Text>
						)}

						<div className={styles.agentList}>
							{/* 添加新 Agent 表单 */}
							{isAdding && (
								<div className={styles.agentItem}>
									<Flex direction="column" gap="2">
										<Flex gap="2" align="center">
											<Text size="2" style={{ minWidth: "60px" }}>
												ID:
											</Text>
											<TextField.Root
												value={newAgent.id ?? ""}
												onChange={(e) =>
													setNewAgent({ ...newAgent, id: e.target.value })
												}
												placeholder={t("agentManager.idPlaceholder", "如: v1")}
												style={{ flex: 1 }}
											/>
										</Flex>
										<Flex gap="2" align="center">
											<Text size="2" style={{ minWidth: "60px" }}>
												Type:
											</Text>
											<Select.Root
												value={newAgent.type}
												onValueChange={(value) =>
													setNewAgent({
														...newAgent,
														type: value as TTMLAgent["type"],
													})
												}
											>
												<Select.Trigger style={{ flex: 1 }} />
												<Select.Content>
													{AGENT_TYPES.map((type) => (
														<Select.Item key={type.value} value={type.value}>
															{type.label}
														</Select.Item>
													))}
												</Select.Content>
											</Select.Root>
										</Flex>
										<Flex gap="2" align="flex-start">
											<Text size="2" style={{ minWidth: "60px", marginTop: "4px" }}>
												Names:
											</Text>
											<NamesEditor
												names={newAgent.names ?? []}
												onChange={(names) => setNewAgent({ ...newAgent, names })}
											/>
										</Flex>
										<Flex gap="2" justify="end">
											<Button
												variant="soft"
												onClick={() => {
													setIsAdding(false);
													setNewAgent({ type: "person", names: [] });
												}}
											>
												{t("common.cancel", "取消")}
											</Button>
											<Button
												onClick={handleAdd}
												disabled={!newAgent.id?.trim()}
											>
												{t("common.add", "添加")}
											</Button>
										</Flex>
									</Flex>
								</div>
							)}

							{/* Agent 列表 */}
							{agents.map((agent, index) => (
								<div key={agent.id} className={styles.agentItem}>
									{editingIndex === index ? (
										<Flex direction="column" gap="2">
											<Flex gap="2" align="center">
												<Text size="2" style={{ minWidth: "60px" }}>
													ID:
												</Text>
												<TextField.Root
													value={editingAgent.id ?? ""}
													onChange={(e) =>
														setEditingAgent({
															...editingAgent,
															id: e.target.value,
														})
													}
													style={{ flex: 1 }}
												/>
											</Flex>
											<Flex gap="2" align="center">
												<Text size="2" style={{ minWidth: "60px" }}>
													Type:
												</Text>
												<Select.Root
													value={editingAgent.type}
													onValueChange={(value) =>
														setEditingAgent({
															...editingAgent,
															type: value as TTMLAgent["type"],
														})
													}
												>
													<Select.Trigger style={{ flex: 1 }} />
													<Select.Content>
														{AGENT_TYPES.map((type) => (
															<Select.Item key={type.value} value={type.value}>
																{type.label}
															</Select.Item>
														))}
													</Select.Content>
												</Select.Root>
											</Flex>
											<Flex gap="2" align="flex-start">
												<Text size="2" style={{ minWidth: "60px", marginTop: "4px" }}>
													Names:
												</Text>
												<NamesEditor
													names={editingAgent.names ?? []}
													onChange={(names) => setEditingAgent({ ...editingAgent, names })}
												/>
											</Flex>
											<Flex gap="2" justify="end">
												<Button
													variant="soft"
													onClick={() => {
														setEditingIndex(null);
														setEditingAgent({});
													}}
												>
													{t("common.cancel", "取消")}
												</Button>
												<Button
													onClick={() => handleUpdate(index)}
													disabled={!editingAgent.id?.trim()}
												>
													{t("common.save", "保存")}
												</Button>
											</Flex>
										</Flex>
									) : (
										<Flex justify="between" align="center">
											<Flex direction="column" gap="1">
												<Text size="2" weight="medium">
													{agent.id} ({agent.type})
												</Text>
												{agent.names.length > 0 && (
													<Text size="1" color="gray">
														{formatNamesOutput(agent.names)}
													</Text>
												)}
											</Flex>
											<Flex gap="2">
												<Button
													variant="soft"
													onClick={() => {
														setEditingIndex(index);
														setEditingAgent({ ...agent });
													}}
													disabled={isAdding}
												>
													{t("common.edit", "编辑")}
												</Button>
												<Button
													color="red"
													onClick={() => handleDelete(index)}
													disabled={isAdding}
												>
													<Delete16Regular />
												</Button>
											</Flex>
										</Flex>
									)}
								</div>
							))}
						</div>
					</section>
				</div>
				<div className={styles.dialogFooter}>
					<Button onClick={() => setOpen(false)}>
						{t("common.close", "关闭")}
					</Button>
				</div>
			</Dialog.Content>
		</Dialog.Root>
	);
};
