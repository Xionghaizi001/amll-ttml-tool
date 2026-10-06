const api = "packages/plugin-api/";
const sdk = "packages/plugin-sdk-js/";
const hostCore = "(?:formats|modes|themes)";
const plugin = `(?:src/plugins/builtin/(?!${hostCore}/)[^/]+/|examples/)`;
const internal = "^(?:src/|packages/|examples/|tests/)";
const rule = (name, from, to) => ({ name, severity: "error", from, to });
const positive = (name, path, allowed) =>
	rule(name, { path }, { pathNot: allowed });
const external = (names) =>
	`(?:node_modules/.*(?:${names})(?:/|$)|^(?:${names})(?:/|$))`;

module.exports = {
	forbidden: [
		positive(
			"application-dependencies",
			"^src/application/",
			`^(?:src/(?:application|kernel|types)/|${api})`,
		),
		positive(
			"kernel-dependencies",
			"^src/kernel/",
			`^(?:src/(?:kernel|types)/|${api})|${external("immer|uid")}`,
		),
		rule(
			"platform-dependencies",
			{ path: "^src/platform/" },
			{
				path: internal,
				pathNot: `^(?:src/(?:platform|application|kernel|types)/|src/modules/(?:audio/ports|ffmpeg/(?:worker|worklet)|spectrogram/workers)/|${api})`,
			},
		),
		rule(
			"plugin-dependencies",
			{ path: "^src/plugins/" },
			{
				path: internal,
				pathNot: `^(?:src/(?:plugins|application|kernel|platform|modules|states|types|components|hooks)/|${api}|${sdk})`,
			},
		),
		rule(
			"plugin-adapter-dependencies",
			{ path: "^src/plugins/adapters/" },
			{
				path: "^src/(?:components|hooks)/",
			},
		),
		rule(
			"plugin-api-dependencies",
			{ path: `^${api}` },
			{ pathNot: `^${api}|${external("vitest")}`, couldNotResolve: false },
		),
		rule(
			"plugin-api-testing-only",
			{ path: `^${api}`, pathNot: `^${api}src/testing/` },
			{ path: external("vitest") },
		),
		positive(
			"sdk-dependencies",
			`^${sdk}`,
			`^(?:${api}|${sdk})|${external("react")}`,
		),
		positive(
			"plugin-public-api-only",
			`^${plugin}`,
			`^(?:${api}|${sdk}|${plugin})|${external("react")}`,
		),
		// A plugin can use its own helpers, but cannot depend on another builtin.
		rule(
			"builtin-plugin-isolation",
			{ path: `^src/plugins/builtin/(?!${hostCore}/)([^/]+)/` },
			{
				path: "^src/plugins/builtin/",
				pathNot: "^src/plugins/builtin/$1/",
			},
		),
		rule(
			"builtin-plugin-no-examples",
			{ path: `^src/plugins/builtin/(?!${hostCore}/)` },
			{ path: "^examples/" },
		),
		rule(
			"examples-no-builtin-plugins",
			{ path: "^examples/" },
			{ path: "^src/plugins/builtin/" },
		),
		positive(
			"api-test-dependencies",
			"^tests/plugin-api/",
			`^${api}|${external("vitest")}`,
		),
		positive(
			"sdk-test-dependencies",
			"^tests/plugin-sdk-js/",
			`^(?:${api}|${sdk})|${external("vitest")}`,
		),
		rule(
			"worker-resources",
			{ pathNot: "^src/(?:platform|plugins/runtime)/" },
			// dependency-cruiser resolves Vite query imports before applying rules,
			// so match the worker resource filename as well as the original query.
			{ path: "(?:\\?worker(?:&|$)|\\.worker\\.ts$)" },
		),
		rule(
			"pure-algorithms-through-adapters",
			{
				path: "^(?:src|packages|tests|examples)/",
				pathNot: "(?:/adapters/|^src/modules/lyric-drag/reorder-engine\\.ts$)",
			},
			{
			path: "^(?:src/(?:modules/(?:segmentation/utils/(?:segmentation|syllable-smoothing)|lyric-drag/drag-reorder|project/logic/|spectrogram/utils/timeline-boundary|lyric-editor/utils/(?:ruby-generator|normalize-line-time)|lrclib/utils/)|utils/parse-lrc(?:\\.|$))|\\$/utils/parse-lrc(?:\\.|$))",
			},
		),
	],
	options: {
		tsConfig: { fileName: "tsconfig.app.json" },
		tsPreCompilationDeps: true,
		doNotFollow: { path: "node_modules" },
		// Keep external edges for the API/SDK/plugin positive allowlists.
		exclude: { path: "(?:^|/)(?:dist|target|build|vendor)/" },
		enhancedResolveOptions: {
			exportsFields: ["exports"],
			conditionNames: ["import", "types", "default"],
		},
	},
};
