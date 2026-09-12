import type { PluginDocumentV0 } from "@amll-ttml-tool/plugin-api";
import { runHostContractTests } from "@amll-ttml-tool/plugin-api/testing";
import {
	createTrustedJsHostUnderTest,
	MockTrustedJsHost,
} from "@amll-ttml-tool/plugin-sdk-js/testing";

const fixture = (): PluginDocumentV0 => ({
	revision: 0,
	lines: [
		{
			id: "line-1",
			words: [
				{
					id: "word-1",
					text: "hello",
					startTime: 0,
					endTime: 100,
					emptyBeat: 0,
					romanText: "",
				},
			],
			translation: "before",
			romanization: "",
			isBackground: false,
			isDuet: false,
			startTime: 0,
			endTime: 100,
			ignoreSync: false,
		},
	],
	metadata: [{ key: "title", values: ["Contract"] }],
});

/** The SDK mock host under the protocol contract, via the HostCallV0 adapter. */
runHostContractTests(() => {
	const host = new MockTrustedJsHost({
		pluginId: "contract.mock",
		document: fixture(),
	});
	return createTrustedJsHostUnderTest(host, { undo: () => host.undo() });
});
