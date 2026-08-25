/**
 * Pure readability analysis for background images. All pixel access works on
 * plain RGBA arrays so the whole module is testable in Node; decoding an
 * image into pixels is the platform adapter's job (BrowserImageSampler).
 */

export interface ImagePixels {
	/** RGBA, row-major, 4 bytes per pixel. */
	data: ArrayLike<number>;
	width: number;
	height: number;
}

export interface RgbColor {
	r: number;
	g: number;
	b: number;
}

/** Region in normalized image coordinates (0..1). */
export interface NormalizedRegion {
	x: number;
	y: number;
	width: number;
	height: number;
}

export type ReadabilityIssue = "low-contrast" | "busy-background";

export interface ReadabilityScrim {
	/** Overlay color: black under light text, white under dark text. */
	color: "black" | "white";
	/** 0..0.85 */
	opacity: number;
	/** Safe-color CSS string, e.g. "rgb(0 0 0 / 0.4)". */
	cssColor: string;
}

export interface ReadabilityReport {
	sampleCount: number;
	meanLuminance: number;
	/** Decile of the region that clashes hardest with the text color. */
	worstCaseLuminance: number;
	/** WCAG contrast ratio between the text color and the worst-case decile. */
	contrastRatio: number;
	luminanceStdDev: number;
	/** Mean local luminance gradient — high values read as "busy"/noisy. */
	busyness: number;
	issues: ReadabilityIssue[];
	ok: boolean;
	/** Smallest overlay that makes the region pass, or null when it already does. */
	recommendedScrim: ReadabilityScrim | null;
}

export const READABILITY_MIN_CONTRAST = 3;
export const READABILITY_TARGET_CONTRAST = 4.5;
export const READABILITY_MAX_BUSYNESS = 0.05;
export const READABILITY_MAX_STDDEV = 0.22;
const MAX_SCRIM_OPACITY = 0.85;

const channelToLinear = (channel: number): number => {
	const normalized = channel / 255;
	return normalized <= 0.04045
		? normalized / 12.92
		: ((normalized + 0.055) / 1.055) ** 2.4;
};

export const relativeLuminance = (color: RgbColor): number =>
	0.2126 * channelToLinear(color.r) +
	0.7152 * channelToLinear(color.g) +
	0.0722 * channelToLinear(color.b);

export const contrastRatio = (first: number, second: number): number => {
	const lighter = Math.max(first, second);
	const darker = Math.min(first, second);
	return (lighter + 0.05) / (darker + 0.05);
};

/**
 * Maps a container-relative element rect to normalized image coordinates for
 * a background rendered with background-size: cover / background-position:
 * center. Omit `rect` to get the whole visible crop.
 */
export const coverCropRegion = (
	image: { width: number; height: number },
	container: { width: number; height: number },
	rect?: { x: number; y: number; width: number; height: number },
): NormalizedRegion => {
	const scale = Math.max(
		container.width / image.width,
		container.height / image.height,
	);
	const visibleWidth = container.width / scale / image.width;
	const visibleHeight = container.height / scale / image.height;
	const offsetX = (1 - visibleWidth) / 2;
	const offsetY = (1 - visibleHeight) / 2;
	if (rect === undefined)
		return {
			x: offsetX,
			y: offsetY,
			width: visibleWidth,
			height: visibleHeight,
		};
	const clamp = (value: number) => Math.min(1, Math.max(0, value));
	const x = clamp(offsetX + (rect.x / container.width) * visibleWidth);
	const y = clamp(offsetY + (rect.y / container.height) * visibleHeight);
	return {
		x,
		y,
		width: clamp((rect.width / container.width) * visibleWidth),
		height: clamp((rect.height / container.height) * visibleHeight),
	};
};

const passes = (
	textLuminance: number,
	worstCase: number,
	busyness: number,
	stdDev: number,
	contrastTarget: number,
): boolean =>
	contrastRatio(textLuminance, worstCase) >= contrastTarget &&
	busyness <= READABILITY_MAX_BUSYNESS &&
	stdDev <= READABILITY_MAX_STDDEV;

/**
 * Judges whether text of the given color stays readable over the sampled
 * image region: worst-case decile contrast catches bright/dark patches, and
 * the local-gradient/variance pair catches regions so busy the eye cannot
 * separate glyphs from the background.
 */
