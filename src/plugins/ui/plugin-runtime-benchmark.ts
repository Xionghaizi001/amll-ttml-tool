export interface DurationSummary {
	count: number;
	meanMs: number;
	p50Ms: number;
	p95Ms: number;
	maxMs: number;
}

function percentile(
	sortedSamples: readonly number[],
	fraction: number,
): number {
	const index = Math.max(
		0,
		Math.min(
			sortedSamples.length - 1,
			Math.ceil(sortedSamples.length * fraction) - 1,
		),
	);
	return sortedSamples[index];
}

export function summarizeDurations(
	samples: readonly number[],
): DurationSummary {
	if (samples.length === 0) {
		throw new Error("At least one duration sample is required");
	}
	const sortedSamples = [...samples].sort((left, right) => left - right);
	return {
		count: samples.length,
		meanMs: samples.reduce((sum, sample) => sum + sample, 0) / samples.length,
		p50Ms: percentile(sortedSamples, 0.5),
		p95Ms: percentile(sortedSamples, 0.95),
		maxMs: sortedSamples.at(-1) ?? 0,
	};
}

export function createJsonPayload(targetBytes: number): { payload: string } {
	const encoder = new TextEncoder();
	const emptyDocument = JSON.stringify({ payload: "" });
	const envelopeBytes = encoder.encode(emptyDocument).byteLength;
	if (targetBytes < envelopeBytes) {
		throw new Error(`Target size must be at least ${envelopeBytes} bytes`);
	}

	const document = { payload: "x".repeat(targetBytes - envelopeBytes) };
	const actualBytes = encoder.encode(JSON.stringify(document)).byteLength;
	if (actualBytes !== targetBytes) {
		throw new Error(
			`Failed to create ${targetBytes} byte JSON payload (got ${actualBytes})`,
		);
	}
	return document;
}
