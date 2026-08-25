import {
	type LocalizedText,
	type MenuLocation,
	evaluateEnablement,
	parseEnablement,
} from "@amll-ttml-tool/plugin-api";
import { DropdownMenu } from "@radix-ui/themes";
import { Fragment, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { CommandMenuItem } from "$/components/TopMenu/CommandMenuItem";
import { commandRegistry } from "$/modules/keyboard/registry";
import { getHostEnablementContext } from "../adapters/enablement-context";
import { extensionRegistry } from "../adapters/extension-host";

const localize = (text: LocalizedText, locale: string): string => {
	if (typeof text === "string") return text;
	return text[locale] ?? text[locale.split("-")[0]] ?? text.default;
};

// Fail closed: a `when` clause that does not parse or references unknown
// identifiers hides the entry instead of showing it unconditionally.
const matchesWhenClause = (when: string | undefined): boolean => {
	if (when === undefined) return true;
	try {
		const parsed = parseEnablement(when);
		return evaluateEnablement(
			parsed.ast,
			getHostEnablementContext(),
			parsed.unknownIdents,
		);
	} catch {
		return false;
	}
};

export const ContributionMenuItems = ({
	location,
}: {
	location: MenuLocation;
}) => {
	const { i18n } = useTranslation();
	useSyncExternalStore(
		(listener) => {
			const subscription = extensionRegistry.contributions.subscribe(listener);
			return () => subscription.dispose();
		},
		() => extensionRegistry.contributions.getRevision(),
		() => 0,
	);
	const items = extensionRegistry.contributions.getMenus(location);

	let previousGroup: string | undefined;
	return items.map((item) => {
		const command = commandRegistry.get(item.commandId);
		if (!command?.title) return null;
		if (!matchesWhenClause(item.when)) return null;
		const separator =
			previousGroup !== undefined && previousGroup !== item.group;
		previousGroup = item.group;
		return (
			<Fragment key={item.id}>
				{separator && <DropdownMenu.Separator />}
				<CommandMenuItem commandId={item.commandId}>
					{localize(command.title, i18n.language)}
				</CommandMenuItem>
			</Fragment>
		);
	});
};
