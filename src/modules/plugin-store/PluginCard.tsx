import { Badge, Heading } from "@radix-ui/themes";
import type { ReactNode } from "react";
import styles from "./PluginCard.module.css";

export const PluginCardGroup = ({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) => (
	<section className={styles.group}>
		<Heading size="3" className={styles.groupTitle}>
			{title}
		</Heading>
		<div className={styles.grid}>{children}</div>
	</section>
);

export const PluginCard = ({
	icon,
	title,
	version,
	badges,
	description,
	action,
	dimmed,
}: {
	icon: ReactNode;
	title: string;
	version: string;
	badges: ReactNode;
	description: ReactNode;
	action?: ReactNode;
	dimmed?: boolean;
}) => (
	<article
		className={styles.card}
		data-dimmed={dimmed || undefined}
		aria-label={title}
	>
		<header className={styles.header}>
			<span className={styles.icon} aria-hidden="true">
				{icon}
			</span>
			<Heading as="h3" size="3" className={styles.title}>
				{title}
			</Heading>
			<Badge color="gray" radius="full" className={styles.version}>
				{version}
			</Badge>
		</header>
		<div className={styles.description}>{description}</div>
		<div className={styles.badges}>{badges}</div>
		{action && <footer className={styles.actions}>{action}</footer>}
	</article>
);
