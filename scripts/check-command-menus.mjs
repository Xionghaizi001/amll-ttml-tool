import { parse } from "@babel/parser";
import { globSync, readFileSync } from "node:fs";

// Dependency parsing belongs to dependency-cruiser; Biome owns global/import
// restrictions. Only the remaining JSX/transaction invariants use this AST.
const files = process.argv.slice(2).length
	? process.argv.slice(2)
	: globSync("{src,tests,examples,packages/*/src}/**/*.{ts,tsx}", {
			exclude: ["**/node_modules/**", "**/dist/**", "**/target/**"],
		});
const callbacks = new Set("onSelect onClick onCheckedChange".split(" "));
const writes = new Set(
	"useSetAtom useSetImmerAtom useAtom set withImmer".split(" "),
);
const business =
	/^(src\/(application|kernel)\/|packages\/plugin-(api|sdk-js)\/)/;
const adapters = new Set([
	"src/components/TopMenu/CommandMenuItem.tsx",
	"src/components/TopMenu/ContextCommandMenuItem.tsx",
]);
let failures = 0;
for (const file of files) {
	const path = file.replaceAll("\\", "/");
	const report = (node, message) => {
		console.error(`${path}:${node.loc?.start.line ?? 1}: ${message}`);
		failures++;
	};
	const tree = parse(readFileSync(file, "utf8"), {
		sourceType: "module",
		plugins: [
			["typescript", { dts: path.endsWith(".d.ts") }],
			"decorators-legacy",
			...(path.endsWith(".tsx") ? ["jsx"] : []),
		],
	});
	if (business.test(path) && path.endsWith(".tsx"))
		report(tree, "Business layers cannot contain TSX");
	const visit = (node) => {
		if (!node || typeof node !== "object") return;
		if (node.type === "JSXOpeningElement" && !adapters.has(path)) {
			const name = node.name;
			if (
				name.type === "JSXMemberExpression" &&
				["DropdownMenu", "ContextMenu"].includes(name.object.name) &&
				["Item", "CheckboxItem"].includes(name.property.name)
			) {
				for (const attribute of node.attributes) {
					if (callbacks.has(attribute.name?.name))
						report(attribute, "Menu items must reference command IDs");
					if (attribute.type === "JSXSpreadAttribute")
						report(attribute, "Menu item prop spreads can hide callbacks");
				}
			}
		}
		if (
			node.type === "CallExpression" &&
			path !== "src/plugins/adapters/editor-document.ts"
		) {
			const callee = node.callee;
			const name =
				callee.type === "Identifier"
					? callee.name
					: callee.type === "MemberExpression" && callee.object.name === "store"
						? callee.property.name
						: undefined;
			if (writes.has(name) && node.arguments[0]?.name === "lyricLinesAtom")
				report(node, "Direct lyricLinesAtom write must use editor adapter");
		}
		if (
			(business.test(path) || path.startsWith("src/states/")) &&
			node.type === "MemberExpression" &&
			node.object.name === "URL" &&
			["createObjectURL", "revokeObjectURL"].includes(
				node.property.name ?? node.property.value,
			)
		)
			report(node, "Object URL lifecycle belongs in platform adapters");
		for (const value of Object.values(node)) {
			if (Array.isArray(value)) value.forEach(visit);
			else if (value?.type) visit(value);
		}
	};
	visit(tree);
}
if (failures) process.exitCode = 1;
else console.log("Command menu and editor transaction boundaries passed.");
