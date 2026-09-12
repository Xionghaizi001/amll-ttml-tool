import type {
	Capability,
	HostResponseV0,
	JsonValue,
	PluginErrorCode,
} from "@amll-ttml-tool/plugin-api";
import {
	hasCapabilities,
	parseHostCall,
	requiredCapabilitiesForCall,
} from "@amll-ttml-tool/plugin-api";
import {
	type PluginHostUnderTest,
	runHostContractTests,
} from "@amll-ttml-tool/plugin-api/testing";
import { EditorDocumentService } from "$/kernel/editor/EditorDocumentService";
import type { TTMLLyric } from "$/types/ttml";
import { PluginDocumentGateway } from "$/plugins/adapters/plugin-document";

const fixture = (): TTMLLyric => ({
	metadata: [{ key: "title", value: ["Contract"] }],
	lyricLines: [
		{
			id: "line-1",
			words: [
				{
					id: "word-1",
					word: "hello",
					startTime: 0,
					endTime: 100,
					obscene: false,
					emptyBeat: 0,
					romanWord: "",
				},
			],
			translatedLyric: "before",
			romanLyric: "",
			isBG: false,
			isDuet: false,
			startTime: 0,
			endTime: 100,
			ignoreSync: false,
		},
	],
});

/**
 * The real host stack under the protocol contract: EditorDocumentService +
 * PluginDocumentGateway behind the same HostCallV0 surface MockPluginHost
 * implements. Both hosts passing the identical suite is the v1-freeze gate.
 */
class RealHostUnderTest implements PluginHostUnderTest {
	private readonly service = new EditorDocumentService(fixture());
	private readonly gateway = new PluginDocumentGateway({
		readSnapshot: () => this.service.readSnapshot(),
		getRevision: () => this.service.getRevision(),
		transact: (meta, updater) => this.service.transact(meta, updater),
	});
	private readonly granted = new Set<Capability>([
		"lyrics.core",
		"ui.notify",
		"storage.kv",
	]);
	private readonly storage = new Map<string, JsonValue>();
	private turnSequence = 0;

	async call(input: unknown): Promise<HostResponseV0> {
		const parsed = parseHostCall(input);
		if (!parsed.ok)
			return this.error(
				typeof input === "object" && input !== null && "id" in input
					? String((input as { id: unknown }).id)
					: "invalid",
				"invalid-params",
				parsed.issues
					.map((issue) => `${issue.path}: ${issue.message}`)
					.join("; "),
			);
		const call = parsed.value;
		const required = requiredCapabilitiesForCall(call.method, call.params);
		if (!hasCapabilities(this.granted, required))
			return this.error(
				call.id,
				"permission-denied",
				`requires ${required.join(", ")}`,
			);
		switch (call.method) {
			case "lyrics.getDocument":
				return this.ok(
					call.id,
					this.gateway.getDocument({
						includeRuby: this.granted.has("lyrics.ruby"),
					}) as unknown as JsonValue,
				);
			case "lyrics.getSelection":
				return this.ok(call.id, { lineIds: [], wordIds: [] });
			case "lyrics.applyEdit": {
				this.turnSequence += 1;
				const result = this.gateway.applyEdit({
					pluginId: "contract.test",
					label: call.params.label,
					expectedRevision: call.params.expectedRevision,
					ops: call.params.ops,
					idSeed: `contract-${this.turnSequence}`,
				});
				if (!result.ok)
					return { id: call.id, result };
				return this.ok(call.id, result.value as unknown as JsonValue);
			}
			case "ui.notify":
				return this.ok(call.id, {});
			case "ui.showForm":
				return this.ok(call.id, { submitted: false });
			case "storage.get":
				return this.ok(call.id, {
					value: this.storage.get(call.params.key) ?? null,
				});
			case "storage.set":
				this.storage.set(call.params.key, call.params.value);
				return this.ok(call.id, {});
			case "storage.delete":
				this.storage.delete(call.params.key);
				return this.ok(call.id, {});
			case "storage.keys":
				return this.ok(call.id, { keys: [...this.storage.keys()].sort() });
		}
	}

	async undo(): Promise<boolean> {
		return this.service.undo() !== undefined;
	}

	private ok(id: string, value: JsonValue): HostResponseV0 {
		return { id, result: { ok: true, value } };
	}

	private error(
		id: string,
		code: PluginErrorCode,
		message: string,
	): HostResponseV0 {
		return { id, result: { ok: false, error: { code, message } } };
	}
}

runHostContractTests(() => new RealHostUnderTest());
