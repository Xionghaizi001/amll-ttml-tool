import { extractMentions, type ReviewLabel, type ReviewPullRequest } from "./card-service";

export const applyReviewFilters = (options: {
	items: ReviewPullRequest[];
	hiddenLabelSet: Set<string>;
	pendingChecked: boolean;
	updatedChecked: boolean;
	hasPendingLabel: (labels: ReviewLabel[]) => boolean;
	postPendingCommitMap: Record<number, boolean>;
	selectedLabels: string[];
	selectedUser: string | null;
}) => {
	const visibleItems = options.items.filter(
		(pr) =>
			!pr.labels.some((label) =>
				options.hiddenLabelSet.has(label.name.toLowerCase()),
			),
	);
	const statusFilteredItems = visibleItems.filter((pr) => {
		if (!options.pendingChecked && !options.updatedChecked) return true;
		const isPending = options.hasPendingLabel(pr.labels);
		const isUpdated = isPending && options.postPendingCommitMap[pr.number] === true;
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
			: statusFilteredItems.filter((pr) => {
					const selectedSet = new Set(
						options.selectedLabels.map((label) => label.toLowerCase()),
					);
					return pr.labels.some((label) =>
						selectedSet.has(label.name.toLowerCase()),
					);
			  });
	if (!options.selectedUser) return labelFilteredItems;
	const selectedUserLower = options.selectedUser.toLowerCase();
	return labelFilteredItems.filter((pr) =>
		extractMentions(pr.body).some(
			(name) => name.toLowerCase() === selectedUserLower,
		),
	);
};
