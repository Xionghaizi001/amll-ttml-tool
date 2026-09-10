import type { TrustedJsHostApi } from "$/plugins/trusted/trusted-js-host";
import type { TrustedJsActivationContext } from "$/plugins/trusted/trusted-js-service";
import { activateTimeShiftBuiltin } from "./index";

/**
 * Trusted-js plugin module for the time-shift tool. The factory (bundled)
 * copy and the store-distributed artifact are built from this same file:
 * the factory registry imports it statically, while the catalog build
 * script bundles it into a standalone same-origin ES module. Both feed the
 * single TrustedJsPluginService load gate.
 */

export const TIME_SHIFT_PLUGIN_VERSION = "1.0.0";

export function activate(
	context: TrustedJsActivationContext<TrustedJsHostApi>,
): void {
	activateTimeShiftBuiltin(context.scope, {
		document: context.host.document,
		getSelectedLineIds: context.host.getSelectedLineIds,
		showForm: context.host.showForm,
		notify: context.host.notify,
	});
}
