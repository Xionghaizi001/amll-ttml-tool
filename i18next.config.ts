import { defineConfig } from "i18next-cli";

export default defineConfig({
	locales: [
		"cs-CZ",
		"da-DK",
		"en-US",
		"es-ES",
		"fr-FR",
		"id-ID",
		"pl-PL",
		"pt-BR",
		"ru-RU",
		"sk-SK",
		"zh-CN",
	],
	extract: {
		input: "src/**/*.{js,jsx,ts,tsx}",
		output: "locales\\{{language}}\\{{namespace}}.json",
	},
});
