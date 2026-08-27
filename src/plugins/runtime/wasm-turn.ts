import {
	applyDocumentOpsV0,
	type Capability,
	type DocumentOpV0,
	hasCapabilities,
	type HostResponseV0,
	type JsonValue,
	type NotifyParams,
	parseHostCall,
	type PluginDocumentV0,
	type PluginErrorCode,
	type PluginSelectionV0,
	requiredCapabilitiesForCall,
} from "@amll-ttml-tool/plugin-api";

/**
 * Per-turn resource limits enforced by the synchronous host bridge inside the
 * plugin worker. They bound what one guest invocation can queue before the
 * main thread ever sees it.
 */
export interface WasmTurnLimits {
	maxHostCalls: number;
	maxHostCallBytes: number;
	maxNotifications: number;
	maxEditBatches: number;
	maxEditOps: number;
	maxStorageKeys: number;
	maxStorageValueBytes: number;
	maxStorageTotalBytes: number;
}

export const DEFAULT_WASM_TURN_LIMITS: WasmTurnLimits = {
	maxHostCalls: 128,
	maxHostCallBytes: 1024 * 1024,
	maxNotifications: 16,
	maxEditBatches: 16,
	maxEditOps: 10000,
	maxStorageKeys: 128,
	maxStorageValueBytes: 32 * 1024,
	maxStorageTotalBytes: 1024 * 1024,
};

/**
 * Everything the main thread snapshots into one guest turn. The worker never
 * talks back to the main thread mid-turn: WASM execution is synchronous, so
 * every host call resolves against this context.
 */
export interface WasmTurnContext {
	pluginId: string;
	grantedCapabilities: Capability[];
	/** Projection at turn start; null when lyrics.core was not granted. */
	document: PluginDocumentV0 | null;
	selection: PluginSelectionV0;
	/** Snapshot of the plugin's isolated KV namespace. */
	storage: Record<string, JsonValue>;
	/**
	 * Unique seed for ids of lines/words this turn inserts. The worker and the
	 * main-thread commit derive identical deterministic ids from it, so a guest
	 * may reference an id it just received from its own insert op.
	 */
	editIdSeed: string;
	/**
	 * false for pure turns (format conversions): lyrics.applyEdit is rejected,
	 * the result is committed by the host flow as its own transaction instead.
	 */
	editsAllowed?: boolean;
}

export interface WasmTurnStorageChanges {
	set: Record<string, JsonValue>;
	deleted: string[];
}

/**
 * Edits a turn queued via lyrics.applyEdit. All batches of one turn are
 * committed by the main thread as ONE document transaction with
 * `baseRevision` as the expected revision — one plugin operation stays one
 * undo record, and a concurrent user edit rejects the whole turn.
 */
export interface WasmTurnEdits {
	baseRevision: number;
	labels: string[];
	ops: DocumentOpV0[];
}

export interface WasmTurnEffects {
	edits: WasmTurnEdits | null;
	notifications: NotifyParams[];
	storage: WasmTurnStorageChanges | null;
	hostCallCount: number;
}

const errorResponse = (
	id: string,
	code: PluginErrorCode,
	message: string,
): HostResponseV0 => ({ id, result: { ok: false, error: { code, message } } });

const okResponse = (id: string, value: JsonValue): HostResponseV0 => ({
	id,
	result: { ok: true, value },
});

const utf8Length = (value: string): number => {
	let length = 0;
	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index);
		length += code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
	}
	return length;
};

/**
 * Synchronous host-call resolver for one guest turn. Permission checks run
 * per call against the granted capabilities snapshot; document edits and
 * storage writes are applied to local copies and surfaced as effects for the
 * main thread to commit after the turn ends.
 */
export class WasmTurnHost {
	private readonly granted: Set<Capability>;
	private readonly document: PluginDocumentV0 | null;
	private readonly storage: Map<string, JsonValue>;
	private readonly storageSet = new Map<string, JsonValue>();
	private readonly storageDeleted = new Set<string>();
	private readonly notifications: NotifyParams[] = [];
	private readonly editLabels: string[] = [];
	private readonly editOps: DocumentOpV0[] = [];
	private baseRevision: number | null = null;
	private hostCallCount = 0;
	private idSequence = 0;

