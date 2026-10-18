import { useAtomValue } from "jotai";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { AlertDialog, Button, Flex } from "@radix-ui/themes";
import {
	installedTrustedJsService,
	trustedJsPluginService,
} from "../trusted/trusted-js-host";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { initializeThemeSurfaceImages } from "$/modules/settings/adapters/theme-surface-images";
import { setDocumentAppearance } from "$/platform/theme/DomThemeStyleAdapter";
import { isDarkThemeAtom } from "$/states/main";
import { themeService } from "../adapters/theme-host";

export const THEME_RESCUE_SHORTCUT = "Ctrl+Alt+Shift+F12";

/**
 * Mounts the theme system: restores the persisted theme (or boots into safe
 * mode after a crash / ?theme-safe-mode=1), keeps the appearance attribute in
 * sync with dark mode, and installs the keyboard rescue shortcut. The
 * shortcut works even when a malicious theme visually covers the in-app UI,
 * because keyboard events cannot be hidden by CSS.
 */
export const ThemeHost = () => {
	const isDarkTheme = useAtomValue(isDarkThemeAtom);
	const { t } = useTranslation();
	const state = useSyncExternalStore(
		useCallback((listener: () => void) => themeService.subscribe(listener), []),
		() => themeService.getState(),
	);
	useEffect(() => {
		const refresh = () => themeService.refreshDependencies();
		const disposers = [
			installedTrustedJsService.subscribe(refresh),
			trustedJsPluginService.subscribe(refresh),
		];
		return () => {
			for (const dispose of disposers) dispose();
		};
	}, []);

	useEffect(() => {
		setDocumentAppearance(isDarkTheme ? "dark" : "light");
	}, [isDarkTheme]);

	useEffect(() => {
		const forceSafeMode =
			new URLSearchParams(window.location.search).get("theme-safe-mode") ===
			"1";
		try {
			themeService.initialize({ forceSafeMode });
		} catch (error) {
			toast.error(`主题状态读取失败：${String(error)}`);
			return;
		}
		let cancelled = false;
		let stableTimer: number | undefined;
		void themeService
			.hydrateInstalledThemes()
			.then(() => {
				if (cancelled) return;
				stableTimer = window.setTimeout(() => {
					try {
						themeService.confirmStartupStable();
					} catch (error) {
						toast.error(`主题状态保存失败：${String(error)}`);
					}
				}, 5000);
			})
			.catch((error) => {
				toast.error(`主题恢复失败：${String(error)}`);
			});
		void initializeThemeSurfaceImages();
		if (themeService.getState().safeModeReason === "crash") {
			toast.warn(
				t(
					"theme.safeModeAfterCrash",
					"上次启动未正常完成，已进入主题安全模式；可在设置中重新启用主题。",
				),
			);
		}
		return () => {
			cancelled = true;
			window.clearTimeout(stableTimer);
		};
	}, [t]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (
				event.ctrlKey &&
				event.altKey &&
				event.shiftKey &&
				event.code === "F12"
			) {
				event.preventDefault();
				try {
					themeService.restoreDefaultTheme();
					toast.info(t("theme.rescueRestored", "已恢复默认主题"));
				} catch (error) {
					toast.error(`本次会话已恢复默认主题，但保存失败：${String(error)}`);
				}
			}
		};
		window.addEventListener("keydown", onKeyDown, true);
		return () => window.removeEventListener("keydown", onKeyDown, true);
	}, [t]);

	const conflict = state.conflict;
	if (!conflict) return null;
	const resolve = (undo: boolean) => {
		try {
			themeService.resolveConflict(undo);
		} catch (error) {
			toast.error(`主题状态保存失败：${String(error)}`);
		}
	};
	return (
		<AlertDialog.Root open>
			<AlertDialog.Content data-amll-protected size="2">
				<AlertDialog.Title>主题冲突</AlertDialog.Title>
				<AlertDialog.Description>
					「{conflict.nextName}」主题与「{conflict.previousName}
					」主题产生冲突，无法同时使用。你想使用哪一个？
				</AlertDialog.Description>
				<Flex gap="3" justify="end" mt="4">
					<Button variant="soft" onClick={() => resolve(true)}>
						恢复原主题
					</Button>
					<Button onClick={() => resolve(false)}>
						继续使用 {conflict.nextName} 
					</Button>
				</Flex>
			</AlertDialog.Content>
		</AlertDialog.Root>
	);
};