export function analyzeRegionReadability(
	pixels: ImagePixels,
	textColor: RgbColor,
	region?: NormalizedRegion,
): ReadabilityReport {
	const startX = Math.floor((region?.x ?? 0) * pixels.width);
	const startY = Math.floor((region?.y ?? 0) * pixels.height);
	const regionWidth = Math.max(
		1,
		Math.round((region?.width ?? 1) * pixels.width),
	);
	const regionHeight = Math.max(
		1,
		Math.round((region?.height ?? 1) * pixels.height),
	);
	const endX = Math.min(pixels.width, startX + regionWidth);
	const endY = Math.min(pixels.height, startY + regionHeight);
	const columns = Math.max(0, endX - startX);
	const rows = Math.max(0, endY - startY);
	const luminances = new Float64Array(columns * rows);
	for (let row = 0; row < rows; row += 1) {
		for (let column = 0; column < columns; column += 1) {
			const offset = ((startY + row) * pixels.width + startX + column) * 4;
			luminances[row * columns + column] = relativeLuminance({
				r: pixels.data[offset],
				g: pixels.data[offset + 1],
				b: pixels.data[offset + 2],
			});
		}
	}
	const textLuminance = relativeLuminance(textColor);
	const count = luminances.length;
	if (count < 4) {
		return {
			sampleCount: count,
			meanLuminance: 0,
			worstCaseLuminance: 0,
			contrastRatio: Number.POSITIVE_INFINITY,
			luminanceStdDev: 0,
			busyness: 0,
			issues: [],
			ok: true,
			recommendedScrim: null,
		};
	}

	let sum = 0;
	for (const luminance of luminances) sum += luminance;
	const mean = sum / count;
	let varianceSum = 0;
	for (const luminance of luminances) varianceSum += (luminance - mean) ** 2;
	const stdDev = Math.sqrt(varianceSum / count);

	let gradientSum = 0;
	let gradientCount = 0;
	for (let row = 0; row < rows; row += 1) {
		for (let column = 0; column < columns; column += 1) {
			const index = row * columns + column;
			if (column + 1 < columns) {
				gradientSum += Math.abs(luminances[index] - luminances[index + 1]);
				gradientCount += 1;
			}
			if (row + 1 < rows) {
				gradientSum += Math.abs(
					luminances[index] - luminances[index + columns],
				);
				gradientCount += 1;
			}
		}
	}
	const busyness = gradientCount === 0 ? 0 : gradientSum / gradientCount;

	// Worst-case decile: the slice of the region closest in luminance to the
	// text color is where contrast collapses first.
	const sorted = Float64Array.from(luminances).sort();
	const decile = Math.max(1, Math.floor(count / 10));
	const lightText = textLuminance >= 0.5;
	let worstSum = 0;
	for (let index = 0; index < decile; index += 1)
		worstSum += lightText ? sorted[count - 1 - index] : sorted[index];
	const worstCase = worstSum / decile;

	const ratio = contrastRatio(textLuminance, worstCase);
	const issues: ReadabilityIssue[] = [];
	if (ratio < READABILITY_MIN_CONTRAST) issues.push("low-contrast");
	if (busyness > READABILITY_MAX_BUSYNESS || stdDev > READABILITY_MAX_STDDEV)
		issues.push("busy-background");

	let recommendedScrim: ReadabilityScrim | null = null;
	if (issues.length > 0) {
		const scrimColor = lightText ? "black" : "white";
		const scrimLuminance = lightText ? 0 : 1;
		let opacity = MAX_SCRIM_OPACITY;
		for (
			let candidate = 0.1;
			candidate <= MAX_SCRIM_OPACITY;
			candidate += 0.05
		) {
			const blendedWorst =
				(1 - candidate) * worstCase + candidate * scrimLuminance;
			if (
				passes(
					textLuminance,
					blendedWorst,
					busyness * (1 - candidate),
					stdDev * (1 - candidate),
					READABILITY_TARGET_CONTRAST,
				)
			) {
				opacity = candidate;
				break;
			}
		}
		opacity = Math.round(opacity * 100) / 100;
		recommendedScrim = {
			color: scrimColor,
			opacity,
			cssColor:
				scrimColor === "black"
					? `rgb(0 0 0 / ${opacity})`
					: `rgb(255 255 255 / ${opacity})`,
		};
	}

	return {
		sampleCount: count,
		meanLuminance: mean,
		worstCaseLuminance: worstCase,
		contrastRatio: ratio,
		luminanceStdDev: stdDev,
		busyness,
		issues,
		ok: issues.length === 0,
		recommendedScrim,
	};
}
