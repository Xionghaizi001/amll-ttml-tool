import type { TrustedJsConsentRequest } from "./trusted-js-service";

export interface PendingTrustedJsConsent extends TrustedJsConsentRequest {
	requestId: number;
}

/**
 * Queue of pending trusted-js consent prompts. The dialog rendering these
 * must portal to body and carry data-amll-protected — same anti-cover
 * guarantee as the WASM capability prompt — and its wording must honestly
 * state that the plugin can read the user's credentials and act as them
 * (plus system risk on desktop). Consent is the tier's admission control;
 * softening the text would void it.
 */
export class TrustedJsConsentService {
	private current: PendingTrustedJsConsent | null = null;
	private resolveCurrent?: (approved: boolean) => void;
	private readonly listeners = new Set<() => void>();
	private nextId = 1;

	getSnapshot = (): PendingTrustedJsConsent | null => this.current;

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	request(input: TrustedJsConsentRequest): Promise<boolean> {
		this.resolveCurrent?.(false);
		this.current = { ...input, requestId: this.nextId++ };
		this.emitChange();
		return new Promise((resolve) => {
			this.resolveCurrent = resolve;
		});
	}

	complete(requestId: number, approved: boolean): void {
		if (this.current?.requestId !== requestId) return;
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

export const trustedJsConsentService = new TrustedJsConsentService();
