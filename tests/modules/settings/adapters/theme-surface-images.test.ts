import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
	resetVersion: 0,
	images: {} as Record<
		string,
		{ url: string; scrim?: string; opacity?: number }
	>,
	listeners: [] as (() => void)[],
	records: [] as {
		surface: string;
		blob: Blob;
		scrim?: string;
		opacity?: number;
	}[],
	readAll: vi.fn(),
	write: vi.fn(),
	remove: vi.fn(),
}));

vi.mock("$/platform/storage/IndexedDbThemeSurfaceImageStorage", () => ({
	IndexedDbThemeSurfaceImageStorage: class {
		readAll = fake.readAll;
		write = fake.write;
		delete = fake.remove;
	},
}));
vi.mock("$/plugins/adapters/theme-host", () => ({
	themeService: {
		subscribe: (listener: () => void) => fake.listeners.push(listener),
		getState: () => ({
			userSurfaceImages: fake.images,
			userSurfaceImageResetVersion: fake.resetVersion,
		}),
		setUserSurfaceImage: (
			surface: string,
			image: { url: string; scrim?: string; opacity?: number } | null,
		) => {
			if (image === null) delete fake.images[surface];
			else fake.images[surface] = image;
			for (const listener of fake.listeners) listener();
			return { ok: true };
		},
	},
}));

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	fake.images = {};
	fake.resetVersion = 0;
	fake.listeners = [];
	fake.records = [];
	fake.readAll.mockImplementation(async () => fake.records);
});

describe("user surface images", () => {
	it.each([false, true])(
		"shows a picked image immediately, persists default scrim and accepts adjustments (dark=%s)",
		async (dark) => {
			const adapter = await import(
				"$/modules/settings/adapters/theme-surface-images"
			);
			const blob = new Blob(["image"], { type: "image/png" });
			const saving = adapter.setThemeSurfaceImage("appRoot", blob, dark);
			const scrim = dark ? "rgb(0 0 0 / 0.45)" : "rgb(255 255 255 / 0.35)";
			expect(fake.images.appRoot).toMatchObject({ scrim });
			expect(fake.images.appRoot.url).toMatch(/^blob:/);
			await saving;
			expect(fake.write).toHaveBeenLastCalledWith("appRoot", blob, scrim);
			await adapter.setThemeSurfaceScrim("appRoot", 0.7);
			const adjusted = dark ? "rgb(0 0 0 / 0.7)" : "rgb(255 255 255 / 0.7)";
			expect(fake.images.appRoot.scrim).toBe(adjusted);
			await adapter.setThemeSurfaceImageOpacity("appRoot", 0.6);
			expect(fake.images.appRoot.opacity).toBe(0.6);
			expect(fake.write).toHaveBeenLastCalledWith(
				"appRoot",
				blob,
				adjusted,
				0.6,
			);
			await adapter.clearThemeSurfaceImage("appRoot");
			expect(fake.images.appRoot).toBeUndefined();
			expect(fake.remove).toHaveBeenCalledWith("appRoot");
		},
	);

	it("restores the user's scrim and deletes stored images when defaults are restored", async () => {
		const adapter = await import(
			"$/modules/settings/adapters/theme-surface-images"
		);
		fake.records = [
			{
				surface: "titleBar",
				blob: new Blob(["image"]),
				scrim: "rgb(0 0 0 / 0.8)",
			},
		];
		await adapter.initializeThemeSurfaceImages();
		expect(fake.images.titleBar.scrim).toBe("rgb(0 0 0 / 0.8)");
		fake.images = {};
		for (const listener of fake.listeners) listener();
		expect(fake.remove).toHaveBeenCalledWith("titleBar");
	});

	it("does not resurrect an image cleared while startup hydration is pending", async () => {
		const adapter = await import(
			"$/modules/settings/adapters/theme-surface-images"
		);
		let finish!: (records: typeof fake.records) => void;
		fake.readAll.mockReturnValue(
			new Promise<typeof fake.records>((resolve) => {
				finish = resolve;
			}),
		);
		const loading = adapter.initializeThemeSurfaceImages();
		await adapter.clearThemeSurfaceImage("titleBar");
		finish([
			{
				surface: "titleBar",
				blob: new Blob(["old"]),
				scrim: "rgb(0 0 0 / 0.8)",
			},
		]);
		await loading;
		expect(fake.images.titleBar).toBeUndefined();
	});
	it("deletes pending persisted images when defaults are restored before hydration", async () => {
		const adapter = await import(
			"$/modules/settings/adapters/theme-surface-images"
		);
		let finish!: (records: typeof fake.records) => void;
		fake.readAll.mockReturnValue(
			new Promise<typeof fake.records>((resolve) => {
				finish = resolve;
			}),
		);
		const loading = adapter.initializeThemeSurfaceImages();
		fake.resetVersion++;
		for (const listener of fake.listeners) listener();
		finish([{ surface: "appRoot", blob: new Blob(["old"]) }]);
		await loading;
		expect(fake.images.appRoot).toBeUndefined();
		expect(fake.remove).toHaveBeenCalledWith("appRoot");
	});
	it("preserves an image picked after defaults reset while old hydration is pending", async () => {
		const adapter = await import(
			"$/modules/settings/adapters/theme-surface-images"
		);
		let finish!: (records: typeof fake.records) => void;
		fake.readAll.mockReturnValue(
			new Promise<typeof fake.records>((resolve) => {
				finish = resolve;
			}),
		);
		const loading = adapter.initializeThemeSurfaceImages();
		fake.resetVersion++;
		for (const listener of fake.listeners) listener();
		const newImage = new Blob(["new"]);
		await adapter.setThemeSurfaceImage("appRoot", newImage, true);
		const newUrl = fake.images.appRoot.url;
		finish([
			{ surface: "appRoot", blob: new Blob(["old"]) },
			{ surface: "titleBar", blob: new Blob(["old title"]) },
		]);
		await loading;
		expect(fake.images.appRoot.url).toBe(newUrl);
		expect(fake.write).toHaveBeenLastCalledWith(
			"appRoot",
			newImage,
			"rgb(0 0 0 / 0.45)",
		);
		expect(fake.remove).not.toHaveBeenCalledWith("appRoot");
		expect(fake.remove).toHaveBeenCalledWith("titleBar");
	});
});
