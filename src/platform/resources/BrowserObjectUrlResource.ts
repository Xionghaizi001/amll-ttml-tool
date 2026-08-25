import type { ResourceUrlPort } from "$/kernel/platform";

export class BrowserObjectUrlResource implements ResourceUrlPort<Blob> {
	create(resource: Blob): string {
		return URL.createObjectURL(resource);
	}

	revoke(url: string): void {
		URL.revokeObjectURL(url);
	}
}
