import type { ThemeSurfaceNameV0 } from "@amll-ttml-tool/plugin-api";
import {
	analyzeRegionReadability,
	coverCropRegion,
	type ReadabilityReport,
	type RgbColor,
} from "$/kernel/theme";
import { IndexedDbThemeSurfaceImageStorage } from "$/platform/storage/IndexedDbThemeSurfaceImageStorage";
import {
	measureSlotRect,
	sampleImagePixels,
} from "$/platform/theme/BrowserImageSampler";
import { themeService } from "$/plugins/adapters/theme-host";

export const LIGHT_TEXT_COLOR: RgbColor = { r: 255, g: 255, b: 255 };
export const DARK_TEXT_COLOR: RgbColor = { r: 28, g: 32, b: 36 };

const SURFACE_SLOTS: Partial<Record<ThemeSurfaceNameV0, string>> = {
	titleBar: "title-bar",
	ribbonBar: "ribbon-bar",
	playControls: "audio-controls",
};

/** Typical component sizes for surfaces that are not mounted while picking. */
const SURFACE_DEFAULT_SIZES: Record<
	ThemeSurfaceNameV0,
	{ width: number; height: number }
> = {
	titleBar: { width: 1280, height: 40 },
	ribbonBar: { width: 1280, height: 140 },
	dropdownMenu: { width: 240, height: 320 },
	playControls: { width: 1280, height: 120 },
	modalLarge: { width: 900, height: 620 },
	modalMedium: { width: 520, height: 420 },
	modalSmall: { width: 380, height: 220 },
};

const surfaceSize = (
	surface: ThemeSurfaceNameV0,
): { width: number; height: number } => {
	const slot = SURFACE_SLOTS[surface];
	if (slot !== undefined) {
		const rect = measureSlotRect(slot);
		if (rect !== null) return { width: rect.width, height: rect.height };
	}
	return SURFACE_DEFAULT_SIZES[surface];
};

export interface SurfaceImageOutcome {
	ok: boolean;
	report: ReadabilityReport | null;
	scrim: string | null;
	error: string | null;
}

const storage = new IndexedDbThemeSurfaceImageStorage();
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
	const records = await storage.readAll();
	for (const record of records) {
		const generation = bumpGeneration(record.surface);
		if (generations.get(record.surface) !== generation) continue;
		dropLocalUrl(record.surface);
		const url = URL.createObjectURL(record.blob);
		objectUrls.set(record.surface, url);
		const result = themeService.setUserSurfaceImage(record.surface, {
			url,
			scrim: record.scrim,
		});
		if (!result.ok) {
			dropLocalUrl(record.surface);
			void storage.delete(record.surface);
		}
	}
}

/**
 * Readability gate for a picked surface background: samples the cover crop
 * the component will show, checks contrast and busyness against the current
 * text color, and — when the image alone would be unreadable — derives the
 * scrim overlay that restores contrast before the image is applied.
 */
export async function setThemeSurfaceImage(
	surface: ThemeSurfaceNameV0,
	blob: Blob,
	isDarkTheme: boolean,
): Promise<SurfaceImageOutcome> {
	startReconciliation();
	const generation = bumpGeneration(surface);
	let report: ReadabilityReport;
	try {
		const sampled = await sampleImagePixels(blob);
		const region = coverCropRegion(
			{ width: sampled.imageWidth, height: sampled.imageHeight },
			surfaceSize(surface),
		);
		report = analyzeRegionReadability(
			sampled.pixels,
			isDarkTheme ? LIGHT_TEXT_COLOR : DARK_TEXT_COLOR,
			region,
		);
	} catch {
		return {
			ok: false,
			report: null,
			scrim: null,
			error: "无法解析所选图片",
		};
	}
	if (generations.get(surface) !== generation)
		return { ok: false, report, scrim: null, error: null };
	const scrim = report.recommendedScrim?.cssColor ?? null;
	const url = URL.createObjectURL(blob);
	const result = themeService.setUserSurfaceImage(surface, {
		url,
		scrim: scrim ?? undefined,
	});
	if (!result.ok) {
		URL.revokeObjectURL(url);
		return {
			ok: false,
			report,
			scrim,
			error: result.issues.map((issue) => issue.message).join("; "),
		};
	}
	dropLocalUrl(surface);
	objectUrls.set(surface, url);
	await storage.write(surface, blob, scrim ?? undefined);
	return { ok: true, report, scrim, error: null };
}

export async function clearThemeSurfaceImage(
	surface: ThemeSurfaceNameV0,
): Promise<void> {
	bumpGeneration(surface);
	themeService.setUserSurfaceImage(surface, null);
	dropLocalUrl(surface);
	await storage.delete(surface);
}
