import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(root, "src");
const pluginApiRoot = resolve(root, "packages/plugin-api/src");
const allowedFiles = new Set([
	resolve(sourceRoot, "plugins/adapters/editor-document.ts"),
]);

const sourceFiles = [];
const walk = async (directory) => {
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) {
			if (entry.name !== "node_modules" && entry.name !== "dist")
				await walk(path);
			continue;
		}
		if (/\.(?:ts|tsx)$/.test(entry.name)) sourceFiles.push(path);
	}
};

await walk(sourceRoot);
await walk(pluginApiRoot);

const forbiddenWrites = [
	/\b(?:useSetAtom|useSetImmerAtom|useAtom)\(\s*lyricLinesAtom\s*\)/s,
	/\b(?:set|store\.set)\(\s*lyricLinesAtom\b/s,
	/\bsetLyricLines\s*=\s*use(?:Atom|SetImmerAtom)\(\s*lyricLinesAtom\s*\)/s,
	/\bwithImmer\(\s*lyricLinesAtom\s*\)/s,
];

const violations = [];
for (const path of sourceFiles) {
	const contents = await readFile(path, "utf8");
	if (!allowedFiles.has(path)) {
		for (const pattern of forbiddenWrites) {
			if (!pattern.test(contents)) continue;
			const line = contents
				.slice(0, contents.search(pattern))
				.split("\n").length;
			violations.push(
				`${relative(root, path)}:${line}: direct lyricLinesAtom write`,
			);
			break;
		}
	}

	if (/\.(?:test|spec)\.[jt]sx?$/.test(path)) continue;
	const displayPath = relative(root, path).replaceAll("\\", "/");
	const isBusinessLayer =
		path.startsWith(pluginApiRoot) ||
		displayPath.startsWith("src/application/") ||
		displayPath.startsWith("src/kernel/");
	if (isBusinessLayer && path.endsWith(".tsx"))
		violations.push(`${displayPath}: business layers cannot contain TSX`);
	const platformGlobalPattern =
		/\b(?:DOMParser|HTMLElement|HTMLInputElement|Window|Worker)\b/g;
	if (isBusinessLayer) {
		for (const match of contents.matchAll(platformGlobalPattern)) {
			const line = contents.slice(0, match.index).split("\n").length;
			violations.push(
				`${displayPath}:${line}: business layer cannot use ${match[0]}`,
			);
		}
	}

	const importPatterns = [
		/(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g,
		/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
	];
	const imports = importPatterns.flatMap((pattern) => [
		...contents.matchAll(pattern),
	]);
	for (const match of imports) {
		const specifier = match[1];
		const line = contents.slice(0, match.index).split("\n").length;

		if (path.startsWith(pluginApiRoot)) {
			const isTestingDependency =
				displayPath.startsWith("packages/plugin-api/src/testing/") &&
				specifier === "vitest";
			if (!specifier.startsWith(".") && !isTestingDependency)
				violations.push(
					`${displayPath}:${line}: plugin-api may only use relative imports (${specifier})`,
				);
			continue;
		}

		if (displayPath.startsWith("src/application/")) {
			const allowed =
				specifier.startsWith(".") ||
				specifier === "@amll-ttml-tool/plugin-api" ||
				specifier.startsWith("@amll-ttml-tool/plugin-api/") ||
				/^\$\/(?:application|kernel|platform)(?:\/|$)/.test(specifier);
			if (!allowed)
				violations.push(
					`${displayPath}:${line}: application layer cannot import ${specifier}`,
				);
		}

		if (displayPath.startsWith("src/kernel/")) {
			const forbidden =
				/^(?:react|react-dom|jotai|@tauri-apps)(?:\/|$)/.test(specifier) ||
				/^\$\/(?:components|hooks|modules|states|plugins)(?:\/|$)/.test(
					specifier,
				);
			if (forbidden)
				violations.push(
					`${displayPath}:${line}: kernel cannot import ${specifier}`,
				);
		}
	}
}

if (violations.length > 0) {
	console.error("Architecture import boundary violations:");
	for (const violation of violations) console.error(`- ${violation}`);
	process.exitCode = 1;
} else {
	console.log("Editor document and architecture import boundaries passed.");
}
