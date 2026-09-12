import { FORM_FLUENT_ICON_NAMES_V0 } from "@amll-ttml-tool/plugin-api";
import { describe, expect, it } from "vitest";
import { FLUENT_FORM_ICONS } from "$/plugins/ui/fluent-form-icons";

describe("declarative form Fluent icon registry", () => {
	it("implements every icon exposed by the public protocol", () => {
		expect(Object.keys(FLUENT_FORM_ICONS).sort()).toEqual(
			[...FORM_FLUENT_ICON_NAMES_V0].sort(),
		);
	});
});
