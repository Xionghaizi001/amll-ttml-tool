import { describe, expect, it, vi } from "vitest";
import { CommandRegistry } from "$/kernel/commands/CommandRegistry";

describe("CommandRegistry", () => {
	it("registers handler, enablement, source and cleanup as one unit", async () => {
		const registry = new CommandRegistry();
		const handler = vi.fn((args) => args);
		let enabled = true;
		const disposable = registry.register({
			id: "builtin.test",
			handler,
			enablement: () => enabled,
			source: { kind: "builtin", id: "test" },
		});

		expect(registry.get("builtin.test")).toMatchObject({
			id: "builtin.test",
			enabled: true,
			source: { kind: "builtin", id: "test" },
		});
		await expect(
			registry.execute("builtin.test", { value: 1 }),
		).resolves.toEqual({ value: 1 });
		enabled = false;
		await expect(registry.execute("builtin.test")).rejects.toThrow("disabled");

		disposable.dispose();
		expect(registry.get("builtin.test")).toBeUndefined();
	});

	it("rejects ambiguous duplicate ownership", () => {
		const registry = new CommandRegistry();
		registry.register({
			id: "example.command",
			handler: () => undefined,
			source: { kind: "plugin", pluginId: "example.first" },
		});
		expect(() =>
			registry.register({
				id: "example.command",
				handler: () => undefined,
				source: { kind: "plugin", pluginId: "example.second" },
			}),
		).toThrow("already registered");
	});

	it("does not run a handler whose registration was replaced re-entrantly", async () => {
		const registry = new CommandRegistry();
		const staleHandler = vi.fn();
		const disposable = registry.register({
			id: "example.reentrant",
			handler: staleHandler,
			enablement: () => {
				disposable.dispose();
				registry.register({
					id: "example.reentrant",
					handler: () => "fresh",
					source: { kind: "plugin", pluginId: "example.other" },
				});
				return true;
			},
			source: { kind: "plugin", pluginId: "example.stale" },
		});
		await expect(registry.execute("example.reentrant")).rejects.toThrow(
			"unregistered during execution",
		);
		expect(staleHandler).not.toHaveBeenCalled();
	});
});
