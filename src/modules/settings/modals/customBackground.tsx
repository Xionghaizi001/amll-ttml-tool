import {
	ArrowHookUpLeft24Regular,
	ChevronRight24Regular,
	Image24Regular,
} from "@fluentui/react-icons";
import { Button, Flex, IconButton, Slider, Text } from "@radix-ui/themes";
import { openDB } from "idb";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
	customBackgroundBlurAtom,
	customBackgroundBrightnessAtom,
	customBackgroundMaskAtom,
	customBackgroundOpacityAtom,
} from "$/modules/settings/states/background";
import { SettingsGroup, SettingsRow } from "./SettingsGroup";

const CUSTOM_BACKGROUND_DB = "amll-custom-background";
const CUSTOM_BACKGROUND_STORE = "background-image";
const CUSTOM_BACKGROUND_KEY = "main";

type CustomBackgroundRecord = {
	key: string;
	blob: Blob;
	updatedAt: number;
};

const customBackgroundDbPromise = openDB(CUSTOM_BACKGROUND_DB, 1, {
	upgrade(db) {
		if (!db.objectStoreNames.contains(CUSTOM_BACKGROUND_STORE)) {
			db.createObjectStore(CUSTOM_BACKGROUND_STORE, { keyPath: "key" });
		}
	},
});

const readLegacyCustomBackground = async () => {
	try {
		const raw = localStorage.getItem("customBackgroundImage");
		if (!raw) return null;
		const parsed = JSON.parse(raw) as string | null;
		if (!parsed || typeof parsed !== "string") {
			localStorage.removeItem("customBackgroundImage");
			return null;
		}
		if (!parsed.startsWith("data:")) {
			localStorage.removeItem("customBackgroundImage");
			return null;
		}
		const response = await fetch(parsed);
		const blob = await response.blob();
		localStorage.removeItem("customBackgroundImage");
		return blob;
	} catch {
		return null;
	}
};

const readCustomBackgroundBlob = async () => {
	try {
		const db = await customBackgroundDbPromise;
		const record = (await db.get(
			CUSTOM_BACKGROUND_STORE,
			CUSTOM_BACKGROUND_KEY,
		)) as CustomBackgroundRecord | undefined;
		if (record?.blob) return record.blob;
	} catch {}
	const legacy = await readLegacyCustomBackground();
	if (!legacy) return null;
	try {
		const db = await customBackgroundDbPromise;
		const record: CustomBackgroundRecord = {
			key: CUSTOM_BACKGROUND_KEY,
			blob: legacy,
			updatedAt: Date.now(),
		};
		await db.put(CUSTOM_BACKGROUND_STORE, record);
	} catch {}
	return legacy;
};

const writeCustomBackgroundBlob = async (blob: Blob | null) => {
	try {
		const db = await customBackgroundDbPromise;
		if (!blob) {
			await db.delete(CUSTOM_BACKGROUND_STORE, CUSTOM_BACKGROUND_KEY);
			return;
		}
		const record: CustomBackgroundRecord = {
			key: CUSTOM_BACKGROUND_KEY,
			blob,
			updatedAt: Date.now(),
		};
		await db.put(CUSTOM_BACKGROUND_STORE, record);
	} catch {}
};

const customBackgroundImageValueAtom = atom<string | null>(null);

export const customBackgroundImageAtom = atom(
	(get) => get(customBackgroundImageValueAtom),
	async (get, set, next: File | Blob | null) => {
		const previous = get(customBackgroundImageValueAtom);
		if (previous) {
			URL.revokeObjectURL(previous);
		}
		if (!next) {
			await writeCustomBackgroundBlob(null);
			set(customBackgroundImageValueAtom, null);
			return;
		}
		await writeCustomBackgroundBlob(next);
		const url = URL.createObjectURL(next);
		set(customBackgroundImageValueAtom, url);
	},
);

export const customBackgroundImageInitAtom = atom(null, async (get, set) => {
	const previous = get(customBackgroundImageValueAtom);
	if (previous) {
		URL.revokeObjectURL(previous);
	}
	const blob = await readCustomBackgroundBlob();
	if (!blob) {
		set(customBackgroundImageValueAtom, null);
		return;
	}
	const url = URL.createObjectURL(blob);
	set(customBackgroundImageValueAtom, url);
});

