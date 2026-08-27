import type { Capability, CoreCapability } from "./types";

export const ALL_CAPABILITIES = [
	"lyrics.core",
	"lyrics.ruby",
	"lyrics.format",
	"ui.notify",
	"ui.form",
	"storage.kv",
] as const satisfies readonly CoreCapability[];

const capabilitySet = new Set<string>(ALL_CAPABILITIES);
const extensionCapabilityPattern =
	/^extensions\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+\.[a-z][a-z0-9-]*$/;

export const isCapability = (value: string): value is Capability =>
	capabilitySet.has(value) || extensionCapabilityPattern.test(value);

export interface CapabilityNegotiation {
	granted: Capability[];
	rejected: string[];
}

export function negotiateCapabilities(
	requested: readonly string[],
	hostSupported: readonly Capability[] = ALL_CAPABILITIES,
): CapabilityNegotiation {
	const supported = new Set(hostSupported);
	const granted: Capability[] = [];
	const rejected: string[] = [];
	for (const capability of new Set(requested)) {
		if (isCapability(capability) && supported.has(capability)) {
			granted.push(capability);
		} else {
			rejected.push(capability);
		}
	}
	return { granted, rejected };
}
