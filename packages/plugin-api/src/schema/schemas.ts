import { ALL_CAPABILITIES } from "../capabilities";
import type { HostMethod } from "../types";
import {
	FORM_FLUENT_ICON_NAMES_V0,
	PLUGIN_API_VERSION,
	THEME_API_VERSION,
	THEME_TOKEN_VERSION,
} from "../types";
import type { JsonSchema } from "./validator";

const id = { type: "string", minLength: 1, maxLength: 256 };
const time = { type: "number", minimum: 0 };
const localizedText = {
	oneOf: [
		{ type: "string", minLength: 1, maxLength: 2048 },
		{
			type: "object",
			required: ["default"],
			properties: { default: { type: "string", minLength: 1, maxLength: 2048 } },
			additionalProperties: { type: "string", maxLength: 2048 },
			maxProperties: 16,
		},
	],
};
const option = {
	type: "object",
	required: ["value", "label"],
	properties: {
		value: id,
		label: localizedText,
		disabled: { type: "boolean" },
		icon: { $ref: "#/$defs/icon" },
	},
	additionalProperties: false,
};
const formValue = {
	anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }],
};
const condition = {
	type: "object",
	required: ["field", "equals"],
	properties: {
		field: { type: "string", pattern: "^[a-zA-Z][a-zA-Z0-9_]*$" },
		equals: formValue,
	},
	additionalProperties: false,
};
const icon = {
	type: "object",
	required: ["source", "name"],
	properties: {
		source: { const: "@fluentui/react-icons" },
		name: { enum: [...FORM_FLUENT_ICON_NAMES_V0] },
	},
	additionalProperties: false,
};
const formAction = {
	type: "object",
	required: ["id", "label"],
	properties: {
		id: { type: "string", pattern: "^[a-zA-Z][a-zA-Z0-9_]*$" },
		label: localizedText,
		role: { enum: ["submit", "cancel"] },
		tone: { enum: ["primary", "danger", "neutral"] },
		icon: { $ref: "#/$defs/icon" },
	},
	additionalProperties: false,
};
const keyedFieldProperties = {
	key: { type: "string", pattern: "^[a-zA-Z][a-zA-Z0-9_]*$" },
	label: localizedText,
};
const presentationProperties = {
	visibleWhen: { $ref: "#/$defs/condition" },
	labelPlacement: { enum: ["top", "hidden"] },
	width: { enum: ["full", "compact"] },
	controlSize: { enum: ["small", "medium"] },
	icon: { $ref: "#/$defs/icon" },
};

export const FORM_SCHEMA_V0 = {
	$defs: {
		localizedText,
		condition,
		icon,
		field: {
			oneOf: [
				{
					type: "object",
					required: ["kind", "key", "label"],
					properties: {
						kind: { const: "text" },
						...keyedFieldProperties,
						default: { type: "string", maxLength: 4096 },
						placeholder: { type: "string", maxLength: 256 },
						required: { type: "boolean" },
						maxLength: { type: "integer", minimum: 1, maximum: 65536 },
						multiline: { type: "boolean" },
						...presentationProperties,
					},
					additionalProperties: false,
				},
				{
					type: "object",
					required: ["kind", "key", "label"],
					properties: {
						kind: { const: "number" },
						...keyedFieldProperties,
						default: { type: "number" },
						min: { type: "number" },
						max: { type: "number" },
						step: { type: "number", minimum: 0 },
						required: { type: "boolean" },
						control: { enum: ["input", "stepper"] },
						decrementIcon: { $ref: "#/$defs/icon" },
						incrementIcon: { $ref: "#/$defs/icon" },
						...presentationProperties,
					},
					additionalProperties: false,
				},
				{
					type: "object",
					required: ["kind", "key", "label"],
					properties: {
						kind: { const: "boolean" },
						...keyedFieldProperties,
						default: { type: "boolean" },
						...presentationProperties,
					},
					additionalProperties: false,
				},
				{
					type: "object",
					required: ["kind", "key", "label", "options"],
					properties: {
						kind: { enum: ["select", "radio"] },
						...keyedFieldProperties,
						options: {
							type: "array",
							minItems: 1,
							maxItems: 200,
							items: option,
						},
						default: { type: "string" },
						orientation: { enum: ["vertical", "horizontal"] },
						...presentationProperties,
					},
					additionalProperties: false,
				},
				{
					type: "object",
					required: ["kind", "text"],
					properties: {
						kind: { const: "note" },
						text: localizedText,
						tone: { enum: ["default", "muted"] },
						visibleWhen: { $ref: "#/$defs/condition" },
						icon: { $ref: "#/$defs/icon" },
					},
					additionalProperties: false,
				},
				{
					type: "object",
					required: ["kind", "id", "fields"],
					properties: {
						kind: { const: "group" },
						id: { type: "string", pattern: "^[a-zA-Z][a-zA-Z0-9_]*$" },
						label: localizedText,
						direction: { enum: ["row", "column"] },
						align: { enum: ["start", "center", "end"] },
						gap: { enum: ["small", "medium", "large"] },
						indent: { type: "boolean" },
						visibleWhen: { $ref: "#/$defs/condition" },
						icon: { $ref: "#/$defs/icon" },
						fields: {
							type: "array",
							minItems: 1,
							maxItems: 64,
							items: { $ref: "#/$defs/field" },
						},
					},
					additionalProperties: false,
				},
			],
		},
	},
	type: "object",
	required: ["title", "fields"],
	properties: {
		title: { $ref: "#/$defs/localizedText" },
		description: { $ref: "#/$defs/localizedText" },
		fields: { type: "array", maxItems: 64, items: { $ref: "#/$defs/field" } },
		size: { enum: ["small", "medium", "large"] },
		icon: { $ref: "#/$defs/icon" },
		submitLabel: { $ref: "#/$defs/localizedText" },
		cancelLabel: { $ref: "#/$defs/localizedText" },
		submitIcon: { $ref: "#/$defs/icon" },
		cancelIcon: { $ref: "#/$defs/icon" },
		actions: { type: "array", minItems: 1, maxItems: 4, items: formAction },
	},
	additionalProperties: false,
} satisfies JsonSchema;

