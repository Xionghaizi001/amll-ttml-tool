import { isCapability } from "./capabilities";
import {
	FORM_RESULT_SCHEMA,
	FORM_SCHEMA_V0,
	HOST_CALL_ENVELOPE_SCHEMA,
	HOST_PARAM_SCHEMAS,
	HOST_RESPONSE_SCHEMA,
	PLUGIN_COMMAND_OUTCOME_SCHEMA,
	PLUGIN_DOCUMENT_SCHEMA,
	PLUGIN_EVENT_SCHEMA,
	PLUGIN_MANIFEST_SCHEMA,
	PLUGIN_RETURN_SCHEMA,
	THEME_TOKENS_SCHEMA,
} from "./schema/schemas";
import { validate } from "./schema/validator";
import type {
	FormResultV0,
	FormSchemaV0,
	HostCallV0,
	HostMethod,
	HostResponseV0,
	ParseIssue,
	ParseResult,
	PluginCommandOutcomeV0,
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
	const fieldTypes = new Map<string, "string" | "number" | "boolean">();
	const groupIds = new Set<string>();
	const conditions: {
		field: string;
		equals: string | number | boolean;
		path: string;
	}[] = [];
	const visit = (
		fields: FormSchemaV0["fields"],
		fieldsPath: string,
		depth: number,
	) => {
		if (depth > 4) {
			issues.push({
				path: fieldsPath,
				message: "form groups exceed max depth 4",
			});
			return;
		}
		fields.forEach((field, index) => {
			const fieldPath = `${fieldsPath}/${index}`;
			if (field.visibleWhen)
				conditions.push({
					field: field.visibleWhen.field,
					equals: field.visibleWhen.equals,
					path: `${fieldPath}/visibleWhen/field`,
				});
			if (field.kind === "group") {
				if (groupIds.has(field.id))
					issues.push({
						path: `${fieldPath}/id`,
						message: "form group id must be unique",
					});
				groupIds.add(field.id);
				visit(field.fields, `${fieldPath}/fields`, depth + 1);
				return;
			}
			if (field.kind === "note") return;
			if (keys.has(field.key))
				issues.push({
					path: `${fieldPath}/key`,
					message: "form field key must be unique",
				});
			keys.add(field.key);
			fieldTypes.set(
				field.key,
				field.kind === "number"
					? "number"
					: field.kind === "boolean"
						? "boolean"
						: "string",
			);
			if (field.kind === "select" || field.kind === "radio") {
				const optionValues = new Set<string>();
				field.options.forEach((option, optionIndex) => {
					if (optionValues.has(option.value))
						issues.push({
							path: `${fieldPath}/options/${optionIndex}/value`,
							message: "option value must be unique",
						});
					optionValues.add(option.value);
				});
				if (
					field.default !== undefined &&
					!field.options.some((option) => option.value === field.default)
				)
					issues.push({
						path: `${fieldPath}/default`,
						message: "default must reference an option",
					});
				if (
					field.default !== undefined &&
					field.options.some(
						(option) => option.value === field.default && option.disabled,
					)
				)
					issues.push({
						path: `${fieldPath}/default`,
						message: "default must not reference a disabled option",
					});
			}
			if (field.kind === "number") {
				if (field.step !== undefined && field.step <= 0)
					issues.push({
						path: `${fieldPath}/step`,
						message: "step must be greater than zero",
					});
				if (
					field.min !== undefined &&
					field.max !== undefined &&
					field.min > field.max
				)
					issues.push({
						path: fieldPath,
						message: "min must not exceed max",
					});
				if (
					field.default !== undefined &&
					field.min !== undefined &&
					field.default < field.min
				)
					issues.push({
						path: `${fieldPath}/default`,
						message: "default is below min",
					});
				if (
					field.default !== undefined &&
					field.max !== undefined &&
					field.default > field.max
				)
					issues.push({
						path: `${fieldPath}/default`,
						message: "default is above max",
					});
			}
		});
	};
	visit(form.fields, `${path}/fields`, 0);
	const actionIds = new Set<string>();
	form.actions?.forEach((action, index) => {
		if (actionIds.has(action.id))
			issues.push({
				path: `${path}/actions/${index}/id`,
				message: "form action id must be unique",
			});
		actionIds.add(action.id);
	});
	for (const condition of conditions) {
		if (!keys.has(condition.field))
			issues.push({
				path: condition.path,
				message: "visibleWhen must reference a form field key",
			});
		else if (fieldTypes.get(condition.field) !== typeof condition.equals)
			issues.push({
				path: condition.path.replace(/\/field$/, "/equals"),
				message: "visibleWhen value type must match the referenced field",
			});
	}
	return issues;
}

