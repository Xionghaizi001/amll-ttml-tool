import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmdirSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const repository = process.cwd();
const biome = resolve(
	process.env.BOUNDARY_BIOME_CLI ?? "node_modules/@biomejs/biome/bin/biome",
);
const cruiser = resolve(
	"node_modules/dependency-cruiser/bin/dependency-cruise.mjs",
);
const partial = process.argv.includes("--skip-depcruise");
// Preserve real paths, dependency resolution and rule configuration without
// writing deliberately invalid modules into the working tree. In particular,
// optional examples directories may be absent or read-only in a checkout.
const workspace = mkdtempSync(join(tmpdir(), "amll-boundary-fixtures-"));
try {
	for (const entry of [
		"src",
		"packages",
		"biome.json",
		".dependency-cruiser.cjs",
		"tsconfig.app.json",
	])
		cpSync(join(repository, entry), join(workspace, entry), {
			recursive: true,
		});
	symlinkSync(
		join(repository, "node_modules"),
		join(workspace, "node_modules"),
		process.platform === "win32" ? "junction" : "dir",
	);
	const prefix = `boundary-fixture-${process.pid}`;
	const run = (args, file, expected, succeeds = false) => {
		const result = spawnSync(process.execPath, [...args, file], {
			encoding: "utf8",
			cwd: workspace,
		});
		assert.ifError(result.error);
		assert.equal(
			result.status,
			succeeds ? 0 : 1,
			result.stdout + result.stderr,
		);
		if (expected) assert.match(result.stdout + result.stderr, expected);
	};
	const fixture = (directory, extension, text, test) => {
		const file = `${directory}/${prefix}.${extension}`;
		const target = join(workspace, file);
		assert.ok(!existsSync(target), `Refusing to overwrite ${target}`);
		const createdDirectory = !existsSync(join(workspace, directory));
		mkdirSync(dirname(target), { recursive: true });
		try {
			writeFileSync(target, text);
			test(file);
		} finally {
			rmSync(target, { force: true });
			if (createdDirectory) rmdirSync(join(workspace, directory));
		}
	};
	const globals = [
		biome,
		"lint",
		"--only=style/noRestrictedGlobals",
		"--only=style/noRestrictedImports",
	];
	const ast = [join(repository, "scripts/check-command-menus.mjs")];
	const sdkReact = [join(repository, "scripts/check-sdk-react-imports.mjs")];
	const dependencies = [cruiser, "--config", ".dependency-cruiser.cjs"];

	for (const text of [
		"fetch('/fixture');",
		"globalThis.fetch('/fixture');",
		"indexedDB.open('fixture');",
	])
		fixture("src/states", "ts", text, (file) =>
			run(globals, file, /noRestrictedGlobals/),
		);
	fixture(
		"src/kernel",
		"ts",
		"function useDocument(document: { title: string }) { return document.title; }",
		(file) => run(globals, file, undefined, true),
	);
	fixture("src/states", "ts", "import { openDB } from 'idb';", (file) =>
		run(globals, file, /noRestrictedImports/),
	);
	fixture(
		"src/states",
		"ts",
		"import { lyricLinesAtom as renamed } from '$/states/main';",
		(file) => run(globals, file, /noRestrictedImports/),
	);
	fixture("src/states", "ts", "URL['createObjectURL'](new Blob());", (file) =>
		run(ast, file, /Object URL lifecycle/),
	);
	for (const prop of ["onSelect", "onClick", "onCheckedChange"])
		fixture(
			"src/components",
			"tsx",
			`const view = <DropdownMenu.Item\n${prop}={() => {}} />;`,
			(file) => run(ast, file, /Menu items must reference command IDs/),
		);
	fixture(
		"src/components",
		"tsx",
		"const view = <ContextMenu.CheckboxItem {...props} />;",
		(file) => run(ast, file, /prop spreads can hide callbacks/),
	);
	fixture(
		"src/components",
		"tsx",
		"// <DropdownMenu.Item onSelect={handler} />\nconst view = <CommandMenuItem commandId='fixture' />;",
		(file) => run(ast, file, undefined, true),
	);
	fixture("src/components", "tsx", "useSetAtom(lyricLinesAtom);", (file) =>
		run(ast, file, /Direct lyricLinesAtom write/),
	);

	if (!partial) {
		assert.ok(
			existsSync(cruiser),
			"Install dependencies before running the complete boundary fixtures",
		);
		fixture(
			"src/kernel",
			"ts",
			"import { lyricLinesAtom } from '$/states/main';",
			(file) => run(dependencies, file, /kernel-dependencies/),
		);
		fixture(
			"src/kernel",
			"ts",
			"import { lyricLinesAtom } from '../states/main';",
			(file) => run(dependencies, file, /kernel-dependencies/),
		);
		fixture(
			"src/components",
			"ts",
			"import Decoder from '$/modules/ffmpeg/worker/decoder.worker?worker';",
			(file) => run(dependencies, file, /worker-resources/),
		);
		fixture(
			"src/components",
			"ts",
			"import * as parser from '$/utils/parse-lrc';",
			(file) => run(dependencies, file, /pure-algorithms-through-adapters/),
		);
		fixture(
			"packages/plugin-sdk-js/src",
			"ts",
			"import React from 'react';",
			(file) => run(sdkReact, file, /sdk-react-types-only/),
		);
		fixture(
			"packages/plugin-sdk-js/src",
			"ts",
			"import type { ReactNode } from 'react';",
			(file) => run(sdkReact, file, undefined, true),
		);
		fixture(
			"examples",
			"ts",
			"import { lyricLinesAtom } from '$/states/main';",
			(file) => run(dependencies, file, /plugin-public-api-only/),
		);
	} else {
		console.log(
			"Dependency-cruiser fixtures explicitly skipped; full boundary acceptance is pending.",
		);
	}
	console.log("Boundary fixtures passed.");
} finally {
	rmSync(workspace, { recursive: true, force: true });
}
