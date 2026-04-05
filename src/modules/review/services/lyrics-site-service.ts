import { lyricsSiteTokenAtom, type LyricsSiteUser, audioProxyUrlAtom } from "$/modules/settings/states";
import { globalStore } from "$/states/store";

const LYRICS_SITE_URL = "https://amlldb.bikonoo.com";

export type LyricsSiteSubmissionStatus =
	| "pending"
	| "reviewing"
	| "approved"
	| "rejected"
	| "missing_audio"
	| "need_revision"
	| "closed";

export type LyricsSiteSubmission = {
	id: string;
	title: string;
	artist: string;
	album: string;
	ids: {
		ncmId: string;
		qqId: string;
		amId: string;
		spotifyId: string;
	};
	fileName: string;
	notes: string;
	status: LyricsSiteSubmissionStatus;
	submitter: string;
	submitterInfo: {
		username: string;
		displayName: string;
		avatar: string;
	};
	createdAt: number;
	metadata?: {
		musicName?: string[];
		artists?: string[];
		album?: string[];
		ncmMusicId?: string[];
		qqMusicId?: string[];
		appleMusicId?: string[];
		spotifyId?: string[];
	};
	audio?: {
		fileName: string;
		title?: string;
		artist?: string;
		album?: string;
		platform?: string;
		platformId?: string;
		uploadedAt: number;
		uploadedBy: string;
		cover?: string;
	};
	reviewHistory?: Array<{
		reviewer: string;
		reviewerInfo: {
			username: string;
			displayName: string;
			avatar: string;
		};
		reviewedAt: number;
		status: string;
		comment: string;
	}>;
	source: "lyrics-site";
};

export type LyricsSiteSubmissionsResponse = {
	success: boolean;
	items: LyricsSiteSubmission[];
	submissions: LyricsSiteSubmission[];
	counts: {
		all: number;
		processing: number;
		pending: number;
		reviewing: number;
		approved: number;
		rejected: number;
		need_revision: number;
		missing_audio: number;
	};
};

export type LyricsSiteSubmissionDetailResponse = {
	success: boolean;
	item: LyricsSiteSubmission;
};

export class AuthExpiredError extends Error {
	constructor(message: string = "认证已过期，请重新登录") {
		super(message);
		this.name = "AuthExpiredError";
	}
}

const fetchWithAuth = async <T>(
	endpoint: string,
	token: string,
	options?: RequestInit,
): Promise<T> => {
	const response = await fetch(`${LYRICS_SITE_URL}${endpoint}`, {
		...options,
		headers: {
			...options?.headers,
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
	});

	if (!response.ok) {
		if (response.status === 401) {
			throw new AuthExpiredError();
		}
		throw new Error(`API request failed: ${response.status} ${response.statusText}`);
	}

	return response.json() as Promise<T>;
};

export const fetchPendingSubmissions = async (
	token: string,
): Promise<LyricsSiteSubmission[]> => {
	const data = await fetchWithAuth<LyricsSiteSubmissionsResponse>(
		"/api/submissions?mode=review&status=pending",
		token,
	);

	const items = data.items || data.submissions || [];
	return items.map((item) => ({
		...item,
		source: "lyrics-site" as const,
	}));
};

export const fetchSubmissionDetail = async (
	token: string,
	id: string,
): Promise<LyricsSiteSubmission | null> => {
	try {
		const data = await fetchWithAuth<LyricsSiteSubmissionDetailResponse>(
			`/api/submissions/${id}`,
			token,
		);
		return {
			...data.item,
			source: "lyrics-site" as const,
		};
	} catch {
		return null;
	}
};

export type ReviewAction = "approve" | "revision" | "missing_audio";

export const submitReview = async (
	token: string,
	submissionId: string,
	action: ReviewAction,
	comment?: string,
): Promise<{ success: boolean }> => {
	const response = await fetch(`${LYRICS_SITE_URL}/api/submissions/${submissionId}`, {
		method: "PATCH",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			action,
			comment: comment || "",
		}),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Review failed: ${response.status} ${errorText}`);
	}

	return response.json() as Promise<{ success: boolean }>;
};

export const getLyricFileUrl = (fileName: string): string => {
	return `${LYRICS_SITE_URL}/tg-lyrics/${fileName}`;
};

export const getAudioFileUrl = (fileName: string): string => {
	return `${LYRICS_SITE_URL}/music/${fileName}`;
};

export const fetchLyricFileContent = async (
	token: string,
	fileName: string,
): Promise<string | null> => {
	try {
		const response = await fetch(getLyricFileUrl(fileName), {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		if (!response.ok) {
			return null;
		}

		return response.text();
	} catch {
		return null;
	}
};

export const fetchAudioFileContent = async (
	_token: string,
	fileName: string,
): Promise<Blob | null> => {
	try {
		const audioUrl = getAudioFileUrl(fileName);
		const proxyBase = globalStore.get(audioProxyUrlAtom)?.trim();
		const fetchUrl = proxyBase
			? `${proxyBase}/?url=${encodeURIComponent(audioUrl)}`
			: audioUrl;

		const response = await fetch(fetchUrl, {
			mode: 'cors',
			cache: 'no-cache',
		});

		if (!response.ok) {
			return null;
		}

		return response.blob();
	} catch {
		return null;
	}
};

export const refreshUserInfo = async (
	token: string,
): Promise<LyricsSiteUser | null> => {
	try {
		const response = await fetch(`${LYRICS_SITE_URL}/api/user/profile`, {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		if (!response.ok) {
			return null;
		}

		return response.json() as Promise<LyricsSiteUser>;
	} catch {
		return null;
	}
};
