import { atomWithStorage } from "jotai/utils";

/**
 * Plugin network offline master switch (goal.md stage 8 item 5: "离线模式"
 * one-click disable). While on, every plugin `network.http` request is
 * refused with `network-unavailable`; host-owned network features (update
 * check, submission) are not affected — this switch is about plugin reach.
 */
export const pluginNetworkOfflineAtom = atomWithStorage(
	"amll-plugin-network-offline",
	false,
	undefined,
	{ getOnInit: true },
);
