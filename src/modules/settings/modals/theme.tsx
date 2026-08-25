import {
	ArrowCounterclockwise24Regular,
	Checkmark16Filled,
	Color24Regular,
	PaintBrush24Regular,
	ShieldTask24Regular,
} from "@fluentui/react-icons";
import { Badge, Button, Flex, Switch, Text, TextField } from "@radix-ui/themes";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { themeService } from "$/plugins/adapters/theme-host";
import { THEME_RESCUE_SHORTCUT } from "$/plugins/ui/ThemeHost";
import { SettingsGroup, SettingsRow } from "./SettingsGroup";

const useThemeState = () =>
	useSyncExternalStore(
		useCallback((listener: () => void) => themeService.subscribe(listener), []),
		() => themeService.getState(),
	);

const ThemeListRow = ({
	id,
	name,
	description,
	source,
}: {
	id: string | null;
	name: string;
	description?: string;
	source?: "builtin" | "installed";
}) => {
	const state = useThemeState();
	const { t } = useTranslation();
	const isActive = state.activeThemeId === id && state.previewThemeId === null;
	const isPreviewing =
		state.previewThemeId !== null && state.previewThemeId === id;
	return (
		<SettingsRow
			icon={isActive ? <Checkmark16Filled /> : <Color24Regular />}
			title={
				<Flex align="center" gap="2">
					{name}
					{source === "installed" && (
						<Badge color="gray">
							{t("settings.theme.installed", "已导入")}
						</Badge>
					)}
					{isPreviewing && (
						<Badge color="amber">
							{t("settings.theme.previewing", "预览中")}
						</Badge>
					)}
				</Flex>
			}
			description={description}
			action={
				<Flex gap="2">
					{id !== null && !isActive && (
						<Button
							variant="soft"
							size="1"
							disabled={state.safeMode}
							onClick={() =>
								isPreviewing
									? themeService.cancelPreview()
									: themeService.previewTheme(id)
							}
						>
							{isPreviewing
								? t("settings.theme.cancelPreview", "取消预览")
								: t("settings.theme.preview", "预览")}
						</Button>
					)}
					<Button
						size="1"
						disabled={state.safeMode || isActive}
						onClick={() => {
							themeService.applyTheme(id);
							if (id !== null)
								toast.info(
									t(
										"settings.theme.appliedHint",
										"主题已应用；若界面异常，可按 {shortcut} 恢复默认。",
										{ shortcut: THEME_RESCUE_SHORTCUT },
									),
								);
						}}
					>
						{isActive
							? t("settings.theme.active", "使用中")
							: t("settings.theme.apply", "应用")}
					</Button>
					{source === "installed" && (
						<Button
							variant="soft"
							color="red"
							size="1"
							onClick={() =>
								id !== null && themeService.removeInstalledTheme(id)
							}
						>
							{t("settings.theme.remove", "移除")}
						</Button>
					)}
				</Flex>
			}
		/>
	);
};

const TOKEN_OVERRIDE_FIELDS = [
	{
		key: "panelBackground",
		label: "面板背景色",
		i18nKey: "settings.theme.tokenPanelBackground",
		placeholder: "#1a1628",
	},
	{
		key: "appBackground",
		label: "应用背景",
		i18nKey: "settings.theme.tokenAppBackground",
		placeholder: "#101018 或 linear-gradient(...)",
	},
	{
		key: "lineSelectedBackground",
		label: "选中歌词行背景",
		i18nKey: "settings.theme.tokenLineSelectedBackground",
		placeholder: "rgb(157 133 255 / 0.16)",
	},
	{
		key: "fontFamily",
		label: "界面字体",
		i18nKey: "settings.theme.tokenFontFamily",
		placeholder: "MiSans, sans-serif",
	},
] as const;

type OverrideValues = Partial<
	Record<(typeof TOKEN_OVERRIDE_FIELDS)[number]["key"], string>
>;

const overridesToValues = (): OverrideValues => {
	const tokens = themeService.getUserTokenOverrides();
	return {
		panelBackground: tokens?.color?.panelBackground ?? "",
		appBackground:
			tokens?.background?.kind === "none"
				? ""
				: (tokens?.background?.value ?? ""),
		lineSelectedBackground: tokens?.lyrics?.lineSelectedBackground ?? "",
		fontFamily: tokens?.font?.family ?? "",
	};
};

/**
 * Declarative token override editor: it only ever edits validated design
 * tokens and never executes or embeds theme code.
 */
