import { type IDBPDatabase, openDB } from "idb";

export type ExtensionDatabaseProvider = () => Promise<IDBPDatabase>;
let connection: Promise<IDBPDatabase> | undefined;

/** The only open/upgrade entry for extension packages, assets and plugin KV. */
export const openPluginDatabase: ExtensionDatabaseProvider = () => {
	connection ??= openDB("amll-extensions", 1, {
		upgrade(database) {
			database.createObjectStore("trusted-js", { keyPath: "id" });
			database.createObjectStore("plugin-kv", { keyPath: ["pluginId", "key"] });
			database.createObjectStore("theme-packages", { keyPath: "id" });
			const assets = database.createObjectStore("theme-assets", {
				keyPath: "surface",
			});
			assets.createIndex("themeId", "themeId");
		},
		blocking(_current, _blocked, event) {
			(event.target as IDBDatabase).close();
			connection = undefined;
		},
		terminated() {
			connection = undefined;
		},
	}).catch((error) => {
		connection = undefined;
		throw error;
	});
	return connection;
};

/** Composite keys sort arrays after strings, covering all keys of this owner. */
export const pluginNamespaceRange = (pluginId: string): IDBKeyRange =>
	IDBKeyRange.bound([pluginId, ""], [pluginId, []]);
