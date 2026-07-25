import { Fragment } from "react";
import { parseAnnotationSummary } from "$/modules/user/services/annotation-summary";
import styles from "./AnnotationSummaryText.module.css";

export const AnnotationSummaryText = ({
	summary,
	className,
}: {
	summary: string;
	className?: string;
}) => {
	const segments = parseAnnotationSummary(summary);
	return (
		<span className={className}>
			{segments.map((segment, index) =>
				segment.kind === "code" ? (
					<code key={`${index}-${segment.text}`} className={styles.code}>
						{segment.text}
					</code>
				) : (
					<Fragment key={`${index}-${segment.text}`}>{segment.text}</Fragment>
				),
			)}
		</span>
	);
};
