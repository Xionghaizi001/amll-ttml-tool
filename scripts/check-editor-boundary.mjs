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
const pluginSdkPackageRoot = resolve(root, "packages/plugin-sdk-js");
const pluginSdkRoot = resolve(pluginSdkPackageRoot, "src");
const pluginBuiltinRoot = resolve(pluginsRoot, "builtin");
const testsRoot = resolve(root, "tests");
const examplesRoot = resolve(root, "examples");
/**
 * Host-core builtins register directly against the kernel registries and never
 * migrate to the SDK (fail-safe Edit mode, host-native TTML, bundled themes).
 * Every other directory under src/plugins/builtin is a plugin module and is
 * held to the SDK-only import rule.
 */
const HOST_CORE_BUILTINS = new Set(["formats", "modes", "themes"]);
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

/** The plugin module directory owning `path`, or null for host code. */
const pluginModuleRootOf = (path) => {
	if (isWithin(path, examplesRoot)) return examplesRoot;
	if (!isWithin(path, pluginBuiltinRoot)) return null;
	const [pluginDirectory] = relative(pluginBuiltinRoot, path).split(/[\\/]/);
	if (!pluginDirectory || HOST_CORE_BUILTINS.has(pluginDirectory)) return null;
	return resolve(pluginBuiltinRoot, pluginDirectory);
};

const SKIPPED_DIRECTORIES = new Set([
	"node_modules",
	"dist",
	"target",
	"bin",
	"obj",
]);

const sourceFiles = [];
const walk = async (directory) => {
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) {
			if (!SKIPPED_DIRECTORIES.has(entry.name)) await walk(path);
			continue;
		}
		if (/\.(?:ts|tsx)$/.test(entry.name)) sourceFiles.push(path);
	}
};

