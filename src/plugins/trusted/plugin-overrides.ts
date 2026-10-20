import {
	type FunctionPluginManifest,
	resolveOverridePayload,
} from "@amll-ttml-tool/plugin-api";
import type { ExtensionScope, OverrideLayer } from "$/kernel/extensions";
import type { TrustedJsPluginEntry } from "./trusted-js-service";

type ResolvedOverride = Parameters<ExtensionScope["registerOverride"]>[0];

/**
 * Filters an overriding entry's payloads against each live target's manifest
 * and string table. Unknown keys and unavailable targets are skipped with a
 * diagnostic naming both plugins; they never fail the overrider's activation.
 */
export const resolveEntryOverrides = (
	entry: TrustedJsPluginEntry,
	getTarget: (pluginId: string) => TrustedJsPluginEntry | undefined,
	warn: (message: string) => void,
): ResolvedOverride[] =>
	(entry.overrides ?? []).flatMap((override): ResolvedOverride[] => {
		const label = `[overrides] ${entry.id} -> ${override.pluginId} (${override.entry})`;
		const target = getTarget(override.pluginId);
		if (!target) {
			warn(`${label}: target is not a live trusted-js plugin; skipped`);
			return [];
		}
		const resolved = resolveOverridePayload(
			override,
			entry.resources?.[override.entry],
			{ ...target, kind: "function", runtime: "trusted-js" } as FunctionPluginManifest,
			target.strings,
		);
		if (!resolved.ok) {
			warn(`${label}: ${resolved.issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`);
			return [];
		}
		for (const issue of resolved.value.diagnostics)
			warn(`${label}: ${issue.path} ${issue.message}`);
		return [
			{
				targetPluginId: override.pluginId,
				kind: override.kind,
				payload: resolved.value.payload,
			},
		];
	});

export interface OverrideConflictNotice {
	targetPluginId: string;
	winnerPluginId: string;
	loserPluginIds: string[];
	keys: string[];
}

/**
 * Strong-reminder queue for override conflicts, shown like theme scope
 * conflicts. Only a winner enabled at or after `since` (this session) is
 * announced: restoring the persisted order at startup or reloading an
 * unchanged winner (update, hot reload) repeats nothing the user already saw.
 */
export const createOverrideConflictNotices = (
	layer: Pick<OverrideLayer, "onConflict">,
	since: number,
) => {
	const notices: OverrideConflictNotice[] = [];
	const listeners = new Set<() => void>();
	const announced = new Set<string>();
	const emit = () => {
		for (const listener of [...listeners]) listener();
	};
	layer.onConflict((conflicts) => {
		let changed = false;
		for (const conflict of conflicts) {
			if ((conflict.winnerEnabledAt ?? Number.NEGATIVE_INFINITY) < since) continue;
			const identity = JSON.stringify([
				conflict.targetPluginId,
				conflict.winnerPluginId,
				conflict.winnerEnabledAt,
				conflict.loserPluginId,
				conflict.kind,
			]);
			if (announced.has(identity)) continue;
			announced.add(identity);
			const notice = notices.find(
				(candidate) =>
					candidate.targetPluginId === conflict.targetPluginId &&
					candidate.winnerPluginId === conflict.winnerPluginId,
			);
			if (!notice)
				notices.push({
					targetPluginId: conflict.targetPluginId,
					winnerPluginId: conflict.winnerPluginId,
					loserPluginIds: [conflict.loserPluginId],
					keys: [...conflict.keys],
				});
			else {
				if (!notice.loserPluginIds.includes(conflict.loserPluginId))
					notice.loserPluginIds = [...notice.loserPluginIds, conflict.loserPluginId];
				notice.keys = [...new Set([...notice.keys, ...conflict.keys])];
				// New identity so useSyncExternalStore re-renders the open dialog.
				notices[notices.indexOf(notice)] = { ...notice };
			}
			changed = true;
		}
		if (changed) emit();
	});
	return {
		current: (): OverrideConflictNotice | undefined => notices[0],
		dismiss: () => {
			if (notices.shift()) emit();
		},
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
};
