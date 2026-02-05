import { githubFetch } from "$/modules/github/api";
import { fetchHeadCommitTime } from "$/modules/github/services/commit-service";
import type {
	ReviewLabel,
	ReviewPullRequest,
} from "$/modules/review/services/card-service";

const REPO_OWNER = "Steve-xmh";
const REPO_NAME = "amll-ttml-db";
const PENDING_LABEL_NAME = "待更新";

type SetAtom<T> = (value: T | ((prev: T) => T)) => void;

export const fetchPendingLabelTime = async (
	token: string,
	prNumber: number,
) => {
	if (!token) return null;
	const headers = {
		Accept: "application/vnd.github+json",
		Authorization: `Bearer ${token}`,
	};
	const perPage = 20;
	const maxPages = 25;
	for (let page = 1; page <= maxPages; page += 1) {
		const response = await githubFetch(
			`/repos/${REPO_OWNER}/${REPO_NAME}/issues/${prNumber}/events`,
			{
				params: { per_page: perPage, page },
				init: { headers },
			},
		);
		if (!response.ok) {
			return null;
		}
		const events = (await response.json()) as Array<{
			event?: string;
			created_at?: string;
			label?: { name?: string };
		}>;
		for (const event of events) {
			if (event.event !== "labeled") continue;
			if (event.label?.name?.trim() !== PENDING_LABEL_NAME) continue;
			if (!event.created_at) continue;
			return new Date(event.created_at).getTime();
		}
		if (events.length < perPage) {
			break;
		}
	}
	return null;
};

export const hasPostLabelCommits = async (token: string, prNumber: number) => {
	const labelTime = await fetchPendingLabelTime(token, prNumber);
	if (!labelTime) return false;
	const commitTime = await fetchHeadCommitTime(token, prNumber);
	if (!commitTime) return false;
	return commitTime > labelTime;
};

export const fetchLabels = async (options: {
	token: string;
	setReviewLabels: SetAtom<ReviewLabel[]>;
	setHiddenLabels: SetAtom<string[]>;
}) => {
	if (!options.token) return;
	const response = await githubFetch(
		`/repos/${REPO_OWNER}/${REPO_NAME}/labels`,
		{
			params: { per_page: 100 },
			init: {
				headers: {
					Accept: "application/vnd.github+json",
					Authorization: `Bearer ${options.token}`,
				},
			},
		},
	);
	if (!response.ok) {
		options.setReviewLabels([]);
		return;
	}
	const data = (await response.json()) as ReviewLabel[];
	const sorted = [...data].sort((a, b) => a.name.localeCompare(b.name));
	options.setReviewLabels(sorted);
	const labelSet = new Set(
		sorted.map((label) => label.name.trim().toLowerCase()),
	);
	options.setHiddenLabels((prev) =>
		prev.filter((label) => labelSet.has(label.trim().toLowerCase())),
	);
};

export const refreshPendingLabels = async (options: {
	token: string;
	sourceItems: ReviewPullRequest[];
	hasPendingLabel: (labels: ReviewLabel[]) => boolean;
}) => {
	if (!options.token) return options.sourceItems;
	const pendingItems = options.sourceItems
		.map((item, index) => ({ item, index }))
		.filter(({ item }) => options.hasPendingLabel(item.labels));
	if (pendingItems.length === 0) return options.sourceItems;
	const headers: Record<string, string> = {
		Accept: "application/vnd.github+json",
		Authorization: `Bearer ${options.token}`,
	};
	const updated = [...options.sourceItems];
	for (const pending of pendingItems) {
		const response = await githubFetch(
			`/repos/${REPO_OWNER}/${REPO_NAME}/issues/${pending.item.number}/labels`,
			{
				params: { per_page: 100 },
				init: { headers },
			},
		);
		if (!response.ok) {
			continue;
		}
		const labels = (await response.json()) as Array<{
			name: string;
			color: string;
		}>;
		updated[pending.index] = {
			...pending.item,
			labels: labels.map((label) => ({
				name: label.name,
				color: label.color,
			})),
		};
	}
	return updated;
};
