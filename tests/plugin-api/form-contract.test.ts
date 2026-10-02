import { describe, expect, it } from "vitest";
import {
	parseFormSchema,
	parseManifest,
	parseRemotePluginCatalog,
	validateThemeCss,
} from "@amll-ttml-tool/plugin-api";

const field = {
	kind: "number",
	key: "offset",
	label: "Offset",
	default: 0,
	min: -5000,
	max: 5000,
};
const icon = { source: "@fluentui/react-icons", name: "ClockRegular" };

describe("trimmed form contract", () => {
	it.each([
		{ animation: { preset: "fade" } },
		{ icon },
		{ submitIcon: icon },
		{ cancelIcon: icon },
	])("rejects retired dialog presentation %j", (presentation) => {
		expect(
			parseFormSchema({ title: "Offset", fields: [field], ...presentation }).ok,
		).toBe(false);
	});
	it.each([
		{ icon },
		{ animation: { preset: "fade" } },
		{ width: "compact" },
		{ control: "stepper" },
		{ incrementIcon: icon },
		{ decrementIcon: icon },
	])("rejects retired field presentation %j", (presentation) => {
		expect(
			parseFormSchema({
				title: "Offset",
				fields: [{ ...field, ...presentation }],
			}).ok,
		).toBe(false);
	});
	it.each([
		{ direction: "row" },
		{ indent: true },
		{ icon },
		{ animation: { preset: "fade" } },
	])("rejects retired group presentation %j", (presentation) => {
		expect(
			parseFormSchema({
				title: "Offset",
				fields: [
					{ kind: "group", id: "parameters", fields: [field], ...presentation },
				],
			}).ok,
		).toBe(false);
	});
	it("retains nested groups, notes, conditions and footer actions", () => {
		expect(
			parseFormSchema({
				title: "Offset",
				size: "medium",
				fields: [
					{
						kind: "boolean",
						key: "advanced",
						label: "Advanced",
						default: true,
					},
					{
						kind: "group",
						id: "outer",
						fields: [
							{
								kind: "group",
								id: "inner",
								visibleWhen: { field: "advanced", equals: true },
								fields: [field],
							},
							{ kind: "note", text: "Timing" },
						],
					},
				],
				actions: [
					{ id: "apply", label: "Apply" },
					{ id: "cancel", label: "Cancel", role: "cancel" },
				],
			}).ok,
		).toBe(true);
	});
	it("continues checking field uniqueness and condition types", () => {
		expect(
			parseFormSchema({ title: "Offset", fields: [field, field] }).ok,
		).toBe(false);
		expect(
			parseFormSchema({
				title: "Offset",
				fields: [{ ...field, visibleWhen: { field: "offset", equals: "0" } }],
			}).ok,
		).toBe(false);
	});
	it("exposes form theme hooks", () => {
		expect(
			validateThemeCss(
				'[data-slot="plugin-form"] [data-part="form-field"] { color: red; }',
			).ok,
		).toBe(true);
	});
});

describe("function runtime contract", () => {
	it("rejects the retired runtime and catalog channel", () => {
		const retired = ["extism", "wasm"].join("-");
		expect(
			parseManifest({
				kind: "function",
				id: "test.retired",
				name: "Retired",
				version: "1.0.0",
				apiVersion: 0,
				runtime: retired,
				entry: "plugin.wasm",
				capabilities: [],
			}).ok,
		).toBe(false);
		expect(
			parseRemotePluginCatalog({
				catalogVersion: 0,
				plugins: [
					{
						id: "test.retired",
						name: "Retired",
						version: "1.0.0",
						channel: retired,
						apiVersion: 0,
						entry: "plugin.zip",
					},
				],
			}).ok,
		).toBe(false);
	});
});
