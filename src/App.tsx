/*
 * Copyright 2023-2025 Steve Xiao (stevexmh@qq.com) and contributors.
 *
 * 本源代码文件是属于 AMLL TTML Tool 项目的一部分。
 * This source code file is a part of AMLL TTML Tool project.
 * 本项目的源代码的使用受到 GNU GENERAL PUBLIC LICENSE version 3 许可证的约束，具体可以参阅以下链接。
 * Use of this source code is governed by the GNU GPLv3 license that can be found through the following link.
 *
 * https://github.com/amll-dev/amll-ttml-tool/blob/main/LICENSE
 */

import {
	Box,
	Button,
	Flex,
	Heading,
	Text,
	TextArea,
	Theme,
} from "@radix-ui/themes";
import SuspensePlaceHolder from "$/components/SuspensePlaceHolder";
import { TouchSyncPanel } from "$/modules/lyric-editor/components/TouchSyncPanel/index.tsx";
import { createLogger } from "$/utils/logger.ts";
import "@radix-ui/themes/styles.css";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { platform, version } from "@tauri-apps/plugin-os";
import { AnimatePresence } from "framer-motion";
import { useAtom, useAtomValue, useSetAtom, useStore } from "jotai";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ErrorBoundary } from "react-error-boundary";
import { useTranslation } from "react-i18next";
import { ToastContainer, toast } from "react-toastify";
import semverGt from "semver/functions/gt";
import styles from "./App.module.css";
import DarkThemeDetector from "./components/DarkThemeDetector";
import RibbonBar from "./components/RibbonBar";
import { Sidebar } from "./components/Sidebar/index.tsx";
import { TitleBar } from "./components/TitleBar";
import { useFileOpener } from "./hooks/useFileOpener.ts";
import AudioControls from "./modules/audio/components/index.tsx";
import { useAudioFeedback } from "./modules/audio/hooks/useAudioFeedback.ts";
import { useMediaSession } from "./modules/audio/hooks/useMediaSession.ts";
import { DragGhostRenderer } from "./modules/lyric-drag/DragGhostRenderer.tsx";
import { SyncKeyBinding } from "./modules/lyric-editor/components/sync-keybinding.tsx";
import { AutosaveManager } from "./modules/project/autosave/AutosaveManager.tsx";
import { GlobalDragOverlay } from "./modules/project/modals/GlobalDragOverlay.tsx";
import { getTauriStartupOpenedFile } from "./platform/files/TauriStartupFile.ts";
import {
	customBackgroundBlurAtom,
	customBackgroundBrightnessAtom,
	customBackgroundImageAtom,
	customBackgroundImageDisposeAtom,
	customBackgroundImageInitAtom,
	customBackgroundMaskAtom,
	customBackgroundOpacityAtom,
} from "./modules/settings/states/custom-background";
import { showTouchSyncPanelAtom } from "./modules/settings/states/sync.ts";
import { ensureFormatCommandsRegistered } from "./plugins/adapters/format-commands.ts";
import { lyricFileFlow } from "./plugins/adapters/lyric-file-flow-host.ts";
import { BuiltinPluginHost } from "./plugins/builtin/BuiltinPluginHost";
import { ensureBuiltinFormatsRegistered } from "./plugins/builtin/formats/index.ts";
import { ensureBuiltinModesRegistered } from "./plugins/builtin/modes/index.tsx";
import PluginRuntimeDiagnostics from "./plugins/ui/PluginRuntimeDiagnostics.tsx";
import { ThemeHost } from "./plugins/ui/ThemeHost.tsx";
import { TrustedJsHost } from "./plugins/ui/TrustedJsHost.tsx";
import { WasmPluginHost } from "./plugins/ui/WasmPluginHost.tsx";
import { useActiveMode } from "./plugins/ui/mode-host.ts";
import { settingsDialogAtom, settingsTabAtom } from "./states/dialogs.ts";
import {
	isDarkThemeAtom,
	isGlobalFileDraggingAtom,
	lyricLinesAtom,
	ToolMode,
	toolModeAtom,
} from "./states/main.ts";
import { useAppUpdate } from "./utils/useAppUpdate.ts";

const Dialogs = lazy(() => import("./components/Dialogs"));

// Builtin Edit/Sync/Preview must exist before the first render of the
// registry-driven TitleBar/RibbonBar/main viewport; builtin format providers
// (and their derived import/export commands) before the first file menu render.
ensureBuiltinModesRegistered();
ensureBuiltinFormatsRegistered();
ensureFormatCommandsRegistered();

const appLogger = createLogger("App");

