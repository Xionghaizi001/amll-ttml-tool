import { unpackPluginContainer } from "$/plugins/store/package-container";
import { themeService } from "$/plugins/adapters/theme-host";
import { installTrustedJsPackage } from "$/plugins/trusted/trusted-js-host";
import { installPluginPackage } from "./plugin-install-service";

/** File imports use the same container and semantic gates as store artifacts. */
export async function installLocalPluginFile(file: File) {
	const unpacked = unpackPluginContainer(
		new Uint8Array(await file.arrayBuffer()),
	);
	if (!unpacked.ok) return { ok: false as const, message: unpacked.message };
	if (unpacked.kind === "trusted-js")
		return installTrustedJsPackage(unpacked.pkg);
	if (unpacked.kind === "function") return installPluginPackage(unpacked.pkg);
	const result = themeService.importThemePackage(unpacked.pkg);
	return result.ok
		? { ok: true as const, pluginId: "theme" }
		: {
				ok: false as const,
				message: result.issues.map((i) => i.message).join("\n"),
			};
}
