import { parseTrustedJsPackage } from "@amll-ttml-tool/plugin-api";
import type { StoredTrustedJsRecord } from "$/platform/storage/IndexedDbTrustedJsStorage";
import type {
	TrustedJsPluginEntry,
	TrustedJsPluginService,
} from "./trusted-js-service";

export interface TrustedJsPackageStorage {
	loadAll(): Promise<StoredTrustedJsRecord[]>;
	save(record: StoredTrustedJsRecord): Promise<void>;
	remove(id: string): Promise<void>;
}

export const digestTrustedJsPackage = async (
	manifest: unknown,
	code: string,
) => {
	const bytes = new TextEncoder().encode(JSON.stringify({ manifest, code }));
	const hash = await crypto.subtle.digest("SHA-256", bytes);
	return [...new Uint8Array(hash)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
};

export class InstalledTrustedJsService<THost> {
	private readonly records = new Map<string, StoredTrustedJsRecord>();
	private readonly listeners = new Set<() => void>();
	private queue: Promise<unknown> = Promise.resolve();
	constructor(
		private readonly storage: TrustedJsPackageStorage,
		private readonly runtime: TrustedJsPluginService<THost>,
		private readonly clearKv: (id: string) => Promise<void>,
	) {}
	list = () => [...this.records.values()];
	/** End a temporary override without deleting the persisted release or KV. */
	discardDevelopment(id: string): void {
		if (this.records.get(id)?.source !== "dev") return;
		this.records.delete(id);
		this.emit();
	}
	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};
	private emit() {
		for (const listener of this.listeners) listener();
	}
	entry(id: string): TrustedJsPluginEntry | undefined {
		const record = this.records.get(id);
		if (!record) return;
		return {
			...record.manifest,
			entry: "installed",
			firstParty: false,
			moduleBlob: record.code,
			consentKey: record.source === "dev" ? `dev:${record.id}` : record.sha256,
			development: record.source === "dev",
		};
	}
	async restore() {
		for (const record of await this.storage.loadAll()) {
			try {
				const code = await record.code.text();
				const parsed = parseTrustedJsPackage({
					packageVersion: 0,
					manifest: record.manifest,
					code,
				});
				if (
					!parsed.ok ||
					record.id !== parsed.value.manifest.id ||
					(await digestTrustedJsPackage(parsed.value.manifest, code)) !==
						record.sha256
				)
					continue;
				this.records.set(record.id, record);
			} catch (error) {
				console.warn("Invalid installed JS record", error);
			}
		}
		this.emit();
	}
	install(input: unknown, source: StoredTrustedJsRecord["source"] = "user") {
		const operation = this.queue.then(() => this.installOne(input, source));
		this.queue = operation.catch(() => undefined);
		return operation;
	}
	private async installOne(
		input: unknown,
		source: StoredTrustedJsRecord["source"],
	): Promise<
		| { ok: true; pluginId: string }
		| { ok: false; cancelled?: boolean; message: string }
	> {
		const parsed = parseTrustedJsPackage(input);
		if (!parsed.ok)
			return {
				ok: false,
				message: parsed.issues.map((i) => `${i.path}: ${i.message}`).join("\n"),
			};
		const { manifest, code } = parsed.value;
		const previous = this.records.get(manifest.id);
		const oldConsent = this.runtime.getConsent(manifest.id);
		let persisted = false;
		const record: StoredTrustedJsRecord = {
			id: manifest.id,
			manifest,
			code: new Blob([code], { type: "text/javascript" }),
			sha256: await digestTrustedJsPackage(manifest, code),
			source,
			installedAt: Date.now(),
		};
		const entry: TrustedJsPluginEntry = {
			...manifest,
			entry: "installed",
			firstParty: false,
			moduleBlob: record.code,
			consentKey: record.source === "dev" ? `dev:${record.id}` : record.sha256,
			development: record.source === "dev",
			beforeImport: async () => {
				if (source !== "dev") {
					await this.storage.save(record);
					persisted = true;
				}
			},
		};
		const oldEntry = this.runtime.getEntry(manifest.id);
		await this.runtime.unload(manifest.id);
		const result = await this.runtime.load(entry);
		if (!result.ok) {
			if (source !== "dev")
				this.runtime.restoreConsent(manifest.id, oldConsent);
			if (persisted) {
				if (previous && previous.source !== "dev")
					await this.storage.save(previous);
				else await this.storage.remove(manifest.id);
			}
			if (oldEntry) await this.runtime.load(oldEntry);
			return {
				ok: false,
				cancelled: result.reason === "consent-declined",
				message: result.message,
			};
		}
		this.records.set(record.id, record);
		this.emit();
		return { ok: true, pluginId: record.id };
	}
	uninstall(id: string): Promise<void> {
		const operation = this.queue.then(async () => {
			await this.runtime.unload(id);
			await this.storage.remove(id);
			await this.clearKv(id);
			this.runtime.forget(id);
			this.records.delete(id);
			this.emit();
		});
		this.queue = operation.catch(() => undefined);
		return operation;
	}
}
