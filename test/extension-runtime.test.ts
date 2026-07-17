import { describe, expect, it, vi } from "vitest";

vi.mock("@earendil-works/pi-tui", () => ({
	getCapabilities: () => ({ images: null }),
	getImageDimensions: () => null,
	calculateImageRows: () => 0,
	getCellDimensions: () => ({ width: 0, height: 0 }),
}));

import { registerImagePreviewExtension } from "../src/extension-runtime.ts";

type Handler = (...args: any[]) => any;

function makeHarness(deps: any) {
	const handlers = new Map<string, Handler>();
	const pi = {
		on: (event: string, handler: Handler) => handlers.set(event, handler),
		sendUserMessage: vi.fn(),
	};
	const ctx = {
		cwd: "/tmp",
		isIdle: () => true,
		ui: {
			setWidget: vi.fn(),
			getEditorText: vi.fn(() => ""),
			setEditorText: vi.fn(),
			theme: {},
		},
	};
	registerImagePreviewExtension(pi as any, deps);
	return { handlers, ctx };
}

describe("submit attachment resizing", () => {
	it("attaches the downscaled image when a tracked attachment is oversized", async () => {
		vi.useFakeTimers();
		try {
			const rawImage = {
				type: "image" as const,
				data: "RAW",
				mimeType: "image/png",
			};
			const resizedImage = {
				type: "image" as const,
				data: "SMALL",
				mimeType: "image/png",
			};
			const resizeForSubmission = vi.fn(async () => resizedImage);
			const deps = {
				readImageContentFromPathAsync: vi.fn(async () => rawImage),
				loadImageContentFromPath: vi.fn(async () => null),
				resizeForSubmission,
			};
			const { handlers, ctx } = makeHarness(deps);
			ctx.ui.getEditorText = vi.fn(() => "check /tmp/big.png");

			await handlers.get("session_start")!(undefined, ctx);
			await vi.advanceTimersByTimeAsync(300);

			const result = await handlers.get("input")!(
				{ text: "check /tmp/big.png", images: [] },
				ctx,
			);

			expect(result.action).toBe("transform");
			expect(result.images).toEqual([resizedImage]);
			expect(resizeForSubmission).toHaveBeenCalledWith(rawImage);
		} finally {
			vi.useRealTimers();
		}
	});

	it("attaches the original image when no submission resizer is provided", async () => {
		vi.useFakeTimers();
		try {
			const rawImage = {
				type: "image" as const,
				data: "RAW",
				mimeType: "image/png",
			};
			const deps = {
				readImageContentFromPathAsync: vi.fn(async () => rawImage),
				loadImageContentFromPath: vi.fn(async () => null),
			};
			const { handlers, ctx } = makeHarness(deps);
			ctx.ui.getEditorText = vi.fn(() => "check /tmp/big.png");

			await handlers.get("session_start")!(undefined, ctx);
			await vi.advanceTimersByTimeAsync(300);

			const result = await handlers.get("input")!(
				{ text: "check /tmp/big.png", images: [] },
				ctx,
			);

			expect(result.action).toBe("transform");
			expect(result.images).toEqual([rawImage]);
		} finally {
			vi.useRealTimers();
		}
	});
});
