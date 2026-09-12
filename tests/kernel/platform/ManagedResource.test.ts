import { describe, expect, it } from "vitest";
import {
	ManagedResource,
	type ResourceStoragePort,
	type ResourceUrlPort,
} from "$/kernel/platform/ManagedResource";

class RecordingUrls implements ResourceUrlPort<string> {
	created: string[] = [];
	revoked: string[] = [];
	private next = 1;

	create(resource: string): string {
		const url = `blob:${resource}-${this.next++}`;
		this.created.push(url);
		return url;
	}

	revoke(url: string): void {
		this.revoked.push(url);
	}
}

const deferredStorage = () => {
	const pending: ((value: string | null) => void)[] = [];
	const storage: ResourceStoragePort<string> = {
		read: () =>
			new Promise<string | null>((resolve) => {
				pending.push(resolve);
			}),
		write: async () => undefined,
	};
	return { storage, pending };
};

describe("ManagedResource", () => {
	it("replaces and revokes urls in call order", async () => {
		const urls = new RecordingUrls();
		const storage: ResourceStoragePort<string> = {
			read: async () => null,
			write: async () => undefined,
		};
		const resource = new ManagedResource(storage, urls);
		const first = await resource.set("a");
		const second = await resource.set("b");
		expect(first).not.toBe(second);
		expect(urls.revoked).toEqual([first]);
		resource.dispose();
		expect(urls.revoked).toEqual([first, second]);
	});

	it("does not let a stale initialize revoke or replace a newer set", async () => {
		const { storage, pending } = deferredStorage();
		const urls = new RecordingUrls();
		const resource = new ManagedResource(storage, urls);
		const initialization = resource.initialize();
		const latest = await resource.set("new");
		pending[0]("stale");
		await expect(initialization).resolves.toBe(latest);
		expect(urls.created).toHaveLength(1);
		expect(urls.revoked).toEqual([]);
	});

	it("does not create urls after dispose invalidated a pending operation", async () => {
		const { storage, pending } = deferredStorage();
		const urls = new RecordingUrls();
		const resource = new ManagedResource(storage, urls);
		const initialization = resource.initialize();
		resource.dispose();
		pending[0]("stale");
		await expect(initialization).resolves.toBeNull();
		expect(urls.created).toHaveLength(0);
	});
});
