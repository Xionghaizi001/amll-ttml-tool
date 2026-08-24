import { isCapability } from "./capabilities";
import {
	FORM_SCHEMA_V0,
	HOST_CALL_ENVELOPE_SCHEMA,
	HOST_PARAM_SCHEMAS,
	HOST_RESPONSE_SCHEMA,
	PLUGIN_DOCUMENT_SCHEMA,
	PLUGIN_EVENT_SCHEMA,
	PLUGIN_MANIFEST_SCHEMA,
	PLUGIN_RETURN_SCHEMA,
	THEME_TOKENS_SCHEMA,
} from "./schema/schemas";
import { validate } from "./schema/validator";
import type {
	FormSchemaV0,
	HostCallV0,
	HostMethod,
	HostResponseV0,
	ParseIssue,
	ParseResult,
	PluginDocumentV0,
	PluginEventV0,
	PluginManifest,
	PluginReturnV0,
	ThemeTokensV0,
} from "./types";

const fail = <T>(issues: ParseIssue[]): ParseResult<T> => ({
	ok: false,
	issues,
});
const relativePackagePath = /^(?![/\\])(?!.*(?:^|[/\\])\.\.(?:[/\\]|$)).+$/;

function validateFormSemantics(form: FormSchemaV0, path: string): ParseIssue[] {
	const issues: ParseIssue[] = [];
	const keys = new Set<string>();
	form.fields.forEach((field, index) => {
		if (field.kind === "note") return;
		if (keys.has(field.key))
			issues.push({
				path: `${path}/fields/${index}/key`,
				message: "form field key must be unique",
			});
		keys.add(field.key);
		if (
			(field.kind === "select" || field.kind === "radio") &&
			field.default !== undefined
		) {
			if (!field.options.some((option) => option.value === field.default))
				issues.push({
					path: `${path}/fields/${index}/default`,
					message: "default must reference an option",
				});
		}
		if (field.kind === "number") {
			if (
				field.min !== undefined &&
				field.max !== undefined &&
				field.min > field.max
			)
				issues.push({
					path: `${path}/fields/${index}`,
					message: "min must not exceed max",
				});
			if (
				field.default !== undefined &&
				field.min !== undefined &&
				field.default < field.min
			)
				issues.push({
					path: `${path}/fields/${index}/default`,
					message: "default is below min",
				});
			if (
				field.default !== undefined &&
				field.max !== undefined &&
				field.default > field.max
			)
				issues.push({
					path: `${path}/fields/${index}/default`,
					message: "default is above max",
				});
		}
	});
	return issues;
}

export function parseManifestSchema(
	input: unknown,
): ParseResult<PluginManifest> {
	const parsed = validate<PluginManifest>(PLUGIN_MANIFEST_SCHEMA, input);
	if (!parsed.ok) return parsed;
	const manifest = parsed.value;
	const issues: ParseIssue[] = [];
	const paths =
		manifest.kind === "function"
			? [{ value: manifest.entry, path: "$/entry" }]
			: [
					{ value: manifest.tokens, path: "$/tokens" },
					...(manifest.styles ?? []).map((value, index) => ({
						value,
						path: `$/styles/${index}`,
					})),
				];
	for (const item of paths) {
		if (!relativePackagePath.test(item.value))
			issues.push({
				path: item.path,
				message: "must be a package-relative path",
			});
	}
	if (manifest.kind === "function") {
		if (manifest.runtime === "trusted-js")
			issues.push({
				path: "/runtime",
				message: "trusted-js is not available in the MVP",
			});
		if (
			manifest.runtime === "builtin" &&
			!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(manifest.entry)
		)
			issues.push({
				path: "/entry",
				message: "builtin entry must be an internal identifier",
			});
		const capabilitySet = new Set<string>();
		manifest.capabilities.forEach((capability, index) => {
			if (!isCapability(capability))
				issues.push({
					path: `$/capabilities/${index}`,
					message: "unknown capability",
				});
			if (capabilitySet.has(capability))
				issues.push({
					path: `$/capabilities/${index}`,
					message: "duplicate capability",
				});
			capabilitySet.add(capability);
		});
		const prefix = `${manifest.id}.`;
		manifest.contributes?.commands?.forEach((command, index) => {
			if (!command.id.startsWith(prefix))
				issues.push({
					path: `$/contributes/commands/${index}/id`,
					message: `must start with ${prefix}`,
				});
		});
		manifest.contributes?.settings?.forEach((page, index) => {
			if (!page.id.startsWith(prefix))
				issues.push({
					path: `$/contributes/settings/${index}/id`,
					message: `must start with ${prefix}`,
				});
			issues.push(
				...validateFormSemantics(
					page.form,
					`$/contributes/settings/${index}/form`,
				),
			);
		});
	}
	return issues.length === 0 ? parsed : fail(issues);
}

export function parsePluginDocument(
	input: unknown,
): ParseResult<PluginDocumentV0> {
	const parsed = validate<PluginDocumentV0>(PLUGIN_DOCUMENT_SCHEMA, input);
	if (!parsed.ok) return parsed;
	const issues: ParseIssue[] = [];
	const lineIds = new Set<string>();
	const wordIds = new Set<string>();
	parsed.value.lines.forEach((line, lineIndex) => {
		if (lineIds.has(line.id))
			issues.push({
				path: `$/lines/${lineIndex}/id`,
				message: "line id must be unique",
			});
		lineIds.add(line.id);
		if (line.endTime < line.startTime)
			issues.push({
				path: `$/lines/${lineIndex}/endTime`,
				message: "endTime must not precede startTime",
			});
		line.words.forEach((word, wordIndex) => {
			if (wordIds.has(word.id))
				issues.push({
					path: `$/lines/${lineIndex}/words/${wordIndex}/id`,
					message: "word id must be unique",
				});
			wordIds.add(word.id);
			if (word.endTime < word.startTime)
				issues.push({
					path: `$/lines/${lineIndex}/words/${wordIndex}/endTime`,
					message: "endTime must not precede startTime",
				});
		});
	});
	return issues.length === 0 ? parsed : fail(issues);
}

export function parseFormSchema(input: unknown): ParseResult<FormSchemaV0> {
	const parsed = validate<FormSchemaV0>(FORM_SCHEMA_V0, input);
	if (!parsed.ok) return parsed;
	const issues = validateFormSemantics(parsed.value, "");
	return issues.length === 0 ? parsed : fail(issues);
}

export function parseHostCall(input: unknown): ParseResult<HostCallV0> {
	const envelope = validate<HostCallV0>(HOST_CALL_ENVELOPE_SCHEMA, input);
	if (!envelope.ok) return envelope;
	const method = envelope.value.method as HostMethod;
	const params = validate(HOST_PARAM_SCHEMAS[method], envelope.value.params);
	return params.ok
		? envelope
		: fail(
				params.issues.map((issue) => ({
					...issue,
					path: `/params${issue.path}`,
				})),
			);
}

export const parseHostResponse = (
	input: unknown,
): ParseResult<HostResponseV0> =>
	validate<HostResponseV0>(HOST_RESPONSE_SCHEMA, input);

export const parsePluginReturn = (
	input: unknown,
): ParseResult<PluginReturnV0> =>
	validate<PluginReturnV0>(PLUGIN_RETURN_SCHEMA, input);

export const parsePluginEvent = (input: unknown): ParseResult<PluginEventV0> =>
	validate<PluginEventV0>(PLUGIN_EVENT_SCHEMA, input);

export const parseThemeTokens = (input: unknown): ParseResult<ThemeTokensV0> =>
	validate<ThemeTokensV0>(THEME_TOKENS_SCHEMA, input);
