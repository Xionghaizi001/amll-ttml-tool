import { githubFetch } from "$/modules/github/api";

const REPO_OWNER = "Steve-xmh";
const REPO_NAME = "amll-ttml-db";

export const fetchHeadCommitTime = async (token: string, prNumber: number) => {
	if (!token) return null;
	const pullResponse = await githubFetch(
		`/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${prNumber}`,
		{
			init: {
				headers: {
					Accept: "application/vnd.github+json",
					Authorization: `Bearer ${token}`,
				},
			},
		},
	);
	if (!pullResponse.ok) {
		return null;
	}
	const pull = (await pullResponse.json()) as {
		head?: { sha?: string };
	};
	const sha = pull.head?.sha;
	if (!sha) return null;
	const commitResponse = await githubFetch(
		`/repos/${REPO_OWNER}/${REPO_NAME}/commits/${sha}`,
		{
			init: {
				headers: {
					Accept: "application/vnd.github+json",
					Authorization: `Bearer ${token}`,
				},
			},
		},
	);
	if (!commitResponse.ok) {
		return null;
	}
	const commit = (await commitResponse.json()) as {
		commit?: {
			author?: { date?: string };
			committer?: { date?: string };
		};
	};
	const commitDate =
		commit.commit?.committer?.date ?? commit.commit?.author?.date;
	if (!commitDate) return null;
	return new Date(commitDate).getTime();
};
