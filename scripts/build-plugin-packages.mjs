import { execFileSync } from "node:child_process";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
async function fixImports(directory) {
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) await fixImports(path);
		else if (/\.(js|ts)$/.test(entry.name)) {
			const code = await readFile(path, "utf8");
			await writeFile(
				path,
				code.replace(
					/((?:from\s*|import\s*)["'])(\.[^"']+)(["'])/g,
					(_all, before, specifier, after) =>
						`${before}${specifier.endsWith(".js") ? specifier : `${specifier}.js`}${after}`,
				),
			);
		}
	}
}
await mkdir(resolve(root, "release"), { recursive: true });
for (const name of ["plugin-api", "plugin-sdk-js"]) {
	execFileSync(
		process.execPath,
		[
			"node_modules/typescript/bin/tsc",
			"-p",
			`packages/${name}/tsconfig.build.json`,
		],
		{ cwd: root, stdio: "inherit" },
	);
	await fixImports(resolve(root, "packages", name, "lib"));
	const npm = process.platform === "win32" ? "npm.cmd" : "npm";
	execFileSync(
		npm,
		["pack", "--ignore-scripts", "--pack-destination", "../../release"],
		{
			cwd: resolve(root, "packages", name),
			stdio: "inherit",
			shell: process.platform === "win32",
			env: {
				...process.env,
				npm_config_cache: resolve(root, "node_modules/.cache/npm-pack"),
			},
		},
	);
}
