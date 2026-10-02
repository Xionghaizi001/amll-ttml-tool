import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";
import { collectFactoryPlugins } from "./collect-factory-plugins.ts";

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

await rm(storeDir, { recursive: true, force: true });
await rm(catalogPath, { force: true });
await mkdir(storeDir, { recursive: true });

const factoryEntries = await collectFactoryPlugins(root);

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
	plugins: factoryEntries,
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
console.log(`- ${factoryEntries.length} locked factory artifacts collected`);
