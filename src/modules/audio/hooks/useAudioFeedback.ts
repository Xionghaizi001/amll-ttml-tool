import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { uid } from "uid";
import {
	audioErrorAtom,
	audioTaskStateAtom,
} from "$/modules/audio/states/index.ts";
import {
	pushNotificationAtom,
	removeNotificationAtom,
	upsertNotificationAtom,
} from "$/states/notifications";

export const useAudioFeedback = () => {
	const taskState = useAtomValue(audioTaskStateAtom);
	const [errorMsg, setErrorMsg] = useAtom(audioErrorAtom);
	const notificationId = useRef<string | null>(null);
	const { t } = useTranslation();
	const setPushNotification = useSetAtom(pushNotificationAtom);
	const upsertNotification = useSetAtom(upsertNotificationAtom);
	const removeNotification = useSetAtom(removeNotificationAtom);

	useEffect(() => {
		const getMessage = (type: string) => {
			switch (type) {
				case "TRANSCODING":
					return t("audio.status.transcoding", "解码失败，正在尝试转码音频...");
				case "LOADING":
					return t("audio.status.loading", "正在加载音频...");
				default:
					return t("audio.status.processing", "正在处理...");
			}
		};

		if (taskState) {
			const { type } = taskState;
			const message = getMessage(type);

			if (notificationId.current === null) {
				notificationId.current = uid();
			}
			upsertNotification({
				id: notificationId.current,
				title: message,
				level: "info",
				source: "Audio",
			});
		} else {
			if (notificationId.current !== null) {
				removeNotification(notificationId.current);
				notificationId.current = null;
			}
		}
	}, [taskState, t, upsertNotification, removeNotification]);

	useEffect(() => {
		if (errorMsg) {
			setPushNotification({
				title: `${t("audio.error.workerError", "处理音频时出错")}: ${errorMsg}`,
				level: "error",
				source: "Audio",
			});
			if (notificationId.current !== null) {
				removeNotification(notificationId.current);
				notificationId.current = null;
			}

			setErrorMsg(null);
		}
	}, [errorMsg, setErrorMsg, t, setPushNotification, removeNotification]);
};
