import { describe, expect, it } from "vitest";
import { TrustedJsStateStorage } from "$/plugins/trusted/trusted-js-state-storage";

describe("durable trusted-js state", () => {
	it("propagates unavailable storage instead of inventing enabled/consented state", () => {
		const port = new TrustedJsStateStorage(() => {
			throw new Error("SecurityError");
		});
		expect(() => port.get("test.plugin")).toThrow("SecurityError");
		expect(() =>
			port.set("test.plugin", { crashes: 0, pending: false }),
		).toThrow("SecurityError");
		expect(() => port.remove("test.plugin")).toThrow("SecurityError");
	});
	it("failed writes and removals preserve the previous durable snapshot", () => {
		let raw: string | null = null;
		let fail = false;
		const port = new TrustedJsStateStorage(() => ({
			getItem: () => raw,
			setItem: (_key, value) => {
				if (fail) throw new Error("QuotaExceededError");
				raw = value;
			},
		}));
		const state = {
			crashes: 0,
			pending: false,
			consented: true,
			consentKey: "digest",
			disabled: true,
		};
		port.set("test.plugin", state);
		fail = true;
		expect(() =>
			port.set("test.plugin", { ...state, disabled: false }),
		).toThrow("QuotaExceededError");
		expect(() => port.remove("test.plugin")).toThrow("QuotaExceededError");
		expect(port.get("test.plugin")).toEqual(state);
		fail = false;
		port.remove("test.plugin");
		expect(port.get("test.plugin")).toBeNull();
	});
});
