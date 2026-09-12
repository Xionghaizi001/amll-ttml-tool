import type { TrustedJsActivationContextV0 } from "@amll-ttml-tool/plugin-sdk-js";
import { activateTimeShift } from "./index";

/**
 * Trusted-js plugin module for the time-shift tool. The factory (bundled)
 * copy and the store-distributed artifact are built from this same file:
 * the factory registry imports it statically, while the catalog build
 * script bundles it into a standalone same-origin ES module. Both feed the
 * single TrustedJsPluginService load gate. The module depends on the SDK
 * only, so the artifact carries no host-internal structure.
 */

export const TIME_SHIFT_PLUGIN_VERSION = "1.1.0";

export function activate({ host }: TrustedJsActivationContextV0): void {
	activateTimeShift(host);
}