const commandContribution = {
	type: "object",
	required: ["id", "title"],
	properties: {
		id,
		title: localizedText,
		category: localizedText,
		enablement: { type: "string", minLength: 1 },
		defaultKeys: { type: "array", items: id },
	},
	additionalProperties: false,
};
const menuLocations = [
	"menu.file",
	"menu.edit",
	"menu.tool",
	"menu.help",
	"toolbar.edit",
	"toolbar.sync",
	"context.lyricLine",
	"context.lyricWord",
	"sidebar.panel",
];
const menuContribution = {
	type: "object",
	required: ["command", "menu"],
	properties: {
		command: id,
		menu: { enum: menuLocations },
		group: { type: "string" },
		order: { type: "number" },
		when: { type: "string", minLength: 1 },
	},
	additionalProperties: false,
};
const settingsContribution = {
	type: "object",
	required: ["id", "title", "form"],
	properties: { id, title: localizedText, form: FORM_SCHEMA_V0 },
	additionalProperties: false,
};
const baseManifestProperties = {
	id: {
		type: "string",
		pattern:
			"^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$",
	},
	name: { type: "string", minLength: 1, maxLength: 128 },
	version: {
		type: "string",
		pattern:
			"^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?(\\+[0-9A-Za-z.-]+)?$",
	},
	description: { type: "string", maxLength: 4096 },
	author: { type: "string", maxLength: 256 },
	homepage: { type: "string", pattern: "^https://" },
	license: { type: "string", maxLength: 128 },
	extensions: { type: "object" },
};

export const PLUGIN_MANIFEST_SCHEMA = {
	oneOf: [
		{
			type: "object",
			required: [
				"id",
				"name",
				"version",
				"kind",
				"apiVersion",
				"runtime",
				"entry",
				"capabilities",
			],
			properties: {
				...baseManifestProperties,
				kind: { const: "function" },
				apiVersion: { const: PLUGIN_API_VERSION },
				runtime: { enum: ["builtin", "extism-wasm", "trusted-js"] },
				entry: { type: "string", minLength: 1 },
				capabilities: {
					type: "array",
					items: {
						anyOf: [
							{ enum: ALL_CAPABILITIES },
							{
								type: "string",
								pattern:
									"^extensions\\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+\\.[a-z][a-z0-9-]*$",
							},
						],
					},
				},
				contributes: {
					type: "object",
					properties: {
						commands: { type: "array", items: commandContribution },
						menus: { type: "array", items: menuContribution },
						settings: { type: "array", items: settingsContribution },
					},
					additionalProperties: false,
				},
				activationEvents: {
					type: "array",
					items: {
						type: "string",
						pattern: "^(onStartup|onDocumentChanged|onCommand:.+)$",
					},
				},
			},
			additionalProperties: false,
		},
		{
			type: "object",
			required: [
				"id",
				"name",
				"version",
				"kind",
				"themeApiVersion",
				"runtime",
				"appearance",
				"tokens",
			],
			properties: {
				...baseManifestProperties,
				kind: { const: "theme" },
				themeApiVersion: { const: THEME_API_VERSION },
				runtime: { const: "none" },
				appearance: { enum: ["light", "dark", "both"] },
				tokens: { type: "string", minLength: 1 },
				styles: {
					type: "array",
					items: { type: "string", minLength: 1 },
				},
			},
			additionalProperties: false,
		},
	],
} satisfies JsonSchema;

