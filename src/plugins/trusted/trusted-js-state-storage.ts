import type {
	TrustedJsPluginStateRecord,
	TrustedJsStatePort,
} from "$/plugins/trusted/trusted-js-service";

const KEY = "amll-trusted-js-plugin-state-v0";

/** Consent and enablement must never silently degrade to session-only writes. */
export class TrustedJsStateStorage implements TrustedJsStatePort {
	constructor(
		private readonly storage: () => Pick<Storage, "getItem" | "setItem"> = () =>
			localStorage,
	) {}
	private read(): Record<string, TrustedJsPluginStateRecord> {
		const raw = this.storage().getItem(KEY);
		if (raw === null) return {};
		const value = JSON.parse(raw);
		if (!value || typeof value !== "object" || Array.isArray(value))
			throw new Error("Invalid trusted-js state storage");
		return value;
	}
	get(id: string): TrustedJsPluginStateRecord | null {
		return this.read()[id] ?? null;
	}
	set(id: string, record: TrustedJsPluginStateRecord): void {
		this.storage().setItem(
			KEY,
			JSON.stringify({ ...this.read(), [id]: record }),
		);
	}
	remove(id: string): void {
		const records = this.read();
		delete records[id];
		this.storage().setItem(KEY, JSON.stringify(records));
	}
}
