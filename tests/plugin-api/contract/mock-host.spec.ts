import type { PluginDocumentV0 } from "@amll-ttml-tool/plugin-api";
import { MockPluginHost, runHostContractTests } from "@amll-ttml-tool/plugin-api/testing";

const createDocument = (): PluginDocumentV0 => ({
	revision: 0,
	metadata: [{ key: "title", values: ["Contract"] }],
	lines: [
		{
			id: "line-1",
			translation: "before",
			romanization: "",
			isBackground: false,
			isDuet: false,
			startTime: 0,
			endTime: 1000,
			ignoreSync: false,
			words: [
				{
					id: "word-1",
					text: "hello",
					startTime: 0,
					endTime: 1000,
					emptyBeat: 0,
					romanText: "",
				},
			],
		},
	],
});

runHostContractTests(
	() =>
		new MockPluginHost({
			document: createDocument(),
			capabilities: ["lyrics.core"],
		}),
);
