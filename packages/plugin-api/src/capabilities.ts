import type { Capability, CoreCapability } from "./types";

export const ALL_CAPABILITIES = [
	"lyrics.core",
	"lyrics.ruby",
	"lyrics.format",
	"ui.notify",
	"ui.form",
	"storage.kv",
	"network.http",
] as const satisfies readonly CoreCapability[];

/**
 * Capabilities the extism-wasm host actually serves. `network.http` is a
 * protocol capability every tier names identically, but the WASM turn host
 * has no network bridge by design, so negotiation for that tier must use
 * this narrower set and reject the request instead of silently granting it.
 */
export const EXTISM_WASM_HOST_CAPABILITIES = ALL_CAPABILITIES.filter(
	(capability) => capability !== "network.http",
) as readonly Exclude<(typeof ALL_CAPABILITIES)[number], "network.http">[];

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