	constructor(
		private readonly context: WasmTurnContext,
		private readonly limits: WasmTurnLimits = DEFAULT_WASM_TURN_LIMITS,
	) {
		this.granted = new Set(context.grantedCapabilities);
		this.document =
			context.document === null
				? null
				: (JSON.parse(JSON.stringify(context.document)) as PluginDocumentV0);
		this.storage = new Map(Object.entries(context.storage));
	}

	/** Raw JSON in, raw JSON out — bound directly to the wasm host function. */
	handleHostCallJson(input: string): string {
		return JSON.stringify(this.handleHostCall(input));
	}

	handleHostCall(input: string): HostResponseV0 {
		this.hostCallCount += 1;
		if (this.hostCallCount > this.limits.maxHostCalls)
			return errorResponse(
				"limit",
				"limit-exceeded",
				`host call limit exceeded (${this.limits.maxHostCalls} per turn)`,
			);
		if (input.length > this.limits.maxHostCallBytes)
			return errorResponse(
				"limit",
				"payload-too-large",
				`host call exceeds ${this.limits.maxHostCallBytes} bytes`,
			);
		let raw: unknown;
		try {
			raw = JSON.parse(input);
		} catch {
			return errorResponse("invalid", "invalid-params", "host call is not JSON");
		}
		const parsed = parseHostCall(raw);
		if (!parsed.ok) {
			const id =
				typeof raw === "object" && raw !== null && "id" in raw
					? String((raw as { id: unknown }).id)
					: "invalid";
			return errorResponse(
				id,
				"invalid-params",
				parsed.issues
					.map((issue) => `${issue.path}: ${issue.message}`)
					.join("; "),
			);
		}
		const call = parsed.value;
		const required = requiredCapabilitiesForCall(call.method, call.params);
		if (!hasCapabilities(this.granted, required))
			return errorResponse(
				call.id,
				"permission-denied",
				`requires ${required.join(", ")}`,
			);

		switch (call.method) {
			case "lyrics.getDocument":
				if (this.document === null)
					return errorResponse(
						call.id,
						"internal",
						"document snapshot is unavailable",
					);
				return okResponse(
					call.id,
					JSON.parse(JSON.stringify(this.document)) as JsonValue,
				);
			case "lyrics.getSelection":
				return okResponse(
					call.id,
					JSON.parse(JSON.stringify(this.context.selection)) as JsonValue,
				);
			case "lyrics.applyEdit":
				return this.applyEdit(call.id, call.params);
			case "ui.notify":
				if (this.notifications.length >= this.limits.maxNotifications)
					return errorResponse(
						call.id,
						"limit-exceeded",
						`notification limit exceeded (${this.limits.maxNotifications} per turn)`,
					);
				this.notifications.push(call.params);
				return okResponse(call.id, {});
			case "ui.showForm":
				// WASM cannot suspend for user input; forms use the showForm command
				// outcome, which ends the turn and resumes via plugin_resume_form.
				return errorResponse(
					call.id,
					"invalid-params",
					"ui.showForm is not available as a synchronous host call in the wasm runtime; return a showForm command outcome instead",
				);
			case "storage.get":
				return okResponse(call.id, {
					value: this.storage.get(call.params.key) ?? null,
				});
			case "storage.set":
				return this.storageWrite(call.id, call.params.key, call.params.value);
			case "storage.delete":
				this.storage.delete(call.params.key);
				this.storageSet.delete(call.params.key);
				this.storageDeleted.add(call.params.key);
				return okResponse(call.id, {});
			case "storage.keys":
				return okResponse(call.id, { keys: [...this.storage.keys()].sort() });
		}
	}

