import {
	type FunctionPluginManifest,
	resolveOverridePayload,
} from "@amll-ttml-tool/plugin-api";
import type { ExtensionScope } from "$/kernel/extensions";
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
