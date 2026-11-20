import { getCapabilities, Image, setCapabilities } from "@earendil-works/pi-tui";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
	clientSupportsKitty,
	decide,
	detectImageProtocol,
	imageEpoch,
	parseClients,
	recordTmuxClients,
} from "../src/image-protocol.ts";
import { installInlineImages, parsePlacementSize } from "../src/inline-images.ts";

// 1×1 transparent PNG.
const PNG =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const theme = { fallbackColor: (s: string) => s };
const PLACEHOLDER = String.fromCodePoint(0x10eeee);

const kittyLaptop = "$4\t/dev/ttys000\tkitty(0.49.2)\txterm-kitty";
const termuxPhone = "$4\t/dev/ttys005\t\txterm-256color";
const otherSession = "$9\t/dev/ttys007\t\txterm-256color";
const probe = (...clients: string[]) => ["$4", ...clients].join("\n");

describe("tmux client detection", () => {
	it("treats kitty, Ghostty, WezTerm and Rex as kitty-capable", () => {
		expect(clientSupportsKitty({ termType: "kitty(0.49.2)", termName: "xterm-kitty" })).toBe(true);
		expect(clientSupportsKitty({ termType: "ghostty 1.2", termName: "xterm-ghostty" })).toBe(true);
		expect(clientSupportsKitty({ termType: "", termName: "xterm-kitty" })).toBe(true);
		expect(clientSupportsKitty({ termType: "", termName: "xterm-256color" })).toBe(false);
	});

	it("keeps only clients viewing this pane's session", () => {
		const { clients } = parseClients(probe(kittyLaptop, otherSession));
		expect(clients).toEqual([{ termType: "kitty(0.49.2)", termName: "xterm-kitty" }]);
	});

	it("counts the pane's window becoming visible as a change", () => {
		const hidden = parseClients(`$4\t0\n${kittyLaptop}`).signature;
		const visible = parseClients(`$4\t1\n${kittyLaptop}`).signature;
		expect(hidden).not.toBe(visible);
	});

	it("needs every viewer to speak kitty, and keeps the last answer when nobody is attached", () => {
		const kitty = { termType: "kitty", termName: "xterm-kitty" };
		const phone = { termType: "", termName: "xterm-256color" };
		expect(decide([kitty], false)).toBe(true);
		expect(decide([kitty, phone], true)).toBe(false);
		expect(decide([], true)).toBe(true);
	});
});

describe("inline images in tmux", () => {
	let uninstall: () => void;
	const writes: string[] = [];

	beforeAll(() => {
		process.env.TMUX = "/tmp/tmux-test,1,0";
		process.env.TMUX_PANE = "%1";
		setCapabilities({ images: null, trueColor: true, hyperlinks: false });
		// First probe before install, so the tests never call a real tmux.
		recordTmuxClients(probe(kittyLaptop));
		vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
			writes.push(String(chunk));
			return true;
		});
		uninstall = installInlineImages();
	});

	afterAll(() => {
		uninstall();
		vi.restoreAllMocks();
		expect(getCapabilities().images).toBeNull();
	});

	beforeEach(() => {
		writes.length = 0;
	});

	it("draws placeholders and sends the PNG through tmux passthrough for a kitty viewer", () => {
		recordTmuxClients(probe(kittyLaptop));
		expect(detectImageProtocol()).toBe("kitty");

		const lines = new Image(PNG, "image/png", theme).render(80);

		expect(lines.length).toBeGreaterThan(0);
		expect(lines.every((line) => line.includes(PLACEHOLDER))).toBe(true);
		expect(lines.some((line) => line.includes("\x1b_G"))).toBe(false);
		expect(writes.join("")).toMatch(/^\x1bPtmux;\x1b\x1b_Ga=T,U=1,f=100,/);
		expect(writes.join("")).toContain(PNG);
	});

	it("tells pi images work while only kitty views, and restores pi's setting when a phone joins", () => {
		recordTmuxClients(probe(kittyLaptop));
		expect(getCapabilities().images).toBe("kitty");

		recordTmuxClients(probe(kittyLaptop, termuxPhone));
		expect(getCapabilities().images).toBeNull();

		recordTmuxClients(probe(kittyLaptop));
		expect(getCapabilities().images).toBe("kitty");
	});

	it("re-applies the override on the next viewer change after pi resets its capability cache", () => {
		setCapabilities({ images: null, trueColor: true, hyperlinks: false });
		recordTmuxClients(probe(termuxPhone));
		recordTmuxClients(probe(kittyLaptop));
		expect(getCapabilities().images).toBe("kitty");
	});

	it("falls back to text and sends nothing when a phone is also viewing", () => {
		recordTmuxClients(probe(kittyLaptop, termuxPhone));
		const lines = new Image(PNG, "image/png", theme, { filename: "shot.png" }).render(80);

		expect(lines.join("")).not.toContain(PLACEHOLDER);
		expect(lines.join("")).toContain("image/png");
		expect(writes).toEqual([]);
	});

	it("re-sends an image when the viewers change back to kitty only", () => {
		recordTmuxClients(probe(kittyLaptop));
		const image = new Image(PNG, "image/png", theme);
		image.render(80);
		image.render(80);
		expect(writes.length).toBe(1);

		const before = imageEpoch();
		recordTmuxClients(probe(termuxPhone));
		recordTmuxClients(probe(kittyLaptop));
		expect(imageEpoch()).toBeGreaterThan(before);

		image.render(80);
		expect(writes.length).toBe(2);
	});

	it("reads the cell size pi-tui chose from its kitty sequence", () => {
		expect(parsePlacementSize("\x1b_Ga=T,f=100,q=2,c=40,r=12,i=7,C=1;AAAA\x1b\\")).toEqual({
			columns: 40,
			rows: 12,
		});
		expect(parsePlacementSize("[image/png 1x1]")).toBeNull();
	});
});
