import { describe, expect, it } from "vitest";
import {
	createJsonPayload,
	summarizeDurations,
} from "$/plugins/ui/plugin-runtime-benchmark.ts";

describe("plugin runtime benchmark helpers", () => {
	it("calculates nearest-rank latency percentiles", () => {
		expect(summarizeDurations([4, 1, 3, 2])).toEqual({
			count: 4,
			meanMs: 2.5,
			p50Ms: 2,
			p95Ms: 4,
			maxMs: 4,
		});
	});

	it("creates an exact-size ASCII JSON document", () => {
		const document = createJsonPayload(1024);
		expect(new TextEncoder().encode(JSON.stringify(document))).toHaveLength(
			1024,
		);
	});
});
