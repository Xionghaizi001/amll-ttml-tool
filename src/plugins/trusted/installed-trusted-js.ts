import { parseTrustedJsPackage, resolvePluginStrings } from "@amll-ttml-tool/plugin-api";
import type { StoreInstallationProvenance } from "$/kernel/extensions/installation-provenance";
import type { StoredTrustedJsRecord } from "$/platform/storage/IndexedDbTrustedJsStorage";
import type {
	TrustedJsPluginEntry,
	TrustedJsPluginService,
} from "./trusted-js-service";

export interface TrustedJsPackageStorage {
	loadAll(): Promise<StoredTrustedJsRecord[]>;
	save(record: StoredTrustedJsRecord): Promise<void>;
	remove(id: string): Promise<void>;
	uninstall?(id: string): Promise<void>;
	checkpoint?(id: string): Promise<() => Promise<void>>;
}

export const digestTrustedJsPackage = async (
	manifest: unknown,
	code: string,
	resources?: StoredTrustedJsRecord["resources"],
) => {
	const bytes = new TextEncoder().encode(JSON.stringify({ manifest, code, ...(resources === undefined ? {} : { resources }) }));
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
	) { }
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
			strings: resolvePluginStrings(record.manifest, record.resources),
			entry: "installed",
			firstParty: false,
			moduleBlob: record.code,
			consentKey: record.source === "dev" ? `dev:${record.id}` : record.sha256,
			development: record.source === "dev",
			providerName: record.store?.providerName,
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
					...(record.resources === undefined ? {} : { resources: record.resources }),
				});
				if (
					!parsed.ok ||
					record.id !== parsed.value.manifest.id ||
					(await digestTrustedJsPackage(parsed.value.manifest, code, record.resources)) !==
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
	install(
		input: unknown,
		source: StoredTrustedJsRecord["source"] = "user",
		store?: StoreInstallationProvenance,
		approvedConsentKey?: string,
	) {
		const operation = this.queue.then(() =>
			this.installOne(input, source, store, approvedConsentKey),
		);
		this.queue = operation.catch(() => undefined);
		return operation;
	}
	private async installOne(
		input: unknown,
		source: StoredTrustedJsRecord["source"],
		store?: StoreInstallationProvenance,
		approvedConsentKey?: string,
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
		const { manifest, code, resources } = parsed.value;
		const previous = this.records.get(manifest.id);
		const restoreRuntime = this.runtime.checkpoint(manifest.id);
		const restoreStorage =
			source !== "dev"
				? await this.storage.checkpoint?.(manifest.id)
				: undefined;
		let persisted = false;
		const record: StoredTrustedJsRecord = {
			id: manifest.id,
			manifest,
			resources,
			code: new Blob([code], { type: "text/javascript" }),
			sha256: await digestTrustedJsPackage(manifest, code, resources),
			source,
			installedAt: Date.now(),
			store: source === "store" && store ? { ...store } : undefined,
		};
		const entry: TrustedJsPluginEntry = {
			...manifest,
			strings: resolvePluginStrings(manifest, resources),
			entry: "installed",
			firstParty: false,
			moduleBlob: record.code,
			consentKey: record.source === "dev" ? `dev:${record.id}` : record.sha256,
			development: record.source === "dev",
			providerName: record.store?.providerName,
			beforeImport: async () => {
				if (source !== "dev") {
					await this.storage.save(record);
					persisted = true;
				}
			},
		};
		try {
			await this.runtime.unload(manifest.id);
			const result = await this.runtime.load(entry, approvedConsentKey);
			if (!result.ok) {
				if (result.reason === "missing-dependency" && source !== "dev") {
					await this.storage.save(record);
					persisted = true;
					this.records.set(record.id, record);
					this.runtime.markMissingDependency(record.id);
					this.emit();
					return { ok: true, pluginId: record.id };
				}
				throw Object.assign(new Error(result.message), {
					cancelled: result.reason === "consent-declined",
				});
			}
			this.records.set(record.id, record);
			this.emit();
			return { ok: true, pluginId: record.id };
		} catch (error) {
			const failures: string[] = [];
			try {
				if (persisted) {
					if (restoreStorage) await restoreStorage();
					else if (previous && previous.source !== "dev")
						await this.storage.save(previous);
					else await this.storage.remove(manifest.id);
				}
			} catch (rollbackError) {
				failures.push(String(rollbackError));
			}
			if (previous) this.records.set(manifest.id, previous);
			else this.records.delete(manifest.id);
			try {
				await restoreRuntime();
			} catch (rollbackError) {
				failures.push(String(rollbackError));
			}
			return {
				ok: false,
				cancelled: (error as { cancelled?: boolean }).cancelled,
				message: `${String(error instanceof Error ? error.message : error)}${failures.length ? `；回滚失败：${failures.join("; ")}` : ""}`,
			};
		}
	}
	/** Restore the package, pre-install KV snapshot, consent and prior runtime. */
	async checkpoint(id: string): Promise<() => Promise<void>> {
		const previous = this.records.get(id);
		const restoreRuntime = this.runtime.checkpoint(id);
		const restoreStorage = await this.storage.checkpoint?.(id);
		return async () => {
			await this.runtime.unload(id);
			if (restoreStorage) await restoreStorage();
			else if (previous && previous.source !== "dev")
				await this.storage.save(previous);
			else if (previous?.source !== "dev") await this.storage.remove(id);
			if (previous) this.records.set(id, previous);
			else this.records.delete(id);
			await restoreRuntime();
			this.emit();
		};
	}

	uninstall(id: string): Promise<void> {
		const operation = this.queue.then(async () => {
			const restoreRuntime = this.runtime.checkpoint(id);
			const restoreStorage = await this.storage.checkpoint?.(id);
			try {
				await this.runtime.unload(id);
				// Fail before deleting packages/KV if consent state cannot be persisted.
				this.runtime.forget(id);
				if (this.storage.uninstall) await this.storage.uninstall(id);
				else {
					await this.storage.remove(id);
					await this.clearKv(id);
				}
				this.records.delete(id);
				this.emit();
			} catch (error) {
				const failures: unknown[] = [error];
				try {
					if (restoreStorage) await restoreStorage();
				} catch (e) {
					failures.push(e);
				}
				try {
					await restoreRuntime();
				} catch (e) {
					failures.push(e);
				}
				if (failures.length > 1)
					throw new AggregateError(
						failures,
						`卸载失败；回滚失败：${failures.map(String).join("; ")}`,
					);
				throw error;
			}
		});
		this.queue = operation.catch(() => undefined);
		return operation;
	}
}
