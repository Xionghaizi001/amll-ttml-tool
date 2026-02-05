import { githubFetch } from "$/modules/github/api";

type SubmitReviewOptions = {
	token: string;
	prNumber: number;
	event: "APPROVE" | "REQUEST_CHANGES";
	reportBody: string;
	repoOwner: string;
	repoName: string;
	pendingLabelName: string;
};

type SubmitReviewResult = {
	ok: boolean;
	status?: number;
	labelStatus?: number;
};

export const submitReview = async (
	options: SubmitReviewOptions,
): Promise<SubmitReviewResult> => {
	const response = await githubFetch(
		`/repos/${options.repoOwner}/${options.repoName}/pulls/${options.prNumber}/reviews`,
		{
			init: {
				method: "POST",
				headers: {
					Accept: "application/vnd.github+json",
					Authorization: `Bearer ${options.token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					event: options.event,
					...(options.reportBody ? { body: options.reportBody } : {}),
				}),
			},
		},
	);
	if (!response.ok) {
		return {
			ok: false,
			status: response.status,
		};
	}
	if (options.event === "REQUEST_CHANGES") {
		const labelResponse = await githubFetch(
			`/repos/${options.repoOwner}/${options.repoName}/issues/${options.prNumber}/labels`,
			{
				init: {
					method: "POST",
					headers: {
						Accept: "application/vnd.github+json",
						Authorization: `Bearer ${options.token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ labels: [options.pendingLabelName] }),
				},
			},
		);
		if (!labelResponse.ok) {
			return {
				ok: true,
				labelStatus: labelResponse.status,
			};
		}
	}
	return { ok: true };
};
