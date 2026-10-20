import type { ActionIconV0, LocalizedText } from "@amll-ttml-tool/plugin-api";
import type { Disposable } from "../commands";

export interface OverrideRegistration {
	/** Plugin whose scope owns the entry; disposing that scope reverts it. */
	sourcePluginId: string;
	targetPluginId: string;
	kind: "localization" | "icons";
	/** Surface key -> value, already filtered against the target's whitelist. */
	payload: Readonly<Record<string, LocalizedText | ActionIconV0>>;
	/**
	 * When the source was last enabled; orders sources so the last enabled
	 * wins regardless of load order. Omitted sources rank after dated ones in
	 * registration order.
	 */
	enabledAt?: number;
}

export interface OverrideSource {
	sourcePluginId: string;
	kind: OverrideRegistration["kind"];
	keys: string[];
	/** Later sources that take over some of these keys (localization: same locale). */
	shadowedBy: { sourcePluginId: string; keys: string[] }[];
}

/** Two sources cover the same target key (and, for text, the same locale). */
export interface OverrideConflict {
	targetPluginId: string;
	kind: OverrideRegistration["kind"];
	winnerPluginId: string;
	winnerEnabledAt?: number;
	loserPluginId: string;
	keys: string[];
}

const toLocales = (text: LocalizedText): Record<string, string> =>
	typeof text === "string" ? { default: text } : text;

const rank = (entry: OverrideRegistration) =>
	entry.enabledAt ?? Number.POSITIVE_INFINITY;

/** Keys of `a` that `b` also sets; same-plugin entries never conflict. */
const sharedKeys = (a: OverrideRegistration, b: OverrideRegistration) =>
	a.sourcePluginId === b.sourcePluginId ||
	a.targetPluginId !== b.targetPluginId ||
	a.kind !== b.kind
		? []
		: Object.keys(a.payload).filter((key) => {
				if (!Object.hasOwn(b.payload, key)) return false;
				if (a.kind === "icons") return true;
				const other = toLocales(b.payload[key] as LocalizedText);
				return Object.keys(toLocales(a.payload[key] as LocalizedText)).some(
					(locale) => Object.hasOwn(other, locale),
				);
			});

/**
 * Localization/icon overrides indexed by target plugin id + surface key.
 * Entries are kept in enable order (`enabledAt`, then registration), so the
 * last enabled source wins a key+locale; locales it does not cover keep the
 * earlier or original text.
 * Overrides only replace existing values and never create a surface.
 */
export class OverrideLayer {
	private readonly entries: OverrideRegistration[] = [];
	private readonly listeners = new Set<(targetPluginId: string) => void>();
	private readonly conflictListeners = new Set<
		(conflicts: OverrideConflict[]) => void
	>();

	register(registration: OverrideRegistration): Disposable {
		const entry = { ...registration, payload: { ...registration.payload } };
		const index = this.entries.findIndex((other) => rank(other) > rank(entry));
		if (index < 0) this.entries.push(entry);
		else this.entries.splice(index, 0, entry);
		this.emit(entry.targetPluginId);
		const position = this.entries.indexOf(entry);
		const conflicts = this.entries.flatMap((other, i): OverrideConflict[] => {
			const keys = sharedKeys(entry, other);
			if (!keys.length) return [];
			const [winner, loser] = i > position ? [other, entry] : [entry, other];
			return [
				{
					targetPluginId: entry.targetPluginId,
					kind: entry.kind,
					winnerPluginId: winner.sourcePluginId,
					winnerEnabledAt: winner.enabledAt,
					loserPluginId: loser.sourcePluginId,
					keys,
				},
			];
		});
		if (conflicts.length)
			for (const listener of [...this.conflictListeners]) listener(conflicts);
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

	/** Override chain of a target in enable order; later sources win shared keys. */
	getSources(targetPluginId: string): OverrideSource[] {
		const entries = this.entries.filter(
			(entry) => entry.targetPluginId === targetPluginId,
		);
		return entries.map((entry, index) => ({
			sourcePluginId: entry.sourcePluginId,
			kind: entry.kind,
			keys: Object.keys(entry.payload),
			shadowedBy: entries.slice(index + 1).flatMap((later) => {
				const keys = sharedKeys(entry, later);
				return keys.length ? [{ sourcePluginId: later.sourcePluginId, keys }] : [];
			}),
		}));
	}

	subscribe(listener: (targetPluginId: string) => void): Disposable {
		this.listeners.add(listener);
		return { dispose: () => this.listeners.delete(listener) };
	}

	/** Fires once per registration that shares keys with another source. */
	onConflict(listener: (conflicts: OverrideConflict[]) => void): Disposable {
		this.conflictListeners.add(listener);
		return { dispose: () => this.conflictListeners.delete(listener) };
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
