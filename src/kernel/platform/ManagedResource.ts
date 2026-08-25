export interface ResourceStoragePort<TResource> {
	read(): Promise<TResource | null>;
	write(resource: TResource | null): Promise<void>;
}

export interface ResourceUrlPort<TResource> {
	create(resource: TResource): string;
	revoke(url: string): void;
}

/**
 * Owns the storage-to-local-URL lifecycle shared by backgrounds and future
 * theme package resources. Only the platform adapter knows Blob or browser APIs.
 */
export class ManagedResource<TResource> {
	private currentUrl: string | null = null;
	private generation = 0;

	constructor(
		private readonly storage: ResourceStoragePort<TResource>,
		private readonly urls: ResourceUrlPort<TResource>,
	) {}

	async initialize(): Promise<string | null> {
		const generation = ++this.generation;
		const resource = await this.storage.read();
		return this.replaceUrl(resource, generation);
	}

	async set(resource: TResource | null): Promise<string | null> {
		const generation = ++this.generation;
		await this.storage.write(resource);
		return this.replaceUrl(resource, generation);
	}

	dispose(): void {
		// Invalidate any in-flight initialize/set so its continuation cannot
		// create a URL nobody will revoke.
		this.generation += 1;
		if (!this.currentUrl) return;
		this.urls.revoke(this.currentUrl);
		this.currentUrl = null;
	}

	private replaceUrl(
		resource: TResource | null,
		generation: number,
	): string | null {
		// A newer set/clear/dispose started while this operation awaited
		// storage; latest wins, so report the current state instead of
		// revoking the newer URL or publishing the stale resource.
		if (generation !== this.generation) return this.currentUrl;
		if (this.currentUrl) {
			this.urls.revoke(this.currentUrl);
			this.currentUrl = null;
		}
		if (!resource) return null;
		this.currentUrl = this.urls.create(resource);
		return this.currentUrl;
	}
}
