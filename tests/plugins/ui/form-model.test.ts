import { describe, expect, it } from "vitest";
import {
	clampFormNumber,
	collectFormDefaultValues,
	isFormValid,
	matchesFormCondition,
	sanitizeFormValues,
} from "$/plugins/ui/form-model";

describe("declarative form model", () => {
	it("collects nested defaults and evaluates conditional groups", () => {
		const values = collectFormDefaultValues([
			{
				kind: "radio",
				key: "scope",
				label: "Scope",
				default: "custom",
				options: [{ value: "custom", label: "Custom" }],
			},
			{
				kind: "group",
				id: "range",
				visibleWhen: { field: "scope", equals: "custom" },
				fields: [
					{ kind: "number", key: "start", label: "Start", default: 1 },
					{ kind: "number", key: "end", label: "End", default: 4 },
				],
			},
		]);
		expect(values).toEqual({ scope: "custom", start: 1, end: 4 });
		expect(
			matchesFormCondition({ field: "scope", equals: "custom" }, values),
		).toBe(true);
		expect(clampFormNumber(-50, 0)).toBe(0);
	});

	it("sanitizes submitted values back to schema types and constraints", () => {
		const fields = [
			{
				kind: "number",
				key: "amount",
				label: "Amount",
				default: 100,
				min: 0,
				max: 500,
			},
			{
				kind: "text",
				key: "label",
				label: "Label",
				maxLength: 4,
			},
			{
				kind: "radio",
				key: "scope",
				label: "Scope",
				default: "all",
				options: [
					{ value: "all", label: "All" },
					{ value: "locked", label: "Locked", disabled: true },
				],
			},
			{ kind: "boolean", key: "flag", label: "Flag" },
		] as const;
		expect(
			sanitizeFormValues(fields, {
				amount: Number.NaN,
				label: "overflowing",
				scope: "locked",
				flag: 1 as unknown as boolean,
				injected: "dropped",
			}),
		).toEqual({ amount: 100, label: "over", scope: "all", flag: true });
		expect(sanitizeFormValues(fields, { amount: 9999 }).amount).toBe(500);
	});

	it("blocks submission while a visible field violates its constraints", () => {
		const fields = [
			{ kind: "text", key: "name", label: "Name", required: true },
			{
				kind: "group",
				id: "range",
				visibleWhen: { field: "name", equals: "custom" },
				fields: [
					{ kind: "number", key: "start", label: "Start", min: 1, default: 1 },
				],
			},
		] as const;
		expect(isFormValid(fields, { name: "", start: 1 })).toBe(false);
		expect(isFormValid(fields, { name: "ok", start: 0 })).toBe(true);
		expect(isFormValid(fields, { name: "custom", start: 0 })).toBe(false);
		expect(isFormValid(fields, { name: "custom", start: 2 })).toBe(true);
	});
});
