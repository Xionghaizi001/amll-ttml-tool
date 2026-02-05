import type { NeteaseProfile } from "$/modules/settings/states";
import { requestNetease } from "./index";
import type { NeteaseResponse } from "./index";

export const NeteaseAuthClient = {
	sendCaptcha: async (phone: string, ctcode = "86") => {
		return requestNetease<NeteaseResponse<boolean>>("/captcha/sent", {
			params: { phone, ctcode },
		});
	},
	loginByPhone: async (phone: string, captcha: string, ctcode = "86") => {
		const res = await requestNetease<
			NeteaseResponse<Record<string, unknown>> & {
				profile: NeteaseProfile;
				cookie: string;
			}
		>("/login/cellphone", {
			params: { phone, captcha, ctcode },
		});

		return {
			cookie: res.cookie ?? "",
			profile: res.profile,
		};
	},
	checkCookieStatus: async (cookieString: string) => {
		const res = await requestNetease<{
			data: {
				profile: NeteaseProfile | null;
				account?: { vipType: number; id: number };
			};
		}>("/login/status", {
			cookie: cookieString,
			method: "POST",
		});

		const profile = res.data?.profile;
		const account = res.data?.account;

		if (profile) {
			if (account && typeof account.vipType === "number") {
				return {
					...profile,
					vipType: account.vipType,
				};
			}
			return profile;
		}
		throw new Error("Cookie 已失效或未登录");
	},
};
