import { describe, expect, it } from "vitest";
import {
	decodeFunctionPluginWasm,
	parseFunctionPluginPackage,
} from "@amll-ttml-tool/plugin-api/function-package";
import { parseCommandOutcome, parseFormResult } from "@amll-ttml-tool/plugin-api/parsers";

const manifest = {
	id: "example.demo",
	kind: "function",
	name: "Demo",
	version: "1.0.0",
	apiVersion: 0,
	runtime: "extism-wasm",
	entry: "demo.wasm",
	capabilities: ["lyrics.core"],
};

// base64 of the minimal wasm header [0x00,0x61,0x73,0x6d,0x01,0,0,0].
const wasmBase64 = "AGFzbQEAAAA=";

describe("parseFunctionPluginPackage", () => {
	it("accepts a valid extism-wasm package and decodes its module", () => {
		const parsed = parseFunctionPluginPackage({
			packageVersion: 0,
			manifest,
			wasm: wasmBase64,
		});
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		const bytes = decodeFunctionPluginWasm(parsed.value);
		expect([...bytes.slice(0, 4)]).toEqual([0x00, 0x61, 0x73, 0x6d]);
	});

	it("rejects theme manifests and non-wasm runtimes", () => {
		const theme = parseFunctionPluginPackage({
			packageVersion: 0,
			manifest: {
				id: "example.theme",
				kind: "theme",
				name: "Theme",
				version: "1.0.0",
				themeApiVersion: 0,
				runtime: "none",
				appearance: "dark",
				tokens: "tokens.json",
			},
			wasm: wasmBase64,
		});
		expect(theme.ok).toBe(false);
		const builtin = parseFunctionPluginPackage({
			packageVersion: 0,
			manifest: { ...manifest, runtime: "builtin", entry: "internal" },
			wasm: wasmBase64,
		});
		expect(builtin.ok).toBe(false);
	});

	it("rejects invalid base64 and missing fields", () => {
		expect(
			parseFunctionPluginPackage({
				packageVersion: 0,
				manifest,
				wasm: "not base64!!",
			}).ok,
		).toBe(false);
		expect(
			parseFunctionPluginPackage({ packageVersion: 0, manifest }).ok,
		).toBe(false);
	});
});

describe("parseCommandOutcome", () => {
	it("accepts done and showForm outcomes", () => {
		expect(parseCommandOutcome({ kind: "done", value: 42 }).ok).toBe(true);
		expect(
			parseCommandOutcome({
				kind: "showForm",
				schema: {
					title: "Pick",
					fields: [{ kind: "text", key: "name", label: "Name" }],
				},
				state: { step: 1 },
			}).ok,
		).toBe(true);
	});

	it("runs the semantic form validation on showForm outcomes", () => {
		const result = parseCommandOutcome({
			kind: "showForm",
			schema: {
				title: "Bad",
				fields: [
					{ kind: "text", key: "dup", label: "A" },
					{ kind: "text", key: "dup", label: "B" },
				],
			},
		});
		expect(result.ok).toBe(false);
	});

	it("rejects unknown outcome kinds", () => {
		expect(parseCommandOutcome({ kind: "renderHtml", html: "<b>" }).ok).toBe(
			false,
		);
	});
});

describe("parseFormResult", () => {
	it("validates both result shapes", () => {
		expect(
			parseFormResult({ submitted: true, values: { a: 1, b: "x" } }).ok,
		).toBe(true);
		expect(parseFormResult({ submitted: false }).ok).toBe(true);
		expect(parseFormResult({ submitted: true }).ok).toBe(false);
		expect(
			parseFormResult({ submitted: true, values: { a: { nested: 1 } } }).ok,
		).toBe(false);
	});
});