export const SettingsCustomBackgroundSettings = () => {
	const customBackgroundImage = useAtomValue(customBackgroundImageAtom);
	const setCustomBackgroundImage = useSetAtom(customBackgroundImageAtom);
	const [customBackgroundOpacity, setCustomBackgroundOpacity] = useAtom(
		customBackgroundOpacityAtom,
	);
	const [customBackgroundMask, setCustomBackgroundMask] = useAtom(
		customBackgroundMaskAtom,
	);
	const [customBackgroundBlur, setCustomBackgroundBlur] = useAtom(
		customBackgroundBlurAtom,
	);
	const [customBackgroundBrightness, setCustomBackgroundBrightness] = useAtom(
		customBackgroundBrightnessAtom,
	);
	const { t } = useTranslation();
	const backgroundFileInputRef = useRef<HTMLInputElement>(null);

	const onSelectBackgroundFile = useCallback(
		(file: File) => {
			setCustomBackgroundImage(file);
		},
		[setCustomBackgroundImage],
	);

	const resetButtonLabel = t("settings.common.customBackgroundReset", "重置");

	return (
		<Flex direction="column" gap="4">
			<SettingsGroup
				title={t("settings.common.customBackground", "自定义背景")}
			>
				<SettingsRow
					icon={<Image24Regular />}
					title={t("settings.common.customBackgroundImage", "背景图片")}
					description={t(
						"settings.common.customBackgroundDesc",
						"选择一张图片作为背景。",
					)}
					action={
						<Flex gap="2" align="center">
							<input
								ref={backgroundFileInputRef}
								type="file"
								accept="image/*"
								style={{ display: "none" }}
								onChange={(event) => {
									const file = event.target.files?.[0];
									if (!file) return;
									onSelectBackgroundFile(file);
									event.target.value = "";
								}}
							/>
							<Button
								variant="soft"
								onClick={() => backgroundFileInputRef.current?.click()}
							>
								{t("settings.common.customBackgroundPick", "选择图片")}
							</Button>
							<Button
								variant="ghost"
								disabled={!customBackgroundImage}
								onClick={() => setCustomBackgroundImage(null)}
							>
								{t("settings.common.customBackgroundClear", "清除")}
							</Button>
						</Flex>
					}
				/>
			</SettingsGroup>

			<SettingsGroup
				title={t("settings.common.customBackgroundStyle", "背景效果")}
			>
				<SettingsRow
					icon={<Image24Regular />}
					title={t("settings.common.customBackgroundOpacity", "透明度")}
					action={
						<Flex align="center" gap="2">
							<Text wrap="nowrap" color="gray" size="1">
								{Math.round(customBackgroundOpacity * 100)}%
							</Text>
							{customBackgroundOpacity !== 0.4 && (
								<IconButton
									variant="ghost"
									size="1"
									aria-label={resetButtonLabel}
									onClick={() => setCustomBackgroundOpacity(0.4)}
								>
									<ArrowHookUpLeft24Regular />
								</IconButton>
							)}
						</Flex>
					}
				>
					<Slider
						min={0}
						max={1}
						step={0.01}
						value={[customBackgroundOpacity]}
						onValueChange={(v) => setCustomBackgroundOpacity(v[0])}
					/>
					{customBackgroundOpacity >= 0.5 && (
						<Text size="1" color="orange">
							{t(
								"settings.common.customBackgroundOpacityWarning",
								"如果这个数值太高可能让你看不清页面上的内容。",
							)}
						</Text>
					)}
				</SettingsRow>

				<SettingsRow
					icon={<Image24Regular />}
					title={t("settings.common.customBackgroundMask", "遮罩")}
					action={
						<Flex align="center" gap="2">
							<Text wrap="nowrap" color="gray" size="1">
								{Math.round(customBackgroundMask * 100)}%
							</Text>
							{customBackgroundMask !== 0.2 && (
								<IconButton
									variant="ghost"
									size="1"
									aria-label={resetButtonLabel}
									onClick={() => setCustomBackgroundMask(0.2)}
								>
									<ArrowHookUpLeft24Regular />
								</IconButton>
							)}
						</Flex>
					}
				>
					<Slider
						min={0}
						max={1}
						step={0.01}
						value={[customBackgroundMask]}
						onValueChange={(v) => setCustomBackgroundMask(v[0])}
					/>
				</SettingsRow>

				<SettingsRow
					icon={<Image24Regular />}
					title={t("settings.common.customBackgroundBlur", "模糊半径")}
					action={
						<Flex align="center" gap="2">
							<Text wrap="nowrap" color="gray" size="1">
								{customBackgroundBlur.toFixed(0)}px
							</Text>
							{customBackgroundBlur !== 0 && (
								<IconButton
									variant="ghost"
									size="1"
									aria-label={resetButtonLabel}
									onClick={() => setCustomBackgroundBlur(0)}
								>
									<ArrowHookUpLeft24Regular />
								</IconButton>
							)}
						</Flex>
					}
				>
					<Slider
						min={0}
						max={30}
						step={1}
						value={[customBackgroundBlur]}
						onValueChange={(v) => setCustomBackgroundBlur(v[0])}
					/>
				</SettingsRow>

				<SettingsRow
					icon={<Image24Regular />}
					title={t("settings.common.customBackgroundBrightness", "亮度")}
					action={
						<Flex align="center" gap="2">
							<Text wrap="nowrap" color="gray" size="1">
								{Math.round(customBackgroundBrightness * 100)}%
							</Text>
							{customBackgroundBrightness !== 1 && (
								<IconButton
									variant="ghost"
									size="1"
									aria-label={resetButtonLabel}
									onClick={() => setCustomBackgroundBrightness(1)}
								>
									<ArrowHookUpLeft24Regular />
								</IconButton>
							)}
						</Flex>
					}
				>
					<Slider
						min={0.5}
						max={1.5}
						step={0.01}
						value={[customBackgroundBrightness]}
						onValueChange={(v) => setCustomBackgroundBrightness(v[0])}
					/>
				</SettingsRow>
			</SettingsGroup>
		</Flex>
	);
};

export const SettingsCustomBackgroundCard = ({
	onOpen,
}: {
	onOpen: () => void;
}) => {
	const customBackgroundImage = useAtomValue(customBackgroundImageAtom);
	const { t } = useTranslation();

	return (
		<SettingsRow
			icon={<Image24Regular />}
			title={t("settings.common.customBackground", "自定义背景")}
			description={
				customBackgroundImage
					? t("settings.common.customBackgroundEnabled", "已设置背景")
					: t("settings.common.customBackgroundDesc", "选择一张图片作为背景。")
			}
			action={
				<IconButton
					variant="ghost"
					aria-label={t("settings.common.customBackgroundManage", "设置")}
					onClick={onOpen}
				>
					<ChevronRight24Regular />
				</IconButton>
			}
		/>
	);
};
