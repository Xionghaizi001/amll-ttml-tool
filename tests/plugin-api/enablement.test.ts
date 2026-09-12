import { describe, expect, it } from "vitest";
import { evaluateEnablement, parseEnablement } from "@amll-ttml-tool/plugin-api/enablement";

const ctx = {
	mode: "edit",
	hasSelection: true,
	hasLineSelection: true,
	hasWordSelection: false,
	documentEmpty: false,
	audioLoaded: true,
	canUndo: true,
	canRedo: false,
};

describe("parseEnablement", () => {
	it("parses a bare identifier", () => {
		const { ast, unknownIdents } = parseEnablement("hasSelection");
		expect(unknownIdents).toEqual([]);
		expect(evaluateEnablement(ast, ctx, unknownIdents)).toBe(true);
	});

	it("parses negation", () => {
		const { ast } = parseEnablement("!hasSelection");
		expect(evaluateEnablement(ast, ctx)).toBe(false);
	});

	it("parses and/or with precedence", () => {
		const { ast } = parseEnablement("hasSelection && audioLoaded || canRedo");
		// (hasSelection && audioLoaded) || canRedo = true
		expect(evaluateEnablement(ast, ctx)).toBe(true);
	});

	it("parses parentheses", () => {
		const { ast } = parseEnablement("hasSelection && (canRedo || audioLoaded)");
		expect(evaluateEnablement(ast, ctx)).toBe(true);
	});

	it("parses comparisons against strings, booleans and numbers", () => {
		expect(evaluateEnablement(parseEnablement("mode == 'edit'").ast, ctx)).toBe(
			true,
		);
		expect(evaluateEnablement(parseEnablement("mode == 'sync'").ast, ctx)).toBe(
			false,
		);
		expect(evaluateEnablement(parseEnablement("mode != 'sync'").ast, ctx)).toBe(
			true,
		);
		expect(
			evaluateEnablement(parseEnablement("audioLoaded == true").ast, ctx),
		).toBe(true);
		expect(
			evaluateEnablement(parseEnablement("canRedo == false").ast, ctx),
		).toBe(true);
	});

	it("returns true for empty expressions", () => {
		const { ast } = parseEnablement(undefined);
		expect(evaluateEnablement(ast, ctx)).toBe(true);
		const { ast: blank } = parseEnablement("   ");
		expect(evaluateEnablement(blank, ctx)).toBe(true);
	});

	it("rejects malformed expressions", () => {
		expect(() => parseEnablement("hasSelection &&")).toThrow();
		expect(() => parseEnablement("(hasSelection")).toThrow();
		expect(() => parseEnablement("1mode")).toThrow();
		expect(() => parseEnablement("mode ==")).toThrow();
		expect(() => parseEnablement("hasSelection ||| audioLoaded")).toThrow();
	});

	it("collects unknown identifiers and evaluates to false", () => {
		const { ast, unknownIdents } = parseEnablement(
			"totallyFakeKey && hasSelection",
		);
		expect(unknownIdents).toEqual(["totallyFakeKey"]);
		expect(evaluateEnablement(ast, ctx, unknownIdents)).toBe(false);
	});

	it("treats unknown identifiers in a dead branch as still failing", () => {
		const { ast, unknownIdents } = parseEnablement("canRedo || fakeKey");
		expect(unknownIdents).toEqual(["fakeKey"]);
		expect(evaluateEnablement(ast, ctx, unknownIdents)).toBe(false);
	});

	it("undefined context value is falsy but != false literal", () => {
		expect(evaluateEnablement(parseEnablement("canRedo").ast, ctx)).toBe(false);
		expect(
			evaluateEnablement(parseEnablement("canRedo == false").ast, ctx),
		).toBe(true);
	});

	it("compares namespaced dynamic mode ids and fails closed on unknown ones", () => {
		const reviewCtx = { ...ctx, mode: "builtin.review.review" };
		expect(
			evaluateEnablement(
				parseEnablement("mode == 'builtin.review.review'").ast,
				reviewCtx,
			),
		).toBe(true);
		// A mode literal that is not the active mode (e.g. its plugin was
		// disabled and the host fell back to edit) simply evaluates false.
		expect(
			evaluateEnablement(
				parseEnablement("mode == 'builtin.review.review'").ast,
				ctx,
			),
		).toBe(false);
	});
});
