/** Real Chromium IndexedDB integration check; no mocked transactions. */
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { stripTypeScriptTypes } from "node:module";

const chrome =
	process.env.CHROME_EXECUTABLE ??
	"C:/Program Files/Google/Chrome/Application/chrome.exe";
const directory = mkdtempSync(join(tmpdir(), "amll-extensions-check-"));
const sources = [
	"plugin-database",
	"IndexedDbTrustedJsStorage",
	"IndexedDbThemePackageStorage",
	"IndexedDbThemeSurfaceImageStorage",
];
const idb = readFileSync(
	resolve("node_modules/idb/build/index.js"),
	"utf8",
).replace(/export \{[^}]+\};/g, "");
const adapters = sources
	.map((name) => {
		const names =
			name === "plugin-database"
				? "openPluginDatabase, pluginNamespaceRange"
				: name;
		return (
			`const { ${names} } = (() => {` +
			stripTypeScriptTypes(
				readFileSync(`src/platform/storage/${name}.ts`, "utf8")
					.replace(/import[\s\S]*?from ["'][^"']+["'];/g, "")
					.replace(/export /g, ""),
				{ mode: "transform" },
			) +
			`; return { ${names} }; })();`
		);
	})
	.join("\n");
const checks = `
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const db = await openPluginDatabase();
assert(db.name === "amll-extensions", "unified database");
assert([...db.objectStoreNames].sort().join(",") === "plugin-kv,theme-assets,theme-packages,trusted-js", "stores");
assert(await openPluginDatabase() === db, "shared connection");
const trusted = new IndexedDbTrustedJsStorage();
await trusted.save({ id: "one", code: new Blob(["code"]) });
await trusted.save({ id: "two", code: new Blob(["code"]) });
for (const pluginId of ["one", "two"]) await db.put("plugin-kv", { pluginId, key: "", value: 1 });
await db.put("plugin-kv", { pluginId: "one", key: "z", value: 2 });
await trusted.uninstall("one");
assert(!await db.get("trusted-js", "one") && (await db.getAll("plugin-kv")).length === 1, "trusted uninstall namespace");
assert(await db.get("trusted-js", "two"), "other plugin preserved");
const themes = new IndexedDbThemePackageStorage();
const image = { mime: "image/png", data: "aGVsbG8=" };
await themes.save("theme.one", { manifest: { id: "theme.one" }, assets: { bg: image } });
await themes.save("theme.two", { manifest: { id: "theme.two" }, assets: { bg: image } });
const surfaces = new IndexedDbThemeSurfaceImageStorage();
await surfaces.write("appRoot", new Blob(["user"]), "rgba(0, 0, 0, 0.45)", 0.4);
const restored = await new IndexedDbThemePackageStorage().loadAll();
assert(restored.find(x => x.id === "theme.one").pkg.assets.bg.data === image.data, "binary asset roundtrip");
assert((await surfaces.readAll()).length === 1, "surface reads exclude package assets");
let failed = false;
try { await themes.save("theme.one", { invalid: () => {}, assets: { bg: { ...image, data: "d29ybGQ=" } } }); } catch { failed = true; }
assert(failed, "DataCloneError surfaced");
assert((await themes.loadAll()).find(x => x.id === "theme.one").pkg.assets.bg.data === image.data, "failed update rolled back old asset");
await themes.remove("theme.one");
assert(!await db.get("theme-packages", "theme.one"), "theme removed");
assert((await db.getAllFromIndex("theme-assets", "themeId", "theme.one")).length === 0, "owned assets removed");
assert((await db.getAllFromIndex("theme-assets", "themeId", "theme.two")).length === 1, "other theme asset preserved");
assert((await surfaces.readAll())[0].opacity === 0.4, "user background preserved");
// Force a synchronous failure after scheduling package deletion. Real transaction abort must restore it.
const failingProvider = async () => ({ transaction(...args) {
 const tx = db.transaction(...args);
 return { done: tx.done, abort: () => tx.abort(), objectStore: (store) => store === "plugin-kv" ? { delete() { throw new Error("injected failure"); } } : tx.objectStore(store) };
} });
failed = false;
try { await new IndexedDbTrustedJsStorage(failingProvider).uninstall("two"); } catch { failed = true; }
assert(failed && await db.get("trusted-js", "two") && await db.get("plugin-kv", ["two", ""]), "aborted trusted uninstall preserved both stores");
db.close();
`;

const browser = spawn(
	chrome,
	[
		"--headless",
		"--no-sandbox",
		"--disable-gpu",
		"--no-first-run",
		"--disable-background-networking",
		"--remote-debugging-port=0",
		`--user-data-dir=${join(directory, "profile")}`,
		"about:blank",
	],
	{ windowsHide: true, stdio: "ignore" },
);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let socket;
try {
	let port;
	for (let attempt = 0; attempt < 100; attempt++) {
		try {
			port = readFileSync(
				join(directory, "profile", "DevToolsActivePort"),
				"utf8",
			).split("\n")[0];
			break;
		} catch {
			await delay(100);
		}
	}
	if (!port) throw new Error("Chrome debugging port did not start");
	const pages = await (
		await fetch(`http://127.0.0.1:${port}/json/list`)
	).json();
	socket = new WebSocket(
		pages.find((page) => page.type === "page").webSocketDebuggerUrl,
	);
	await new Promise((resolve, reject) => {
		socket.onopen = resolve;
		socket.onerror = reject;
	});
	let sequence = 0;
	const call = (method, params) =>
		new Promise((resolve, reject) => {
			const id = ++sequence;
			const timeout = setTimeout(
				() => reject(new Error(`${method} timed out`)),
				15000,
			);
			const listener = (event) => {
				const message = JSON.parse(event.data);
				if (message.id !== id) return;
				clearTimeout(timeout);
				socket.removeEventListener("message", listener);
				if (message.error) reject(new Error(JSON.stringify(message.error)));
				else resolve(message.result);
			};
			socket.addEventListener("message", listener);
			socket.send(JSON.stringify({ id, method, params }));
		});
	const html = join(directory, "check.html");
	writeFileSync(html, "<body>extensions test</body>");
	await call("Page.navigate", { url: `file:///${html.replaceAll("\\", "/")}` });
	await delay(300);
	const result = await call("Runtime.evaluate", {
		expression: `(async () => {${idb}\n${adapters}\n${checks} return "PASS";})()`,
		awaitPromise: true,
		returnByValue: true,
	});
	if (result.exceptionDetails || result.result.value !== "PASS")
		throw new Error(JSON.stringify(result));
	console.log(
		"PASS real IndexedDB: shared connection, Blob roundtrip, atomic uninstall/update rollback, namespace isolation, user background preservation",
	);
} finally {
	socket?.close();
	browser.kill();
	await delay(500);
	rmSync(directory, { recursive: true, force: true });
}
