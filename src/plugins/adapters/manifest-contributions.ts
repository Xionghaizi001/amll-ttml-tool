import {
	type EnablementContext,
	evaluateEnablement,
	type FunctionPluginManifest,
	type JsonValue,
	parseEnablement,
	parseManifest,
} from "@amll-ttml-tool/plugin-api";
import type { ExtensionScope } from "$/kernel/extensions";

export interface ManifestContributionPorts {
	executeCommand(
		commandId: string,
		args?: JsonValue,
	): unknown | Promise<unknown>;
	getEnablementContext(): EnablementContext;
}

/** Maps the public, declarative v0 manifest into an owner-scoped host registry. */
export const registerManifestContributions = (
	scope: ExtensionScope,
	manifest: FunctionPluginManifest,
	ports: ManifestContributionPorts,
): void => {
	// The compile-time type carries no guarantee at the trust boundary; a
	// loader handing over raw JSON must still hit full protocol validation.
	const parsed = parseManifest(manifest);
	if (!parsed.ok) throw new Error(parsed.error.message);
	if (parsed.value.kind !== "function")
		throw new Error(
			`Plugin ${parsed.value.id} is a theme package and cannot contribute commands`,
		);
	const validated = parsed.value;
	for (const command of validated.contributes?.commands ?? []) {
		const enablement = parseEnablement(command.enablement);
		scope.registerCommand({
			id: command.id,
			title: command.title,
			category: command.category,
			handler: (args) => ports.executeCommand(command.id, args as JsonValue),
			enablement: () =>
				evaluateEnablement(
					enablement.ast,
					ports.getEnablementContext(),
					enablement.unknownIdents,
				),
		});
	}
	for (const menu of validated.contributes?.menus ?? [])
		scope.registerMenu(menu);
	for (const settings of validated.contributes?.settings ?? [])
		scope.registerDeclarativeForm({
			id: settings.id,
			kind: "settings",
			title: settings.title,
			form: settings.form,
		});
};
