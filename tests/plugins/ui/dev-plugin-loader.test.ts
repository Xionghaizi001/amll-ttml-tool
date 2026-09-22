import { afterEach, expect, it, vi } from "vitest";
import { DevPluginWatcher } from "$/plugins/ui/dev-plugin-loader";

afterEach(() => vi.useRealTimers());

it("serializes rebuilds, waits for stable files, and ignores reads completing after stop", async () => {
	vi.useFakeTimers();
	let stamp = 1;
	let release: (() => void) | undefined;
	const manifest = {
		id: "test.dev",
		name: "Dev",
		version: "1.0.0",
		kind: "function",
		apiVersion: 0,
		runtime: "trusted-js",
		entry: "index.js",
		capabilities: [],
	};
	const directory = {
		getFileHandle: async (path: string) => ({
			getFile: async () => ({
				lastModified: stamp,
				size: stamp,
				text: async () =>
					path === "manifest.json"
						? JSON.stringify(manifest)
						: "export function activate() {}",
			}),
		}),
	} as unknown as FileSystemDirectoryHandle;
	const reload = vi.fn(
		() =>
			new Promise<void>((resolve) => {
				release = resolve;
			}),
	);
	const watcher = new DevPluginWatcher(directory, reload, 100);
	watcher.start();
	await vi.advanceTimersByTimeAsync(100);
	stamp = 2;
	await vi.advanceTimersByTimeAsync(200);
	expect(reload).toHaveBeenCalledTimes(1);
	stamp = 3;
	await vi.advanceTimersByTimeAsync(400);
	expect(reload).toHaveBeenCalledTimes(1);
	release?.();
	await vi.advanceTimersByTimeAsync(200);
	expect(reload).toHaveBeenCalledTimes(2);
	release?.();
	watcher.stop();
	stamp = 4;
	await vi.advanceTimersByTimeAsync(400);
	expect(reload).toHaveBeenCalledTimes(2);
	// stop() must also cancel an initial asynchronous baseline read.
	watcher.start();
	watcher.stop();
	await vi.advanceTimersByTimeAsync(400);
	expect(reload).toHaveBeenCalledTimes(2);
});
