import type { ThemeSurfaceNameV0 } from "@amll-ttml-tool/plugin-api";
import { IndexedDbThemeSurfaceImageStorage } from "$/platform/storage/IndexedDbThemeSurfaceImageStorage";
import { themeService } from "$/plugins/adapters/theme-host";

export interface SurfaceImageOutcome {
	ok: boolean;
	error: string | null;
}

export const defaultSurfaceScrim = (isDarkTheme: boolean): string =>
	isDarkTheme ? "rgb(0 0 0 / 0.45)" : "rgb(255 255 255 / 0.35)";

const storage = new IndexedDbThemeSurfaceImageStorage();
const imageBlobs = new Map<ThemeSurfaceNameV0, Blob>();
const objectUrls = new Map<ThemeSurfaceNameV0, string>();
const generations = new Map<ThemeSurfaceNameV0, number>();
let reconcileStarted = false;

const bumpGeneration = (surface: ThemeSurfaceNameV0): number => {
	const next = (generations.get(surface) ?? 0) + 1;
	generations.set(surface, next);
	return next;
};

const dropLocalUrl = (surface: ThemeSurfaceNameV0): void => {
	const url = objectUrls.get(surface);
	if (url === undefined) return;
	objectUrls.delete(surface);
	imageBlobs.delete(surface);
	URL.revokeObjectURL(url);
};

/**
 * restoreDefaultTheme (settings button or the rescue shortcut) clears the
 * kernel's surface images; mirror that into persistent storage so the next
 * launch does not resurrect them.
 */
const startReconciliation = (): void => {
	if (reconcileStarted) return;
	reconcileStarted = true;
	themeService.subscribe(() => {
		const known = themeService.getState().userSurfaceImages;
		for (const surface of [...objectUrls.keys()]) {
			if (known[surface] === undefined) {
				bumpGeneration(surface);
				dropLocalUrl(surface);
				void storage.delete(surface);
			}
		}
	});
};

/** Restores persisted per-surface images at startup. */
export async function initializeThemeSurfaceImages(): Promise<void> {
	startReconciliation();
	const beforeRead = new Map(generations);
	const resetVersion = themeService.getState().userSurfaceImageResetVersion;
	const records = await storage.readAll();
	if (themeService.getState().userSurfaceImageResetVersion !== resetVersion) {
		await Promise.all(
			records
				.filter(
					(record) =>
						generations.get(record.surface) === beforeRead.get(record.surface),
				)
				.map((record) => storage.delete(record.surface)),
		);
		return;
	}
	for (const record of records) {
		if (generations.get(record.surface) !== beforeRead.get(record.surface))
			continue;
		bumpGeneration(record.surface);
		dropLocalUrl(record.surface);
		const url = URL.createObjectURL(record.blob);
		objectUrls.set(record.surface, url);
		imageBlobs.set(record.surface, record.blob);
		const result = themeService.setUserSurfaceImage(record.surface, {
			url,
			scrim: record.scrim,
			opacity: record.opacity,
		});
		if (!result.ok) {
			dropLocalUrl(record.surface);
			void storage.delete(record.surface);
		}
	}
}

/** Applies picked images immediately with a fixed, editable default overlay. */
export async function setThemeSurfaceImage(
	surface: ThemeSurfaceNameV0,
	blob: Blob,
	isDarkTheme: boolean,
): Promise<SurfaceImageOutcome> {
	startReconciliation();
	bumpGeneration(surface);
	const scrim = defaultSurfaceScrim(isDarkTheme);
	const url = URL.createObjectURL(blob);
	const result = themeService.setUserSurfaceImage(surface, { url, scrim });
	if (!result.ok) {
		URL.revokeObjectURL(url);
		return {
			ok: false,
			error: result.issues.map((issue) => issue.message).join("; "),
		};
	}
	dropLocalUrl(surface);
	objectUrls.set(surface, url);
	imageBlobs.set(surface, blob);
	await storage.write(surface, blob, scrim);
	return { ok: true, error: null };
}

/** Updates the user's overlay without decoding or replacing the image. */
export async function setThemeSurfaceScrim(
	surface: ThemeSurfaceNameV0,
	opacity: number,
): Promise<void> {
	const image = themeService.getState().userSurfaceImages[surface];
	const blob = imageBlobs.get(surface);
	if (image === undefined || blob === undefined) return;
	const color = image.scrim?.startsWith("rgb(255") ? "255 255 255" : "0 0 0";
	const scrim = `rgb(${color} / ${Math.min(1, Math.max(0, opacity))})`;
	const result = themeService.setUserSurfaceImage(surface, { ...image, scrim });
	if (result.ok) await storage.write(surface, blob, scrim, image.opacity);
}

/** Sets global background image transparency independently of its scrim. */
export async function setThemeSurfaceImageOpacity(
	surface: ThemeSurfaceNameV0,
	opacity: number,
): Promise<void> {
	const image = themeService.getState().userSurfaceImages[surface];
	const blob = imageBlobs.get(surface);
	if (image === undefined || blob === undefined) return;
	const next = { ...image, opacity: Math.min(1, Math.max(0, opacity)) };
	const result = themeService.setUserSurfaceImage(surface, next);
	if (result.ok) await storage.write(surface, blob, next.scrim, next.opacity);
}

export async function clearThemeSurfaceImage(
	surface: ThemeSurfaceNameV0,
): Promise<void> {
	bumpGeneration(surface);
	themeService.setUserSurfaceImage(surface, null);
	dropLocalUrl(surface);
	await storage.delete(surface);
}
