import { parseThemePackage } from "@amll-ttml-tool/plugin-api";
import { describe, expect, it } from "vitest";
import { BUILTIN_THEME_PACKAGES } from "$/plugins/builtin/themes/index";

describe("built-in theme packages", () => {
	it("all pass full theme package validation", () => {
		expect(BUILTIN_THEME_PACKAGES.length).toBeGreaterThan(0);
		for (const themePackage of BUILTIN_THEME_PACKAGES) {
			const result = parseThemePackage(themePackage);
			expect(result.ok, JSON.stringify(result)).toBe(true);
		}
	});
});
