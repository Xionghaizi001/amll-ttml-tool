import { spawn } from "node:child_process";
import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const wasiSdkPath = process.env.WASI_SDK_PATH;

if (!wasiSdkPath) {
	throw new Error(
		"C# PDK build requires WASI_SDK_PATH pointing to the x86_64 WASI SDK",
	);
}

function run(command, args, cwd = root) {
	return new Promise((resolvePromise, reject) => {
		const child = spawn(command, args, {
			cwd,
			stdio: "inherit",
			shell: false,
			env: { ...process.env, WASI_SDK_PATH: wasiSdkPath },
		});
		child.on("error", reject);
		child.on("exit", (code) => {
			if (code === 0) resolvePromise();
			else reject(new Error(`${command} exited with code ${code}`));
		});
	});
}

const rustDir = resolve(root, "examples/plugins/rust-pdk-echo");
await run("cargo", [
	"build",
	"--manifest-path",
	resolve(rustDir, "Cargo.toml"),
	"--target",
	"wasm32-unknown-unknown",
	"--release",
]);

const csharpDir = resolve(root, "examples/plugins/csharp-pdk-echo");
await run(
	"dotnet",
	["build", "--configuration", "Release", "--framework", "net8.0"],
	csharpDir,
);

await mkdir(resolve(root, "public/plugins"), { recursive: true });
await cp(
	resolve(
		rustDir,
		"target/wasm32-unknown-unknown/release/amll_plugin_rust_pdk_echo.wasm",
	),
	resolve(root, "public/plugins/rust-pdk-echo.wasm"),
);
await cp(
	resolve(
		csharpDir,
		"bin/Release/net8.0/wasi-wasm/AppBundle/AmllPluginCsharpPdk.wasm",
	),
	resolve(root, "public/plugins/csharp-pdk-echo.wasm"),
);

console.log("Built Rust and C# Extism PDK example plugins.");