const AppErrorPage = ({
	error,
	resetErrorBoundary,
}: {
	error: unknown;
	resetErrorBoundary: () => void;
}) => {
	const { t } = useTranslation();

	return (
		<Flex direction="column" align="center" justify="center" height="100vh">
			<Flex direction="column" align="start" justify="center" gap="2">
				<Heading>{t("app.error.title", "诶呀，出错了！")}</Heading>
				<Text>
					{t("app.error.description", "AMLL TTML Tools 在运行时出现了错误")}
				</Text>
				<Text>
					{t("app.error.checkDevTools", "具体错误详情可以在开发者工具中查询")}
				</Text>
				<Flex gap="2">
					<Button
						onClick={() => {
							lyricFileFlow.saveDocumentToFile().catch(appLogger.error);
						}}
					>
						{t("app.error.saveLyrics", "尝试保存当前歌词")}
					</Button>
					<Button
						onClick={() => {
							resetErrorBoundary();
						}}
						variant="soft"
					>
						{t("app.error.tryRestart", "尝试重新进入程序")}
					</Button>
				</Flex>
				<Text>{t("app.error.details", "大致错误信息：")}</Text>
				<TextArea
					readOnly
					value={String(error)}
					style={{
						width: "100%",
						height: "8em",
					}}
				/>
			</Flex>
		</Flex>
	);
};

