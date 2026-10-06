import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

// Archives and fresh checkouts omit empty optional directories such as examples.
// Native tools own all parsing; this runner only supplies existing inputs.
const roots = [
	"src",
	"packages/plugin-api/src",
	"packages/plugin-sdk-js/src",
	"tests",
	"examples",
].filter(existsSync);
if (!roots.length) throw new Error("No boundary source directories found");
const steps = [
	[
		"node_modules/dependency-cruiser/bin/dependency-cruise.mjs",
		"--config",
		".dependency-cruiser.cjs",
		...roots,
	],
	[
		"node_modules/@biomejs/biome/bin/biome",
		"lint",
		"--only=style/noRestrictedGlobals",
		"--only=style/noRestrictedImports",
		...roots,
	],
	["scripts/check-command-menus.mjs"],
	["scripts/check-sdk-react-imports.mjs", "packages/plugin-sdk-js/src"],
];
for (const args of steps) {
	const result = spawnSync(process.execPath, args, { stdio: "inherit" });
	if (result.error) throw result.error;
	if (result.status !== 0) process.exit(result.status ?? 1);
}
