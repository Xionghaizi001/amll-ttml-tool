import { beforeEach, describe, expect, it, vi } from "vitest";
import { githubFetch } from "$/modules/github/api";
import { savePullRequestLabels } from "./label-services";

vi.mock("$/modules/github/api", () => ({ githubFetch: vi.fn() }));
const options = {
	token: " test-token ",
	repoOwner: "amll-dev",
	repoName: "amll-ttml-db",
	prNumber: 10740,
	original: ["旧标签", "保留"],
	selected: ["保留", "新标签", "语言：汉语"],
};
const response = (names: string[]) =>
	new Response(
		JSON.stringify(names.map((name) => ({ name, color: "ffffff" }))),
	);
beforeEach(() => vi.mocked(githubFetch).mockReset());
describe("savePullRequestLabels", () => {
	it("batches additions and removals, preserving concurrent additions and removals", async () => {
		vi.mocked(githubFetch)
			.mockResolvedValueOnce(response(["旧标签", "他人添加"]))
			.mockResolvedValueOnce(response(["他人添加", "新标签", "语言：汉语"]));
		const result = await savePullRequestLabels(options);
		expect(result.map((label) => label.name)).toEqual([
			"他人添加",
			"新标签",
			"语言：汉语",
		]);
		expect(githubFetch).toHaveBeenCalledTimes(2);
		expect(githubFetch).toHaveBeenLastCalledWith(
			"/repos/amll-dev/amll-ttml-db/issues/10740/labels",
			{
				init: {
					method: "PUT",
					headers: {
						Accept: "application/vnd.github+json",
						Authorization: "Bearer test-token",
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						labels: ["他人添加", "新标签", "语言：汉语"],
					}),
				},
			},
		);
	});
	it("supports clearing all selected labels", async () => {
		vi.mocked(githubFetch)
			.mockResolvedValueOnce(response(options.original))
			.mockResolvedValueOnce(response([]));
		await expect(
			savePullRequestLabels({ ...options, selected: [] }),
		).resolves.toEqual([]);
		expect(
			JSON.parse(vi.mocked(githubFetch).mock.calls[1][1]?.init?.body as string),
		).toEqual({ labels: [] });
	});
	it("does not overwrite labels if reading the current labels fails", async () => {
		vi.mocked(githubFetch).mockResolvedValueOnce(
			new Response(null, { status: 503 }),
		);
		await expect(savePullRequestLabels(options)).rejects.toThrow("HTTP 503");
		expect(githubFetch).toHaveBeenCalledTimes(1);
	});
	it("reports write failures", async () => {
		vi.mocked(githubFetch)
			.mockResolvedValueOnce(response(options.original))
			.mockResolvedValueOnce(new Response(null, { status: 403 }));
		await expect(savePullRequestLabels(options)).rejects.toThrow("HTTP 403");
	});
	it("rejects missing authentication before sending requests", async () => {
		await expect(
			savePullRequestLabels({ ...options, token: " " }),
		).rejects.toThrow("请先登录 GitHub");
		expect(githubFetch).not.toHaveBeenCalled();
	});
});
