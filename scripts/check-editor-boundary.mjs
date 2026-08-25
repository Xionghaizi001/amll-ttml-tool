import { readdir, readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(root, "src");
const applicationRoot = resolve(sourceRoot, "application");
const kernelRoot = resolve(sourceRoot, "kernel");
const platformRoot = resolve(sourceRoot, "platform");
const pluginsRoot = resolve(sourceRoot, "plugins");
const pluginRuntimeRoot = resolve(pluginsRoot, "runtime");
const pluginAdaptersRoot = resolve(pluginsRoot, "adapters");
const pluginUiRoot = resolve(pluginsRoot, "ui");
const modulesRoot = resolve(sourceRoot, "modules");
const audioPortsRoot = resolve(modulesRoot, "audio/ports");
const ffmpegWorkerRoot = resolve(modulesRoot, "ffmpeg/worker");
const ffmpegWorkletRoot = resolve(modulesRoot, "ffmpeg/worklet");
const spectrogramWorkersRoot = resolve(modulesRoot, "spectrogram/workers");
const statesRoot = resolve(sourceRoot, "states");
const typesRoot = resolve(sourceRoot, "types");
const componentsRoot = resolve(sourceRoot, "components");
const hooksRoot = resolve(sourceRoot, "hooks");
const pluginApiPackageRoot = resolve(root, "packages/plugin-api");
const pluginApiRoot = resolve(pluginApiPackageRoot, "src");
const pluginApiTestsRoot = resolve(pluginApiPackageRoot, "tests");
const allowedFiles = new Set([
	resolve(sourceRoot, "plugins/adapters/editor-document.ts"),
]);

const isWithin = (path, directory) => {
	const pathFromDirectory = relative(directory, path);
	return (
		pathFromDirectory === "" ||
		(!pathFromDirectory.startsWith("..") && !isAbsolute(pathFromDirectory))
	);
};

const isWithinAny = (path, directories) =>
	directories.some((directory) => isWithin(path, directory));

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
await walk(pluginApiTestsRoot);

const forbiddenWrites = [
	/\b(?:useSetAtom|useSetImmerAtom|useAtom)\(\s*lyricLinesAtom\s*\)/s,
	/\b(?:set|store\.set)\(\s*lyricLinesAtom\b/s,
	/\bsetLyricLines\s*=\s*use(?:Atom|SetImmerAtom)\(\s*lyricLinesAtom\s*\)/s,
	/\bwithImmer\(\s*lyricLinesAtom\s*\)/s,
];

const importPatterns = [
	/(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g,
	/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
];

const cleanSpecifier = (specifier) => specifier.split(/[?#]/, 1)[0];

const resolveInternalImport = (importer, specifier) => {
	const clean = cleanSpecifier(specifier);
	if (clean.startsWith(".")) return resolve(dirname(importer), clean);
	if (clean === "$") return sourceRoot;
	if (clean.startsWith("$/")) return resolve(sourceRoot, clean.slice(2));
	if (clean === "@amll-ttml-tool/plugin-api") return pluginApiRoot;
	if (clean.startsWith("@amll-ttml-tool/plugin-api/"))
		return resolve(
			pluginApiRoot,
			clean.slice("@amll-ttml-tool/plugin-api/".length),
		);
	return null;
};

const isPureModuleTarget = (target) => {
	if (!target) return false;
	const targetPath = relative(sourceRoot, target).replaceAll("\\", "/");
	return (
		/^modules\/(?:segmentation\/utils\/(?:segmentation|syllable-smoothing)|lyric-drag\/drag-reorder|project\/logic\/|spectrogram\/utils\/timeline-boundary|lyric-editor\/utils\/(?:ruby-generator|normalize-line-time)|lrclib\/utils\/)/.test(
			targetPath,
		) || targetPath === "utils/parse-lrc"
	);
};

const isTestFile = (path) => /\.(?:test|spec)\.[jt]sx?$/.test(path);

const layerImportViolation = (path, specifier) => {
	const target = resolveInternalImport(path, specifier);
	const isExternal = target === null;

	if (isWithin(path, pluginApiPackageRoot)) {
		if (
			isExternal &&
			!(
				(isTestFile(path) ||
					isWithin(path, resolve(pluginApiRoot, "testing"))) &&
				specifier === "vitest"
			)
		)
			return `plugin-api may only import its own files (${specifier})`;
		if (target && !isWithin(target, pluginApiPackageRoot))
			return `plugin-api relative import escapes its package (${specifier})`;
		return null;
	}

	if (isWithin(path, applicationRoot)) {
		if (isExternal && isTestFile(path) && specifier === "vitest") return null;
		if (isExternal)
			return `application layer cannot import external dependency ${specifier}`;
		if (
			!isWithinAny(target, [
				applicationRoot,
				kernelRoot,
				typesRoot,
				pluginApiRoot,
			])
		)
			return `application layer cannot import ${specifier}`;
		return null;
	}

	if (isWithin(path, kernelRoot)) {
		if (isExternal) {
			if (isTestFile(path) && specifier === "vitest") return null;
			if (specifier === "immer" || specifier === "uid") return null;
			return `kernel cannot import external dependency ${specifier}`;
		}
		if (!isWithinAny(target, [kernelRoot, typesRoot, pluginApiRoot]))
			return `kernel cannot import ${specifier}`;
		return null;
	}

	if (isWithin(path, platformRoot)) {
		if (isExternal) return null;
		if (
			!isWithinAny(target, [
				platformRoot,
				applicationRoot,
				kernelRoot,
				audioPortsRoot,
				ffmpegWorkerRoot,
				ffmpegWorkletRoot,
				spectrogramWorkersRoot,
				typesRoot,
				pluginApiRoot,
			])
		)
			return `platform implementation cannot import ${specifier}`;
		return null;
	}

	if (isWithin(path, pluginRuntimeRoot)) {
		if (isExternal) return null;
		if (!isWithinAny(target, [pluginRuntimeRoot, pluginApiRoot]))
			return `plugin runtime cannot import ${specifier}`;
		return null;
	}

	if (isWithin(path, pluginAdaptersRoot)) {
		if (isExternal) return null;
		if (
			!isWithinAny(target, [
				pluginsRoot,
				applicationRoot,
				kernelRoot,
				platformRoot,
				modulesRoot,
				statesRoot,
				typesRoot,
				pluginApiRoot,
			])
		)
			return `plugin adapter cannot import ${specifier}`;
		return null;
	}

	if (isWithin(path, pluginUiRoot)) {
		if (isExternal) return null;
		if (
			!isWithinAny(target, [
				pluginsRoot,
				applicationRoot,
				kernelRoot,
				platformRoot,
				modulesRoot,
				statesRoot,
				typesRoot,
				componentsRoot,
				hooksRoot,
				pluginApiRoot,
			])
		)
			return `plugin UI cannot import ${specifier}`;
		return null;
	}

	if (isWithin(path, pluginsRoot)) {
		if (isExternal) return null;
		if (
			!isWithinAny(target, [
				pluginsRoot,
				applicationRoot,
				kernelRoot,
				platformRoot,
				modulesRoot,
				statesRoot,
				typesRoot,
				componentsRoot,
				hooksRoot,
				pluginApiRoot,
			])
		)
			return `plugin layer cannot import ${specifier}`;
	}

	return null;
};

const maskNonCode = (contents) => {
	let result = "";
	let index = 0;
	let state = "code";
	while (index < contents.length) {
		const current = contents[index];
		const next = contents[index + 1];
		if (state === "code") {
			if (current === "/" && next === "/") {
				result += "  ";
				index += 2;
				state = "line-comment";
				continue;
			}
			if (current === "/" && next === "*") {
				result += "  ";
				index += 2;
				state = "block-comment";
				continue;
			}
			if (current === '"' || current === "'" || current === "`") {
				result += " ";
				index += 1;
				state = current;
				continue;
			}
			result += current;
			index += 1;
			continue;
		}
		if (state === "line-comment") {
			if (current === "\n") {
				result += "\n";
				state = "code";
			} else result += " ";
			index += 1;
			continue;
		}
		if (state === "block-comment") {
			if (current === "*" && next === "/") {
				result += "  ";
				index += 2;
				state = "code";
			} else {
				result += current === "\n" ? "\n" : " ";
				index += 1;
			}
			continue;
		}
		if (current === "\\") {
			result += " ";
			if (next !== undefined) result += next === "\n" ? "\n" : " ";
			index += 2;
			continue;
		}
		if (current === state) {
			result += " ";
			index += 1;
			state = "code";
			continue;
		}
		result += current === "\n" ? "\n" : " ";
		index += 1;
	}
	return result;
};

const platformGlobalPatterns = [
	/\b(DOMParser|HTMLElement|HTMLInputElement|Window|Worker)\b/g,
	/(?<![\w$.])(window)\b/g,
	/(?<![\w$.])(localStorage)\b/g,
	/(?<![\w$.])(fetch)\s*\(/g,
	/\bglobalThis\s*\.\s*(document|window|localStorage|fetch)\b/g,
];

const documentGlobalPattern =
	/(?<![\w$.])(document)\s*(?:\.|\[)\s*(?:body|head|documentElement|baseURI|cookie|title|URL|activeElement|createElement|createTextNode|querySelector|querySelectorAll|getElementById|getElementsByClassName|getElementsByTagName|addEventListener|removeEventListener|dispatchEvent|createEvent|execCommand|visibilityState|fullscreenElement|fonts|location)\b/g;

const declaresDocumentBinding = (contents) =>
	/\b(?:const|let|var|function|class|interface|type)\s+document\b/.test(
		contents,
	) || /(?:\(|,)\s*document\s*(?::|,|\)|=)/.test(contents);

const findHostGlobals = (contents) => {
	const code = maskNonCode(contents);
	const patterns = declaresDocumentBinding(code)
		? [...platformGlobalPatterns]
		: [...platformGlobalPatterns, /(?<![\w$.])(document)\b(?!\s*[?!]?\s*:)/g];
	patterns.push(documentGlobalPattern);
	const matches = patterns.flatMap((pattern) =>
		[...code.matchAll(pattern)].map((match) => ({
			name: match[1],
			index: match.index,
		})),
	);
	return matches.filter(
		(match, index) =>
			matches.findIndex(
				(candidate) =>
					candidate.name === match.name && candidate.index === match.index,
			) === index,
	);
};

const violations = [];
const boundaryRegressionChecks = [
	{
		passed: Boolean(
			layerImportViolation(
				resolve(applicationRoot, "lyrics/fixture.ts"),
				"../../modules/fixture",
			),
		),
		message: "application relative imports must not escape into src/modules",
	},
	{
		passed: Boolean(
			layerImportViolation(
				resolve(kernelRoot, "editor/fixture.ts"),
				"../../modules/fixture",
			),
		),
		message: "kernel relative imports must not escape into src/modules",
	},
	{
		passed: sourceFiles.some((path) => isWithin(path, pluginApiTestsRoot)),
		message: "packages/plugin-api/tests must be included in boundary traversal",
	},
	{
		passed: Boolean(
			layerImportViolation(
				resolve(platformRoot, "fixture.ts"),
				"$/states/main",
			),
		),
		message: "platform positive rules must reject UI state imports",
	},
	{
		passed: Boolean(
			layerImportViolation(
				resolve(pluginRuntimeRoot, "fixture.ts"),
				"$/states/main",
			),
		),
		message: "plugin runtime positive rules must reject host state imports",
	},
	{
		passed: Boolean(
			layerImportViolation(
				resolve(pluginsRoot, "fixture.ts"),
				"$/utils/logger",
			),
		),
		message: "plugin root files must also use positive import rules",
	},
	{
		passed: ["document", "window", "localStorage", "fetch"].every((name) =>
			findHostGlobals(
				"document.createElement('div'); window.location; localStorage.getItem('x'); fetch('/x');",
			).some((match) => match.name === name),
		),
		message: "lowercase DOM and browser globals must be detected",
	},
];
for (const check of boundaryRegressionChecks) {
	if (!check.passed)
		violations.push(`boundary checker regression: ${check.message}`);
}

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

	const displayPath = relative(root, path).replaceAll("\\", "/");
	const isBusinessLayer =
		isWithin(path, pluginApiPackageRoot) ||
		isWithin(path, applicationRoot) ||
		isWithin(path, kernelRoot);
	if (isBusinessLayer && path.endsWith(".tsx"))
		violations.push(`${displayPath}: business layers cannot contain TSX`);

	if (isBusinessLayer) {
		for (const match of findHostGlobals(contents)) {
			const line = contents.slice(0, match.index).split("\n").length;
			violations.push(
				`${displayPath}:${line}: business layer cannot use host global ${match.name}`,
			);
		}
	}

	const imports = importPatterns.flatMap((pattern) => [
		...contents.matchAll(pattern),
	]);
	for (const match of imports) {
		const specifier = match[1];
		const line = contents.slice(0, match.index).split("\n").length;
		const directPureModule = isPureModuleTarget(
			resolveInternalImport(path, specifier),
		);
		const isPureModuleAdapter =
			displayPath.includes("/adapters/") ||
			displayPath === "src/modules/lyric-drag/reorder-engine.ts";
		if (directPureModule && !isPureModuleAdapter)
			violations.push(
				`${displayPath}:${line}: pure module ${specifier} must be called through an application service adapter`,
			);
		if (
			specifier.includes("?worker") &&
			!displayPath.startsWith("src/platform/") &&
			!displayPath.startsWith("src/plugins/runtime/")
		)
			violations.push(
				`${displayPath}:${line}: Worker constructors and asset URLs belong in platform/runtime adapters`,
			);

		const violation = layerImportViolation(path, specifier);
		if (violation) violations.push(`${displayPath}:${line}: ${violation}`);
	}
}

if (violations.length > 0) {
	console.error("Architecture import boundary violations:");
	for (const violation of violations) console.error(`- ${violation}`);
	process.exitCode = 1;
} else {
	console.log("Editor document and architecture import boundaries passed.");
}
