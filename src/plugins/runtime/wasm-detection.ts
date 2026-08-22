export type WasmLoadMode = "auto" | "disabled" | "enabled";

export function detectWasiImports(bytes: Uint8Array): boolean {
	const module = new WebAssembly.Module(new Uint8Array(bytes));
	return WebAssembly.Module.imports(module).some(
		(imported) => imported.module === "wasi_snapshot_preview1",
	);
}

export function resolveWasiMode(
	bytes: Uint8Array,
	mode: WasmLoadMode,
): boolean {
	if (mode === "enabled") return true;
	if (mode === "disabled") return false;
	return detectWasiImports(bytes);
}