const documentDefs = {
	ruby: {
		type: "object",
		required: ["text", "startTime", "endTime"],
		properties: { text: { type: "string" }, startTime: time, endTime: time },
		additionalProperties: false,
	},
	word: {
		type: "object",
		required: ["id", "text", "startTime", "endTime", "emptyBeat", "romanText"],
		properties: {
			id,
			text: { type: "string" },
			startTime: time,
			endTime: time,
			emptyBeat: { type: "number" },
			romanText: { type: "string" },
			ruby: { type: "array", items: { $ref: "#/$defs/ruby" } },
		},
		additionalProperties: false,
	},
	line: {
		type: "object",
		required: [
			"id",
			"words",
			"translation",
			"romanization",
			"isBackground",
			"isDuet",
			"startTime",
			"endTime",
			"ignoreSync",
		],
		properties: {
			id,
			words: { type: "array", items: { $ref: "#/$defs/word" } },
			translation: { type: "string" },
			romanization: { type: "string" },
			isBackground: { type: "boolean" },
			isDuet: { type: "boolean" },
			startTime: time,
			endTime: time,
			ignoreSync: { type: "boolean" },
		},
		additionalProperties: false,
	},
	metadata: {
		type: "object",
		required: ["key", "values"],
		properties: {
			key: { type: "string", minLength: 1 },
			values: { type: "array", items: { type: "string" } },
		},
		additionalProperties: false,
	},
};

export const PLUGIN_DOCUMENT_SCHEMA = {
	$defs: {
		...documentDefs,
		jsonValue: {
			oneOf: [
				{ type: "null" },
				{ type: "boolean" },
				{ type: "number" },
				{ type: "string" },
				{ type: "array", items: { $ref: "#/$defs/jsonValue" } },
				{
					type: "object",
					additionalProperties: { $ref: "#/$defs/jsonValue" },
				},
			],
		},
	},
	type: "object",
	required: ["revision", "lines", "metadata"],
	properties: {
		revision: { type: "integer", minimum: 0 },
		lines: { type: "array", items: { $ref: "#/$defs/line" } },
		metadata: { type: "array", items: { $ref: "#/$defs/metadata" } },
		extensions: {
			type: "object",
			additionalProperties: { $ref: "#/$defs/jsonValue" },
		},
	},
	additionalProperties: false,
} satisfies JsonSchema;

const linePatchProperties = {
	translation: { type: "string" },
	romanization: { type: "string" },
	isBackground: { type: "boolean" },
	isDuet: { type: "boolean" },
	startTime: time,
	endTime: time,
	ignoreSync: { type: "boolean" },
};
const wordPatchProperties = {
	text: { type: "string" },
	startTime: time,
	endTime: time,
	emptyBeat: { type: "number" },
	romanText: { type: "string" },
	ruby: { type: "array", items: documentDefs.ruby },
};
const newWordSchema = {
	type: "object",
	required: ["text", "startTime", "endTime", "emptyBeat", "romanText"],
	properties: wordPatchProperties,
	additionalProperties: false,
};
const newLineSchema = {
	type: "object",
	required: [
		"words",
		"translation",
		"romanization",
		"isBackground",
		"isDuet",
		"startTime",
		"endTime",
		"ignoreSync",
	],
	properties: {
		...linePatchProperties,
		words: { type: "array", items: newWordSchema },
	},
	additionalProperties: false,
};
const opSchema = (
	op: string,
	required: string[],
	properties: Record<string, unknown>,
) => ({
	type: "object",
	required: ["op", ...required],
	properties: { op: { const: op }, ...properties },
	additionalProperties: false,
});