const UserTokenOverrideEditor = () => {
	const { t } = useTranslation();
	const state = useThemeState();
	const [values, setValues] = useState<OverrideValues>(overridesToValues);

	const save = () => {
		const trimmed = Object.fromEntries(
			Object.entries(values).map(([key, value]) => [key, value?.trim() ?? ""]),
		) as OverrideValues;
		const hasAny = Object.values(trimmed).some((value) => value !== "");
		const result = themeService.setUserTokenOverrides(
			hasAny
				? {
						tokenVersion: 0,
						...(trimmed.panelBackground
							? { color: { panelBackground: trimmed.panelBackground } }
							: {}),
						...(trimmed.lineSelectedBackground
							? {
									lyrics: {
										lineSelectedBackground: trimmed.lineSelectedBackground,
									},
								}
							: {}),
						...(trimmed.fontFamily
							? { font: { family: trimmed.fontFamily } }
							: {}),
						...(trimmed.appBackground
							? {
									background: {
										kind: trimmed.appBackground.includes("gradient(")
											? ("gradient" as const)
											: ("solid" as const),
										value: trimmed.appBackground,
									},
								}
							: {}),
					}
				: null,
		);
		if (result.ok)
			toast.success(t("settings.theme.overridesSaved", "已保存 token 覆盖"));
		else
			toast.error(
				t("settings.theme.overridesInvalid", "token 值未通过校验：{issues}", {
					issues: result.issues
						.map((issue) => `${issue.path}: ${issue.message}`)
						.join("; "),
				}),
			);
	};

	return (
		<SettingsRow
			icon={<Color24Regular />}
			title={t("settings.theme.overridesTitle", "用户 token 覆盖")}
			description={t(
				"settings.theme.overridesDesc",
				"以最高优先级覆盖主题的设计 token；仅接受声明式值，不执行任何主题代码。",
			)}
		>
			<Flex direction="column" gap="2" mt="2">
				{TOKEN_OVERRIDE_FIELDS.map((field) => (
					<Flex key={field.key} align="center" gap="2">
						<Text size="1" style={{ minWidth: "9em" }}>
							{t(field.i18nKey, field.label)}
						</Text>
						<TextField.Root
							size="1"
							style={{ flexGrow: 1 }}
							placeholder={field.placeholder}
							value={values[field.key] ?? ""}
							onChange={(event) =>
								setValues((prev) => ({
									...prev,
									[field.key]: event.target.value,
								}))
							}
						/>
					</Flex>
				))}
				<Flex gap="2">
					<Button size="1" onClick={save} disabled={state.safeMode}>
						{t("settings.theme.overridesApply", "保存覆盖")}
					</Button>
					<Button
						size="1"
						variant="soft"
						disabled={!state.hasUserOverrides}
						onClick={() => {
							themeService.setUserTokenOverrides(null);
							setValues(overridesToValues());
						}}
					>
						{t("settings.theme.overridesClear", "清除覆盖")}
					</Button>
				</Flex>
			</Flex>
		</SettingsRow>
	);
};

export const SettingsThemeSection = () => {
	const { t } = useTranslation();
	const state = useThemeState();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const themes = themeService.listThemes();

	const onImportFile = async (file: File) => {
		try {
			const parsed: unknown = JSON.parse(await file.text());
			const result = themeService.importThemePackage(parsed);
			if (result.ok)
				toast.success(
					t("settings.theme.importSuccess", "已导入主题 {name}", {
						name: result.value.manifest.name,
					}),
				);
			else
				toast.error(
					t("settings.theme.importInvalid", "主题包未通过校验：{issues}", {
						issues: result.issues
							.slice(0, 3)
							.map((issue) => `${issue.path}: ${issue.message}`)
							.join("; "),
					}),
				);
		} catch {
			toast.error(
				t("settings.theme.importParseError", "主题包不是有效的 JSON 文件"),
			);
		}
	};

	return (
		<SettingsGroup title={t("settings.theme.title", "主题")}>
			{state.safeMode && (
				<SettingsRow
					icon={<ShieldTask24Regular />}
					title={t("settings.theme.safeModeActive", "主题安全模式已开启")}
					description={
						state.safeModeReason === "crash"
							? t(
									"settings.theme.safeModeCrash",
									"上次启动未正常完成，主题已被自动停用。",
								)
							: t(
									"settings.theme.safeModeOn",
									"所有主题样式均被停用，界面使用默认外观。",
								)
					}
				/>
			)}
			<ThemeListRow
				id={null}
				name={t("settings.theme.defaultTheme", "默认外观")}
			/>
			{themes.map((theme) => (
				<ThemeListRow
					key={theme.id}
					id={theme.id}
					name={theme.name}
					description={theme.description}
					source={theme.source}
				/>
			))}
			<SettingsRow
				icon={<PaintBrush24Regular />}
				title={t("settings.theme.import", "导入主题包")}
				description={t(
					"settings.theme.importDesc",
					"从 JSON 文件导入声明式主题包；主题只包含设计 token 与受限 CSS，不包含可执行代码。",
				)}
				action={
					<>
						<input
							ref={fileInputRef}
							type="file"
							accept=".json,application/json"
							style={{ display: "none" }}
							onChange={(event) => {
								const file = event.target.files?.[0];
								event.target.value = "";
								if (file) void onImportFile(file);
							}}
						/>
						<Button
							variant="soft"
							size="1"
							onClick={() => fileInputRef.current?.click()}
						>
							{t("settings.theme.importButton", "选择文件")}
						</Button>
					</>
				}
			/>
			<SettingsRow
				icon={<ShieldTask24Regular />}
				title={t("settings.theme.safeMode", "主题安全模式")}
				description={t(
					"settings.theme.safeModeDesc",
					"停用全部主题样式；下次启动依然生效，可随时关闭。",
				)}
				action={
					<Switch
						checked={state.safeMode}
						onCheckedChange={(checked) => themeService.setSafeMode(checked)}
					/>
				}
				asLabel
			/>
			<SettingsRow
				icon={<ArrowCounterclockwise24Regular />}
				title={t("settings.theme.restoreDefault", "恢复默认主题")}
				description={t(
					"settings.theme.restoreDefaultDesc",
					"清除当前主题、预览与全部用户 token 覆盖；快捷键 {shortcut} 随时可用。",
					{ shortcut: THEME_RESCUE_SHORTCUT },
				)}
				action={
					<Button
						variant="soft"
						size="1"
						onClick={() => {
							themeService.restoreDefaultTheme();
							toast.info(t("settings.theme.restored", "已恢复默认主题"));
						}}
					>
						{t("settings.theme.restoreButton", "恢复默认")}
					</Button>
				}
			/>
			<UserTokenOverrideEditor />
		</SettingsGroup>
	);
};
