import { readFileSync, statSync, readdirSync } from "node:fs";

const roots = process.argv.slice(2);
const files = [];
const visit = (path) => {
	const info = statSync(path);
	if (info.isDirectory()) {
		for (const entry of readdirSync(path)) visit(`${path}/${entry}`);
	} else if (/\.[cm]?[jt]sx?$/.test(path)) files.push(path);
};
for (const root of roots.length ? roots : ["packages/plugin-sdk-js/src"]) visit(root);

const violations = [];
for (const file of files) {
	const source = readFileSync(file, "utf8");
	const re = /(^|\n)\s*import\s+(?!type\b)[^;\n]*?\bfrom\s*["']react["']/g;
	if (re.test(source)) violations.push(file);
}
if (violations.length) {
	console.error(`sdk-react-types-only: ${violations.join(", ")}`);
	process.exit(1);
}
