import {
	Button,
	Dialog,
	Flex,
	Grid,
	Select,
	Switch,
	Text,
	TextArea,
	TextField,
} from "@radix-ui/themes";
import { atom, useAtom, useStore } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { memo, type PropsWithChildren, useCallback } from "react";
import { toast } from "react-toastify";
import { importFromTextDialogAtom } from "$/states/dialogs.ts";
import {
	parsePlainTextLyrics,
	type PlainTextImportMode,
	type PlainTextLineSeparatorMode,
} from "$/application/lyrics";

// import styles from "./ImportFromText.module.css";
import error = toast.error;

import { useTranslation } from "react-i18next";
import { editorDocumentAdapter } from "$/plugins/adapters/editor-document.ts";
import { lyricFileFlow } from "$/plugins/adapters/lyric-file-flow-host.ts";
import { projectLogger } from "../logger";

// type IModelDeltaDecoration = monaco.editor.IModelDeltaDecoration;
// type IEditorDecorationsCollection = monaco.editor.IEditorDecorationsCollection;

const PrefText = memo((props: PropsWithChildren) => (
	<Text color="gray" size="2">
		{props.children}
	</Text>
));

enum ImportMode {
	Lyric = "lyric",
	LyricTrans = "lyric-trans",
	LyricRoman = "lyric-roman",
	LyricTransRoman = "lyric-trans-roman",
}

enum LineSeparatorMode {
	Interleaved = "interleaved-line",
	SameLineSeparator = "same-line-separator",
}

const importModeAtom = atomWithStorage(
	"importFromText.importMode",
	ImportMode.Lyric,
);
const lineSeparatorModeAtom = atomWithStorage(
	"importFromText.lineSeparatorMode",
	LineSeparatorMode.Interleaved,
);
const lineSeparatorAtom = atomWithStorage("importFromText.lineSeparator", "|");
const swapTransAndRomanAtom = atomWithStorage(
	"importFromText.swapTransAndRoman",
	false,
);
const wordSeparatorAtom = atomWithStorage("importFromText.wordSeparator", "\\");
const enableSpecialPrefixAtom = atomWithStorage(
	"importFromText.enableSpecialPrefix",
	false,
);
const bgLyricPrefixAtom = atomWithStorage("importFromText.bgLyricPrefix", "<");
const duetLyricPrefixAtom = atomWithStorage(
	"importFromText.duetLyricPrefix",
	">",
);
const enableEmptyBeatAtom = atomWithStorage(
	"importFromText.enableEmptyBeat",
	false,
);
const emptyBeatSymbolAtom = atomWithStorage(
	"importFromText.emptyBeatSymbol",
	"^",
);
const textValueAtom = atom("");

const ImportFromTextEditor = memo(() => {
	const [value, setValue] = useAtom(textValueAtom);
	return (
		<TextArea
			style={{
				height: "calc(80vh - 5em)",
				flex: "1 1 auto",
				fontFamily: "var(--code-font-family)",
			}}
			value={value}
			onChange={(evt) => setValue(evt.currentTarget.value)}
		/>
	);
});

