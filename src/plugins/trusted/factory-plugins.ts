import { factoryPlugins } from "../generated/factory";
import type { TrustedJsPluginEntry } from "./trusted-js-service";

/**
 * Factory (bundled) trusted-js plugins: non-core features that migrated out
 * of the host but still ship with the application (the Android system-app
 * model). The store catalog is only an update channel — when it lists a
 * newer version of one of these ids, the remote module shadows the factory
 * copy; uninstalling the update falls back to the entry listed here. A
 * missing or unreachable catalog therefore never removes a feature.
 */
export const FACTORY_TRUSTED_JS_PLUGINS: readonly TrustedJsPluginEntry[] =
	factoryPlugins;

export const getFactoryTrustedJsPlugin = (
	pluginId: string,
): TrustedJsPluginEntry | undefined =>
	FACTORY_TRUSTED_JS_PLUGINS.find((entry) => entry.id === pluginId);
