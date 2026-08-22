import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@amll-ttml-tool/plugin-api": resolve(
				__dirname,
				"packages/plugin-api/src/index.ts",
			),
			$: resolve(__dirname, "src"),
		},
	},
	test: {
		environment: "node",
		include: [
			"src/**/*.{test,spec}.{ts,tsx}",
			"packages/*/src/**/*.{test,spec}.{ts,tsx}",
			"packages/*/tests/**/*.{test,spec}.{ts,tsx}",
		],
		exclude: ["**/node_modules/**", "**/dist/**", "src-tauri/**"],
	},
});
