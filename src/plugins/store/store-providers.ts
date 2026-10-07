import type {
	RemotePluginCatalogEntryV0,
	RemotePluginCatalogV0,
	StoreProviderV0,
} from "@amll-ttml-tool/plugin-api";
import { parseRemotePluginCatalog } from "@amll-ttml-tool/plugin-api";
import { readStoreResponse } from "./read-store-response";

export interface ProviderCatalogEntry extends RemotePluginCatalogEntryV0 {
	provider: StoreProviderV0;
	artifactUrl: string;
	blockedReason?: string;
	mirrorOf?: string;
}
export interface ProviderShelf {
	provider: StoreProviderV0;
	catalog: RemotePluginCatalogV0 | null;
	fetchedAt?: number;
	error?: string;
}
export interface ProviderStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}
const KEY = "amll.plugin-store.providers.v0";
export function validateProviderUrl(input: string): string {
	const url = new URL(input);
	const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
	if (url.protocol !== "https:" && !(url.protocol === "http:" && local))
		throw new Error(
			"提供者必须使用 HTTPS；技术原型允许 HTTP localhost/127.0.0.1/[::1]",
		);
	if (url.username || url.password || url.hash)
		throw new Error("提供者地址不能包含凭据或片段");
	return url.href;
}
/** One validated cache per provider. Network access occurs only on explicit refresh. */
export class StoreProviderClient {
	private shelves: ProviderShelf[];
	private pending: Promise<void> | null = null;
	private readonly listeners = new Set<() => void>();
	constructor(
		private readonly official: StoreProviderV0,
		private readonly storage?: ProviderStorage,
		private readonly request: typeof fetch = (...args) =>
			globalThis.fetch(...args),
	) {
		this.shelves = [{ provider: official, catalog: null }];
		try {
			const saved: unknown = JSON.parse(storage?.getItem(KEY) ?? "null");
			if (Array.isArray(saved))
				for (const item of saved) {
					if (!item || typeof item !== "object") continue;
					const provider = item.provider;
					if (
						!provider ||
						typeof provider.id !== "string" ||
						typeof provider.name !== "string" ||
						typeof provider.catalogUrl !== "string"
					)
						continue;
					const isOfficial = provider.id === official.id;
					if (isOfficial && provider.catalogUrl !== official.catalogUrl)
						continue;
					const restored = isOfficial
						? official
						: {
								id: provider.id,
								name: provider.name,
								catalogUrl: validateProviderUrl(provider.catalogUrl),
								official: false,
							};
					if (
						!isOfficial &&
						this.shelves.some(
							(s) =>
								s.provider.id === restored.id ||
								s.provider.catalogUrl === restored.catalogUrl,
						)
					)
						continue;
					const parsed = parseRemotePluginCatalog(item.catalog);
					const shelf = {
						provider: restored,
						catalog: parsed.ok ? parsed.value : null,
						fetchedAt:
							typeof item.fetchedAt === "number" ? item.fetchedAt : undefined,
					};
					if (isOfficial) this.shelves[0] = shelf;
					else this.shelves.push(shelf);
				}
		} catch {
			/* Missing or corrupt cache never prevents startup. */
		}
	}
	list = () => this.shelves;
	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};
	private emit() {
		for (const listener of this.listeners) listener();
	}
	private save(next: ProviderShelf[]) {
		this.storage?.setItem(KEY, JSON.stringify(next));
		this.shelves = next;
		this.emit();
	}
	add(name: string, catalogUrl: string) {
		const url = validateProviderUrl(catalogUrl.trim());
		if (!name.trim()) throw new Error("请填写提供者名称");
		if (this.shelves.some((s) => s.provider.catalogUrl === url))
			throw new Error("该提供者地址已添加");
		this.save([
			...this.shelves,
			{
				provider: {
					id: crypto.randomUUID(),
					name: name.trim(),
					catalogUrl: url,
					official: false,
				},
				catalog: null,
			},
		]);
	}
	remove(id: string) {
		if (id === this.official.id) throw new Error("不能移除官方提供者");
		this.save(this.shelves.filter((s) => s.provider.id !== id));
	}
	refresh(): Promise<void> {
		if (this.pending) return this.pending;
		this.pending = this.refreshAll().finally(() => {
			this.pending = null;
		});
		return this.pending;
	}
	private async refreshAll() {
		await Promise.all(
			this.shelves.map(async (original) => {
				let next: ProviderShelf;
				try {
					const response = await this.request(original.provider.catalogUrl, {
						cache: "no-store",
						credentials: "omit",
						redirect: "error",
						signal: AbortSignal.timeout(15000),
					});
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					const raw = new TextDecoder().decode(
						await readStoreResponse(response, 4 * 1024 * 1024),
					);
					const parsed = parseRemotePluginCatalog(JSON.parse(raw));
					if (!parsed.ok) throw new Error("目录格式无效");
					next = {
						provider: original.provider,
						catalog: parsed.value,
						fetchedAt: Date.now(),
					};
				} catch (error) {
					next = {
						...original,
						error: String(error instanceof Error ? error.message : error),
					};
				}
				// Removing a source during refresh must not resurrect it.
				const current = this.shelves.find(
					(s) => s.provider.id === original.provider.id,
				);
				if (!current) return;
				const updated = this.shelves.map((s) => (s === current ? next : s));
				try {
					this.save(updated);
				} catch {
					this.shelves = updated.map((s) =>
						s === next ? { ...s, error: "本地缓存写入失败" } : s,
					);
					this.emit();
				}
			}),
		);
	}
	entries(factoryIds: ReadonlySet<string> = new Set()): ProviderCatalogEntry[] {
		const entries = this.shelves.flatMap((s) =>
			(s.catalog?.plugins ?? []).map(
				(entry) =>
					({
						...entry,
						firstParty: s.provider.official && entry.firstParty === true,
						provider: s.provider,
						artifactUrl: new URL(entry.entry, s.provider.catalogUrl).href,
					}) as ProviderCatalogEntry,
			),
		);
		const winners = new Map<string, ProviderCatalogEntry>();
		for (const entry of entries) {
			if (!entry.provider.official && factoryIds.has(entry.id))
				entry.blockedReason = "第三方提供者不能覆盖出厂插件";
			else if (
				!entry.provider.official &&
				(!entry.sha256 || !/\.(zip|json)$/i.test(entry.entry))
			)
				entry.blockedReason = "第三方插件必须提供带 SHA-256 的 ZIP/JSON 包";
			const winner = winners.get(entry.id);
			if (!winner) {
				winners.set(entry.id, entry);
				continue;
			}
			if (entry.sha256 && winner.sha256 === entry.sha256)
				entry.mirrorOf = winner.provider.name;
			else
				entry.blockedReason = `与 ${winner.provider.name} 的同名插件冲突，不可安装`;
		}
		return entries;
	}
}
