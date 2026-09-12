import { describe, expect, it } from "vitest";
import { validate } from "@amll-ttml-tool/plugin-api/json-schema";
import {
	functionManifestSchema,
	lyricsApplyEditParamsSchema,
	notifyParamsSchema,
	themeManifestSchema,
	themeTokensSchema,
} from "@amll-ttml-tool/plugin-api/schema/schemas";
import { validateThemeTokens } from "@amll-ttml-tool/plugin-api/theme-tokens";

const validFunctionManifest = {
	kind: "function",
	id: "dev.amll.time-shift",
	name: "Time Shift",
	version: "1.0.0",
	apiVersion: 0,
	runtime: "builtin",
	entry: "time-shift",
	capabilities: ["lyrics.core"],
};

describe("JSON Schema subset validator", () => {
	it("validates a function manifest", () => {
		expect(validate(functionManifestSchema, validFunctionManifest).ok).toBe(
			true,
		);
	});

	it("rejects unexpected properties", () => {
		const result = validate(functionManifestSchema, {
			...validFunctionManifest,
			sneaky: true,
		});
		expect(result.ok).toBe(false);
	});

	it("rejects a wrong const", () => {
		const result = validate(functionManifestSchema, {
			...validFunctionManifest,
			apiVersion: 7,
		});
		expect(result.ok).toBe(false);
	});

	it("validates a theme manifest", () => {
		expect(
			validate(themeManifestSchema, {
				kind: "theme",
				id: "dev.amll.theme",
				name: "Theme",
				version: "1.0.0",
				themeApiVersion: 0,
				runtime: "none",
				appearance: "both",
				tokens: "tokens.json",
			}).ok,
		).toBe(true);
	});

	it("validates applyEdit params with document ops", () => {
		const result = validate(lyricsApplyEditParamsSchema, {
			expectedRevision: 3,
			label: "Time shift",
			ops: [
				{ op: "updateLine", lineId: "line-1", patch: { startTime: 100 } },
				{
					op: "insertWord",
					lineId: "line-1",
					afterWordId: null,
					word: {
						text: "a",
						startTime: 0,
						endTime: 10,
						emptyBeat: 0,
						romanText: "",
					},
				},
				{ op: "setMetadata", entries: [{ key: "title", values: ["T"] }] },
			],
		});
		expect(result.ok).toBe(true);
	});

	it("rejects an unknown document op", () => {
		const result = validate(lyricsApplyEditParamsSchema, {
			expectedRevision: 0,
			label: "x",
			ops: [{ op: "dropDatabase" }],
		});
		expect(result.ok).toBe(false);
	});

	it("rejects negative timestamps", () => {
		const result = validate(lyricsApplyEditParamsSchema, {
			expectedRevision: 0,
			label: "x",
			ops: [{ op: "updateLine", lineId: "l", patch: { startTime: -5 } }],
		});
		expect(result.ok).toBe(false);
	});

	it("validates notify params and rejects extra fields", () => {
		expect(
			validate(notifyParamsSchema, { level: "info", message: "hi" }).ok,
		).toBe(true);
		expect(
			validate(notifyParamsSchema, {
				level: "info",
				message: "hi",
				html: "<b>",
			}).ok,
		).toBe(false);
	});

	it("reports paths for nested issues", () => {
		const result = validate(themeTokensSchema, {
			tokenVersion: 0,
			font: { scale: "big" },
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.issues.some((issue) => issue.path === "/font/scale")).toBe(
				true,
			);
		}
	});
});

describe("validateThemeTokens", () => {
	it("accepts safe color and length values", () => {
		const result = validateThemeTokens({
			tokenVersion: 0,
			color: {
				textPrimary: "#ff0000",
				panelBackground: "rgb(12, 34, 56)",
				accent: "rgba(1, 2, 3, 0.5)",
				border: "oklch(0.7 0.1 200)",
			},
			spacing: { radius: "8px", scale: 1 },
		});
		expect(result.ok).toBe(true);
	});

	it("rejects url() and remote references", () => {
		const result = validateThemeTokens({
			tokenVersion: 0,
			color: { accent: "url(https://evil.example/x.png)" },
		});
		expect(result.ok).toBe(false);
	});

	it("rejects var() indirection", () => {
		const result = validateThemeTokens({
			tokenVersion: 0,
			color: { accent: "var(--steal)" },
		});
		expect(result.ok).toBe(false);
	});

	it("rejects expression() and @import", () => {
		expect(
			validateThemeTokens({
				tokenVersion: 0,
				color: { accent: "expression(alert(1))" },
			}).ok,
		).toBe(false);
	});

	it("rejects a wrong tokenVersion", () => {
		expect(validateThemeTokens({ tokenVersion: 1, color: {} }).ok).toBe(false);
	});
});
