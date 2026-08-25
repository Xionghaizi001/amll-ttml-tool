import type { ImagePixels, NormalizedRegion } from "$/kernel/theme";

const decodeImage = async (
	blob: Blob,
): Promise<{
	source: CanvasImageSource;
	width: number;
	height: number;
	close: () => void;
}> => {
	if (typeof createImageBitmap === "function") {
		const bitmap = await createImageBitmap(blob);
		return {
			source: bitmap,
			width: bitmap.width,
			height: bitmap.height,
			close: () => bitmap.close(),
		};
	}
	const url = URL.createObjectURL(blob);
	try {
		const image = new Image();
		image.src = url;
		await image.decode();
		return {
			source: image,
			width: image.naturalWidth,
			height: image.naturalHeight,
			close: () => URL.revokeObjectURL(url),
		};
	} catch (error) {
		URL.revokeObjectURL(url);
		throw error;
	}
};

export interface SampledImage {
	pixels: ImagePixels;
	imageWidth: number;
	imageHeight: number;
}

/**
 * Decodes an image blob and returns a downscaled RGBA sample of the given
 * normalized region (whole image by default), sized for the pure readability
 * analysis in kernel/theme.
 */
export async function sampleImagePixels(
	blob: Blob,
	region?: NormalizedRegion,
	maxDimension = 160,
): Promise<SampledImage> {
	const decoded = await decodeImage(blob);
	try {
		const sourceX = Math.floor((region?.x ?? 0) * decoded.width);
		const sourceY = Math.floor((region?.y ?? 0) * decoded.height);
		const sourceWidth = Math.max(
			1,
			Math.round((region?.width ?? 1) * decoded.width),
		);
		const sourceHeight = Math.max(
			1,
			Math.round((region?.height ?? 1) * decoded.height),
		);
		const scale = Math.min(
			1,
			maxDimension / Math.max(sourceWidth, sourceHeight),
		);
		const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
		const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
		const canvas = document.createElement("canvas");
		canvas.width = targetWidth;
		canvas.height = targetHeight;
		const context = canvas.getContext("2d", { willReadFrequently: true });
		if (context === null) throw new Error("Canvas 2D context unavailable");
		context.drawImage(
			decoded.source,
			sourceX,
			sourceY,
			sourceWidth,
			sourceHeight,
			0,
			0,
			targetWidth,
			targetHeight,
		);
		const imageData = context.getImageData(0, 0, targetWidth, targetHeight);
		return {
			pixels: {
				data: imageData.data,
				width: targetWidth,
				height: targetHeight,
			},
			imageWidth: decoded.width,
			imageHeight: decoded.height,
		};
	} finally {
		decoded.close();
	}
}

/** Viewport rect of a published slot element, if it is currently mounted. */
export const measureSlotRect = (
	slot: string,
): { x: number; y: number; width: number; height: number } | null => {
	const element = document.querySelector(`[data-slot="${slot}"]`);
	if (element === null) return null;
	const rect = element.getBoundingClientRect();
	if (rect.width === 0 || rect.height === 0) return null;
	return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
};

export const viewportSize = (): { width: number; height: number } => ({
	width: window.innerWidth,
	height: window.innerHeight,
});
