import { describe, expect, it, vi } from "vitest";
import {
	PREVIEW_MAX_BYTES,
	PREVIEW_MAX_DIMENSION,
	resizeForPreview,
} from "../src/preview-resize.ts";

const toBase64 = (text: string): string => Buffer.from(text).toString("base64");

describe("preview thumbnail resizing", () => {
	it("shrinks within preview bounds and returns a PNG thumbnail", async () => {
		const resizeImage = vi.fn(async () => ({
			data: toBase64("small-jpeg"),
			mimeType: "image/jpeg",
		}));
		const convertToPng = vi.fn(async () => ({
			data: toBase64("png-bytes"),
			mimeType: "image/png",
		}));
		const original = {
			type: "image" as const,
			data: toBase64("BIG-DATA"),
			mimeType: "image/jpeg",
		};

		const result = await resizeForPreview(original, {
			resizeImage,
			convertToPng,
		});

		expect(result).toEqual({
			type: "image",
			data: toBase64("png-bytes"),
			mimeType: "image/png",
		});

		const [bytes, mimeType, options] = resizeImage.mock.calls[0];
		expect(Buffer.from(bytes).toString()).toBe("BIG-DATA");
		expect(mimeType).toBe("image/jpeg");
		expect(options).toEqual({
			maxWidth: PREVIEW_MAX_DIMENSION,
			maxHeight: PREVIEW_MAX_DIMENSION,
			maxBytes: PREVIEW_MAX_BYTES,
		});
		expect(convertToPng).toHaveBeenCalledWith(toBase64("small-jpeg"), "image/jpeg");
	});

	it("converts the original to PNG when no resizing is needed", async () => {
		const resizeImage = vi.fn(async () => null);
		const convertToPng = vi.fn(async (data: string) => ({
			data,
			mimeType: "image/png",
		}));
		const original = {
			type: "image" as const,
			data: toBase64("already-small"),
			mimeType: "image/jpeg",
		};

		const result = await resizeForPreview(original, {
			resizeImage,
			convertToPng,
		});

		expect(result).toEqual({
			type: "image",
			data: toBase64("already-small"),
			mimeType: "image/png",
		});
		expect(convertToPng).toHaveBeenCalledWith(toBase64("already-small"), "image/jpeg");
	});

	it("keeps the original image when thumbnailing fails", async () => {
		const resizeImage = vi.fn(async () => {
			throw new Error("resize unavailable");
		});
		const convertToPng = vi.fn();
		const original = {
			type: "image" as const,
			data: toBase64("orig"),
			mimeType: "image/png",
		};

		const result = await resizeForPreview(original, {
			resizeImage,
			convertToPng,
		});

		expect(result).toBe(original);
		expect(convertToPng).not.toHaveBeenCalled();
	});
});
