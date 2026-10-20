import {
	ICONS_OVERRIDE_SCHEMA,
	LOCALIZATION_OVERRIDE_SCHEMA,
} from "./schema/schemas";
import { validate } from "./schema/validator";
import { localizedTextHasHtml, mergeStringTables } from "./strings";
import type {
	FormFieldV0,
	FormSchemaV0,
	IconsOverridePayloadV0,
	LocalizationOverridePayloadV0,
	LocalizedText,
	PackageResourcesV0,
	ParseIssue,
	ParseResult,
	PluginManifest,
	PluginOverrideV0,
} from "./types";

type Payload = LocalizationOverridePayloadV0 | IconsOverridePayloadV0;
/** JSON Pointer segment escaping used by override surface keys. */
export const escapeOverrideKeySegment = (key: string): string =>
	key.replace(/~/g, "~0").replace(/\//g, "~1");

/** Validate even unknown keys before filtering; payloads are never object patches. */
export function parseOverridePayload(
	kind: PluginOverrideV0["kind"],
	input: unknown,
): ParseResult<Payload> {
	const parsed = validate<Payload>(
		kind === "localization"
			? LOCALIZATION_OVERRIDE_SCHEMA
			: ICONS_OVERRIDE_SCHEMA,
		input,
	);
	if (!parsed.ok) return parsed;
	const issues: ParseIssue[] = [];
	for (const [key, value] of Object.entries(parsed.value)) {
		if (!key.startsWith("/") || key.length > 1024 || /~(?![01])/u.test(key))
			issues.push({
				path: `/${escapeOverrideKeySegment(key)}`,
				message:
					"key must be a surface JSON pointer of at most 1024 characters",
			});
		if (kind === "localization" && localizedTextHasHtml(value as LocalizedText))
			issues.push({
				path: `/${escapeOverrideKeySegment(key)}`,
				message: "override text must not contain HTML",
			});
	}
	return issues.length ? { ok: false, issues } : parsed;
}

/**
 * Package gate for override payloads and string tables: all declared
 * resources must exist and validate, all carried resources be declared.
 */
export function validatePackageResources(
	manifest: PluginManifest,
	resources: PackageResourcesV0 = {},
): ParseIssue[] {
	const strings = mergeStringTables(manifest, resources);
	const issues: ParseIssue[] = strings.ok ? [] : [...strings.issues];
	const declared = new Set<string>(
		manifest.kind === "function" ? manifest.contributes?.strings : [],
	);
	const locales = new Map<string, Set<string>>();
	for (const override of manifest.overrides ?? []) {
		declared.add(override.entry);
		const path = `/resources/${escapeOverrideKeySegment(override.entry)}`;
		if (!Object.hasOwn(resources, override.entry)) {
			issues.push({
				path,
				message:
					"manifest declares an override resource the package does not carry",
			});
			continue;
		}
		const parsed = parseOverridePayload(
			override.kind,
			resources[override.entry],
		);
		if (!parsed.ok)
			issues.push(
				...parsed.issues.map((issue) => ({
					...issue,
					path: `${path}${issue.path}`,
				})),
			);
		else if (override.kind === "localization") {
			for (const [key, text] of Object.entries(parsed.value)) {
				const identity = JSON.stringify([override.pluginId, key]);
				const languages = locales.get(identity) ?? new Set<string>();
				for (const locale of typeof text === "string"
					? ["default"]
					: Object.keys(text))
					languages.add(locale);
				locales.set(identity, languages);
				if (languages.size > 16)
					issues.push({
						path,
						message:
							"override key exceeds 16 language entries across resources (including default)",
					});
			}
		}
	}
	for (const entry of Object.keys(resources)) {
		if (!declared.has(entry))
			issues.push({
				path: `/resources/${escapeOverrideKeySegment(entry)}`,
				message: "undeclared package resource",
			});
	}
	return issues;
}

/** Enumerates only public declarative surfaces. IDs serve as addresses, never values to replace. */
export function getOverrideSurfaceKeys(
	target: PluginManifest,
	kind: PluginOverrideV0["kind"],
	strings: Record<string, LocalizedText> = {},
): Set<string> {
	const keys = new Set<string>();
	const add = (object: object, base: string, fields: readonly string[]) => {
		for (const field of fields)
			if (Object.hasOwn(object, field)) keys.add(`${base}/${field}`);
	};
	if (kind === "localization")
		for (const key of Object.keys(strings))
			keys.add(`/strings/${escapeOverrideKeySegment(key)}`);
	if (target.kind !== "function") return keys;
	const contributions = target.contributes;
	for (const action of contributions?.titleBarActions ?? []) {
		add(
			action,
			`/titleBarActions/${escapeOverrideKeySegment(action.id ?? action.command)}`,
			kind === "icons" ? ["icon"] : ["tooltip"],
		);
	}
	if (kind === "icons") return keys;
	for (const command of contributions?.commands ?? [])
		add(command, `/commands/${escapeOverrideKeySegment(command.id)}`, ["title", "category"]);
	for (const format of contributions?.formats ?? [])
		add(format, `/formats/${escapeOverrideKeySegment(format.id)}`, ["title"]);
	const fields = (items: FormFieldV0[], base: string) => {
		items.forEach((field, index) => {
			const path = `${base}/${index}`;
			add(field, path, field.kind === "note" ? ["text"] : ["label"]);
			if (field.kind === "group") fields(field.fields, `${path}/fields`);
			if (field.kind === "select" || field.kind === "radio")
				field.options.forEach((option, i) => {
					add(option, `${path}/options/${i}`, ["label"]);
				});
		});
	};
	const form = (value: FormSchemaV0, base: string) => {
		add(value, base, ["title", "description", "submitLabel", "cancelLabel"]);
		fields(value.fields, `${base}/fields`);
		value.actions?.forEach((action, i) => {
			add(action, `${base}/actions/${i}`, ["label"]);
		});
	};
	for (const setting of contributions?.settings ?? []) {
		const base = `/settings/${escapeOverrideKeySegment(setting.id)}`;
		add(setting, base, ["title"]);
		form(setting.form, `${base}/form`);
	}
	return keys;
}

/** Caller logs diagnostics with provider/target identity; this function does not mutate the target. */
export function resolveOverridePayload(
	override: PluginOverrideV0,
	input: unknown,
	target: PluginManifest,
	strings: Record<string, LocalizedText> = {},
): ParseResult<{ payload: Payload; diagnostics: ParseIssue[] }> {
	if (override.pluginId !== target.id)
		return {
			ok: false,
			issues: [
				{ path: "/pluginId", message: "override target identity mismatch" },
			],
		};
	const parsed = parseOverridePayload(override.kind, input);
	if (!parsed.ok) return parsed;
	const allowed = getOverrideSurfaceKeys(target, override.kind, strings);
	const diagnostics: ParseIssue[] = [];
	const entries = Object.entries(parsed.value).filter(([key]) => {
		if (allowed.has(key)) return true;
		diagnostics.push({
			path: key,
			message: "unknown or non-overridable target key ignored",
		});
		return false;
	});
	return {
		ok: true,
		value: { payload: Object.fromEntries(entries), diagnostics },
	};
}