export const LYRICS_APPLY_EDIT_SCHEMA = {
	type: "object",
	required: ["expectedRevision", "label", "ops"],
	properties: {
		expectedRevision: { type: "integer", minimum: -1 },
		label: { type: "string", minLength: 1, maxLength: 256 },
		ops: {
			type: "array",
			maxItems: 10000,
			items: {
				oneOf: [
					opSchema("updateLine", ["lineId", "patch"], {
						lineId: id,
						patch: {
							type: "object",
							properties: linePatchProperties,
							additionalProperties: false,
						},
					}),
					opSchema("updateWord", ["wordId", "patch"], {
						wordId: id,
						patch: {
							type: "object",
							properties: wordPatchProperties,
							additionalProperties: false,
						},
					}),
					opSchema("insertLine", ["afterLineId", "line"], {
						afterLineId: { ...id, nullable: true },
						line: newLineSchema,
					}),
					opSchema("removeLine", ["lineId"], { lineId: id }),
					opSchema("moveLine", ["lineId", "afterLineId"], {
						lineId: id,
						afterLineId: { ...id, nullable: true },
					}),
					opSchema("insertWord", ["lineId", "afterWordId", "word"], {
						lineId: id,
						afterWordId: { ...id, nullable: true },
						word: newWordSchema,
					}),
					opSchema("removeWord", ["wordId"], { wordId: id }),
					opSchema("setMetadata", ["entries"], {
						entries: { type: "array", items: documentDefs.metadata },
					}),
					opSchema("replaceDocument", ["lines", "metadata"], {
						lines: { type: "array", items: newLineSchema },
						metadata: { type: "array", items: documentDefs.metadata },
					}),
				],
			},
		},
	},
	additionalProperties: false,
} satisfies JsonSchema;

export const NOTIFY_PARAMS_SCHEMA = {
	type: "object",
	required: ["level", "message"],
	properties: {
		level: { enum: ["info", "success", "warning", "error"] },
		message: { type: "string", minLength: 1, maxLength: 4096 },
		detail: { type: "string", maxLength: 16384 },
		timeoutMs: { type: "number", minimum: 0, maximum: 60000 },
	},
	additionalProperties: false,
} satisfies JsonSchema;

const jsonValueDefs = {
	jsonValue: {
		oneOf: [
			{ type: "null" },
			{ type: "boolean" },
			{ type: "number" },
			{ type: "string" },
			{ type: "array", items: { $ref: "#/$defs/jsonValue" } },
			{ type: "object", additionalProperties: { $ref: "#/$defs/jsonValue" } },
		],
	},
};
const emptyParams = {
	type: "object",
	properties: {},
	additionalProperties: false,
};
const keyParams = {
	type: "object",
	required: ["key"],
	properties: { key: { type: "string", minLength: 1, maxLength: 256 } },
	additionalProperties: false,
};
export const HOST_PARAM_SCHEMAS: Readonly<Record<HostMethod, JsonSchema>> = {
	"lyrics.getDocument": emptyParams,
	"lyrics.getSelection": emptyParams,
	"lyrics.applyEdit": LYRICS_APPLY_EDIT_SCHEMA,
	"ui.notify": NOTIFY_PARAMS_SCHEMA,
	"ui.showForm": {
		type: "object",
		required: ["schema"],
		properties: { schema: FORM_SCHEMA_V0 },
		additionalProperties: false,
	},
	"storage.get": keyParams,
	"storage.set": {
		...keyParams,
		$defs: jsonValueDefs,
		required: ["key", "value"],
		properties: {
			...(keyParams.properties as object),
			value: { $ref: "#/$defs/jsonValue" },
		},
	},
	"storage.delete": keyParams,
	"storage.keys": emptyParams,
};

export const HOST_CALL_ENVELOPE_SCHEMA = {
	type: "object",
	required: ["id", "method", "params"],
	properties: {
		id,
		method: { enum: Object.keys(HOST_PARAM_SCHEMAS) },
		params: { type: "object" },
	},
	additionalProperties: false,
} satisfies JsonSchema;

