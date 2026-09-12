import { runHostContractTests } from "@amll-ttml-tool/plugin-api/testing";
import { createTrustedJsHostUnderTest } from "@amll-ttml-tool/plugin-sdk-js/testing";
import { createRealTrustedHost } from "./real-host-fixture";

/**
 * Third contract implementation: the real trusted-js host (SDK surface over
 * EditorDocumentService + PluginDocumentGateway + ExtensionRegistry) answers
 * the same protocol suite as MockPluginHost, the WASM real host and the SDK
 * mock. All four passing identically is the v1-freeze gate for the tier.
 */
runHostContractTests(() => {
	const fixture = createRealTrustedHost({ pluginId: "contract.trusted" });
	return createTrustedJsHostUnderTest(fixture.host, {
		undo: () => fixture.service.undo() !== undefined,
	});
});