export function parseManifestSchema(
	input: unknown,
): ParseResult<PluginManifest> {
	// Modes own the whole main viewport and are a trusted-host-only surface;
	// reject them with a targeted message before the generic schema pass turns
	// the attempt into an anonymous "additional property" issue.
	if (typeof input === "object" && input !== null) {
		const contributes = (input as { contributes?: unknown }).contributes;
		if (
			typeof contributes === "object" &&
			contributes !== null &&
			"modes" in contributes
		)
			return fail([
				{
					path: "$/contributes/modes",
					message:
						"mode (main page) contributions are reserved for trusted builtin scopes and cannot be declared by plugin manifests",
				},
			]);
	}
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
		manifest.contributes?.menus?.forEach((menu, index) => {
			if (!menu.command.startsWith(prefix))
				issues.push({
					path: `$/contributes/menus/${index}/command`,
					message: `must reference a command starting with ${prefix}`,
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
		manifest.contributes?.titleBarActions?.forEach((action, index) => {
			if (!action.command.startsWith(prefix))
				issues.push({
					path: `$/contributes/titleBarActions/${index}/command`,
					message: `must reference a command starting with ${prefix}`,
				});
			if (action.id !== undefined && !action.id.startsWith(prefix))
				issues.push({
					path: `$/contributes/titleBarActions/${index}/id`,
					message: `must start with ${prefix}`,
				});
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
	if (!params.ok)
		return fail(
			params.issues.map((issue) => ({
				...issue,
				path: `/params${issue.path}`,
			})),
		);
	if (method === "ui.showForm") {
		// Structural validation alone still admits duplicate keys, dangling
		// visibleWhen references and invalid defaults; run the same semantic
		// pass that manifest settings forms get.
		const semanticIssues = validateFormSemantics(
			(envelope.value.params as { schema: FormSchemaV0 }).schema,
			"/params/schema",
		);
		if (semanticIssues.length > 0) return fail(semanticIssues);
	}
	return envelope;
}

export const parseHostResponse = (
	input: unknown,
): ParseResult<HostResponseV0> =>
	validate<HostResponseV0>(HOST_RESPONSE_SCHEMA, input);

export const parsePluginReturn = (
	input: unknown,
): ParseResult<PluginReturnV0> =>
	validate<PluginReturnV0>(PLUGIN_RETURN_SCHEMA, input);

/**
 * Validates the value a guest returned from `plugin_execute_command` or
 * `plugin_resume_form`. showForm outcomes run the same semantic form pass as
 * every other form entering the host renderer.
 */
export function parseCommandOutcome(
	input: unknown,
): ParseResult<PluginCommandOutcomeV0> {
	const parsed = validate<PluginCommandOutcomeV0>(
		PLUGIN_COMMAND_OUTCOME_SCHEMA,
		input,
	);
	if (!parsed.ok) return parsed;
	if (parsed.value.kind === "showForm") {
		const issues = validateFormSemantics(parsed.value.schema, "/schema");
		if (issues.length > 0) return fail(issues);
	}
	return parsed;
}

export const parseFormResult = (input: unknown): ParseResult<FormResultV0> =>
	validate<FormResultV0>(FORM_RESULT_SCHEMA, input);

export const parsePluginEvent = (input: unknown): ParseResult<PluginEventV0> =>
	validate<PluginEventV0>(PLUGIN_EVENT_SCHEMA, input);

export const parseThemeTokens = (input: unknown): ParseResult<ThemeTokensV0> =>
	validate<ThemeTokensV0>(THEME_TOKENS_SCHEMA, input);
