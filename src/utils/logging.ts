export function log(...messages: unknown[]) {
	// #if DEV
	console.log(...messages);
	// #endif
}

export function warn(...messages: unknown[]) {
	// #if DEV
	console.warn(...messages);
	// #endif
}

export function error(...messages: unknown[]) {
	console.error(...messages);
}
