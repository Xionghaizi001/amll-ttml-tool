import { parseManifest } from "@amll-ttml-tool/plugin-api";

export interface DevPluginSource {
	manifest: unknown;
	wasm: Uint8Array;
}

interface DirectoryPickerWindow {
	showDirectoryPicker?: (options?: {
		mode?: "read" | "readwrite";
	}) => Promise<FileSystemDirectoryHandle>;
}

export const isDevPluginLoadingSupported = (): boolean =>
	typeof (window as unknown as DirectoryPickerWindow).showDirectoryPicker ===
	"function";

export const pickDevPluginDirectory =
	async (): Promise<FileSystemDirectoryHandle | null> => {
		const picker = (window as unknown as DirectoryPickerWindow)
			.showDirectoryPicker;
		if (!picker) return null;
		try {
			return await picker({ mode: "read" });
		} catch {
			// User dismissed the picker.
			return null;
		}
	};

const getFileAtPath = async (
	directory: FileSystemDirectoryHandle,
	path: string,
): Promise<File> => {
	const segments = path.split("/").filter(Boolean);
	let current = directory;
	for (const segment of segments.slice(0, -1))
		current = await current.getDirectoryHandle(segment);
	const handle = await current.getFileHandle(segments[segments.length - 1]);
	return handle.getFile();
};

/**
 * Reads manifest.json + the manifest's entry wasm from a local directory.
 * The result still goes through the single installPluginPackage parse gate;
 * this loader never bypasses validation or the permission prompt.
 */
export async function readDevPluginDirectory(
	directory: FileSystemDirectoryHandle,
): Promise<DevPluginSource> {
	const manifestFile = await getFileAtPath(directory, "manifest.json");
	const manifestRaw: unknown = JSON.parse(await manifestFile.text());
	const manifest = parseManifest(manifestRaw);
	if (!manifest.ok) throw new Error(`manifest.json: ${manifest.error.message}`);
	if (manifest.value.kind !== "function")
		throw new Error("dev loading currently supports function plugins only");
	const wasmFile = await getFileAtPath(directory, manifest.value.entry);
	return {
		manifest: manifestRaw,
		wasm: new Uint8Array(await wasmFile.arrayBuffer()),
	};
}

/**
 * Cheap hot-reload watcher: polls the lastModified stamps of manifest.json
 * and the entry module. The File System Access API has no change events, so
 * polling is the portable option; the interval is generous to stay cheap.
 */
export class DevPluginWatcher {
	private timer: ReturnType<typeof setInterval> | null = null;
	private lastStamp = "";

	constructor(
		private readonly directory: FileSystemDirectoryHandle,
		private readonly onChange: () => void,
		private readonly intervalMs = 1500,
	) {}

	start(): void {
		if (this.timer !== null) return;
		void this.computeStamp().then((stamp) => {
			this.lastStamp = stamp;
		});
		this.timer = setInterval(() => {
			void this.poll();
		}, this.intervalMs);
	}

	stop(): void {
		if (this.timer !== null) clearInterval(this.timer);
		this.timer = null;
	}

	private async poll(): Promise<void> {
		try {
			const stamp = await this.computeStamp();
			if (this.lastStamp !== "" && stamp !== this.lastStamp) this.onChange();
			this.lastStamp = stamp;
		} catch {
			// Directory temporarily unavailable (e.g. mid-rebuild); retry later.
		}
	}

	private async computeStamp(): Promise<string> {
		const manifestFile = await getFileAtPath(this.directory, "manifest.json");
		const manifestRaw: unknown = JSON.parse(await manifestFile.text());
		const manifest = parseManifest(manifestRaw);
		if (!manifest.ok || manifest.value.kind !== "function")
			return `invalid-${manifestFile.lastModified}`;
		const wasmFile = await getFileAtPath(this.directory, manifest.value.entry);
		return `${manifestFile.lastModified}-${wasmFile.lastModified}-${wasmFile.size}`;
	}
}
