import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { detectWasiImports, resolveWasiMode } from "$/plugins/runtime/wasm-detection.ts";

const emptyWasm = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);

describe("WASM loading mode detection", () => {
	it("keeps explicit modes deterministic", () => {
		expect(resolveWasiMode(emptyWasm, "auto")).toBe(false);
		expect(resolveWasiMode(emptyWasm, "disabled")).toBe(false);
		expect(resolveWasiMode(emptyWasm, "enabled")).toBe(true);
	});

	it("detects WASI imports when present", async () => {
		const csharpPdk = new Uint8Array(
			await readFile(
				resolve(process.cwd(), "public/plugins/csharp-pdk-echo.wasm"),
			),
		);
		expect(detectWasiImports(csharpPdk)).toBe(true);
		expect(resolveWasiMode(csharpPdk, "auto")).toBe(true);
	});
});