function EditorApp() {
	const isDarkTheme = useAtomValue(isDarkThemeAtom);
	const [toolMode, setToolMode] = useAtom(toolModeAtom);
	const { activeModeId, activeMode } = useActiveMode(toolMode);
	const showTouchSyncPanel = useAtomValue(showTouchSyncPanelAtom);
	const customBackgroundImage = useAtomValue(customBackgroundImageAtom);
	const customBackgroundOpacity = useAtomValue(customBackgroundOpacityAtom);
	const customBackgroundMask = useAtomValue(customBackgroundMaskAtom);
	const customBackgroundBlur = useAtomValue(customBackgroundBlurAtom);
	const customBackgroundBrightness = useAtomValue(
		customBackgroundBrightnessAtom,
	);
	const [hasBackground, setHasBackground] = useState(false);
	const effectiveTheme = isDarkTheme ? "dark" : "light";
	const { checkUpdate, status, update } = useAppUpdate();
	const hasNotifiedRef = useRef(false);
	const setSettingsOpen = useSetAtom(settingsDialogAtom);
	const setSettingsTab = useSetAtom(settingsTabAtom);
	const initCustomBackgroundImage = useSetAtom(customBackgroundImageInitAtom);
	const disposeCustomBackgroundImage = useSetAtom(
		customBackgroundImageDisposeAtom,
	);
	const { t } = useTranslation();
	const store = useStore();

	// Mode fail-safe: when the active mode's contribution disappears (its
	// plugin was disabled, unloaded or crashed), fall back to the builtin
	// edit mode instead of leaving a blank viewport.
	useEffect(() => {
		if (toolMode !== activeModeId) setToolMode(activeModeId);
	}, [toolMode, activeModeId, setToolMode]);

	useEffect(() => {
		void initCustomBackgroundImage();
		return () => disposeCustomBackgroundImage();
	}, [disposeCustomBackgroundImage, initCustomBackgroundImage]);

	useEffect(() => {
		if (import.meta.env.TAURI_ENV_PLATFORM) {
			checkUpdate(true);
		}
	}, [checkUpdate]);

	useEffect(() => {
		if (
			import.meta.env.TAURI_ENV_PLATFORM &&
			platform() === "windows" &&
			semverGt("10.0.22000", version())
		) {
			setHasBackground(true);
			void getCurrentWindow().clearEffects();
		}
	}, []);

	useEffect(() => {
		if (status === "available" && update && !hasNotifiedRef.current) {
			hasNotifiedRef.current = true;

			toast.info(
				() => (
					<div>
						<div style={{ fontWeight: "bold" }}>
							{t("app.update.updateAvailable", "发现新版本: {version}", {
								version: update.version,
							})}
						</div>
					</div>
				),
				{
					autoClose: 5000,
					onClick: () => {
						setSettingsTab("about");
						setSettingsOpen(true);
					},
				},
			);
		}
	}, [status, update, t, setSettingsOpen, setSettingsTab]);

	const setIsGlobalDragging = useSetAtom(isGlobalFileDraggingAtom);
	const { openFile } = useFileOpener();
	useAudioFeedback();
	useMediaSession();

	useEffect(() => {
		if (!import.meta.env.TAURI_ENV_PLATFORM) {
			return;
		}

		(async () => {
			const file = await getTauriStartupOpenedFile();

			if (file) {
				appLogger.debug("File data from tauri args", file.name);
				lyricFileFlow.openLyricSource(file);
			}
		})();
	}, []);

	useEffect(() => {
		const onBeforeClose = (evt: BeforeUnloadEvent) => {
			const currentLyricLines = store.get(lyricLinesAtom);
			if (
				currentLyricLines.lyricLines.length +
					currentLyricLines.metadata.length >
				0
			) {
				evt.preventDefault();
				evt.returnValue = false;
			}
		};
		window.addEventListener("beforeunload", onBeforeClose);
		return () => {
			window.removeEventListener("beforeunload", onBeforeClose);
		};
	}, [store]);

	useEffect(() => {
		const handleDragEnter = (e: DragEvent) => {
			if (e.dataTransfer?.types.includes("Files")) {
				setIsGlobalDragging(true);
			}
		};

		const handleDragOver = (e: DragEvent) => {
			e.preventDefault();
		};

		const handleDragLeave = (e: DragEvent) => {
			if (e.relatedTarget === null) {
				setIsGlobalDragging(false);
			}
		};

		const handleDrop = (e: DragEvent) => {
			e.preventDefault();
			setIsGlobalDragging(false);

			const files = e.dataTransfer?.files;
			if (files && files.length > 0) {
				openFile(files[0]);
			}
		};

		window.addEventListener("dragenter", handleDragEnter);
		window.addEventListener("dragover", handleDragOver);
		window.addEventListener("dragleave", handleDragLeave);
		window.addEventListener("drop", handleDrop);

		return () => {
			window.removeEventListener("dragenter", handleDragEnter);
			window.removeEventListener("dragover", handleDragOver);
			window.removeEventListener("dragleave", handleDragLeave);
			window.removeEventListener("drop", handleDrop);
		};
	}, [setIsGlobalDragging, openFile]);

	return (
		<Theme
			appearance={effectiveTheme}
			panelBackground="solid"
			hasBackground={hasBackground}
			accentColor={effectiveTheme === "dark" ? "jade" : "green"}
			className={styles.radixTheme}
		>
			<ErrorBoundary
				FallbackComponent={AppErrorPage}
				onReset={(_details) => {
					// TODO
				}}
			>
				{customBackgroundImage && (
					<div
						className={styles.customBackgroundLayer}
						data-slot="background-layer"
						aria-hidden="true"
					>
						<div
							className={styles.customBackgroundImage}
							style={{
								backgroundImage: `linear-gradient(rgba(0, 0, 0, ${customBackgroundMask}), rgba(0, 0, 0, ${customBackgroundMask})), url(${customBackgroundImage})`,
								opacity: customBackgroundOpacity,
								filter: `blur(${customBackgroundBlur}px) brightness(${customBackgroundBrightness})`,
							}}
						/>
					</div>
				)}
				<div className={styles.appContent} data-slot="app-root">
					<ThemeHost />
					<BuiltinPluginHost />
						<WasmPluginHost />
					<TrustedJsHost />
					<AutosaveManager />
					<GlobalDragOverlay />
					{toolMode === ToolMode.Sync && <SyncKeyBinding />}
					<DarkThemeDetector />
					<Flex direction="column" height="100vh">
						<TitleBar />
						<RibbonBar />
						<Flex flexGrow="1" overflow="hidden" direction="row" mt="2">
							{!activeMode?.hideSidebar && <Sidebar />}
							<Box flexGrow="1" overflow="hidden" minWidth="0">
								<AnimatePresence mode="wait">
									{activeMode && (
										<SuspensePlaceHolder
											key={activeMode.mainViewKey ?? activeMode.modeId}
										>
											<activeMode.mainView />
										</SuspensePlaceHolder>
									)}
								</AnimatePresence>
							</Box>
						</Flex>
						{showTouchSyncPanel && toolMode === ToolMode.Sync && (
							<TouchSyncPanel />
						)}
						<Box flexShrink="0">
							<AudioControls />
						</Box>
					</Flex>
					<Suspense fallback={null}>
						<Dialogs />
					</Suspense>
					<DragGhostRenderer />
				</div>

				{createPortal(
					<Theme appearance={effectiveTheme} style={{ display: "contents" }}>
						<ToastContainer theme={effectiveTheme} />
					</Theme>,
					document.body,
				)}
			</ErrorBoundary>
		</Theme>
	);
}

function App() {
	useEffect(() => {
		if (!import.meta.env.TAURI_ENV_PLATFORM) {
			return;
		}

		(async () => {
			const win = getCurrentWindow();
			if (platform() === "windows" && semverGt("10.0.22000", version())) {
				await win.clearEffects();
			}

			await new Promise((r) => requestAnimationFrame(r));
			await win.show();
		})();
	}, []);

	const showPluginRuntimeDiagnostics =
		import.meta.env.DEV &&
		new URLSearchParams(window.location.search).get("plugin-runtime") === "1";

	if (showPluginRuntimeDiagnostics) {
		return <PluginRuntimeDiagnostics />;
	}

	return <EditorApp />;
}

export default App;
