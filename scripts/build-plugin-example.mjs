import { spawn } from "node:child_process";
import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifest = resolve(root, "examples/plugins/echo/Cargo.toml");
const source = resolve(
	root,
	"examples/plugins/echo/target/wasm32-unknown-unknown/release/amll_plugin_echo.wasm",
);
const destination = resolve(root, "public/plugins/echo.wasm");

await new Promise((resolvePromise, reject) => {
	const child = spawn(
		"cargo",
		[
			"build",
			"--manifest-path",
			manifest,
			"--target",
			"wasm32-unknown-unknown",
			"--release",
		],
		{ cwd: root, stdio: "inherit" },
	);
	child.on("error", reject);
	child.on("exit", (code) => {
		if (code === 0) resolvePromise();
		else reject(new Error(`cargo exited with code ${code}`));
	});
});

await mkdir(resolve(root, "public/plugins"), { recursive: true });
await cp(source, destination);
console.log(`Built ${destination}`);