export const ImportFromText = () => {
	const { t } = useTranslation();

	const [importFromTextDialog, setImportFromTextDialog] = useAtom(
		importFromTextDialogAtom,
	);

	const [importMode, setImportMode] = useAtom(importModeAtom);
	const [lineSeparatorMode, setLineSeparatorMode] = useAtom(
		lineSeparatorModeAtom,
	);
	const [lineSeparator, setLineSeparator] = useAtom(lineSeparatorAtom);
	const [swapTransAndRoman, setSwapTransAndRoman] = useAtom(
		swapTransAndRomanAtom,
	);
	const [wordSeparator, setWordSeparator] = useAtom(wordSeparatorAtom);
	const [enableSpecialPrefix, setEnableSpecialPrefix] = useAtom(
		enableSpecialPrefixAtom,
	);
	const [bgLyricPrefix, setBgLyricPrefix] = useAtom(bgLyricPrefixAtom);
	const [duetLyricPrefix, setDuetLyricPrefix] = useAtom(duetLyricPrefixAtom);
	const [enableEmptyBeat, setEnableEmptyBeat] = useAtom(enableEmptyBeatAtom);
	const [emptyBeatSymbol, setEmptyBeatSymbol] = useAtom(emptyBeatSymbolAtom);

	const store = useStore();

	const onImport = useCallback(
		(text: string) => {
			const result = parsePlainTextLyrics(text, {
				mode: store.get(importModeAtom) as PlainTextImportMode,
				lineSeparatorMode: store.get(lineSeparatorModeAtom) as PlainTextLineSeparatorMode,
				lineSeparator: store.get(lineSeparatorAtom),
				swapTransAndRoman: store.get(swapTransAndRomanAtom),
				wordSeparator: store.get(wordSeparatorAtom),
				enableSpecialPrefix: store.get(enableSpecialPrefixAtom),
				bgLyricPrefix: store.get(bgLyricPrefixAtom),
				duetLyricPrefix: store.get(duetLyricPrefixAtom),
				enableEmptyBeat: store.get(enableEmptyBeatAtom),
				emptyBeatSymbol: store.get(emptyBeatSymbolAtom),
			});
			void lyricFileFlow
				.commitImportedLyric(
					{
						lyricLines: result,
						metadata: [],
					},
					{
						label: "Import plain text lyrics",
						expectedRevision: editorDocumentAdapter.getRevision(),
					},
				)
				.catch((e) => {
					error(
						"导入纯文本歌词失败，请检查输入的文本是否正确，或者导入设置是否正确",
					);
					projectLogger.error(e);
				});
		},
		[store],
	);

	return (
		<Dialog.Root
			open={importFromTextDialog}
			onOpenChange={setImportFromTextDialog}
		>
			<Dialog.Content maxWidth="100%" maxHeight="100%">
				<Flex direction="column">
					<Flex gap="2" align="center" mb="2">
						<Dialog.Title
							style={{
								flex: "1 1 auto",
							}}
						>
							{t("textImportDialog.title", "导入纯文本歌词")}
						</Dialog.Title>
						<Button
							onClick={() => {
								const importAction = () => {
									try {
										onImport(store.get(textValueAtom));
										setImportFromTextDialog(false);
									} catch (e) {
										error(
											"导入纯文本歌词失败，请检查输入的文本是否正确，或者导入设置是否正确",
										);
										projectLogger.error(e);
									}
								};
								lyricFileFlow.confirmIfDirty(
									{
										title: t("confirmDialog.importFile.title", "确认导入歌词"),
										description: t(
											"confirmDialog.importFile.description",
											"当前文件有未保存的更改。如果继续，这些更改将会丢失。确定要导入歌词吗？",
										),
									},
									importAction,
								);
							}}
						>
							{t("textImportDialog.actionButton", "导入歌词")}
						</Button>
					</Flex>
					<Flex
						gap="4"
						direction={{
							initial: "column",
							sm: "row",
						}}
					>
						{/* <Card style={{ flex: "1 1 auto" }}>
							<Inset>
								<TextArea
									style={{
										height: "calc(80vh - 5em)",
										flex: "1 1 auto"
									}}
									value={value}
									onChange={(evt) => setValue(evt.currentTarget.value)}
								/>
							</Inset>
						</Card> */}

						<ImportFromTextEditor />
						<Grid
							columns="2"
							gapY="2"
							gapX="4"
							style={{
								whiteSpace: "nowrap",
								flex: "0 0 auto",
								alignItems: "center",
								alignContent: "start",
								textAlign: "end",
							}}
						>
							<PrefText>
								{t("textImportDialog.contentMode.caption", "导入模式")}
							</PrefText>
							<Select.Root
								value={importMode}
								onValueChange={(v) => setImportMode(v as ImportMode)}
							>
								<Select.Trigger />
								<Select.Content>
									<Select.Item value={ImportMode.Lyric}>
										{t("textImportDialog.contentMode.lyric", "仅歌词")}
									</Select.Item>
									<Select.Item value={ImportMode.LyricTrans}>
										{t(
											"textImportDialog.contentMode.withTranslation",
											"歌词和翻译歌词",
										)}
									</Select.Item>
									<Select.Item value={ImportMode.LyricRoman}>
										{t(
											"textImportDialog.contentMode.withRoman",
											"歌词和音译歌词",
										)}
									</Select.Item>
									<Select.Item value={ImportMode.LyricTransRoman}>
										{t(
											"textImportDialog.contentMode.withBoth",
											"歌词和翻译、音译歌词",
										)}
									</Select.Item>
								</Select.Content>
							</Select.Root>

							<PrefText>
								{t(
									"textImportDialog.separationMode.caption",
									"歌词分行（翻译和音译）模式",
								)}
							</PrefText>
							<Select.Root
								disabled={importMode === ImportMode.Lyric}
								value={lineSeparatorMode}
								onValueChange={(v) =>
									setLineSeparatorMode(v as LineSeparatorMode)
								}
							>
								<Select.Trigger />
								<Select.Content>
									<Select.Item value={LineSeparatorMode.Interleaved}>
										{t(
											"textImportDialog.separationMode.multipleLine",
											"多行交错分隔",
										)}
									</Select.Item>
									<Select.Item value={LineSeparatorMode.SameLineSeparator}>
										{t("textImportDialog.separationMode.sameLine", "同行分隔")}
									</Select.Item>
								</Select.Content>
							</Select.Root>

							<PrefText>
								{t("textImportDialog.separator", "歌词行分隔符")}
							</PrefText>
							<TextField.Root
								disabled={
									importMode === ImportMode.Lyric ||
									lineSeparatorMode !== LineSeparatorMode.SameLineSeparator
								}
								value={lineSeparator}
								onChange={(evt) => setLineSeparator(evt.currentTarget.value)}
							/>

							<PrefText>
								{t("textImportDialog.swapTransAndRoman", "交换翻译行和音译行")}
							</PrefText>
							<Switch
								checked={swapTransAndRoman}
								onCheckedChange={setSwapTransAndRoman}
							/>

							<PrefText>
								{t("textImportDialog.wordSeparator", "单词分隔符")}
							</PrefText>
							<TextField.Root
								value={wordSeparator}
								onChange={(evt) => setWordSeparator(evt.currentTarget.value)}
							/>

							<PrefText>
								{t("textImportDialog.enableSpecialPrefix", "启用特殊前缀")}
							</PrefText>
							<Switch
								checked={enableSpecialPrefix}
								onCheckedChange={setEnableSpecialPrefix}
							/>

							<PrefText>
								{t("textImportDialog.bgLyricPrefix", "背景歌词前缀")}
							</PrefText>
							<TextField.Root
								disabled={!enableSpecialPrefix}
								value={bgLyricPrefix}
								onChange={(evt) => setBgLyricPrefix(evt.currentTarget.value)}
							/>

							<PrefText>
								{t("textImportDialog.duetLyricPrefix", "对唱歌词前缀")}
							</PrefText>
							<TextField.Root
								disabled={!enableSpecialPrefix}
								value={duetLyricPrefix}
								onChange={(evt) => setDuetLyricPrefix(evt.currentTarget.value)}
							/>

							<PrefText>
								{t("textImportDialog.enableEmptyBeat", "启用空拍")}
							</PrefText>
							<Switch
								checked={enableEmptyBeat}
								onCheckedChange={setEnableEmptyBeat}
							/>

							<PrefText>
								{t("textImportDialog.emptyBeatSymbol", "空拍符号")}
							</PrefText>
							<TextField.Root
								disabled={!enableEmptyBeat}
								value={emptyBeatSymbol}
								onChange={(evt) => setEmptyBeatSymbol(evt.currentTarget.value)}
							/>
						</Grid>
					</Flex>
				</Flex>
			</Dialog.Content>
		</Dialog.Root>
	);
};