await walk(sourceRoot);
await walk(pluginApiRoot);
await walk(pluginSdkRoot);
await walk(testsRoot);
await walk(examplesRoot);

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
	if (clean === "@amll-ttml-tool/plugin-sdk-js") return pluginSdkRoot;
	if (clean.startsWith("@amll-ttml-tool/plugin-sdk-js/"))
		return resolve(
			pluginSdkRoot,
			clean.slice("@amll-ttml-tool/plugin-sdk-js/".length),
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

	if (isWithin(path, testsRoot)) {
		// Package tests exercise the packages alone; host tests may reach any layer.
		if (isWithin(path, resolve(testsRoot, "plugin-api"))) {
			if (isExternal)
				return specifier === "vitest"
					? null
					: `plugin-api tests may only import plugin-api and vitest (${specifier})`;
			if (!isWithin(target, pluginApiRoot))
				return `plugin-api tests cannot import ${specifier}`;
			return null;
		}
		if (isWithin(path, resolve(testsRoot, "plugin-sdk-js"))) {
			if (isExternal)
				return specifier === "vitest"
					? null
					: `plugin-sdk-js tests may only import plugin-api, plugin-sdk-js and vitest (${specifier})`;
			if (!isWithinAny(target, [pluginApiRoot, pluginSdkRoot]))
				return `plugin-sdk-js tests cannot import ${specifier}`;
			return null;
		}
		return null;
	}

	if (isWithin(path, pluginApiPackageRoot)) {
		if (
			isExternal &&
			!(
				isWithin(path, resolve(pluginApiRoot, "testing")) &&
				specifier === "vitest"
			)
		)
			return `plugin-api may only import its own files (${specifier})`;
		if (target && !isWithin(target, pluginApiPackageRoot))
			return `plugin-api relative import escapes its package (${specifier})`;
		return null;
	}

	if (isWithin(path, pluginSdkPackageRoot)) {
		// The SDK is protocol + React types only: no Jotai, no Tauri, no host
		// internals (TTMLLyric included). `react` must be a type-only import,
		// which the main loop checks separately.
		if (isExternal)
			return specifier === "react"
				? null
				: `plugin-sdk-js may only import plugin-api and React types (${specifier})`;
		if (!isWithinAny(target, [pluginSdkPackageRoot, pluginApiRoot]))
			return `plugin-sdk-js cannot import ${specifier}`;
		return null;
	}

	const pluginModuleRoot = pluginModuleRootOf(path);
	if (pluginModuleRoot !== null) {
		// Plugin modules (src/plugins/builtin/<plugin>, examples/) see the host
		// only through the SDK, so the store artifact built from the same source
		// never depends on host-internal structure.
		if (isExternal)
			return specifier === "react" || specifier.startsWith("react/")
				? null
				: `plugin module may only import @amll-ttml-tool/plugin-api, @amll-ttml-tool/plugin-sdk-js and React (${specifier})`;
		if (!isWithinAny(target, [pluginModuleRoot, pluginApiRoot, pluginSdkRoot]))
			return `plugin module cannot import host internals (${specifier}); go through @amll-ttml-tool/plugin-sdk-js`;
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
				pluginSdkRoot,
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
				pluginSdkRoot,
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
				pluginSdkRoot,
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
		passed: sourceFiles.some((path) =>
			isWithin(path, resolve(testsRoot, "plugin-api")),
		),
		message: "tests/plugin-api must be included in boundary traversal",
	},
	{
		passed: sourceFiles.some((path) => isWithin(path, pluginSdkRoot)),
		message:
			"packages/plugin-sdk-js/src must be included in boundary traversal",
	},
	{
		passed: ["jotai", "@tauri-apps/api", "$/types/ttml", "$/states/main"].every(
			(specifier) =>
				Boolean(
					layerImportViolation(resolve(pluginSdkRoot, "fixture.ts"), specifier),
				),
		),
		message: "plugin-sdk-js must reject Jotai, Tauri and host-internal imports",
	},
	{
		passed:
			layerImportViolation(
				resolve(pluginSdkRoot, "fixture.ts"),
				"@amll-ttml-tool/plugin-api",
			) === null,
		message: "plugin-sdk-js must be allowed to import plugin-api",
	},
	{
		passed: [
			"$/kernel/extensions",
			"$/application/lyrics",
			"$/states/main",
			"$/plugins/adapters/plugin-document",
			"$/plugins/trusted/trusted-js-host",
			"jotai",
		].every((specifier) =>
			Boolean(
				layerImportViolation(
					resolve(pluginBuiltinRoot, "fixture-plugin/index.ts"),
					specifier,
				),
			),
		),
		message:
			"plugin modules under src/plugins/builtin must reject host-internal imports",
	},
	{
		passed: [
			"@amll-ttml-tool/plugin-api",
			"@amll-ttml-tool/plugin-sdk-js",
		].every(
			(specifier) =>
				layerImportViolation(
					resolve(pluginBuiltinRoot, "fixture-plugin/index.ts"),
					specifier,
				) === null,
		),
		message: "plugin modules must be allowed to import plugin-api and the SDK",
	},
	{
		passed:
			layerImportViolation(
				resolve(pluginBuiltinRoot, "formats/index.ts"),
				"$/kernel/formats",
			) === null,
		message: "host-core builtins (formats/modes/themes) keep host import rules",
	},
	{
		passed: Boolean(
			layerImportViolation(
				resolve(examplesRoot, "fixture/index.ts"),
				"$/states/main",
			),
		),
		message: "examples must reject host-internal imports",
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
	const commandMenuAdapters = new Set([
		"src/components/TopMenu/CommandMenuItem.tsx",
		"src/components/TopMenu/ContextCommandMenuItem.tsx",
	]);
	if (!commandMenuAdapters.has(displayPath)) {
		const directMenuCallback =
			/<(?:DropdownMenu|ContextMenu)\.(?:Item|CheckboxItem)\b[^>]*\b(?:onSelect|onClick|onCheckedChange)\s*=/s.exec(
				contents,
			);
		if (directMenuCallback) {
			const line = contents
				.slice(0, directMenuCallback.index)
				.split("\n").length;
			violations.push(
				`${displayPath}:${line}: menu items must reference command IDs through a command menu adapter`,
			);
		}
	}
	if (displayPath === "src/modules/settings/states/custom-background.ts") {
		const platformLeak =
			/(?:from\s+["']idb["']|\blocalStorage\b|\bfetch\s*\(|\bURL\.(?:createObjectURL|revokeObjectURL))/g.exec(
				contents,
			);
		if (platformLeak) {
			const line = contents.slice(0, platformLeak.index).split("\n").length;
			violations.push(
				`${displayPath}:${line}: custom background state must use platform storage/resource adapters`,
			);
		}
	}
	const isBusinessLayer =
		isWithin(path, pluginApiPackageRoot) ||
		isWithin(path, pluginSdkPackageRoot) ||
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

		if (
			isWithin(path, pluginSdkPackageRoot) &&
			cleanSpecifier(specifier) === "react" &&
			!/^(?:import|export)\s+type\b/.test(match[0])
		)
			violations.push(
				`${displayPath}:${line}: plugin-sdk-js may import React as types only (import type)`,
			);
	}
}

if (violations.length > 0) {
	console.error("Architecture import boundary violations:");
	for (const violation of violations) console.error(`- ${violation}`);
	process.exitCode = 1;
} else {
	console.log("Editor document and architecture import boundaries passed.");
}
