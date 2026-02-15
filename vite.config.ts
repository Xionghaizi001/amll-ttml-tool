// import MillionLint from "@million/lint";
import { exec } from "node:child_process";
import type { Readable } from "node:stream";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import jotaiDebugLabel from "jotai/babel/plugin-debug-label";
import jotaiReactRefresh from "jotai/babel/plugin-react-refresh";
import ConditionalCompile from "unplugin-preprocessor-directives/vite";
import { defineConfig, type Plugin } from "vite";
import i18nextLoader from "vite-plugin-i18next-loader";
import { VitePWA } from "vite-plugin-pwa";
// 由于这个插件会除去 Source Map 注释，所以考虑移除
// https://github.com/Menci/vite-plugin-top-level-await/issues/34
// import topLevelAwait from "vite-plugin-top-level-await";
import wasm from "vite-plugin-wasm";
import svgLoader from "vite-svg-loader";

const AMLL_LOCAL_EXISTS = existsSync(
	resolve(__dirname, "../applemusic-like-lyrics"),
);

const ReactCompilerConfig = {
	target: "19",
};

process.env.AMLL_LOCAL_EXISTS = AMLL_LOCAL_EXISTS ? "true" : "false";

const plugins: Plugin[] = [
	{
		name: "github-proxy-dev",
		configureServer(server) {
			server.middlewares.use("/api/github", async (req, res) => {
				const requestUrl = new URL(req.url ?? "", "http://localhost");
				const rawUrl = requestUrl.searchParams.get("url") ?? "";
				const path = requestUrl.searchParams.get("path") ?? "";
				if (!rawUrl && !path) {
					res.statusCode = 400;
					res.end("Missing path or url");
					return;
				}
				const targetUrl = rawUrl
					? buildTargetFromUrl(rawUrl)
					: buildTargetUrl(path, requestUrl.searchParams);
				if (!targetUrl) {
					res.statusCode = 400;
					res.end("Invalid url");
					return;
				}
				const method = req.method ?? "GET";
				const headers: Record<string, string> = {
					Accept: String(req.headers.accept ?? "application/vnd.github+json"),
					"User-Agent": String(req.headers["user-agent"] ?? "amll-ttml-tool"),
				};
				const authorization = req.headers.authorization;
				if (authorization) {
					headers.Authorization = String(authorization);
				}
				const contentType = req.headers["content-type"];
				if (contentType) {
					headers["Content-Type"] = String(contentType);
				}
				const body =
					method === "GET" || method === "HEAD"
						? undefined
						: await readRequestBody(req);
				try {
					const response = await fetch(targetUrl.toString(), {
						method,
						headers,
						body,
					});
					res.statusCode = response.status;
					const responseType =
						response.headers.get("content-type") ?? "application/json";
					res.setHeader("content-type", responseType);
					const text = await response.text();
					res.end(text);
				} catch (error) {
					res.statusCode = 502;
					res.end(error instanceof Error ? error.message : "Proxy error");
				}
			});
		},
	},
	ConditionalCompile(),
	// topLevelAwait(),
	// MillionLint.vite(),
	react({
		babel: {
			presets: ["jotai/babel/preset"],
			plugins: [
				["babel-plugin-react-compiler", ReactCompilerConfig],
				jotaiDebugLabel,
				jotaiReactRefresh,
			],
		},
	}),
	svgLoader(),
	wasm(),
	i18nextLoader({
		paths: ["./locales"],
		namespaceResolution: "basename",
	}),
	{
		name: "buildmeta",
		async resolveId(id) {
			if (id === "virtual:buildmeta") {
				return id;
			}
		},
		async load(id) {
			if (id === "virtual:buildmeta") {
				let gitCommit = "unknown";

				try {
					gitCommit = await new Promise<string>((resolve, reject) =>
						exec("git rev-parse HEAD", (err, stdout) => {
							if (err) {
								reject(err);
							} else {
								resolve(stdout.trim());
							}
						}),
					);
				} catch {}

				return `
					export const BUILD_TIME = "${new Date().toISOString()}";
					export const GIT_COMMIT = "${gitCommit}";
				`;
			}
		},
	},
	VitePWA({
		injectRegister: null,
		disable: !!process.env.TAURI_PLATFORM,
		workbox: {
			globPatterns: ["**/*.{js,css,html,wasm}"],
			maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
		},
		manifest: {
			name: "Apple Music-like lyrics TTML Tool",
			id: "amll-ttml-tool",
			short_name: "AMLL TTML Tool",
			description: "一个用于 Apple Music 的逐词歌词 TTML 编辑和时间轴工具",
			theme_color: "#18a058",
			icons: [
				{
					src: "./icons/Square30x30Logo.png",
					sizes: "30x30",
					type: "image/png",
				},
				{
					src: "./icons/Square44x44Logo.png",
					sizes: "44x44",
					type: "image/png",
				},
				{
					src: "./icons/Square71x71Logo.png",
					sizes: "71x71",
					type: "image/png",
				},
				{
					src: "./icons/Square89x89Logo.png",
					sizes: "89x89",
					type: "image/png",
				},
				{
					src: "./icons/Square107x107Logo.png",
					sizes: "107x107",
					type: "image/png",
				},
				{
					src: "./logo.png",
					sizes: "1024x1024",
					type: "image/png",
				},
				{
					src: "./logo.svg",
					sizes: "128x128",
					type: "image/svg",
				},
			],
		},
	}),
];

