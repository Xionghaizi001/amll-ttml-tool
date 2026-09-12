import { describe, expect, it } from "vitest";
import { CommandRegistry } from "$/kernel/commands";
import { ExtensionRegistry } from "$/kernel/extensions";
import type { TTMLLyric } from "$/types/ttml";

const emptyLyric: TTMLLyric = { lyricLines: [], metadata: [] };

const createBuiltinScope = (registry: ExtensionRegistry) =>
	registry.createScope({ kind: "builtin", id: "core.formats", trusted: true });

const createPluginScope = (registry: ExtensionRegistry) =>
	registry.createScope({
		kind: "plugin",
		pluginId: "example.formats",
		runtime: "extism-wasm",
		trusted: false,
	});

describe("format provider contributions", () => {
	it("registers providers, resolves by extension and cleans up on dispose", () => {
		const registry = new ExtensionRegistry(new CommandRegistry());
		const scope = createBuiltinScope(registry);
		scope.registerFormatProvider({
			formatId: "lrc",
			title: "LyRiC",
			extensions: [".LRC"],
			order: 200,
			importer: () => emptyLyric,
			exporter: () => "text",
		});
		const disposable = scope.registerFormatProvider({
			formatId: "ass",
			title: "ASS",
			extensions: ["ass"],
			order: 300,
			exporter: () => "text",
		});

		const providers = registry.contributions.getFormatProviders();
		expect(providers.map((p) => p.formatId)).toEqual(["lrc", "ass"]);
		// Extensions are normalized at the scope boundary.
		expect(registry.contributions.getFormatProvider("lrc")?.extensions).toEqual(
			["lrc"],
		);
		expect(
			registry.contributions.findFormatProviderForExtension(".LRC")?.formatId,
		).toBe("lrc");
		expect(
			registry.contributions.findFormatProviderForExtension("unknown"),
		).toBeUndefined();

		disposable.dispose();
		expect(
			registry.contributions.getFormatProviders().map((p) => p.formatId),
		).toEqual(["lrc"]);
	});

	it("requires an importer or exporter and at least one extension", () => {
		const registry = new ExtensionRegistry(new CommandRegistry());
		const scope = createBuiltinScope(registry);
		expect(() =>
			scope.registerFormatProvider({
				formatId: "empty",
				title: "Empty",
				extensions: [],
				importer: () => emptyLyric,
			}),
		).toThrow("at least one extension");
		expect(() =>
			scope.registerFormatProvider({
				formatId: "noop",
				title: "Noop",
				extensions: ["noop"],
			}),
		).toThrow("importer or an exporter");
	});

	it("rejects duplicate format ids across owners", () => {
		const registry = new ExtensionRegistry(new CommandRegistry());
		const scope = createBuiltinScope(registry);
		scope.registerFormatProvider({
			formatId: "lrc",
			title: "LyRiC",
			extensions: ["lrc"],
			importer: () => emptyLyric,
		});
		const other = registry.createScope({
			kind: "builtin",
			id: "core.other",
			trusted: true,
		});
		expect(() =>
			other.registerFormatProvider({
				formatId: "lrc",
				title: "Other LRC",
				extensions: ["lrc"],
				importer: () => emptyLyric,
			}),
		).toThrow("already registered");
	});

	it("keeps the host-native format unique, bidirectional and trusted-only", () => {
		const registry = new ExtensionRegistry(new CommandRegistry());
		const scope = createBuiltinScope(registry);
		expect(() =>
			scope.registerFormatProvider({
				formatId: "ttml",
				title: "TTML",
				extensions: ["ttml"],
				hostNative: true,
				importer: () => emptyLyric,
			}),
		).toThrow("must support import and export");

		scope.registerFormatProvider({
			formatId: "ttml",
			title: "TTML",
			extensions: ["ttml"],
			hostNative: true,
			importer: () => emptyLyric,
			exporter: () => "<tt/>",
		});
		expect(
			registry.contributions.getHostNativeFormatProvider()?.formatId,
		).toBe("ttml");
		expect(() =>
			scope.registerFormatProvider({
				formatId: "ttml2",
				title: "TTML2",
				extensions: ["ttml2"],
				hostNative: true,
				importer: () => emptyLyric,
				exporter: () => "<tt/>",
			}),
		).toThrow("already registered; ttml2 cannot claim it");

		const plugin = createPluginScope(registry);
		expect(() =>
			plugin.registerFormatProvider({
				formatId: "example.formats.ttml",
				title: "Fake TTML",
				extensions: ["ttml"],
				hostNative: true,
				importer: () => emptyLyric,
				exporter: () => "<tt/>",
			}),
		).toThrow("cannot register the host-native format");
	});

	it("lets the host-native provider win extension conflicts", () => {
		const registry = new ExtensionRegistry(new CommandRegistry());
		const scope = createBuiltinScope(registry);
		scope.registerFormatProvider({
			formatId: "shadow",
			title: "Shadow",
			extensions: ["ttml"],
			order: 1,
			importer: () => emptyLyric,
		});
		scope.registerFormatProvider({
			formatId: "ttml",
			title: "TTML",
			extensions: ["ttml"],
			order: 100,
			hostNative: true,
			importer: () => emptyLyric,
			exporter: () => "<tt/>",
		});
		expect(
			registry.contributions.findFormatProviderForExtension("ttml")?.formatId,
		).toBe("ttml");
	});

	it("forces plugin format ids into the plugin namespace", () => {
		const registry = new ExtensionRegistry(new CommandRegistry());
		const plugin = createPluginScope(registry);
		expect(() =>
			plugin.registerFormatProvider({
				formatId: "krc",
				title: "KRC",
				extensions: ["krc"],
				importer: () => emptyLyric,
			}),
		).toThrow("outside its own namespace");

		plugin.registerFormatProvider({
			formatId: "example.formats.krc",
			title: "KRC",
			extensions: ["krc"],
			importer: () => emptyLyric,
		});
		expect(
			registry.contributions.findFormatProviderForExtension("krc")?.formatId,
		).toBe("example.formats.krc");

		plugin.dispose();
		expect(
			registry.contributions.findFormatProviderForExtension("krc"),
		).toBeUndefined();
	});
});
