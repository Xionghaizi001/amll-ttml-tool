import type { ThemeStyleSinkPort } from "$/kernel/theme";

const THEME_STYLE_ID = "amll-theme-style";
const USER_STYLE_ID = "amll-user-style";

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
 */
export class DomThemeStyleAdapter implements ThemeStyleSinkPort {
	setThemeCss(css: string): void {
		ensureStyleElement(THEME_STYLE_ID).textContent =
			css.length === 0 ? "" : `@layer amll.theme {\n${css}\n}`;
	}

	setUserCss(css: string): void {
		ensureStyleElement(USER_STYLE_ID).textContent =
			css.length === 0 ? "" : `@layer amll.user {\n${css}\n}`;
	}
}

/** Keeps the appearance attribute themes key their mode overrides off. */
export const setDocumentAppearance = (appearance: "light" | "dark"): void => {
	document.documentElement.setAttribute("data-amll-appearance", appearance);
};
