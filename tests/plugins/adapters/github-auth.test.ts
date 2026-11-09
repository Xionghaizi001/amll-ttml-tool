import { describe, expect, it, vi } from "vitest";
import { createGithubAuth } from "$/plugins/adapters/github-auth";

function fixture() {
	const values = new Map<string, string>();
	const storage = {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value);
		},
		removeItem: (key: string) => {
			values.delete(key);
		},
	};
	const fetch = vi
		.fn<typeof globalThis.fetch>()
		.mockImplementation(async () =>
			Response.json({ login: "tester", id: 7, token: "never expose" }),
		);
	const controller = new AbortController();
	let offline = false;
	const ports = { storage, fetch, isOffline: () => offline };
	return {
		auth: createGithubAuth(ports, controller.signal),
		ports,
		values,
		fetch,
		controller,
		offline: () => {
			offline = true;
		},
	};
}

describe("GitHub credential bridge", () => {
	it("validates, persists, restores and returns only identity fields", async () => {
		const f = fixture();
		expect(await f.auth.getIdentity()).toEqual({ status: "missing-token" });
		expect(await f.auth.authenticate(" ghp_test ")).toEqual({
			status: "ok",
			profile: { login: "tester", id: 7 },
		});
		expect([...f.values.values()]).toEqual(["ghp_test"]);
		expect(
			await createGithubAuth(
				f.ports,
				new AbortController().signal,
			).getIdentity(),
		).toEqual({ status: "ok", profile: { login: "tester", id: 7 } });
		f.auth.logout();
		expect(f.values.size).toBe(0);
		expect(await f.auth.getIdentity()).toEqual({ status: "missing-token" });
	});
	it.each([
		[401, "invalid-token"],
		[403, "user-error"],
		[429, "user-error"],
	])(
		"handles HTTP %s without replacing the saved PAT",
		async (status, expected) => {
			const f = fixture();
			await f.auth.authenticate("old");
			f.fetch.mockResolvedValue(new Response("no", { status: Number(status) }));
			expect((await f.auth.authenticate("new")).status).toBe(expected);
			expect([...f.values.values()]).toEqual(["old"]);
		},
	);
	it("rejects malformed identity, malformed tokens, offline requests and storage failure", async () => {
		const f = fixture();
		expect((await f.auth.authenticate("bad\nheader")).status).toBe(
			"invalid-token",
		);
		expect(f.fetch).not.toHaveBeenCalled();
		f.fetch.mockResolvedValue(Response.json({ login: "tester", id: "7" }));
		expect((await f.auth.authenticate("token")).status).toBe("user-missing");
		f.fetch.mockImplementation(async () =>
			Response.json({ login: "tester", id: 7 }),
		);
		f.ports.storage.setItem = () => {
			throw new Error("quota");
		};
		await expect(f.auth.authenticate("token")).rejects.toThrow("quota");
		f.offline();
		expect((await f.auth.authenticate("token")).status).toBe("network-error");
	});
	it("POST attaches the saved credential only to GitHub, with no cookies, redirects or retries", async () => {
		const f = fixture();
		await f.auth.authenticate("ghp_test");
		f.fetch.mockResolvedValue(new Response("denied", { status: 403 }));
		const result = await f.auth.post("/repos/owner/repo/issues", {
			title: "歌词",
		});
		expect(result).toMatchObject({
			ok: true,
			value: { ok: false, status: 403, body: "denied" },
		});
		expect(f.fetch).toHaveBeenLastCalledWith(
			"https://api.github.com/repos/owner/repo/issues",
			expect.objectContaining({
				method: "POST",
				credentials: "omit",
				redirect: "error",
				headers: expect.objectContaining({ Authorization: "Bearer ghp_test" }),
				body: '{"title":"歌词"}',
			}),
		);
		expect(f.fetch).toHaveBeenCalledTimes(2);
		for (const path of [
			"https://evil.test",
			"//evil.test",
			"/../user",
			"/%2f%2fevil.test",
			"/user?x=1",
			"/user#x",
			"/\\evil.test",
		]) {
			expect(await f.auth.post(path, {})).toMatchObject({
				ok: false,
				error: { code: "invalid-params" },
			});
		}
		expect(await f.auth.post("/test", "中".repeat(400000))).toMatchObject({
			ok: false,
		});
		expect(f.fetch).toHaveBeenCalledTimes(2);
	});
	it.each(["logout", "unload"])(
		"%s cancels pending authentication and prevents saving",
		async (action) => {
			const f = fixture();
			let finish!: (response: Response) => void;
			f.fetch.mockImplementation(
				() =>
					new Promise((resolve) => {
						finish = resolve;
					}),
			);
			const pending = f.auth.authenticate("token");
			if (action === "logout") f.auth.logout();
			else f.controller.abort();
			finish(Response.json({ login: "tester", id: 7 }));
			expect(await pending).toEqual({ status: "cancelled" });
			expect(f.values.size).toBe(0);
		},
	);
});
