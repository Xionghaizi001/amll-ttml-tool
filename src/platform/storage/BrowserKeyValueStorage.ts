// localStorage can throw synchronously (SecurityError in privacy modes,
// QuotaExceededError on write); settings persistence degrades gracefully
// instead of crashing atom writes.
const attempt = <T>(operation: () => T, fallback: T): T => {
	try {
		if (typeof localStorage === "undefined") return fallback;
		return operation();
	} catch (error) {
		console.warn("localStorage access failed", error);
		return fallback;
	}
};

export const browserKeyValueStorage: Storage = {
	get length() {
		return attempt(() => localStorage.length, 0);
	},
	clear: () => {
		attempt(() => localStorage.clear(), undefined);
	},
	getItem: (key) => attempt(() => localStorage.getItem(key), null),
	key: (index) => attempt(() => localStorage.key(index), null),
	removeItem: (key) => {
		attempt(() => localStorage.removeItem(key), undefined);
	},
	setItem: (key, value) => {
		attempt(() => localStorage.setItem(key, value), undefined);
	},
};
