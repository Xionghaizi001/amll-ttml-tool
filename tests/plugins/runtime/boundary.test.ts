import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function collectSourceFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) return collectSourceFiles(path);
		return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
	});
}

describe("plugin runtime import boundary", () => {
	it("keeps Extism imports inside src/plugins/runtime", () => {
		const sourceRoot = resolve(process.cwd(), "src");
		const runtimeRoot = resolve(sourceRoot, "plugins/runtime");
		const leakedFiles = collectSourceFiles(sourceRoot).filter((path) => {
			if (path.startsWith(runtimeRoot)) return false;
			return readFileSync(path, "utf8").includes("@extism/");
		});

		expect(leakedFiles).toEqual([]);
	});
});
