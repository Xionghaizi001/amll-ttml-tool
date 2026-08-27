import type {
	Capability,
	FunctionPluginManifest,
} from "@amll-ttml-tool/plugin-api";
import {
	decodeFunctionPluginWasm,
	negotiateCapabilities,
	parseFunctionPluginPackage,
} from "@amll-ttml-tool/plugin-api";
import { wasmPluginService } from "$/plugins/adapters/wasm-plugin-host";

export type PluginInstallSource = "user" | "sample" | "dev";

export interface PluginPermissionRequest {
	id: number;
	manifest: FunctionPluginManifest;
	granted: Capability[];
	rejected: string[];
	source: PluginInstallSource;
}

/**
 * Queue of pending capability-grant prompts. The dialog rendering these must
 * portal to body and carry data-amll-protected so no theme can cover it.
 */
class PluginPermissionService {
	private current: PluginPermissionRequest | null = null;
	private resolveCurrent?: (approved: boolean) => void;
	private readonly listeners = new Set<() => void>();
	private nextId = 1;

	getSnapshot = (): PluginPermissionRequest | null => this.current;

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	request(input: Omit<PluginPermissionRequest, "id">): Promise<boolean> {
		this.resolveCurrent?.(false);
		this.current = { ...input, id: this.nextId++ };
		this.emitChange();
		return new Promise((resolve) => {
			this.resolveCurrent = resolve;
		});
	}

	complete(requestId: number, approved: boolean): void {
		if (this.current?.id !== requestId) return;
		const resolve = this.resolveCurrent;
		if (!resolve) return;
		this.resolveCurrent = undefined;
		this.current = null;
		this.emitChange();
		resolve(approved);
	}

	private emitChange(): void {
		for (const listener of this.listeners) listener();
	}
}

export const pluginPermissionService = new PluginPermissionService();

export type PluginInstallResult =
	| { ok: true; pluginId: string }
	| { ok: false; cancelled: true }
	| { ok: false; cancelled?: false; message: string };

/**
 * The single install gate for WASM plugin packages: full protocol validation,
 * capability negotiation, an explicit user grant prompt, then activation.
 * Every entry point (file import, sample button, dev directory) goes through
 * here — there is no second loader path.
 */
export async function installPluginPackage(
	input: unknown,
	source: PluginInstallSource = "user",
): Promise<PluginInstallResult> {
	const parsed = parseFunctionPluginPackage(input);
	if (!parsed.ok)
		return {
			ok: false,
			message: parsed.issues
				.map((issue) => `${issue.path || "/"}: ${issue.message}`)
				.join("\n"),
		};
	const manifest = parsed.value.manifest;
	const negotiation = negotiateCapabilities(manifest.capabilities);
	const approved = await pluginPermissionService.request({
		manifest,
		granted: negotiation.granted,
		rejected: negotiation.rejected,
		source,
	});
	if (!approved) return { ok: false, cancelled: true };
	let wasm: Uint8Array;
	try {
		wasm = decodeFunctionPluginWasm(parsed.value);
	} catch (error) {
		return { ok: false, message: String(error) };
	}
	try {
		await wasmPluginService.install(manifest, wasm, { source });
	} catch (error) {
		return {
			ok: false,
			message: String(error instanceof Error ? error.message : error),
		};
	}
	return { ok: true, pluginId: manifest.id };
}

const CHUNK = 0x8000;

export const bytesToBase64 = (bytes: Uint8Array): string => {
	let binary = "";
	for (let index = 0; index < bytes.length; index += CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK));
	}
	return btoa(binary);
};

/** Builds a package object from separate manifest JSON + wasm bytes. */
export const assemblePluginPackage = (
	manifest: unknown,
	wasm: Uint8Array,
): unknown => ({
	packageVersion: 0,
	manifest,
	wasm: bytesToBase64(wasm),
});

/** Fetches and installs the bundled sample plugin (dev/demo helper). */
export async function installSamplePlugin(): Promise<PluginInstallResult> {
	try {
		const base = import.meta.env.BASE_URL ?? "/";
		const [manifestResponse, wasmResponse] = await Promise.all([
			fetch(`${base}plugins/sample-tools.manifest.json`),
			fetch(`${base}plugins/sample-tools.wasm`),
		]);
		if (!manifestResponse.ok || !wasmResponse.ok)
			return { ok: false, message: "Sample plugin assets are unavailable" };
		const manifest = await manifestResponse.json();
		const wasm = new Uint8Array(await wasmResponse.arrayBuffer());
		return await installPluginPackage(
			assemblePluginPackage(manifest, wasm),
			"sample",
		);
	} catch (error) {
		return { ok: false, message: String(error) };
	}
}
