import { THEME_ASSET_NAME_PATTERN } from "./schema/schemas";
import type { ParseIssue, ParseResult } from "./types";
import { THEME_PART_NAMES_V0, THEME_SLOT_NAMES_V0 } from "./types";

export interface ThemeCssValidationOptions {
	/** Allowed data-slot names; defaults to THEME_SLOT_NAMES_V0. */
	slots?: readonly string[];
	/** Allowed data-part names; defaults to THEME_PART_NAMES_V0. */
	parts?: readonly string[];
	/**
	 * Asset names the package ships. When provided, every url(asset:<name>)
	 * must reference one of them; url() is rejected entirely otherwise unless
	 * the name is well-formed.
	 */
	assetNames?: readonly string[];
	maxLength?: number;
}

const DEFAULT_MAX_LENGTH = 131072;
const MAX_NESTING_DEPTH = 4;
const ALLOWED_AT_RULES = new Set(["media", "supports", "font-face"]);
// Strings may not contain structural characters, escapes, or a protocol
// colon; this keeps them inert for every later text-level check.
const SAFE_STRING_CONTENT = /^[^{};@\\:]*$/;
const SELECTOR_ANCHOR =
	/^(?:\[data-amll-appearance=(?:"dark"|"light")\]\s+)?\[data-(slot|part)="([a-z][a-z-]*)"\]/;