	getEffects(): WasmTurnEffects {
		return {
			edits:
				this.editOps.length === 0 || this.baseRevision === null
					? null
					: {
							baseRevision: this.baseRevision,
							labels: [...this.editLabels],
							ops: [...this.editOps],
						},
			notifications: [...this.notifications],
			storage:
				this.storageSet.size === 0 && this.storageDeleted.size === 0
					? null
					: {
							set: Object.fromEntries(this.storageSet),
							deleted: [...this.storageDeleted],
						},
			hostCallCount: this.hostCallCount,
		};
	}

	private applyEdit(
		id: string,
		params: {
			expectedRevision: number;
			label: string;
			ops: DocumentOpV0[];
		},
	): HostResponseV0 {
		if (this.context.editsAllowed === false)
			return errorResponse(
				id,
				"permission-denied",
				"document edits are not available during a format conversion turn",
			);
		if (this.document === null)
			return errorResponse(id, "internal", "document snapshot is unavailable");
		if (this.editLabels.length >= this.limits.maxEditBatches)
			return errorResponse(
				id,
				"limit-exceeded",
				`applyEdit batch limit exceeded (${this.limits.maxEditBatches} per turn)`,
			);
		if (this.editOps.length + params.ops.length > this.limits.maxEditOps)
			return errorResponse(
				id,
				"limit-exceeded",
				`applyEdit op limit exceeded (${this.limits.maxEditOps} per turn)`,
			);
		// The local revision is authoritative within the turn: the real document
		// cannot move while the turn runs because the commit happens afterwards
		// against baseRevision (a concurrent user edit rejects the whole turn).
		if (
			params.expectedRevision !== -1 &&
			params.expectedRevision !== this.document.revision
		)
			return errorResponse(
				id,
				"revision-conflict",
				`expected ${params.expectedRevision}, actual ${this.document.revision}`,
			);
		const previous = JSON.parse(
			JSON.stringify(this.document),
		) as PluginDocumentV0;
		const failure = applyDocumentOpsV0(this.document, params.ops, {
			nextId: (kind) => {
				this.idSequence += 1;
				// Deterministic per-turn ids: the main-thread commit replays the ops
				// with the same seed and sequence, producing identical final ids.
				return `${this.context.editIdSeed}-${kind}-${this.idSequence}`;
			},
		});
		if (failure !== undefined) {
			this.document.lines = previous.lines;
			this.document.metadata = previous.metadata;
			this.document.revision = previous.revision;
			return errorResponse(id, "not-found", failure);
		}
		if (this.baseRevision === null)
			this.baseRevision = this.context.document?.revision ?? 0;
		this.document.revision += 1;
		this.editLabels.push(params.label);
		this.editOps.push(...(JSON.parse(JSON.stringify(params.ops)) as DocumentOpV0[]));
		return okResponse(id, {
			revision: this.document.revision,
			appliedOps: params.ops.length,
		});
	}

	private storageWrite(
		id: string,
		key: string,
		value: JsonValue,
	): HostResponseV0 {
		const serialized = JSON.stringify(value);
		if (utf8Length(serialized) > this.limits.maxStorageValueBytes)
			return errorResponse(
				id,
				"payload-too-large",
				`storage value exceeds ${this.limits.maxStorageValueBytes} bytes`,
			);
		if (
			!this.storage.has(key) &&
			this.storage.size >= this.limits.maxStorageKeys
		)
			return errorResponse(
				id,
				"limit-exceeded",
				`storage key limit exceeded (${this.limits.maxStorageKeys})`,
			);
		let totalBytes = utf8Length(key) + utf8Length(serialized);
		for (const [existingKey, existingValue] of this.storage) {
			if (existingKey === key) continue;
			totalBytes +=
				utf8Length(existingKey) + utf8Length(JSON.stringify(existingValue));
		}
		if (totalBytes > this.limits.maxStorageTotalBytes)
			return errorResponse(
				id,
				"limit-exceeded",
				`storage namespace exceeds ${this.limits.maxStorageTotalBytes} bytes`,
			);
		const cloned = JSON.parse(serialized) as JsonValue;
		this.storage.set(key, cloned);
		this.storageSet.set(key, cloned);
		this.storageDeleted.delete(key);
		return okResponse(id, {});
	}
}
