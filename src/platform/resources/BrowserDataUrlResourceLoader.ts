export class BrowserDataUrlResourceLoader {
	async load(dataUrl: string): Promise<Blob> {
		if (!dataUrl.startsWith("data:"))
			throw new Error("Only data URLs can be migrated into local resources");
		const response = await fetch(dataUrl);
		return response.blob();
	}
}
