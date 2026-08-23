import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, relative, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(root, "src");
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

const forbiddenWrites = [
	/\b(?:useSetAtom|useSetImmerAtom|useAtom)\(\s*lyricLinesAtom\s*\)/s,
	/\b(?:set|store\.set)\(\s*lyricLinesAtom\b/s,
	/\bsetLyricLines\s*=\s*use(?:Atom|SetImmerAtom)\(\s*lyricLinesAtom\s*\)/s,
	/\bwithImmer\(\s*lyricLinesAtom\s*\)/s,
];

const violations = [];
for (const path of sourceFiles) {
	if (allowedFiles.has(path)) continue;
	const contents = await readFile(path, "utf8");
	for (const pattern of forbiddenWrites) {
		if (!pattern.test(contents)) continue;
		const line = contents.slice(0, contents.search(pattern)).split("\n").length;
		violations.push(`${relative(root, path)}:${line}`);
		break;
	}
}

if (violations.length > 0) {
	console.error(
		"Direct lyricLinesAtom writes are forbidden outside the editor document adapter:",
	);
	for (const violation of violations) console.error(`- ${violation}`);
	process.exitCode = 1;
} else {
	console.log("Editor document import boundary passed.");
}
