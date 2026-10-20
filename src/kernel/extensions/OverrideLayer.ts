import type { ActionIconV0, LocalizedText } from "@amll-ttml-tool/plugin-api";
import type { Disposable } from "../commands";

export interface OverrideRegistration {
	/** Plugin whose scope owns the entry; disposing that scope reverts it. */
	sourcePluginId: string;
	targetPluginId: string;
	kind: "localization" | "icons";
	/** Surface key -> value, already filtered against the target's whitelist. */
	payload: Readonly<Record<string, LocalizedText | ActionIconV0>>;
}

export interface OverrideSource {
	sourcePluginId: string;
	kind: OverrideRegistration["kind"];
	keys: string[];
}

const toLocales = (text: LocalizedText): Record<string, string> =>
	typeof text === "string" ? { default: text } : text;

/**
 * Localization/icon overrides indexed by target plugin id + surface key.
 * Registration order is enable order, so the last enabled source wins a
 * key+locale; locales it does not cover keep the earlier or original text.
 * Overrides only replace existing values and never create a surface.
 */
export class OverrideLayer {
	private readonly entries: OverrideRegistration[] = [];
	private readonly listeners = new Set<(targetPluginId: string) => void>();

	register(registration: OverrideRegistration): Disposable {
		const entry = { ...registration, payload: { ...registration.payload } };
		this.entries.push(entry);
		this.emit(entry.targetPluginId);
		let disposed = false;
		return {
			dispose: () => {
				if (disposed) return;
				disposed = true;
				const index = this.entries.indexOf(entry);
				if (index < 0) return;
				this.entries.splice(index, 1);
				this.emit(entry.targetPluginId);
			},
		};
	}

	resolveText<T extends LocalizedText | undefined>(
		targetPluginId: string,
		key: string,
		original: T,
	): T {
		if (original === undefined) return original;
		let merged: Record<string, string> | undefined;
		for (const entry of this.matching(targetPluginId, "localization", key))
			merged = {
				...(merged ?? toLocales(original)),
				...toLocales(entry.payload[key] as LocalizedText),
			};
		return (merged ?? original) as T;
	}

	resolveIcon(
		targetPluginId: string,
		key: string,
		original: ActionIconV0,
	): ActionIconV0 {
		const latest = this.matching(targetPluginId, "icons", key).at(-1);
		return latest ? (latest.payload[key] as ActionIconV0) : original;
	}

	/** Sources applied to a target in enable order; the last one wins conflicts. */
	getSources(targetPluginId: string): OverrideSource[] {
		return this.entries
			.filter((entry) => entry.targetPluginId === targetPluginId)
			.map((entry) => ({
				sourcePluginId: entry.sourcePluginId,
				kind: entry.kind,
				keys: Object.keys(entry.payload),
			}));
	}

	subscribe(listener: (targetPluginId: string) => void): Disposable {
		this.listeners.add(listener);
		return { dispose: () => this.listeners.delete(listener) };
	}

	private matching(
		targetPluginId: string,
		kind: OverrideRegistration["kind"],
		key: string,
	): OverrideRegistration[] {
		return this.entries.filter(
			(entry) =>
				entry.targetPluginId === targetPluginId &&
				entry.kind === kind &&
				Object.hasOwn(entry.payload, key),
		);
	}

	private emit(targetPluginId: string): void {
		for (const listener of [...this.listeners]) listener(targetPluginId);
	}
}
