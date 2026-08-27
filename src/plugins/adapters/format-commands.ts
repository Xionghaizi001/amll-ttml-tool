import type { LocalizedText } from "@amll-ttml-tool/plugin-api";
import type { CommandRegistry, Disposable } from "$/kernel/commands";
import type { ContributionRegistry } from "$/kernel/extensions";
import { commandRegistry } from "$/modules/keyboard/registry";
import { extensionRegistry } from "./extension-host";
import { lyricFileFlow } from "./lyric-file-flow-host";

/**
 * 依据 format provider registry 自动派生导入/导出命令：任何 provider
 * （内置或插件）注册后即可在文件菜单中出现，provider 随 scope 消失时
 * 对应命令一并销毁。菜单项只引用这些 command ID。
 */

export const formatImportCommandId = (formatId: string): string =>
	`core.formats.import.${formatId}`;

export const formatExportCommandId = (formatId: string): string =>
	`core.formats.export.${formatId}`;

const localizeTitle = (title: LocalizedText, locale: string): string => {
	if (typeof title === "string") return title;
	return title[locale] ?? title.default;
};

const importCommandTitle = (title: LocalizedText): LocalizedText => ({
	default: `Import from ${localizeTitle(title, "default")} file`,
	"zh-CN": `从 ${localizeTitle(title, "zh-CN")} 文件导入`,
});

const exportCommandTitle = (title: LocalizedText): LocalizedText => ({
	default: `Export to ${localizeTitle(title, "default")}`,
	"zh-CN": `导出到 ${localizeTitle(title, "zh-CN")}`,
});

export interface FormatCommandFlowPort {
	importWithPicker(formatId: string): Promise<void>;
	exportDocumentAs(formatId: string): Promise<void>;
}

export const createFormatCommandReconciler = (
	contributions: Pick<
		ContributionRegistry,
		"getFormatProviders" | "subscribe"
	>,
	commands: CommandRegistry,
	flow: FormatCommandFlowPort,
): { reconcile: () => void; start: () => Disposable } => {
	const registered = new Map<string, Disposable>();

	const reconcile = (): void => {
		const wanted = new Map<string, () => Disposable>();
		for (const provider of contributions.getFormatProviders()) {
			// 宿主原生格式（TTML）走“打开/保存文件”命令，不进入导入/导出菜单。
			if (provider.hostNative) continue;
			const { formatId, title } = provider;
			if (provider.importer) {
				const id = formatImportCommandId(formatId);
				wanted.set(id, () =>
					commands.register({
						id,
						title: importCommandTitle(title),
						handler: () => flow.importWithPicker(formatId),
						source: { kind: "builtin", id: "core.formats" },
					}),
				);
			}
			if (provider.exporter) {
				const id = formatExportCommandId(formatId);
				wanted.set(id, () =>
					commands.register({
						id,
						title: exportCommandTitle(title),
						handler: () => flow.exportDocumentAs(formatId),
						source: { kind: "builtin", id: "core.formats" },
					}),
				);
			}
		}
		for (const [id, disposable] of registered) {
			if (wanted.has(id)) continue;
			disposable.dispose();
			registered.delete(id);
		}
		for (const [id, create] of wanted) {
			if (registered.has(id)) continue;
			registered.set(id, create());
		}
	};

	return {
		reconcile,
		start: () => {
			reconcile();
			const subscription = contributions.subscribe(reconcile);
			return {
				dispose: () => {
					subscription.dispose();
					for (const disposable of registered.values()) disposable.dispose();
					registered.clear();
				},
			};
		},
	};
};

let started = false;

/** 宿主启动时接线一次；命令生命周期此后完全由 provider registry 驱动。 */
export const ensureFormatCommandsRegistered = (): void => {
	if (started) return;
	started = true;
	createFormatCommandReconciler(
		extensionRegistry.contributions,
		commandRegistry,
		lyricFileFlow,
	).start();
};
