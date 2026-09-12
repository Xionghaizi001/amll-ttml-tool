import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { strToU8, zipSync } from "fflate";
import { build, createServer } from "vite";

/**
 * Store thin slice generator (goal.md milestone 2): builds the first-party
 * store artifacts and the same-origin static catalog at CI build time.
 *
 * Red lines honored from day one:
 * - Content addressing: every artifact is written to
 *   public/plugins/store/<sha256>.<ext> and its hash is published in the
 *   catalog entry; artifacts are immutable by construction.
 * - No personalization: the catalog is a static file, identical bytes for
 *   every user.
 *
 * Outputs are build products (gitignored), regenerated on every `pnpm build`.
 */

const root = resolve(import.meta.dirname, "..");
const publicPluginsDir = resolve(root, "public/plugins");
const storeDir = resolve(publicPluginsDir, "store");
const catalogPath = resolve(publicPluginsDir, "catalog.json");
const buildOutDir = resolve(root, "node_modules/.cache/plugin-catalog");

const sha256 = (bytes: Uint8Array): string =>
	createHash("sha256").update(bytes).digest("hex");

await rm(storeDir, { recursive: true, force: true });
await rm(catalogPath, { force: true });
await mkdir(storeDir, { recursive: true });

// --- trusted-js artifact: the time-shift plugin as a standalone ES module ---
await build({
	configFile: false,
	root,
	logLevel: "warn",
	resolve: {
		alias: {
			"@amll-ttml-tool/plugin-api": resolve(
				root,
				"packages/plugin-api/src/index.ts",
			),
			"@amll-ttml-tool/plugin-sdk-js": resolve(
				root,
				"packages/plugin-sdk-js/src/index.ts",
			),
			$: resolve(root, "src"),
		},
	},
	build: {
		lib: {
			entry: resolve(root, "src/plugins/builtin/time-shift/plugin.ts"),
			formats: ["es"],
			fileName: () => "time-shift.mjs",
		},
		outDir: buildOutDir,
		emptyOutDir: true,
		sourcemap: false,
		target: "es2022",
	},
});
const timeShiftBytes = await readFile(resolve(buildOutDir, "time-shift.mjs"));
const timeShiftHash = sha256(timeShiftBytes);
const timeShiftFile = `${timeShiftHash}.mjs`;
await writeFile(resolve(storeDir, timeShiftFile), timeShiftBytes);
const timeShiftModule = (await import(
	pathToFileURL(resolve(storeDir, timeShiftFile)).href
)) as { TIME_SHIFT_PLUGIN_VERSION: string };

// --- extism-wasm artifact: the sample plugin as a fixed-layout zip ---
const sampleManifestBytes = await readFile(
	resolve(publicPluginsDir, "sample-tools.manifest.json"),
);
const sampleManifest = JSON.parse(sampleManifestBytes.toString("utf8")) as {
	id: string;
	name: string;
	version: string;
	description?: string;
	author?: string;
	apiVersion: number;
	entry: string;
};
const sampleWasm = await readFile(
	resolve(publicPluginsDir, "sample-tools.wasm"),
);
const sampleZip = zipSync(
	{
		"manifest.json": strToU8(
			JSON.stringify({ packageVersion: 0, manifest: sampleManifest }),
		),
		[`assets/${sampleManifest.entry}`]: sampleWasm,
	},
	// Fixed mtime keeps the artifact byte-identical across builds, so the
	// content address only changes when the content does.
	{ mtime: new Date("2000-01-01T00:00:00Z") },
);
const sampleHash = sha256(sampleZip);
const sampleFile = `${sampleHash}.zip`;
await writeFile(resolve(storeDir, sampleFile), sampleZip);

// --- catalog ---
const server = await createServer({
	root,
	appType: "custom",
	logLevel: "silent",
	server: { middlewareMode: true },
});
let pluginApi: {
	PLUGIN_API_VERSION: number;
	parseRemotePluginCatalog(input: unknown): {
		ok: boolean;
		issues?: { path: string; message: string }[];
	};
};
try {
	pluginApi = (await server.ssrLoadModule(
		"/packages/plugin-api/src/index.ts",
	)) as typeof pluginApi;
} finally {
	await server.close();
}

const catalog = {
	catalogVersion: 0,
	plugins: [
		{
			id: "builtin.time-shift",
			name: "Time Shift",
			version: timeShiftModule.TIME_SHIFT_PLUGIN_VERSION,
			description: "Shift lyric line and word timing by a fixed offset",
			channel: "trusted-js",
			apiVersion: pluginApi.PLUGIN_API_VERSION,
			entry: `plugins/store/${timeShiftFile}`,
			sha256: timeShiftHash,
			platforms: ["web", "desktop"],
			firstParty: true,
		},
		{
			id: sampleManifest.id,
			name: sampleManifest.name,
			version: sampleManifest.version,
			description: sampleManifest.description,
			author: sampleManifest.author,
			channel: "extism-wasm",
			apiVersion: sampleManifest.apiVersion,
			entry: `plugins/store/${sampleFile}`,
			sha256: sampleHash,
			platforms: ["web", "desktop"],
		},
	],
};

const parsed = pluginApi.parseRemotePluginCatalog(catalog);
if (!parsed.ok) {
	console.error("Generated catalog failed protocol validation:");
	for (const issue of parsed.issues ?? [])
		console.error(`- ${issue.path || "/"}: ${issue.message}`);
	process.exit(1);
}

await writeFile(
	catalogPath,
	`${JSON.stringify(catalog, null, "\t")}\n`,
	"utf8",
);
console.log(
	`Generated public/plugins/catalog.json (${catalog.plugins.length} entries)`,
);
console.log(
	`- trusted-js builtin.time-shift -> plugins/store/${timeShiftFile}`,
);
console.log(
	`- extism-wasm ${sampleManifest.id} -> plugins/store/${sampleFile}`,
);
