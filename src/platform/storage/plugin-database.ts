import { openDB } from "idb";

/** Single upgrade entry for installed trusted-js packages. */
export const openPluginDatabase = () =>
	openDB("amll-plugins", 2, {
		upgrade(database) {
			for (const name of ["trusted-js"])
				if (!database.objectStoreNames.contains(name))
					database.createObjectStore(name, { keyPath: "id" });
		},
		blocking(_current, _blocked, event) {
			(event.target as IDBDatabase).close();
		},
	});
