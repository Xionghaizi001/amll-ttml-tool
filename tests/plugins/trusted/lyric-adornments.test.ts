import { expect, it } from "vitest";
import { createRealTrustedHost } from "./real-host-fixture";
import { extensionRegistry } from "$/plugins/adapters/extension-host";

it("registers and disposes lyric adornments through the public SDK", () => {
	const fixture = createRealTrustedHost({ pluginId: "test.linter" });
	for (const kind of ["line-adornment", "word-adornment"] as const) {
		fixture.host.views.registerView({
			id: `test.linter.${kind}`,
			kind,
			title: "Lint",
			view: () => null,
		});
		expect(fixture.extensions.contributions.getTrustedViews(kind)).toHaveLength(
			1,
		);
	}
	fixture.handle.dispose();
	fixture.scope.dispose();
	for (const kind of ["line-adornment", "word-adornment"] as const)
		expect(fixture.extensions.contributions.getTrustedViews(kind)).toHaveLength(
			0,
		);
});

it.each(["line-adornment", "word-adornment"] as const)(
	"rejects untrusted %s contributions",
	(kind) => {
		const scope = extensionRegistry.createScope({
			kind: "plugin",
			pluginId: "test.untrusted",
			runtime: "trusted-js",
			trusted: false,
		});
		expect(() =>
			scope.registerTrustedView({
				id: "test.untrusted.badge",
				kind,
				title: "Lint",
				view: () => null,
			}),
		).toThrow("trusted view");
		scope.dispose();
	},
);
