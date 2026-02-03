import { registerSW } from "virtual:pwa-register";
import { t } from "i18next";
import { confirmDialogAtom } from "$/states/dialogs";
import { pushNotificationAtom } from "$/states/notifications";
import { globalStore } from "$/states/store";

if (!import.meta.env.TAURI_ENV_PLATFORM) {
	const refresh = registerSW({
		onOfflineReady() {
			globalStore.set(pushNotificationAtom, {
				title: t("pwa.offlineReady", "网站已成功离线缓存，后续可离线访问本网页"),
				level: "info",
				source: "PWA",
			});
		},
		onNeedRefresh() {
			const message = t(
				"pwa.updateRefresh",
				"网站已更新，刷新网页以使用最新版本！",
			);
			globalStore.set(pushNotificationAtom, {
				title: message,
				level: "info",
				source: "PWA",
			});
			globalStore.set(confirmDialogAtom, {
				open: true,
				title: t("pwa.refresh", "刷新"),
				description: message,
				onConfirm: () => refresh(true),
			});
		},
	});
}
