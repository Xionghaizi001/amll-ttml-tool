import { useEffect } from "react";
import { toast } from "react-toastify";
import {
	initializeTrustedJsPlugins,
	trustedJsPluginService,
} from "$/plugins/trusted/trusted-js-host";
import { TrustedJsConsentDialog } from "./TrustedJsConsentDialog";

let initialized = false;

/**
 * Mounts the trusted-js plugin host: loads the same-origin catalog once per
 * session and renders the protected consent prompt. It is
 * deliberately not torn down on unmount (StrictMode double-mount safe).
 * Startup is declared stable on the same 5s timer the theme system uses;
 * until then a session crash is charged to the plugins that were live.
 */
export const TrustedJsHost = () => {
	useEffect(() => {
		if (initialized) return;
		initialized = true;
		void initializeTrustedJsPlugins().catch((error) => {
			toast.error(`插件恢复失败：${String(error)}`);
		});
	}, []);
	useEffect(() => {
		const stableTimer = window.setTimeout(() => {
			try { trustedJsPluginService.confirmStartupStable(); }
			catch (error) { toast.error(`插件状态保存失败：${String(error)}`); }
		}, 5000);
		return () => window.clearTimeout(stableTimer);
	}, []);
	return <TrustedJsConsentDialog />;
};
