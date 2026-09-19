import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build, createServer } from "vite";
import { describe, expect, it } from "vitest";
import { sharedReact } from "../../scripts/shared-react";
import {
	isSharedReactImport,
	SHARED_REACT_IMPORTS,
	trustedJsArtifactGuard,
} from "../../scripts/trusted-js-build";

const root = resolve(import.meta.dirname, "../..");
async function temporary<T>(run: (directory: string) => Promise<T>) {
	await mkdir(resolve(root, "node_modules/.cache"), { recursive: true });
	const directory = await mkdtemp(
		resolve(root, "node_modules/.cache/sdk-test-"),
	);
	try {
		return await run(directory);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}
async function artifact(
	code: string,
	external: (id: string) => boolean = isSharedReactImport,
) {
	return temporary(async (directory) => {
		const entry = resolve(directory, "plugin.js");
		await writeFile(entry, code);
		return build({
			configFile: false,
			root,
			logLevel: "silent",
			plugins: [trustedJsArtifactGuard()],
			build: {
				write: false,
				minify: false,
				lib: { entry, formats: ["es"] },
				rolldownOptions: { external },
			},
		});
	});
}

describe("trusted-js artifact boundary", () => {
	it("preserves React and JSX bare imports", async () => {
		const output = await artifact(
			'import React from "react"; import { jsx } from "react/jsx-runtime"; export const view = () => jsx("div", { children: React.version });',
		);
		expect(JSON.stringify(output)).toContain("react/jsx-runtime");
	});
	it.each([
		'import "jotai"; export const x = 1;',
		'export { x } from "https://example.com/x.js";',
		'export const x = () => import("./other.js");',
		"export const x = (name) => import(name);",
		'export const x = () => require("react");',
		'export const x = "$/states";',
		'import "react/private"; export const x = 1;',
	])("rejects unsupported output: %s", async (code) => {
		await expect(artifact(code, () => true)).rejects.toThrow();
	});
	it("rejects a bundled second React", async () => {
		await expect(
			artifact('export { useState } from "react";', () => false),
		).rejects.toThrow(/private React/);
	});
});

describe("host React import map", () => {
	it.each(["./", "/", "/editor/"])(
		"emits same-origin facades with host identity at base %s",
		async (base) => {
			await temporary(async (directory) => {
				await writeFile(
					resolve(directory, "index.html"),
					'<html><head></head><body><script type="module" src="./host.js"></script></body></html>',
				);
				await writeFile(
					resolve(directory, "host.js"),
					'import * as React from "react"; import * as dom from "react-dom"; import * as client from "react-dom/client"; import { renderToString } from "react-dom/server.browser"; globalThis.__sdkHost = { React, dom, client, renderToString, context: React.createContext("host") };',
				);
				await build({
					configFile: false,
					root: directory,
					base,
					logLevel: "silent",
					plugins: [sharedReact()],
					resolve: { dedupe: ["react", "react-dom"] },
					build: { minify: false, modulePreload: false, outDir: "dist" },
				});
				const html = await readFile(
					resolve(directory, "dist/index.html"),
					"utf8",
				);
				const map = JSON.parse(
					html.match(/<script type="importmap">(.*?)<\/script>/s)?.[1] ?? "",
				).imports;
				expect(Object.keys(map)).toEqual([...SHARED_REACT_IMPORTS]);
				expect(html.indexOf('type="importmap"')).toBeLessThan(
					html.indexOf('type="module"'),
				);
				const load = (url: string) =>
					import(
						/* @vite-ignore */ pathToFileURL(
							resolve(directory, "dist", url.slice(base.length)),
						).href
					);
				const hostUrl =
					html.match(/type="module"[^>]*src="([^"]+)"/)?.[1] ?? "";
				await load(hostUrl);
				const host = (
					globalThis as unknown as {
						__sdkHost: {
							React: typeof import("react");
							dom: typeof import("react-dom");
							client: typeof import("react-dom/client");
							context: import("react").Context<string>;
							renderToString: typeof import("react-dom/server").renderToString;
						};
					}
				).__sdkHost;
				const react = await load(map.react);
				expect(react.default).toBe(host.React.default);
				expect(react.useState).toBe(host.React.useState);
				expect(react.createContext).toBe(host.React.createContext);
				const View = () =>
					react.createElement(
						"span",
						null,
						`${react.useContext(host.context)}:${react.useState(7)[0]}`,
					);
				expect(
					host.renderToString(
						host.React.createElement(
							host.context.Provider,
							{ value: "shared" },
							host.React.createElement(View),
						),
					),
				).toBe("<span>shared:7</span>");
				expect((await load(map["react-dom"])).createPortal).toBe(
					host.dom.createPortal,
				);
				expect((await load(map["react-dom/client"])).createRoot).toBe(
					host.client.createRoot,
				);
				for (const url of Object.values(map)) await load(url as string);
			});
		},
		30000,
	);
	it("serves dev facades through Vite's shared dependency graph", async () => {
		const server = await createServer({
			configFile: false,
			root,
			plugins: [sharedReact()],
			server: { port: 0, host: "127.0.0.1" },
			optimizeDeps: { noDiscovery: true },
			logLevel: "silent",
		});
		try {
			await server.listen();
			const address = server.resolvedUrls?.local[0];
			const html = await server.transformIndexHtml(
				"/",
				"<html><head></head><body></body></html>",
			);
			const map = JSON.parse(
				html.match(/<script type="importmap">(.*?)<\/script>/s)?.[1] ?? "",
			).imports;
			for (const specifier of SHARED_REACT_IMPORTS) {
				const response = await fetch(new URL(map[specifier], address));
				expect(response.status).toBe(200);
				expect(await response.text()).toContain("/node_modules/.vite/deps/");
			}
		} finally {
			await server.close();
		}
	}, 30000);
});
