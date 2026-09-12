import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ExtismPluginSession } from "$/plugins/runtime/session.ts";
import { MAX_PLUGIN_WASM_BYTES } from "$/plugins/runtime/types.ts";

const fixturePath = resolve(process.cwd(), "public/plugins/echo.wasm");
const rustPdkFixturePath = resolve(
	process.cwd(),
	"public/plugins/rust-pdk-echo.wasm",
);
const csharpPdkFixturePath = resolve(
	process.cwd(),
	"public/plugins/csharp-pdk-echo.wasm",
);

async function readFixture(): Promise<Uint8Array> {
	return new Uint8Array(await readFile(fixturePath));
}

async function assertPdkRoundtrip(
	path: string,
	useWasi = false,
): Promise<void> {
	const session = new ExtismPluginSession();
	try {
		await session.load(new Uint8Array(await readFile(path)), useWasi);
		const input = new TextEncoder().encode('{"language":"pdk"}');
		await expect(session.call("echo_json", input)).resolves.toEqual(input);
	} finally {
		await session.close();
	}
}

describe("ExtismPluginSession", () => {
	it("roundtrips JSON through the Rust fixture", async () => {
		const session = new ExtismPluginSession();
		try {
			await session.load(await readFixture());
			const input = new TextEncoder().encode(
				JSON.stringify({ kind: "json", value: 42 }),
			);
			const output = await session.call("echo_json", input);

			expect(new TextDecoder().decode(output)).toBe(
				new TextDecoder().decode(input),
			);
		} finally {
			await session.close();
		}
	});

	it("maps a WASM trap to plugin-crashed", async () => {
		const session = new ExtismPluginSession();
		try {
			await session.load(await readFixture());
			await expect(
				session.call("crash", new Uint8Array()),
			).rejects.toMatchObject({
				code: "plugin-crashed",
			});
		} finally {
			await session.close();
		}
	});

	it("rejects payloads above the runtime limit", async () => {
		const session = new ExtismPluginSession();
		await expect(
			session.load(new Uint8Array(MAX_PLUGIN_WASM_BYTES + 1)),
		).rejects.toMatchObject({ code: "payload-too-large" });
	});

	it("roundtrips through the Rust PDK fixture", async () => {
		await assertPdkRoundtrip(rustPdkFixturePath);
	});

	it("roundtrips through the C# PDK fixture with WASI", async () => {
		await assertPdkRoundtrip(csharpPdkFixturePath, true);
	});
});
