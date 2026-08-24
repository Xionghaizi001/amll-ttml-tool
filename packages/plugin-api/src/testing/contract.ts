import { describe, expect, it } from "vitest";
import type { HostCallV0, HostResponseV0, PluginDocumentV0 } from "../types";

export interface PluginHostUnderTest {
	call(input: unknown): Promise<HostResponseV0>;
	undo(): Promise<boolean>;
}

const documentFrom = (response: HostResponseV0): PluginDocumentV0 => {
	expect(response.result.ok).toBe(true);
	if (!response.result.ok) throw new Error(response.result.error.message);
	return response.result.value as unknown as PluginDocumentV0;
};

export function runHostContractTests(
	createHost: () => PluginHostUnderTest,
): void {
	describe("Plugin Host v0 contract", () => {
		it("reads a stable document projection", async () => {
			const host = createHost();
			const document = documentFrom(
				await host.call({
					id: "read",
					method: "lyrics.getDocument",
					params: {},
				}),
			);
			expect(Number.isInteger(document.revision)).toBe(true);
			expect(Array.isArray(document.lines)).toBe(true);
			for (const line of document.lines) {
				expect(line.id).toBeTruthy();
				for (const word of line.words) expect(word.id).toBeTruthy();
			}
		});

		it("applies one edit atomically and undoes it as one record", async () => {
			const host = createHost();
			const before = documentFrom(
				await host.call({
					id: "before",
					method: "lyrics.getDocument",
					params: {},
				}),
			);
			const line = before.lines[0];
			expect(line).toBeDefined();
			const call: HostCallV0 = {
				id: "edit",
				method: "lyrics.applyEdit",
				params: {
					expectedRevision: before.revision,
					label: "Contract edit",
					ops: [
						{
							op: "updateLine",
							lineId: line.id,
							patch: { translation: "changed" },
						},
					],
				},
			};
			const edit = await host.call(call);
			expect(edit.result).toMatchObject({ ok: true });
			const changed = documentFrom(
				await host.call({
					id: "changed",
					method: "lyrics.getDocument",
					params: {},
				}),
			);
			expect(changed.lines[0].translation).toBe("changed");
			expect(changed.revision).toBe(before.revision + 1);

			expect(await host.undo()).toBe(true);
			const restored = documentFrom(
				await host.call({
					id: "restored",
					method: "lyrics.getDocument",
					params: {},
				}),
			);
			expect(restored.lines[0].translation).toBe(line.translation);
		});

		it("rejects a stale expected revision without changing the document", async () => {
			const host = createHost();
			const before = documentFrom(
				await host.call({
					id: "before",
					method: "lyrics.getDocument",
					params: {},
				}),
			);
			const response = await host.call({
				id: "stale",
				method: "lyrics.applyEdit",
				params: {
					expectedRevision: before.revision + 1,
					label: "Stale edit",
					ops: [{ op: "removeLine", lineId: before.lines[0].id }],
				},
			});
			expect(response.result).toMatchObject({
				ok: false,
				error: { code: "revision-conflict" },
			});
			const after = documentFrom(
				await host.call({
					id: "after",
					method: "lyrics.getDocument",
					params: {},
				}),
			);
			expect(after).toEqual(before);
		});

		it("validates every call before dispatch", async () => {
			const response = await createHost().call({
				id: "invalid",
				method: "ui.notify",
				params: { level: "script", message: "bad" },
			});
			expect(response.result).toMatchObject({
				ok: false,
				error: { code: "invalid-params" },
			});
		});
	});
}
