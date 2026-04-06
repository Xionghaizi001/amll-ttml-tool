import {
	extractMentions,
	isGitHubPullRequest,
	isLyricsSiteSubmission,
	type ReviewItem,
	type ReviewLabel,
} from "./card-service";

export const applyReviewFilters = (options: {
	items: ReviewItem[];
	hiddenLabelSet: Set<string>;
	hiddenUserSet: Set<string>;
	hiddenUserMode: "any" | "all";
	pendingChecked: boolean;
	updatedChecked: boolean;
	hasPendingLabel: (labels: ReviewLabel[]) => boolean;
	postPendingCommitMap: Record<number, boolean>;
	selectedLabels: string[];
	selectedUser: string | null;
	selectedLanguage: string | null;
}) => {
	const visibleItems = options.items.filter((item) => {
		if (isGitHubPullRequest(item)) {
			return !item.labels.some((label) =>
				options.hiddenLabelSet.has(label.name.toLowerCase()),
			);
		}
		return true;
	});

	const statusFilteredItems = visibleItems.filter((item) => {
		if (!options.pendingChecked && !options.updatedChecked) return true;
		if (!isGitHubPullRequest(item)) return true;
		
		const isPending = options.hasPendingLabel(item.labels);
		const isUpdated = isPending && options.postPendingCommitMap[item.number] === true;
		const pendingMatch = isPending && !isUpdated;
		const updatedMatch = isUpdated;
		if (options.pendingChecked && options.updatedChecked) return pendingMatch || updatedMatch;
		if (options.pendingChecked) return pendingMatch;
		if (options.updatedChecked) return updatedMatch;
		return true;
	});

	const labelFilteredItems =
		options.selectedLabels.length === 0
			? statusFilteredItems
			: statusFilteredItems.filter((item) => {
					if (!isGitHubPullRequest(item)) return true;
					const selectedSet = new Set(
						options.selectedLabels.map((label) => label.toLowerCase()),
					);
					return item.labels.some((label) =>
						selectedSet.has(label.name.toLowerCase()),
					);
		});

const userFilteredItems =
	// 先处理隐藏用户过滤
	options.hiddenUserSet.size === 0
		? labelFilteredItems
		: labelFilteredItems.filter((item) => {
				const mentions = extractMentions(item.body);
				if (mentions.length === 0) return true;
				if (options.hiddenUserMode === "any") {
					// 只要包含该用户就隐藏
					return !mentions.some((name) =>
						options.hiddenUserSet.has(name.toLowerCase()),
					);
				}
				// 只包含该用户才隐藏
				return !mentions.every((name) =>
					options.hiddenUserSet.has(name.toLowerCase()),
				);
		  });

// 选中用户过滤
if (options.selectedUser) {
	const selectedUserLower = options.selectedUser.toLowerCase();
	return userFilteredItems.filter((item) => {
		if (isLyricsSiteSubmission(item)) {
			return item.submitter?.toLowerCase() === selectedUserLower;
		}
		if (isGitHubPullRequest(item)) {
			return extractMentions(item.body).some(
				(name) => name.toLowerCase() === selectedUserLower,
			);
		}
		return false;
	});
}

// 语言过滤
if (!options.selectedLanguage) return userFilteredItems;

return userFilteredItems.filter((item) => {
	if (isLyricsSiteSubmission(item)) {
		return item.language === options.selectedLanguage;
	}
	return true;
});