const pluginError = {
	type: "object",
	required: ["code", "message"],
	properties: {
		code: {
			enum: [
				"revision-conflict",
				"permission-denied",
				"invalid-params",
				"not-found",
				"unsupported-api-version",
				"timeout",
				"cancelled",
				"payload-too-large",
				"plugin-crashed",
				"internal",
			],
		},
		message: { type: "string", minLength: 1 },
		data: { $ref: "#/$defs/jsonValue" },
	},
	additionalProperties: false,
};
export const HOST_RESPONSE_SCHEMA = {
	$defs: jsonValueDefs,
	type: "object",
	required: ["id", "result"],
	properties: {
		id,
		result: {
			oneOf: [
				{
					type: "object",
					required: ["ok", "value"],
					properties: {
						ok: { const: true },
						value: { $ref: "#/$defs/jsonValue" },
					},
					additionalProperties: false,
				},
				{
					type: "object",
					required: ["ok", "error"],
					properties: { ok: { const: false }, error: pluginError },
					additionalProperties: false,
				},
			],
		},
	},
	additionalProperties: false,
} satisfies JsonSchema;

export const PLUGIN_RETURN_SCHEMA = {
	$defs: jsonValueDefs,
	oneOf: (HOST_RESPONSE_SCHEMA.properties.result as { oneOf: JsonSchema[] })
		.oneOf,
} satisfies JsonSchema;

export const PLUGIN_EVENT_SCHEMA = {
	oneOf: [
		{
			type: "object",
			required: [
				"type",
				"revision",
				"source",
				"changedLineIds",
				"changedWordIds",
			],
			properties: {
				type: { const: "document.changed" },
				revision: { type: "integer", minimum: 0 },
				source: { enum: ["user", "plugin", "host", "import"] },
				changedLineIds: { type: "array", items: id },
				changedWordIds: { type: "array", items: id },
			},
			additionalProperties: false,
		},
		...(["document.undo", "document.redo"] as const).map((type) => ({
			type: "object",
			required: ["type", "revision"],
			properties: {
				type: { const: type },
				revision: { type: "integer", minimum: 0 },
			},
			additionalProperties: false,
		})),
		{
			type: "object",
			required: ["type", "selection"],
			properties: {
				type: { const: "selection.changed" },
				selection: {
					type: "object",
					required: ["lineIds", "wordIds"],
					properties: {
						lineIds: { type: "array", items: id },
						wordIds: { type: "array", items: id },
					},
					additionalProperties: false,
				},
			},
			additionalProperties: false,
		},
	],
} satisfies JsonSchema;

export const THEME_TOKENS_SCHEMA = {
	type: "object",
	required: ["tokenVersion"],
	properties: {
		tokenVersion: { const: THEME_TOKEN_VERSION },
		color: { type: "object", additionalProperties: { type: "string" } },
		font: {
			type: "object",
			properties: {
				family: { type: "string" },
				monoFamily: { type: "string" },
				scale: { type: "number", minimum: 0.5, maximum: 2 },
			},
			additionalProperties: false,
		},
		spacing: {
			type: "object",
			properties: {
				scale: { type: "number", minimum: 0.5, maximum: 2 },
				radius: { type: "string" },
			},
			additionalProperties: false,
		},
		lyrics: { type: "object", additionalProperties: { type: "string" } },
		spectrogram: { type: "object", additionalProperties: { type: "string" } },
		background: {
			type: "object",
			required: ["kind"],
			properties: {
				kind: { enum: ["solid", "gradient", "none"] },
				value: { type: "string" },
			},
			additionalProperties: false,
		},
	},
	additionalProperties: false,
} satisfies JsonSchema;

export const SCHEMA_CATALOG = {
	manifest: PLUGIN_MANIFEST_SCHEMA,
	pluginDocument: PLUGIN_DOCUMENT_SCHEMA,
	lyricsApplyEdit: LYRICS_APPLY_EDIT_SCHEMA,
	form: FORM_SCHEMA_V0,
	notify: NOTIFY_PARAMS_SCHEMA,
	hostCall: HOST_CALL_ENVELOPE_SCHEMA,
	hostResponse: HOST_RESPONSE_SCHEMA,
	pluginReturn: PLUGIN_RETURN_SCHEMA,
	pluginEvent: PLUGIN_EVENT_SCHEMA,
	themeTokens: THEME_TOKENS_SCHEMA,
} as const;

export const functionManifestSchema = PLUGIN_MANIFEST_SCHEMA
	.oneOf[0] as JsonSchema;
export const themeManifestSchema = PLUGIN_MANIFEST_SCHEMA
	.oneOf[1] as JsonSchema;
export const lyricsApplyEditParamsSchema = LYRICS_APPLY_EDIT_SCHEMA;
export const notifyParamsSchema = NOTIFY_PARAMS_SCHEMA;
export const themeTokensSchema = THEME_TOKENS_SCHEMA;
