import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

/** Workspace package alias: bare specifier -> index.ts, subpaths -> files. */
const packageAlias = (name: string, directory: string) => [
	{
		find: new RegExp(`^${name}$`),
		replacement: resolve(__dirname, directory, "index.ts"),
	},
	{
		find: new RegExp(`^${name}/(.*)$`),
		replacement: `${resolve(__dirname, directory)}/$1`,
	},
];

export default defineConfig({
	resolve: {
		alias: [
			...packageAlias("@amll-ttml-tool/plugin-api", "packages/plugin-api/src"),
			...packageAlias(
				"@amll-ttml-tool/plugin-sdk-js",
				"packages/plugin-sdk-js/src",
			),
			{ find: /^\$\/(.*)$/, replacement: `${resolve(__dirname, "src")}/$1` },
		],
	},
	test: {
		environment: "node",
		// Every test lives under tests/, mirroring the source tree it exercises
		// (tests/plugin-api and tests/plugin-sdk-js for the packages).
		include: ["tests/**/*.{test,spec}.{ts,tsx}"],
		exclude: ["**/node_modules/**", "**/dist/**", "src-tauri/**"],
	},
});
