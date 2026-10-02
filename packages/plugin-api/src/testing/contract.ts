import { describe, expect, it } from "vitest";
import type {
	ApplyEditResult,
	DocumentOpV0,
	HostResult,
	PluginDocumentV0,
} from "../types";

export interface PluginHostUnderTest {
	readDocument(): PluginDocumentV0;
	applyEdit(
		ops: DocumentOpV0[],
		label: string,
		options?: { expectedRevision?: number },
	): HostResult<ApplyEditResult>;
	undo(): Promise<boolean>;
}

export function runHostContractTests(
	createHost: () => PluginHostUnderTest,
): void {
	describe("Trusted-js document contract", () => {
		it("reads a stable document projection", () => {
			const document = createHost().readDocument();
			expect(Number.isInteger(document.revision)).toBe(true);
			for (const line of document.lines) {
				expect(line.id).toBeTruthy();
				for (const word of line.words) expect(word.id).toBeTruthy();
			}
		});

		it("applies one edit atomically and undoes it as one record", async () => {
			const host = createHost();
			const before = host.readDocument();
			const line = before.lines[0];
			const result = host.applyEdit(
				[
					{
						op: "updateLine",
						lineId: line.id,
						patch: { translation: "changed" },
					},
				],
				"Contract edit",
				{ expectedRevision: before.revision },
			);
			expect(result.ok).toBe(true);
			const changed = host.readDocument();
			expect(changed.lines[0].translation).toBe("changed");
			expect(changed.revision).toBe(before.revision + 1);
			expect(await host.undo()).toBe(true);
			expect(host.readDocument().lines[0].translation).toBe(line.translation);
		});

		it("rejects a stale expected revision without changing the document", () => {
			const host = createHost();
			const before = host.readDocument();
			expect(
				host.applyEdit(
					[{ op: "removeLine", lineId: before.lines[0].id }],
					"Stale edit",
					{ expectedRevision: before.revision + 1 },
				),
			).toMatchObject({
				ok: false,
				error: { code: "revision-conflict" },
			});
			expect(host.readDocument()).toEqual(before);
		});

		it("rejects invalid edits without partially committing earlier operations", () => {
			const host = createHost();
			const before = host.readDocument();
			const result = host.applyEdit(
				[
					{
						op: "updateLine",
						lineId: before.lines[0].id,
						patch: { translation: "partial" },
					},
					{ op: "removeLine", lineId: "missing-line" },
				],
				"Invalid edit",
			);
			expect(result.ok).toBe(false);
			expect(host.readDocument()).toEqual(before);
		});
	});
}
