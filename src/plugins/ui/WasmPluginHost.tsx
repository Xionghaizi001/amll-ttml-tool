import { useEffect } from "react";
import { wasmPluginService } from "$/plugins/adapters/wasm-plugin-host";
import { PluginPermissionDialog } from "./PluginPermissionDialog";

let initialized = false;

/**
 * Mounts the WASM plugin host: loads installed plugins once per session and
 * renders the protected permission prompt. Deliberately not torn down on
 * unmount — plugin workers survive React StrictMode double-mounting and are
 * only disposed with the page.
 */
export const WasmPluginHost = () => {
	useEffect(() => {
		if (initialized) return;
		initialized = true;
		void wasmPluginService.initialize();
	}, []);
	return <PluginPermissionDialog />;
};
