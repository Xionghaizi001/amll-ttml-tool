import type { ThemePackageAssetV0 } from "@amll-ttml-tool/plugin-api";
import type { ThemeAssetUrlPort } from "$/kernel/theme";

/** Decodes packaged base64 assets into local Blob object URLs. */
export class BrowserThemeAssetUrlAdapter implements ThemeAssetUrlPort {
	create(asset: ThemePackageAssetV0): string {
		const binary = atob(asset.data);
		const bytes = new Uint8Array(binary.length);
		for (let index = 0; index < binary.length; index += 1)
			bytes[index] = binary.charCodeAt(index);
		return URL.createObjectURL(new Blob([bytes], { type: asset.mime }));
	}

	revoke(url: string): void {
		URL.revokeObjectURL(url);
	}
}
