import { githubFetch } from "$/modules/github/api";
import type { AppNotification } from "$/states/notifications";

const REPO_OWNER = "Steve-xmh";
const REPO_NAME = "amll-ttml-db";
const PENDING_LABEL_NAME = "待更新";

type PendingUpdatePullRequest = {
	number: number;
	title: string;
	htmlUrl: string;
};

type UpsertNotification = (
	input: Omit<AppNotification, "createdAt"> & { createdAt?: string },
) => void;

type RemoveNotification = (id: string) => void;

const buildPendingUpdateNotificationId = (prNumber: number) =>
	`pending-update-${prNumber}`;

const fetchPendingUpdatePullRequests = async (
	token: string,
	login: string,
): Promise<PendingUpdatePullRequest[]> => {
	const trimmedLogin = login.trim();
	if (!token.trim() || !trimmedLogin) return [];
	const headers = {
		Accept: "application/vnd.github+json",
		Authorization: `Bearer ${token}`,
	};
	const perPage = 50;
	const maxPages = 10;
	const items: PendingUpdatePullRequest[] = [];
	for (let page = 1; page <= maxPages; page += 1) {
		const response = await githubFetch("/search/issues", {
			params: {
				q: `repo:${REPO_OWNER}/${REPO_NAME} is:pr is:open label:"${PENDING_LABEL_NAME}" mentions:${trimmedLogin}`,
				per_page: perPage,
				page,
				sort: "updated",
				order: "desc",
			},
			init: { headers },
		});
		if (!response.ok) {
			throw new Error("load-pending-update-pr-failed");
		}
		const data = (await response.json()) as {
			items?: Array<{
				number: number;
				title: string;
				html_url: string;
			}>;
		};
		const pageItems =
			data.items?.map((item) => ({
				number: item.number,
				title: item.title,
				htmlUrl: item.html_url,
			})) ?? [];
		items.push(...pageItems);
		if (pageItems.length < perPage) {
			break;
		}
	}
	return items;
};

export const syncPendingUpdateReviewNotices = async (options: {
	token: string;
	login: string;
	previousIds: Set<string>;
	upsertNotification: UpsertNotification;
	removeNotification: RemoveNotification;
}) => {
	const pending = await fetchPendingUpdatePullRequests(
		options.token,
		options.login,
	);
	const nextIds = new Set<string>();
	for (const pr of pending) {
		const notificationId = buildPendingUpdateNotificationId(pr.number);
		nextIds.add(notificationId);
		options.upsertNotification({
			id: notificationId,
			title: `待更新 PR #${pr.number}`,
			description: pr.title,
			level: "info",
			source: "github",
			pinned: true,
			dismissible: true,
			action: {
				type: "open-review-update",
				payload: {
					prNumber: pr.number,
					prTitle: pr.title,
				},
			},
		});
	}
	for (const previousId of options.previousIds) {
		if (!nextIds.has(previousId)) {
			options.removeNotification(previousId);
		}
	}
	return nextIds;
};
