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

import { Button, Dialog, Flex, Text } from "@radix-ui/themes";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { duplicateSongIdDialogAtom } from "$/states/dialogs";

export const DuplicateSongIdDialog = () => {
	const { t } = useTranslation();
	const [dialogState, setDialogState] = useAtom(duplicateSongIdDialogAtom);

	const handleClose = () => {
		setDialogState({ ...dialogState, open: false });
	};

	const handleConfirm = () => {
		dialogState.onConfirm?.();
		setDialogState({ ...dialogState, open: false });
	};

	return (
		<Dialog.Root open={dialogState.open} onOpenChange={handleClose}>
			<Dialog.Content>
				<Dialog.Title>
					{t("duplicateSongIdDialog.title", "歌曲 ID 已存在")}
				</Dialog.Title>
				<Flex direction="column" gap="3">
					<Text size="2">
						{t(
							"duplicateSongIdDialog.description",
							"以下歌曲 ID 已有提交记录，提交时请记得更改标题为「歌词补正」，在元数据中添加原歌词作者的 Github ID 和用户名，并且提交时在「备注」一栏补充上一次提交的 PR 编号",
						)}
					</Text>
					<Flex direction="column" gap="2">
						{dialogState.existingIds.map(({ type, id }) => (
							<Flex
								key={`${type}-${id}`}
								gap="2"
								align="center"
								style={{
									padding: "8px 12px",
									background: "var(--gray-3)",
									borderRadius: "6px",
								}}
							>
								<Text size="2" weight="bold">
									{type}:
								</Text>
								<Text size="2" style={{ fontFamily: "monospace" }}>
									{id}
								</Text>
							</Flex>
						))}
					</Flex>
				</Flex>
				<Flex gap="3" mt="4" justify="end">
					<Button onClick={handleConfirm}>
						{t("duplicateSongIdDialog.confirm", "我已知晓此 ID 为重复提交")}
					</Button>
				</Flex>
			</Dialog.Content>
		</Dialog.Root>
	);
};
