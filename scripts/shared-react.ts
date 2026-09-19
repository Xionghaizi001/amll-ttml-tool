import { createRequire } from "node:module";
import type { Plugin, ResolvedConfig } from "vite";
import { SHARED_REACT_IMPORTS } from "./trusted-js-build.ts";

const require = createRequire(import.meta.url);
const prefix = "virtual:amll-shared-react/";

/** Public ESM facades use the SAME module graph as the host, including its renderer. */
export function sharedReact(): Plugin {
	let config: ResolvedConfig;
	const entries = new Map<string, string>();
	const files = new Map<string, string>();
	return {
		name: "amll-shared-react",
		config() {
			return { optimizeDeps: { include: [...SHARED_REACT_IMPORTS] } };
		},
		configResolved(value) {
			config = value;
		},
		resolveId(id) {
			if (id.startsWith(prefix)) return `\0${id}`;
		},
		load(id) {
			if (!id.startsWith(`\0${prefix}`)) return;
			const specifier = id.slice(prefix.length + 1);
			if (!SHARED_REACT_IMPORTS.some((value) => value === specifier))
				throw new Error(`Unknown React bridge: ${specifier}`);
			// CJS export-star cannot reliably expose React DOM/client named exports.
			// Enumerate the pinned package surface and bind values from the shared runtime.
			const names = Object.keys(require(specifier)).filter(
				(name) => name !== "default" && name !== "__esModule",
			);
			return `import runtime from ${JSON.stringify(specifier)}; export default runtime; export const { ${names.join(", ")} } = runtime;`;
		},
		buildStart() {
			if (config.command !== "build") return;
			for (const specifier of SHARED_REACT_IMPORTS) {
				entries.set(
					specifier,
					this.emitFile({
						type: "chunk",
						id: `${prefix}${specifier}`,
						name: `shared-${specifier.replaceAll("/", "-")}`,
						preserveSignature: "strict",
					}),
				);
			}
		},
		generateBundle() {
			for (const [specifier, reference] of entries)
				files.set(specifier, this.getFileName(reference));
		},
		transformIndexHtml: {
			order: "post",
			handler() {
				const imports = Object.fromEntries(
					SHARED_REACT_IMPORTS.map((specifier) => {
						const path =
							config.command === "build"
								? files.get(specifier)
								: `@id/__x00__${prefix}${specifier}`;
						if (!path) throw new Error(`Missing React bridge: ${specifier}`);
						return [specifier, `${config.base}${path}`];
					}),
				);
				return [
					{
						tag: "script",
						attrs: { type: "importmap" },
						children: JSON.stringify({ imports }),
						injectTo: "head-prepend",
					},
				];
			},
		},
	};
}
