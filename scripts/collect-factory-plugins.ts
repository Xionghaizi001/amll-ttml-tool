import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { unpackPluginContainer } from "../src/plugins/store/package-container.ts";
import { createServer } from "vite";

/** Locked artifact collector. No plugin source compilation or evaluation. */
export async function collectFactoryPlugins(root: string) {
	const server = await createServer({
		root,
		configFile: false,
		appType: "custom",
		optimizeDeps: { noDiscovery: true, include: [] },
		server: { middlewareMode: true },
	});
	let parseTrustedJsPackage: typeof import("../packages/plugin-api/src/trusted-js-package").parseTrustedJsPackage;
	try {
		({ parseTrustedJsPackage } = await server.ssrLoadModule(
			"/packages/plugin-api/src/index.ts",
		));
	} finally {
		await server.close();
	}
	const lock = JSON.parse(
		await readFile(resolve(root, "factory-plugins.lock.json"), "utf8"),
	);
	if (lock.lockVersion !== 0 || !Array.isArray(lock.plugins))
		throw new Error("Invalid factory lock");
	const generated = resolve(root, "src/plugins/generated");
	const store = resolve(root, "public/plugins/store");
	await mkdir(generated, { recursive: true });
	await mkdir(store, { recursive: true });
	const catalog = [];
	const imports: string[] = [];
	const entries: string[] = [];
	const seen = new Set();
	for (const item of lock.plugins) {
		if (seen.has(item.id) || !/^[a-f0-9]{64}$/.test(item.sha256))
			throw new Error("Invalid lock identity/hash");
		seen.add(item.id);
		let bytes: Uint8Array;
		if (/^https:\/\//.test(item.source)) {
			const response = await fetch(item.source);
			if (!response.ok)
				throw new Error(`Factory download failed: ${response.status}`);
			bytes = new Uint8Array(await response.arrayBuffer());
		} else bytes = await readFile(resolve(root, item.source));
		if (createHash("sha256").update(bytes).digest("hex") !== item.sha256)
			throw new Error(`Factory hash mismatch: ${item.id}`);
		const unpacked = unpackPluginContainer(bytes);
		if (!unpacked.ok || unpacked.kind !== "trusted-js")
			throw new Error("Expected trusted-js factory artifact");
		const parsed = parseTrustedJsPackage(unpacked.pkg);
		if (!parsed.ok) throw new Error("Invalid factory package");
		const { manifest, code } = parsed.value;
		if (manifest.id !== item.id || manifest.version !== item.version)
			throw new Error("Factory identity mismatch");
		const moduleName = `${item.sha256}.js`;
		await writeFile(resolve(generated, moduleName), code);
		await writeFile(
			resolve(generated, `${item.sha256}.d.ts`),
			'export function activate(context: import("@amll-ttml-tool/plugin-sdk-js").TrustedJsActivationContextV0): void;\n',
		);
		await writeFile(resolve(store, `${item.sha256}.zip`), bytes);
		const index = imports.length;
		imports.push(`import * as plugin${index} from "./${moduleName}";`);
		entries.push(
			`{ ...${JSON.stringify(manifest)}, firstParty: true, loadModule: async () => plugin${index} }`,
		);
		catalog.push({
			id: manifest.id,
			name: manifest.name,
			version: manifest.version,
			description: manifest.description,
			apiVersion: manifest.apiVersion,
			channel: "trusted-js",
			firstParty: true,
			platforms: ["web", "desktop"],
			entry: `plugins/store/${item.sha256}.zip`,
			sha256: item.sha256,
		});
	}
	await writeFile(
		resolve(generated, "factory.ts"),
		`${imports.join("\n")}\nexport const factoryPlugins = [${entries.join(",\n")}];\n`,
	);
	return catalog;
}
