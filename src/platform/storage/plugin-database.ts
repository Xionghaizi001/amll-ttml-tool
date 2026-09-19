import { openDB } from "idb";

/** Shared upgrade path keeps WASM and JS connections at the same version. */
export const openPluginDatabase = () => openDB("amll-plugins", 2, {
	upgrade(database) {
		for (const name of ["packages", "trusted-js"])
			if (!database.objectStoreNames.contains(name))
				database.createObjectStore(name, { keyPath: "id" });
	},
	blocking(_current, _blocked, event) {
		(event.target as IDBDatabase).close();
	},
});
