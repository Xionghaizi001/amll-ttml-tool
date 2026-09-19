import type { Plugin } from "vite";

/** Exact runtime surface shared by the host; arbitrary package subpaths fail closed. */
export const SHARED_REACT_IMPORTS = [
	"react",
	"react/jsx-runtime",
	"react/jsx-dev-runtime",
	"react/compiler-runtime",
	"react-dom",
	"react-dom/client",
] as const;

export const isSharedReactImport = (id: string): boolean =>
	SHARED_REACT_IMPORTS.some((specifier) => specifier === id);

/** SDK/API helpers are bundled; only the host's React bridges remain external. */
export function assertTrustedJsArtifact(
	code: string,
	fileName: string,
	ast: unknown,
): void {
	if (code.includes("$/"))
		throw new Error(`${fileName}: host alias $/ remains`);
	const check = (node: unknown) => {
		const value = node as { type?: string; value?: unknown } | undefined;
		if (
			value?.type !== "Literal" ||
			typeof value.value !== "string" ||
			!isSharedReactImport(value.value)
		) {
			throw new Error(`${fileName}: unsupported module dependency`);
		}
	};
	const visit = (value: unknown): void => {
		if (!value || typeof value !== "object") return;
		if (Array.isArray(value)) {
			value.forEach(visit);
			return;
		}
		const node = value as Record<string, unknown>;
		if (node.type === "Identifier" && node.name === "require")
			throw new Error(`${fileName}: CommonJS require is not supported`);
		if (
			node.type === "ImportDeclaration" ||
			node.type === "ExportNamedDeclaration" ||
			node.type === "ExportAllDeclaration"
		) {
			if (node.source) check(node.source);
		}
		if (node.type === "ImportExpression") check(node.source);
		if (node.type === "CallExpression") {
			const callee = node.callee as { type?: string; name?: string };
			if (callee.type === "Identifier" && callee.name === "require")
				throw new Error(`${fileName}: CommonJS require is not supported`);
		}
		Object.values(node).forEach(visit);
	};
	visit(ast);
}

export function trustedJsArtifactGuard(): Plugin {
	return {
		name: "trusted-js-artifact-guard",
		generateBundle(_options, bundle) {
			for (const item of Object.values(bundle)) {
				if (item.type !== "chunk")
					throw new Error(`Unexpected plugin asset: ${item.fileName}`);
				assertTrustedJsArtifact(
					item.code,
					item.fileName,
					this.parse(item.code),
				);
				for (const id of [...item.imports, ...item.dynamicImports]) {
					if (!isSharedReactImport(id))
						throw new Error(`Unsupported plugin dependency: ${id}`);
				}
				for (const id of item.moduleIds) {
					if (
						/node_modules[\\/](?:\.pnpm[\\/][^/\\]+[\\/]node_modules[\\/])?(react|react-dom)[\\/]/.test(
							id,
						)
					) {
						throw new Error(`Plugin bundles a private React runtime: ${id}`);
					}
				}
			}
		},
	};
}
