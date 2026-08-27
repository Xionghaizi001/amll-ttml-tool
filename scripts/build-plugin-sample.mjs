import { spawn } from "node:child_process";
import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function run(command, args, cwd = root) {
	return new Promise((resolvePromise, reject) => {
		const child = spawn(command, args, {
			cwd,
			stdio: "inherit",
			shell: false,
		});
		child.on("error", reject);
		child.on("exit", (code) => {
			if (code === 0) resolvePromise();
			else reject(new Error(`${command} exited with code ${code}`));
		});
	});
}

const sampleDir = resolve(root, "examples/plugins/sample-tools");
await run("cargo", [
	"build",
	"--manifest-path",
	resolve(sampleDir, "Cargo.toml"),
	"--target",
	"wasm32-unknown-unknown",
	"--release",
]);

await mkdir(resolve(root, "public/plugins"), { recursive: true });
await cp(
	resolve(
		sampleDir,
		"target/wasm32-unknown-unknown/release/amll_plugin_sample_tools.wasm",
	),
	resolve(root, "public/plugins/sample-tools.wasm"),
);
console.log("Built public/plugins/sample-tools.wasm");
