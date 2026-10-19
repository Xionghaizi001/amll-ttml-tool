import { STRING_TABLE_SCHEMA } from "./schema/schemas";
import { validate } from "./schema/validator";
import type {
	LocalizedText,
	PackageResourcesV0,
	ParseIssue,
	ParseResult,
	PluginManifest,
	StringTableV0,
} from "./types";

/** Keys are plain identifiers, never paths; `/strings/<key>` is the override address. */
export const STRING_KEY_PATTERN_V0 = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/u;
export const STRING_TABLE_LANGUAGES_LIMIT_V0 = 16;

const HTML_PATTERN = /<\s*(?:\/?[a-z][^>]*|![^>]*|\?[^>]*)>/iu;

/** Shared by string tables and localization overrides. */
export const localizedTextHasHtml = (
	text: LocalizedText | Readonly<Record<string, string>>,
): boolean =>
	(typeof text === "string" ? [text] : Object.values(text)).some(
		(value) => typeof value === "string" && HTML_PATTERN.test(value),
	);

/** BCP-47 lookup with base-language fallback, then default. */
export const localizeText = (text: LocalizedText, locale: string): string => {
	if (typeof text === "string") return text;
	return text[locale] ?? text[locale.split("-")[0]] ?? text.default;
};

/** `{name}` placeholders only; unknown placeholders stay verbatim. */
export const formatPluginString = (
	text: string,
	params?: Readonly<Record<string, string | number>>,
): string =>
	params === undefined
		? text
		: text.replace(/\{([A-Za-z0-9_]+)\}/gu, (match, name: string) =>
				Object.hasOwn(params, name) ? String(params[name]) : match,
			);

export function parseStringTable(input: unknown): ParseResult<StringTableV0> {
	const parsed = validate<StringTableV0>(STRING_TABLE_SCHEMA, input);
	if (!parsed.ok) return parsed;
	const issues: ParseIssue[] = [];
	for (const [key, text] of Object.entries(parsed.value)) {
		if (!STRING_KEY_PATTERN_V0.test(key))
			issues.push({
				path: `/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`,
				message:
					"string key must be at most 128 letters, digits, '_', '.' or '-' and not start with '.' or '-'",
			});
		else if (typeof text === "object" && Object.keys(text).length === 0)
			issues.push({ path: `/${key}`, message: "string entry must declare at least one locale" });
		else if (localizedTextHasHtml(text))
			issues.push({ path: `/${key}`, message: "string text must not contain HTML" });
	}
	return issues.length ? { ok: false, issues } : parsed;
}

/**
 * Merges every `contributes.strings` resource into one table. A key may be
 * split across files by locale (`strings/en.json` holding only `en`), but
 * the merged entry must carry `default`; the same key+locale in two files,
 * or more than 16 entries for one key (default included), is a package error.
 */
export function mergeStringTables(
	manifest: PluginManifest,
	resources: PackageResourcesV0 = {},
): ParseResult<Record<string, LocalizedText>> {
	const merged: Record<string, Record<string, string>> = {};
	const issues: ParseIssue[] = [];
	const entries = manifest.kind === "function" ? (manifest.contributes?.strings ?? []) : [];
	for (const entry of entries) {
		const path = `/resources/${entry.replace(/~/g, "~0").replace(/\//g, "~1")}`;
		if (!Object.hasOwn(resources, entry)) {
			issues.push({ path, message: "manifest declares a string table the package does not carry" });
			continue;
		}
		const parsed = parseStringTable(resources[entry]);
		if (!parsed.ok) {
			issues.push(...parsed.issues.map((issue) => ({ ...issue, path: `${path}${issue.path}` })));
			continue;
		}
		for (const [key, text] of Object.entries(parsed.value)) {
			const target = merged[key] ?? {};
			merged[key] = target;
			for (const [locale, value] of Object.entries(
				typeof text === "string" ? { default: text } : text,
			)) {
				if (Object.hasOwn(target, locale))
					issues.push({ path: `${path}/${key}`, message: `string ${key} declares locale ${locale} in more than one file` });
				target[locale] = value;
			}
			if (Object.keys(target).length > STRING_TABLE_LANGUAGES_LIMIT_V0)
				issues.push({ path: `${path}/${key}`, message: "string key exceeds 16 language entries across files (including default)" });
		}
	}
	for (const [key, text] of Object.entries(merged))
		if (!Object.hasOwn(text, "default"))
			issues.push({ path: `/strings/${key}`, message: `string ${key} has no default text in any file` });
	return issues.length
		? { ok: false, issues }
		: { ok: true, value: merged as Record<string, LocalizedText> };
}

/** Runtime table of an already validated package; an invalid package yields none. */
export function resolvePluginStrings(
	manifest: PluginManifest,
	resources?: PackageResourcesV0,
): Record<string, LocalizedText> {
	const merged = mergeStringTables(manifest, resources);
	return merged.ok ? merged.value : {};
}
