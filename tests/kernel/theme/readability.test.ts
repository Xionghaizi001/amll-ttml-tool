import { describe, expect, it } from "vitest";
import {
	analyzeRegionReadability,
	coverCropRegion,
	type RgbColor,
} from "$/kernel/theme/readability";

const WHITE_TEXT: RgbColor = { r: 255, g: 255, b: 255 };
const DARK_TEXT: RgbColor = { r: 28, g: 32, b: 36 };

const makePixels = (
	width: number,
	height: number,
	colorAt: (x: number, y: number) => [number, number, number],
) => {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const [r, g, b] = colorAt(x, y);
			const offset = (y * width + x) * 4;
			data[offset] = r;
			data[offset + 1] = g;
			data[offset + 2] = b;
			data[offset + 3] = 255;
		}
	}
	return { data, width, height };
};

describe("analyzeRegionReadability", () => {
	it("passes white text on a uniform dark background", () => {
		const report = analyzeRegionReadability(
			makePixels(32, 32, () => [16, 16, 24]),
			WHITE_TEXT,
		);
		expect(report.ok).toBe(true);
		expect(report.contrastRatio).toBeGreaterThan(10);
		expect(report.recommendedScrim).toBeNull();
	});

	it("fails white text on a bright background and recommends a black scrim", () => {
		const report = analyzeRegionReadability(
			makePixels(32, 32, () => [200, 200, 200]),
			WHITE_TEXT,
		);
		expect(report.ok).toBe(false);
		expect(report.issues).toContain("low-contrast");
		expect(report.recommendedScrim?.color).toBe("black");
		expect(report.recommendedScrim?.opacity).toBeGreaterThan(0);
		expect(report.recommendedScrim?.cssColor).toMatch(/^rgb\(0 0 0 \/ /);
	});

	it("fails dark text on a dark background and recommends a white scrim", () => {
		const report = analyzeRegionReadability(
			makePixels(32, 32, () => [40, 40, 48]),
			DARK_TEXT,
		);
		expect(report.ok).toBe(false);
		expect(report.recommendedScrim?.color).toBe("white");
	});

	it("flags a high-frequency checkerboard as busy even when mean contrast is fine", () => {
		const report = analyzeRegionReadability(
			makePixels(32, 32, (x, y) =>
				(x + y) % 2 === 0 ? [0, 0, 0] : [255, 255, 255],
			),
			WHITE_TEXT,
		);
		expect(report.ok).toBe(false);
		expect(report.issues).toContain("busy-background");
		expect(report.busyness).toBeGreaterThan(0.05);
		expect(report.recommendedScrim).not.toBeNull();
	});

	it("catches bright patches through the worst-case decile", () => {
		// 90% dark, 10% white patch: mean luminance is dark but white text
		// over the patch would vanish.
		const report = analyzeRegionReadability(
			makePixels(40, 40, (x, y) =>
				x < 13 && y < 5 ? [250, 250, 250] : [10, 10, 14],
			),
			WHITE_TEXT,
		);
		expect(report.issues).toContain("low-contrast");
	});

	it("analyzes only the requested region", () => {
		// Left half dark, right half bright.
		const pixels = makePixels(40, 20, (x) =>
			x < 20 ? [10, 10, 14] : [240, 240, 240],
		);
		const left = analyzeRegionReadability(pixels, WHITE_TEXT, {
			x: 0,
			y: 0,
			width: 0.5,
			height: 1,
		});
		const right = analyzeRegionReadability(pixels, WHITE_TEXT, {
			x: 0.5,
			y: 0,
			width: 0.5,
			height: 1,
		});
		expect(left.ok).toBe(true);
		expect(right.ok).toBe(false);
	});

	it("treats tiny samples as readable instead of guessing", () => {
		const report = analyzeRegionReadability(
			makePixels(1, 1, () => [128, 128, 128]),
			WHITE_TEXT,
		);
		expect(report.ok).toBe(true);
	});
});

describe("coverCropRegion", () => {
	it("returns the centered visible crop for a wide image in a square container", () => {
		// Image 200x100 covering a 100x100 container: scale 1, visible width
		// 100/200 = 0.5 centered.
		const region = coverCropRegion(
			{ width: 200, height: 100 },
			{ width: 100, height: 100 },
		);
		expect(region.x).toBeCloseTo(0.25);
		expect(region.width).toBeCloseTo(0.5);
		expect(region.y).toBeCloseTo(0);
		expect(region.height).toBeCloseTo(1);
	});

	it("maps a component rect at the top of the viewport to the top of the crop", () => {
		const region = coverCropRegion(
			{ width: 1000, height: 1000 },
			{ width: 1000, height: 500 },
			{ x: 0, y: 0, width: 1000, height: 50 },
		);
		expect(region.y).toBeCloseTo(0.25);
		expect(region.height).toBeCloseTo(0.05);
		expect(region.x).toBeCloseTo(0);
		expect(region.width).toBeCloseTo(1);
	});
});