const GITHUB_API_BASE = "https://api.github.com";
const ALLOWED_HOSTS = new Set([
	"api.github.com",
	"github.com",
	"raw.githubusercontent.com",
]);

const buildTargetUrl = (path: string, query: URLSearchParams) => {
	const normalizedPath = path.startsWith("/") ? path : `/${path}`;
	const url = new URL(normalizedPath, GITHUB_API_BASE);
	for (const [key, value] of query.entries()) {
		if (key === "path" || key === "url") continue;
		url.searchParams.append(key, value);
	}
	return url;
};

const buildTargetFromUrl = (rawUrl: string) => {
	try {
		const url = new URL(rawUrl);
		if (!ALLOWED_HOSTS.has(url.hostname)) {
			return null;
		}
		return url;
	} catch {
		return null;
	}
};

const readRequestBody = async (req: Readable) => {
	if (!req.readable) return undefined;
	const chunks: Uint8Array[] = [];
	await new Promise<void>((resolve, reject) => {
		req.on("data", (chunk) => {
			chunks.push(chunk as Uint8Array);
		});
		req.on("end", () => resolve());
		req.on("error", reject);
	});
	if (chunks.length === 0) return undefined;
	const merged = Buffer.concat(chunks);
	return merged;
};

// https://vitejs.dev/config/
export default defineConfig({
	plugins,
	base: process.env.TAURI_ENV_PLATFORM ? "/" : "./",
	clearScreen: false,
	server: {
		headers: {
			"Cross-Origin-Embedder-Policy": "require-corp",
			"Cross-Origin-Opener-Policy": "same-origin",
		},
		strictPort: true,
	},
	envPrefix: ["VITE_", "TAURI_", "AMLL_", "SENTRY_"],
	build: {
		// Tauri uses Chromium on Windows and WebKit on macOS and Linux
		target:
			process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari15",
		// don't minify for debug builds
		minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
		// produce sourcemaps for debug builds
		sourcemap: true,
	},
	resolve: {
		alias: Object.assign(
			{
				$: resolve(__dirname, "src"),
			},
			AMLL_LOCAL_EXISTS
				? {
						// for development, use the local copy of the AMLL library
						"@applemusic-like-lyrics/core": resolve(
							__dirname,
							"../applemusic-like-lyrics/packages/core/src",
						),
						"@applemusic-like-lyrics/react": resolve(
							__dirname,
							"../applemusic-like-lyrics/packages/react/src",
						),
					}
				: {},
		) as Record<string, string>,
		dedupe: ["react", "react-dom", "jotai"],
	},
	worker: {
		format: "es",
	},
});
