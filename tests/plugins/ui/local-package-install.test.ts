import { beforeEach, describe, expect, it, vi } from "vitest";

const ports = vi.hoisted(() => ({
	unpack: vi.fn(),
	installTheme: vi.fn(),
	installJs: vi.fn(),
}));
vi.mock("$/plugins/store/package-container", () => ({
	unpackPluginContainer: ports.unpack,
}));
vi.mock("$/plugins/adapters/theme-host", () => ({
	themeService: { installThemePackage: ports.installTheme },
}));
vi.mock("$/plugins/trusted/trusted-js-host", () => ({
	installTrustedJsPackage: ports.installJs,
}));
import { installLocalPluginFile } from "$/plugins/ui/local-package-install";

describe("local theme installation durability", () => {
	beforeEach(() => vi.resetAllMocks());
	it("does not report success until storage commits", async () => {
		const pkg = { manifest: { id: "test.theme" } };
		ports.unpack.mockReturnValue({ ok: true, kind: "theme", pkg });
		let commit!: () => void;
		ports.installTheme.mockImplementation(
			() =>
				new Promise((resolve) => {
					commit = () => resolve({ ok: true, value: pkg });
				}),
		);
		let finished = false;
		const result = installLocalPluginFile(new File(["zip"], "theme.zip")).then(
			(value) => {
				finished = true;
				return value;
			},
		);
		await vi.waitFor(() =>
			expect(ports.installTheme).toHaveBeenCalledWith(pkg),
		);
		expect(finished).toBe(false);
		commit();
		expect(await result).toMatchObject({ ok: true });
	});
	it("surfaces storage rejection to the import UI instead of reporting installed", async () => {
		ports.unpack.mockReturnValue({ ok: true, kind: "theme", pkg: {} });
		ports.installTheme.mockRejectedValue(new Error("QuotaExceededError"));
		await expect(
			installLocalPluginFile(new File(["zip"], "theme.zip")),
		).rejects.toThrow("QuotaExceededError");
		expect(ports.installJs).not.toHaveBeenCalled();
	});
});
