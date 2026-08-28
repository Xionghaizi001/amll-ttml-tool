import { useEffect } from "react";
import {
	initializeTrustedJsPlugins,
	trustedJsPluginService,
} from "$/plugins/trusted/trusted-js-host";
import { TrustedJsConsentDialog } from "./TrustedJsConsentDialog";

let initialized = false;

/**
 * Mounts the trusted-js plugin host: loads the same-origin catalog once per
 * session and renders the protected consent prompt. Like the WASM host it is
 * deliberately not torn down on unmount (StrictMode double-mount safe).
 * Startup is declared stable on the same 5s timer the theme system uses;
 * until then a session crash is charged to the plugins that were live.
 */
export const TrustedJsHost = () => {
	useEffect(() => {
		if (initialized) return;
		initialized = true;
		void initializeTrustedJsPlugins();
	}, []);
	useEffect(() => {
		const stableTimer = window.setTimeout(() => {
			trustedJsPluginService.confirmStartupStable();
		}, 5000);
		return () => window.clearTimeout(stableTimer);
	}, []);
	return <TrustedJsConsentDialog />;
};