const SELECTOR_REST = /^[\w\s"'[\]()>+~*.:#=,^$|-]*$/u;

const lineOf = (text: string, index: number): number =>
	text.slice(0, index).split("\n").length;

interface ScanResult {
	stripped: string;
	issues: ParseIssue[];
}

/**
 * Removes comments while walking strings, and rejects the constructs that
 * would let later regex checks be evaded: backslash escapes, unterminated
 * strings/comments, and structural characters inside strings.
 */
const scan = (css: string): ScanResult => {
	const issues: ParseIssue[] = [];
	let stripped = "";
	let index = 0;
	let state: "code" | "comment" | '"' | "'" = "code";
	let stringStart = 0;
	while (index < css.length) {
		const current = css[index];
		const next = css[index + 1];
		if (state === "code") {
			if (current === "/" && next === "*") {
				stripped += "  ";
				index += 2;
				state = "comment";
				continue;
			}
			if (current === "\\") {
				issues.push({
					path: "/css",
					message: `escape sequences are not allowed (line ${lineOf(css, index)})`,
				});
				return { stripped, issues };
			}
			if (current === '"' || current === "'") {
				state = current;
				stringStart = index;
			}
			stripped += current;
			index += 1;
			continue;
		}
		if (state === "comment") {
			if (current === "*" && next === "/") {
				stripped += "  ";
				index += 2;
				state = "code";
			} else {
				stripped += current === "\n" ? "\n" : " ";
				index += 1;
			}
			continue;
		}
		// Inside a string.
		if (current === state) {
			const content = css.slice(stringStart + 1, index);
			if (!SAFE_STRING_CONTENT.test(content) || content.length > 256)
				issues.push({
					path: "/css",
					message: `string contains forbidden characters (line ${lineOf(css, stringStart)})`,
				});
			state = "code";
		} else if (current === "\n") {
			issues.push({
				path: "/css",
				message: `unterminated string (line ${lineOf(css, stringStart)})`,
			});
			return { stripped, issues };
		} else if (current === "\\") {
			issues.push({
				path: "/css",
				message: `escape sequences are not allowed (line ${lineOf(css, index)})`,
			});
			return { stripped, issues };
		}
		stripped += current;
		index += 1;
	}
	if (state === "comment")
		issues.push({ path: "/css", message: "unterminated comment" });
	if (state === '"' || state === "'")
		issues.push({
			path: "/css",
			message: `unterminated string (line ${lineOf(css, stringStart)})`,
		});
	return { stripped, issues };
};

const checkTextLevelBans = (
	stripped: string,
	assetNames: readonly string[] | undefined,
	issues: ParseIssue[],
): void => {
	if (/data-amll-protected/i.test(stripped))
		issues.push({
			path: "/css",
			message: "theme CSS must not reference protected host regions",
		});
	const importantMatch = /!\s*important/i.exec(stripped);
	if (importantMatch)
		issues.push({
			path: "/css",
			message: `!important is not allowed (line ${lineOf(stripped, importantMatch.index)})`,
		});
	for (const match of stripped.matchAll(/@([a-zA-Z-]+)/g)) {
		if (!ALLOWED_AT_RULES.has(match[1].toLowerCase()))
			issues.push({
				path: "/css",
				message: `@${match[1]} is not allowed (line ${lineOf(stripped, match.index)})`,
			});
	}
	for (const match of stripped.matchAll(
		/(?:https?|data|javascript|file|blob):/gi,
	)) {
		issues.push({
			path: "/css",
			message: `remote or scheme URLs are not allowed (line ${lineOf(stripped, match.index)})`,
		});
	}
	const dangerousFunction = /(?:expression|element|-moz-binding)\s*\(/i.exec(
		stripped,
	);
	if (dangerousFunction)
		issues.push({
			path: "/css",
			message: `forbidden function (line ${lineOf(stripped, dangerousFunction.index)})`,
		});
	for (const match of stripped.matchAll(/url\s*\(([^)]*)\)|url\s*\(/gi)) {
		if (match[1] === undefined) {
			// url( without a closing paren in the remaining text
			issues.push({
				path: "/css",
				message: `malformed url() (line ${lineOf(stripped, match.index)})`,
			});
			continue;
		}
		const content = match[1].trim();
		const asset = /^asset:([a-zA-Z0-9][a-zA-Z0-9._-]*)$/.exec(content);
		if (!asset || !THEME_ASSET_NAME_PATTERN.test(asset[1])) {
			issues.push({
				path: "/css",
				message: `url() may only reference package assets via url(asset:<name>) (line ${lineOf(stripped, match.index)})`,
			});
			continue;
		}
		if (assetNames && !assetNames.includes(asset[1]))
			issues.push({
				path: "/css",
				message: `unknown theme asset "${asset[1]}" (line ${lineOf(stripped, match.index)})`,
			});
	}
};

/** Splits a selector prelude on top-level commas ((), [] aware). */
const splitSelectors = (prelude: string): string[] => {
	const selectors: string[] = [];
	let depth = 0;
	let start = 0;
	for (let index = 0; index < prelude.length; index += 1) {
		const char = prelude[index];
		if (char === "(" || char === "[") depth += 1;
		else if (char === ")" || char === "]") depth -= 1;
		else if (char === "," && depth === 0) {
			selectors.push(prelude.slice(start, index));
			start = index + 1;
		}
	}
	selectors.push(prelude.slice(start));
	return selectors;
};

const checkSelector = (
	selector: string,
	line: number,
	slots: readonly string[],
	parts: readonly string[],
	issues: ParseIssue[],
): void => {
	const trimmed = selector.trim();
	if (trimmed.length === 0) {
		issues.push({ path: "/css", message: `empty selector (line ${line})` });
		return;
	}
	const anchor = SELECTOR_ANCHOR.exec(trimmed);
	if (!anchor) {
		issues.push({
			path: "/css",
			message: `selector must be scoped to a published data-slot or data-part (line ${line}): ${trimmed.slice(0, 80)}`,
		});
		return;
	}
	const allowed = anchor[1] === "slot" ? slots : parts;
	if (!allowed.includes(anchor[2])) {
		issues.push({
			path: "/css",
			message: `unknown data-${anchor[1]} "${anchor[2]}" (line ${line})`,
		});
		return;
	}
	const rest = trimmed.slice(anchor[0].length);
	if (!SELECTOR_REST.test(rest))
		issues.push({
			path: "/css",
			message: `selector contains forbidden characters (line ${line}): ${trimmed.slice(0, 80)}`,
		});
};

const findBlockEnd = (
	text: string,
	openBrace: number,
): { end: number; hasNested: boolean } | null => {
	let depth = 1;
	let hasNested = false;
	for (let index = openBrace + 1; index < text.length; index += 1) {
		const char = text[index];
		if (char === "{") {
			depth += 1;
			hasNested = true;
		} else if (char === "}") {
			depth -= 1;
			if (depth === 0) return { end: index, hasNested };
		}
	}
	return null;
};

const parseRuleList = (
	text: string,
	start: number,
	end: number,
	depth: number,
	slots: readonly string[],
	parts: readonly string[],
	issues: ParseIssue[],
): void => {
	if (depth > MAX_NESTING_DEPTH) {
		issues.push({ path: "/css", message: "rules are nested too deeply" });
		return;
	}
	let index = start;
	while (index < end) {
		const char = text[index];
		if (/\s|;/.test(char)) {
			index += 1;
			continue;
		}
		const braceIndex = text.indexOf("{", index);
		if (braceIndex === -1 || braceIndex >= end) {
			if (text.slice(index, end).trim().length > 0)
				issues.push({
					path: "/css",
					message: `unexpected content outside of rules (line ${lineOf(text, index)})`,
				});
			return;
		}
		const block = findBlockEnd(text, braceIndex);
		if (!block || block.end > end) {
			issues.push({
				path: "/css",
				message: `unbalanced braces (line ${lineOf(text, braceIndex)})`,
			});
			return;
		}
		const prelude = text.slice(index, braceIndex).trim();
		if (prelude.startsWith("@")) {
			const name = /^@([a-zA-Z-]+)/.exec(prelude)?.[1]?.toLowerCase();
			if (name === "media" || name === "supports") {
				parseRuleList(
					text,
					braceIndex + 1,
					block.end,
					depth + 1,
					slots,
					parts,
					issues,
				);
			} else if (name === "font-face") {
				if (block.hasNested)
					issues.push({
						path: "/css",
						message: `@font-face must not contain nested blocks (line ${lineOf(text, braceIndex)})`,
					});
			} else {
				// Already reported by the at-rule allowlist; skip the block.
			}
		} else {
			if (block.hasNested)
				issues.push({
					path: "/css",
					message: `nested rules are not allowed (line ${lineOf(text, braceIndex)})`,
				});
			const line = lineOf(text, index);
			for (const selector of splitSelectors(prelude))
				checkSelector(selector, line, slots, parts, issues);
		}
		index = block.end + 1;
	}
};

/**
 * Validates theme package CSS against the v0 contract: selectors are limited
 * to published data-slot/data-part scopes, no @import/@layer/remote URLs, no
 * escapes, no !important, and url() may only reference package assets.
 * Returns the comment-stripped CSS the host should inject.
 */
export function validateThemeCss(
	css: string,
	options: ThemeCssValidationOptions = {},
): ParseResult<string> {
	const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
	if (css.length > maxLength)
		return {
			ok: false,
			issues: [
				{ path: "/css", message: `CSS exceeds ${maxLength} characters` },
			],
		};
	const { stripped, issues } = scan(css);
	if (issues.length > 0) return { ok: false, issues };
	checkTextLevelBans(stripped, options.assetNames, issues);
	parseRuleList(
		stripped,
		0,
		stripped.length,
		1,
		options.slots ?? THEME_SLOT_NAMES_V0,
		options.parts ?? THEME_PART_NAMES_V0,
		issues,
	);
	return issues.length === 0
		? { ok: true, value: stripped }
		: { ok: false, issues };
}

/**
 * Replaces validated url(asset:<name>) references with host-resolved local
 * URLs. Unresolvable assets degrade to url("about:invalid") so a missing
 * asset can never fetch anything.
 */
export function substituteThemeAssetUrls(
	css: string,
	resolve: (name: string) => string | null,
): string {
	return css.replace(
		/url\s*\(\s*asset:([a-zA-Z0-9][a-zA-Z0-9._-]*)\s*\)/g,
		(_match, name: string) => {
			const resolved = resolve(name);
			return resolved === null ? 'url("about:invalid")' : `url("${resolved}")`;
		},
	);
}
