import { describe, expect, it, vi } from "vitest";
import {
	resizeForSubmission,
	SUBMISSION_MAX_BYTES,
	SUBMISSION_MAX_DIMENSION,
} from "../src/submission-resize.ts";

const base64OfSize = (byteLength: number): string =>
	Buffer.alloc(byteLength, 0x41).toString("base64");

describe("submission image resizing", () => {
	it("returns the image unchanged when its bytes are within the cap", async () => {
		const resizeImage = vi.fn();
		const original = {
			type: "image" as const,
			data: base64OfSize(SUBMISSION_MAX_BYTES),
			mimeType: "image/png",
		};

		const result = await resizeForSubmission(original, { resizeImage });

		expect(result).toBe(original);
		expect(resizeImage.mock.calls.length === 0).toBe(true);
	});

	it("downscales an oversized image and preserves its format", async () => {
		const resizeImage = vi.fn(async () => ({
			data: base64OfSize(1024),
			mimeType: "image/png",
		}));
		const original = {
			type: "image" as const,
			data: base64OfSize(SUBMISSION_MAX_BYTES + 1),
			mimeType: "image/png",
		};

		const result = await resizeForSubmission(original, { resizeImage });

		expect(result).toEqual({
			type: "image",
			data: base64OfSize(1024),
			mimeType: "image/png",
		});

		const [bytes, mimeType, options] = resizeImage.mock.calls[0];
		expect(bytes.length === SUBMISSION_MAX_BYTES + 1).toBe(true);
		expect(mimeType).toBe("image/png");
		expect(options).toEqual({
			maxWidth: SUBMISSION_MAX_DIMENSION,
			maxHeight: SUBMISSION_MAX_DIMENSION,
			maxBytes: SUBMISSION_MAX_BYTES,
		});
	});

	it("keeps the original when the resizer cannot shrink it", async () => {
		const resizeImage = vi.fn(async () => null);
		const original = {
			type: "image" as const,
			data: base64OfSize(SUBMISSION_MAX_BYTES + 1),
			mimeType: "image/png",
		};

		const result = await resizeForSubmission(original, { resizeImage });

		expect(result).toBe(original);
	});

	it("keeps the original when the resizer throws", async () => {
		const resizeImage = vi.fn(async () => {
			throw new Error("resize unavailable");
		});
		const original = {
			type: "image" as const,
			data: base64OfSize(SUBMISSION_MAX_BYTES + 1),
			mimeType: "image/png",
		};

		const result = await resizeForSubmission(original, { resizeImage });

		expect(result).toBe(original);
	});
});
