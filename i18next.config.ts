import { defineConfig } from "i18next-cli";

export default defineConfig({
	locales: [
		"zh-CN",
		"en-US",

		// 因为缺少这些语言的维护者，暂时不生成它们的翻译键值
		// "cs-CZ",
		// "da-DK",
		// "es-ES",
		// "fr-FR",
		// "id-ID",
		// "pl-PL",
		// "pt-BR",
		// "ru-RU",
		// "sk-SK",
	],
	extract: {
		input: "src/**/*.{js,jsx,ts,tsx}",
		ignore: ["**/wasm/**", "**/vendor/**"],
		output: "locales\\{{language}}\\{{namespace}}.json",

		sort: false,

		defaultValue: (key, _namespace, _language, value) => {
			return value || key;
		},

		disablePlurals: true,
	},
});
