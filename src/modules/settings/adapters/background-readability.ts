import {
	analyzeRegionReadability,
	coverCropRegion,
	type ReadabilityReport,
} from "$/kernel/theme";
import {
	measureSlotRect,
	sampleImagePixels,
	viewportSize,
} from "$/platform/theme/BrowserImageSampler";
import { DARK_TEXT_COLOR, LIGHT_TEXT_COLOR } from "./theme-surface-images";

/** Slots whose text sits directly above the full-window custom background. */
const CHECKED_SLOTS = [
	"title-bar",
	"ribbon-bar",
	"sidebar",
	"lyric-editor",
	"audio-controls",
] as const;

export interface AppBackgroundReadability {
	/** Slot name -> report, for every slot that is currently mounted. */
	reports: { slot: string; report: ReadabilityReport }[];
	failingSlots: string[];
	/**
	 * In dark mode this maps to the existing 遮罩 (black mask) slider; in
	 * light mode a black mask cannot help dark text, so it maps to lowering
	 * the image 透明度 instead.
	 */
	recommendation:
		| { kind: "mask"; value: number }
		| { kind: "opacity"; value: number }
		| null;
}

/**
 * Readability check for the full-app custom background: samples the image
 * once, then judges the crop under each mounted UI slot the way
 * background-size: cover will actually place it.
 */
export async function analyzeAppBackgroundImage(
	blob: Blob,
	isDarkTheme: boolean,
): Promise<AppBackgroundReadability | null> {
	let sampled: Awaited<ReturnType<typeof sampleImagePixels>>;
	try {
		sampled = await sampleImagePixels(blob, undefined, 256);
	} catch {
		return null;
	}
	const viewport = viewportSize();
	const image = { width: sampled.imageWidth, height: sampled.imageHeight };
	const textColor = isDarkTheme ? LIGHT_TEXT_COLOR : DARK_TEXT_COLOR;
	const reports: { slot: string; report: ReadabilityReport }[] = [];
	for (const slot of CHECKED_SLOTS) {
		const rect = measureSlotRect(slot);
		if (rect === null) continue;
		const region = coverCropRegion(image, viewport, rect);
		reports.push({
			slot,
			report: analyzeRegionReadability(sampled.pixels, textColor, region),
		});
	}
	if (reports.length === 0) return null;
	const failing = reports.filter(({ report }) => !report.ok);
	let recommendation: AppBackgroundReadability["recommendation"] = null;
	if (failing.length > 0) {
		const worstOpacity = Math.max(
			...failing.map(({ report }) => report.recommendedScrim?.opacity ?? 0.3),
		);
		recommendation = isDarkTheme
			? { kind: "mask", value: Math.min(0.9, worstOpacity) }
			: {
					kind: "opacity",
					value: Math.max(0.1, Math.round((1 - worstOpacity) * 100) / 100),
				};
	}
	return {
		reports,
		failingSlots: failing.map(({ slot }) => slot),
		recommendation,
	};
}
