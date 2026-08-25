import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
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

	useEffect(() => {
		setDocumentAppearance(isDarkTheme ? "dark" : "light");
	}, [isDarkTheme]);

	useEffect(() => {
		const forceSafeMode =
			new URLSearchParams(window.location.search).get("theme-safe-mode") ===
			"1";
		themeService.initialize({ forceSafeMode });
		if (themeService.getState().safeModeReason === "crash") {
			toast.warn(
				t(
					"theme.safeModeAfterCrash",
					"上次启动未正常完成，已进入主题安全模式；可在设置中重新启用主题。",
				),
			);
		}
		const stableTimer = window.setTimeout(() => {
			themeService.confirmStartupStable();
		}, 5000);
		return () => window.clearTimeout(stableTimer);
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
				themeService.restoreDefaultTheme();
				toast.info(t("theme.rescueRestored", "已恢复默认主题"));
			}
		};
		window.addEventListener("keydown", onKeyDown, true);
		return () => window.removeEventListener("keydown", onKeyDown, true);
	}, [t]);

	return null;
};
