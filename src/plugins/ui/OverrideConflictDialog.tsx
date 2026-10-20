import { AlertDialog, Button, Flex } from "@radix-ui/themes";
import { useCallback, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { pluginInstallationService } from "$/plugins/store/store-host";
import {
	overrideConflictNotices,
	trustedJsPluginService,
} from "$/plugins/trusted/trusted-js-host";

/**
 * Strong reminder for override conflicts, protected like the theme scope
 * conflict dialog. The last enabled overrider already wins; "disable" undoes
 * that enable so the previous overrider takes the keys back.
 */
export const OverrideConflictDialog = () => {
	const { t } = useTranslation();
	const [busy, setBusy] = useState(false);
	const notice = useSyncExternalStore(
		useCallback(
			(listener: () => void) => overrideConflictNotices.subscribe(listener),
			[],
		),
		overrideConflictNotices.current,
	);
	if (!notice) return null;
	const name = (id: string) => trustedJsPluginService.getEntry(id)?.name ?? id;
	const winner = name(notice.winnerPluginId);
	const disable = async () => {
		setBusy(true);
		try {
			await pluginInstallationService.setEnabled(
				"function",
				notice.winnerPluginId,
				false,
			);
			overrideConflictNotices.dismiss();
		} catch (error) {
			toast.error(String(error));
		} finally {
			setBusy(false);
		}
	};
	return (
		<AlertDialog.Root open>
			<AlertDialog.Content
				size="2"
				maxWidth="480px"
				data-amll-protected
				data-amll-modal-size="small"
			>
				<AlertDialog.Title>
					{t("pluginStore.overrideConflictTitle", "覆盖冲突")}
				</AlertDialog.Title>
				<AlertDialog.Description size="2">
					{t(
						"pluginStore.overrideConflictDescription",
						"「{winner}」与「{losers}」同时覆盖了「{target}」的 {count} 处文案或图标。最后启用的「{winner}」优先生效。",
						{
							winner,
							losers: notice.loserPluginIds.map(name).join("」「"),
							target: name(notice.targetPluginId),
							count: notice.keys.length,
						},
					)}
				</AlertDialog.Description>
				<Flex gap="3" justify="end" mt="4">
					<Button variant="soft" disabled={busy} onClick={() => void disable()}>
						{t("pluginStore.overrideConflictDisable", "停用「{name}」", {
							name: winner,
						})}
					</Button>
					<Button
						disabled={busy}
						onClick={() => overrideConflictNotices.dismiss()}
					>
						{t("pluginStore.overrideConflictKeep", "继续使用「{name}」", {
							name: winner,
						})}
					</Button>
				</Flex>
			</AlertDialog.Content>
		</AlertDialog.Root>
	);
};
