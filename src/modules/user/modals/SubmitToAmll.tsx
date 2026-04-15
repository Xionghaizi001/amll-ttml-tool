import { ErrorCircle16Regular, Info16Regular } from "@fluentui/react-icons";
import {
	Box,
	Button,
	Card,
	Dialog,
	DropdownMenu,
	Flex,
	RadioGroup,
	Select,
	Text,
	TextArea,
	TextField,
} from "@radix-ui/themes";
import { Fragment, memo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	type NameFieldKey,
	useSubmitToAMLLDBDialog,
} from "$/modules/user/services/submit-to-amll";

export const SubmitToAMLLDBDialog = memo(() => {
	const { t } = useTranslation();
	const {
		comment,
		dialogOpen,
		artistSelections,
		emptySelectValue,
		hideWarning,
		issues,
		noDataSelectValue,
		onArtistSelectionChange,
		onNameOrderMove,
		onSubmit,
		orderedFieldItems,
		processing,
		setComment,
		setDialogOpen,
		setHideWarning,
		setSubmitReason,
		submitReason,
	} = useSubmitToAMLLDBDialog();
	const [draggingKey, setDraggingKey] = useState<NameFieldKey | null>(null);
	const [dragOver, setDragOver] = useState<{
		key: NameFieldKey;
		position: "before" | "after";
	} | null>(null);

	return (
		<Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
			<Dialog.Content
				aria-description={t(
					"submitToAMLLDB.description",
					"提交歌词到 AMLL 歌词数据库",
				)}
			>
				<Dialog.Title>
					{t(
						"submitToAMLLDB.title",
						"提交歌词到 AMLL 歌词数据库（仅简体中文用户）",
					)}
				</Dialog.Title>
				<Flex direction="column" gap="4">
					{!hideWarning && (
						<>
							<Card>
								<Flex gap="2" align="start">
									<ErrorCircle16Regular />
									<Text size="2">
										{t(
											"submitToAMLLDB.chineseOnlyWarning",
											"本功能仅使用 AMLL 歌词数据库的简体中文用户可用，如果您是为了在其他软件上使用歌词而编辑歌词的话，请参考对应的软件提交歌词的方式来提交歌词哦！",
										)}
									</Text>
								</Flex>
							</Card>
							<Card>
								<Flex gap="2" align="start">
									<Info16Regular />
									<Box>
										<Text size="2" asChild>
											<p>
												{t(
													"submitToAMLLDB.thankYou",
													"首先，感谢您的慷慨歌词贡献！",
												)}
												<br />
												{t(
													"submitToAMLLDB.cc0Agreement",
													"通过提交，你将默认同意",
												)}{" "}
												<Text weight="bold" color="orange">
													{t(
														"submitToAMLLDB.cc0Rights",
														"使用 CC0 共享协议完全放弃歌词所有权",
													)}
												</Text>
												{t("submitToAMLLDB.andSubmit", "并提交到歌词数据库！")}
												<br />
												{t(
													"submitToAMLLDB.futureUse",
													"并且歌词将会在以后被 AMLL 系程序作为默认 TTML 歌词源获取！",
												)}
												<br />
												{t(
													"submitToAMLLDB.rightsWarning",
													"如果您对歌词所有权比较看重的话，请勿提交歌词哦！",
												)}
												<br />
												{t(
													"submitToAMLLDB.submitInstructions",
													"请输入以下提交信息然后跳转到 Github 议题提交页面！",
												)}
											</p>
										</Text>
									</Box>
								</Flex>
							</Card>
							<Button
								variant="soft"
								size="1"
								onClick={() => setHideWarning(true)}
							>
								{t("submitToAMLLDB.closeWarning", "关闭上述警告信息")}
							</Button>
						</>
					)}
					<Text as="div" size="2">
						<Flex direction="column" gap="2">
							名称顺序
							<Flex gap="1" wrap="wrap">
								{orderedFieldItems.map((item) => {
									const isDropBefore =
										dragOver?.key === item.key &&
										dragOver.position === "before";
									const isDropAfter =
										dragOver?.key === item.key && dragOver.position === "after";
									return (
										<Flex
											key={item.key}
											draggable
											style={{
												cursor: "grab",
												padding: "4px 12px",
												minHeight: "28px",
												borderRadius: "var(--radius-3)",
												background: "var(--gray-a2)",
												border: "1px solid var(--gray-a4)",
												borderLeft: isDropBefore
													? "2px solid var(--accent-9)"
													: undefined,
												borderRight: isDropAfter
													? "2px solid var(--accent-9)"
													: undefined,
											}}
											onDragStart={(event) => {
												event.dataTransfer.effectAllowed = "move";
												setDraggingKey(item.key);
											}}
											onDragEnd={() => {
												setDraggingKey(null);
												setDragOver(null);
											}}
											onDragOver={(event) => {
												if (!draggingKey || draggingKey === item.key) return;
												event.preventDefault();
												const rect =
													event.currentTarget.getBoundingClientRect();
												const innerX = event.clientX - rect.left;
												setDragOver({
													key: item.key,
													position:
														innerX < rect.width / 2 ? "before" : "after",
												});
											}}
											onDragLeave={() => {
												if (dragOver?.key === item.key) {
													setDragOver(null);
												}
											}}
											onDrop={(event) => {
												event.preventDefault();
												if (!draggingKey || draggingKey === item.key) return;
												onNameOrderMove(
													draggingKey,
													item.key,
													dragOver?.position ?? "after",
												);
												setDraggingKey(null);
												setDragOver(null);
											}}
										>
											<Text size="2" color="gray">
												{item.label}
											</Text>
										</Flex>
									);
								})}
							</Flex>
						</Flex>
					</Text>
					<Text as="div" size="2">
						<Flex direction="column" gap="2">
							音乐名称
							<Flex gap="1" wrap="wrap" align="center">
								{orderedFieldItems.map((item, index) => (
									<Fragment key={item.key}>
										{item.key === "artists" ? (
											<DropdownMenu.Root>
												<DropdownMenu.Trigger>
													<Button size="1" variant="soft">
														{item.value.length > 0 ? item.value : "无"}
													</Button>
												</DropdownMenu.Trigger>
												<DropdownMenu.Content>
													{item.options.length === 0 ? (
														<DropdownMenu.Item disabled>
															暂无数据
														</DropdownMenu.Item>
													) : (
														item.options.map((option) => (
															<DropdownMenu.CheckboxItem
																key={`${item.key}-${option}`}
																checked={artistSelections.includes(option)}
																onSelect={(event) => {
																	event.preventDefault();
																}}
																onCheckedChange={(checked) =>
																	onArtistSelectionChange(
																		option,
																		checked === true,
																	)
																}
															>
																{option}
															</DropdownMenu.CheckboxItem>
														))
													)}
												</DropdownMenu.Content>
											</DropdownMenu.Root>
										) : item.key === "remark" ? (
											<TextField.Root
												placeholder="备注"
												value={item.value}
												onChange={(event) =>
													item.onChange(event.currentTarget.value)
												}
												size="1"
											/>
										) : (
											<Select.Root
												value={
													item.value.length === 0
														? emptySelectValue
														: item.value
												}
												onValueChange={(value) =>
													item.onChange(
														value === emptySelectValue
															? item.key === "album"
																? emptySelectValue
																: ""
															: value,
													)
												}
												size="1"
											>
												<Select.Trigger placeholder="无" />
												<Select.Content>
													{(item.key === "album" ||
														item.options.length === 0) && (
														<Select.Item value={emptySelectValue}>
															无
														</Select.Item>
													)}
													{item.options.length === 0 && (
														<Select.Item value={noDataSelectValue} disabled>
															暂无数据
														</Select.Item>
													)}
													{item.options.map((option) => (
														<Select.Item
															key={`${item.key}-${option}`}
															value={option}
														>
															{option}
														</Select.Item>
													))}
												</Select.Content>
											</Select.Root>
										)}
										{index < orderedFieldItems.length - 1 && (
											<Text size="2"> - </Text>
										)}
									</Fragment>
								))}
							</Flex>
							推荐使用 歌手 - 歌曲 格式，方便仓库管理员确认你的歌曲是否存在
						</Flex>
					</Text>
					<Text as="label" size="2">
						<Flex direction="column" gap="2">
							提交缘由
							<RadioGroup.Root
								value={submitReason}
								onValueChange={setSubmitReason}
							>
								<RadioGroup.Item value="新歌词提交">新歌词提交</RadioGroup.Item>
								<RadioGroup.Item value="修正已有歌词">
									修正已有歌词
								</RadioGroup.Item>
							</RadioGroup.Root>
						</Flex>
					</Text>
					<Text as="label" size="2">
						<Flex direction="column" gap="2">
							备注
							<TextArea
								resize="vertical"
								placeholder="有什么需要补充说明的呢？"
								value={comment}
								onChange={(e) => setComment(e.currentTarget.value)}
							/>
						</Flex>
					</Text>
					{issues.length > 0 && (
						<Card>
							<Flex gap="2" align="start">
								<ErrorCircle16Regular />
								<Box>
									<Text size="2">发现以下问题，请修正后再提交：</Text>
									<ul>
										{issues.map((issue) => (
											<li key={issue}>{issue}</li>
										))}
									</ul>
								</Box>
							</Flex>
						</Card>
					)}
					<Button
						loading={processing}
						disabled={issues.length > 0}
						onClick={onSubmit}
					>
						上传歌词并创建议题
					</Button>
				</Flex>
			</Dialog.Content>
		</Dialog.Root>
	);
});
