import { expect, it, vi } from "vitest";
import { createRealTrustedHost } from "./real-host-fixture";

it("exposes provider commands through the real registry and removes them on disable", async () => {
	const identity = {
		status: "ok" as const,
		profile: { login: "tester", id: 7 },
	};
	const getIdentity = vi.fn(async () => identity);
	const provider = createRealTrustedHost({
		pluginId: "github.auth",
		ports: {
			createGithub: () => ({
				getIdentity,
				authenticate: getIdentity,
				logout: () => {},
				post: async () => ({
					ok: false,
					error: { code: "network-unavailable", message: "offline" },
				}),
			}),
		},
	});
	provider.host.commands.register({
		id: "github.auth.getIdentity",
		handler: () => provider.host.github.getIdentity(),
	});
	const consumer = createRealTrustedHost({
		pluginId: "test.consumer",
		ports: {
			executeCommand: (id, args) => provider.commands.execute(id, args),
		},
	});
	expect(
		await consumer.host.commands.execute("github.auth.getIdentity"),
	).toEqual(identity);
	expect(() => consumer.host.github.getIdentity()).toThrow("provider commands");
	provider.handle.dispose();
	provider.scope.dispose();
	await expect(
		consumer.host.commands.execute("github.auth.getIdentity"),
	).rejects.toThrow("not registered");
	consumer.handle.dispose();
	await expect(
		consumer.host.commands.execute("github.auth.getIdentity"),
	).rejects.toThrow("disposed");
});
