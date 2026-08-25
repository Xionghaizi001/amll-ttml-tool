import type { ThemeStyleFlags, ThemeStyleSinkPort } from "$/kernel/theme";

const THEME_STYLE_ID = "amll-theme-style";
const USER_STYLE_ID = "amll-user-style";
const FLAG_ATTRIBUTE_PREFIX = "data-amll-surface-";

const kebab = (name: string): string =>
	name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);

const ensureStyleElement = (id: string): HTMLStyleElement => {
	const existing = document.getElementById(id);
	if (existing instanceof HTMLStyleElement) return existing;
	const element = document.createElement("style");
	element.id = id;
	document.head.appendChild(element);
	return element;
};

/**
 * Injects validated theme CSS into the amll.theme layer and user token
 * overrides into amll.user. The layer order declared in index.css
 * (@layer amll.base, amll.theme, amll.user) guarantees user overrides beat
 * theme packages while unlayered app CSS — including every protected
 * region — always beats both.
 *
 * Flag-gated bridges (accent, surface backgrounds) activate through
 * attributes on the document root: index.css only applies those bridge
 * rules while the matching attribute is present, so an unset token can
 * never leave a component transparent.
 */
export class DomThemeStyleAdapter implements ThemeStyleSinkPort {
	private flaggedAttributes = new Set<string>();

	setThemeCss(css: string): void {
		ensureStyleElement(THEME_STYLE_ID).textContent =
			css.length === 0 ? "" : `@layer amll.theme {\n${css}\n}`;
	}

	setUserCss(css: string): void {
		ensureStyleElement(USER_STYLE_ID).textContent =
			css.length === 0 ? "" : `@layer amll.user {\n${css}\n}`;
	}

	setFlags(flags: ThemeStyleFlags): void {
		const next = new Set<string>();
		if (flags.accent) next.add("data-amll-accent");
		for (const surface of flags.surfaces)
			next.add(`${FLAG_ATTRIBUTE_PREFIX}${kebab(surface)}`);
		const root = document.documentElement;
		for (const attribute of this.flaggedAttributes)
			if (!next.has(attribute)) root.removeAttribute(attribute);
		for (const attribute of next) root.setAttribute(attribute, "");
		this.flaggedAttributes = next;
	}
}

/** Keeps the appearance attribute themes key their mode overrides off. */
export const setDocumentAppearance = (appearance: "light" | "dark"): void => {
	document.documentElement.setAttribute("data-amll-appearance", appearance);
};
