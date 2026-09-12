import { describe, expect, it, vi } from "vitest";
import { CommandRegistry } from "$/kernel/commands";
import { ExtensionRegistry } from "$/kernel/extensions";
import type { TTMLLyric } from "$/types/ttml";
import {
	createFormatCommandReconciler,
	formatExportCommandId,
	formatImportCommandId,
} from "$/plugins/adapters/format-commands";

const emptyLyric: TTMLLyric = { lyricLines: [], metadata: [] };

describe("format command reconciler", () => {
	it("derives import/export commands from providers and removes them with the scope", async () => {
		const commands = new CommandRegistry();
		const registry = new ExtensionRegistry(commands);
		const flow = {
			importWithPicker: vi.fn(async () => undefined),
			exportDocumentAs: vi.fn(async () => undefined),
		};

		const coreScope = registry.createScope({
			kind: "builtin",
			id: "core.formats",
			trusted: true,
		});
		coreScope.registerFormatProvider({
			formatId: "ttml",
			title: "TTML",
			extensions: ["ttml"],
			hostNative: true,
			importer: () => emptyLyric,
			exporter: () => "<tt/>",
		});
		const optionalScope = registry.createScope({
			kind: "builtin",
			id: "core.formats.optional",
			trusted: true,
		});
		optionalScope.registerFormatProvider({
			formatId: "lrc",
			title: "LyRiC",
			extensions: ["lrc"],
			importer: () => emptyLyric,
			exporter: () => "text",
		});
		optionalScope.registerFormatProvider({
			formatId: "ass",
			title: "ASS",
			extensions: ["ass"],
			exporter: () => "text",
		});

		const reconciler = createFormatCommandReconciler(
			registry.contributions,
			commands,
			flow,
		);
		const subscription = reconciler.start();

		expect(commands.get(formatImportCommandId("lrc"))?.title).toEqual({
			default: "Import from LyRiC file",
			"zh-CN": "从 LyRiC 文件导入",
		});
		expect(commands.get(formatExportCommandId("lrc"))?.title).toEqual({
			default: "Export to LyRiC",
			"zh-CN": "导出到 LyRiC",
		});
		expect(commands.get(formatExportCommandId("ass"))).toBeDefined();
		expect(commands.get(formatImportCommandId("ass"))).toBeUndefined();
		// 宿主原生格式走“打开/保存文件”，不生成导入/导出命令。
		expect(commands.get(formatImportCommandId("ttml"))).toBeUndefined();
		expect(commands.get(formatExportCommandId("ttml"))).toBeUndefined();

		await commands.execute(formatImportCommandId("lrc"));
		expect(flow.importWithPicker).toHaveBeenCalledWith("lrc");
		await commands.execute(formatExportCommandId("ass"));
		expect(flow.exportDocumentAs).toHaveBeenCalledWith("ass");

		// provider 随 scope 消失时，对应命令一并销毁（禁用格式的机制）。
		optionalScope.dispose();
		expect(commands.get(formatImportCommandId("lrc"))).toBeUndefined();
		expect(commands.get(formatExportCommandId("lrc"))).toBeUndefined();
		expect(commands.get(formatExportCommandId("ass"))).toBeUndefined();

		subscription.dispose();
	});

	it("registers commands for plugin-owned providers under the host namespace", () => {
		const commands = new CommandRegistry();
		const registry = new ExtensionRegistry(commands);
		const flow = {
			importWithPicker: vi.fn(async () => undefined),
			exportDocumentAs: vi.fn(async () => undefined),
		};
		const reconciler = createFormatCommandReconciler(
			registry.contributions,
			commands,
			flow,
		);
		reconciler.start();

		const plugin = registry.createScope({
			kind: "plugin",
			pluginId: "example.formats",
			runtime: "extism-wasm",
			trusted: false,
		});
		plugin.registerFormatProvider({
			formatId: "example.formats.krc",
			title: "KRC",
			extensions: ["krc"],
			importer: () => emptyLyric,
		});

		const commandId = formatImportCommandId("example.formats.krc");
		expect(commands.get(commandId)?.source).toEqual({
			kind: "builtin",
			id: "core.formats",
		});

		plugin.dispose();
		expect(commands.get(commandId)).toBeUndefined();
	});
});
