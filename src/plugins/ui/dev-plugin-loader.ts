import { parseManifest } from "@amll-ttml-tool/plugin-api";

export interface DevPluginSource {
	manifest: unknown;
	code: string;
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

/** Reads a trusted-js directory; installation still applies validation and consent. */
export async function readDevPluginDirectory(
	directory: FileSystemDirectoryHandle,
): Promise<DevPluginSource> {
	const manifestFile = await getFileAtPath(directory, "manifest.json");
	const manifestRaw: unknown = JSON.parse(await manifestFile.text());
	const manifest = parseManifest(manifestRaw);
	if (!manifest.ok) throw new Error(`manifest.json: ${manifest.error.message}`);
	if (
		manifest.value.kind !== "function" ||
		manifest.value.runtime !== "trusted-js"
	)
		throw new Error("dev loading requires a trusted-js function plugin");
	const entryFile = await getFileAtPath(directory, manifest.value.entry);
	return {
		manifest: manifestRaw,
		code: await entryFile.text(),
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
	private polling = false;
	private generation = 0;
	private candidateStamp = "";

	constructor(
		private readonly directory: FileSystemDirectoryHandle,
		private readonly onChange: () => void | Promise<void>,
		private readonly intervalMs = 1500,
	) {}

	start(): void {
		if (this.timer !== null) return;
		this.generation++;
		void this.poll();
		this.timer = setInterval(() => {
			void this.poll();
		}, this.intervalMs);
	}

	stop(): void {
		this.generation++;
		if (this.timer !== null) clearInterval(this.timer);
		this.timer = null;
	}

	private async poll(): Promise<void> {
		if (this.polling) return;
		this.polling = true;
		const generation = this.generation;
		try {
			const stamp = await this.computeStamp();
			if (generation !== this.generation) return;
			// Require a stable pair of files across two polls during a rebuild.
			if (this.lastStamp !== "" && stamp !== this.candidateStamp) {
				this.candidateStamp = stamp;
				return;
			}
			this.candidateStamp = stamp;
			if (this.lastStamp !== "" && stamp !== this.lastStamp)
				await this.onChange();
			this.lastStamp = stamp;
		} catch {
			// Directory temporarily unavailable (e.g. mid-rebuild); retry later.
		} finally {
			this.polling = false;
		}
	}

	private async computeStamp(): Promise<string> {
		const manifestFile = await getFileAtPath(this.directory, "manifest.json");
		const manifestRaw: unknown = JSON.parse(await manifestFile.text());
		const manifest = parseManifest(manifestRaw);
		if (
			!manifest.ok ||
			manifest.value.kind !== "function" ||
			manifest.value.runtime !== "trusted-js"
		)
			return `invalid-${manifestFile.lastModified}`;
		const entryFile = await getFileAtPath(this.directory, manifest.value.entry);
		return `${manifestFile.lastModified}-${entryFile.lastModified}-${entryFile.size}`;
	}
}
