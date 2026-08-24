import type { Capability, DocumentOpV0, HostMethod } from "./types";

export const HOST_METHOD_CAPABILITY = {
	"lyrics.getDocument": "lyrics.core",
	"lyrics.getSelection": "lyrics.core",
	"lyrics.applyEdit": "lyrics.core",
	"ui.notify": "ui.notify",
	"ui.showForm": "ui.form",
	"storage.get": "storage.kv",
	"storage.set": "storage.kv",
	"storage.delete": "storage.kv",
	"storage.keys": "storage.kv",
} as const satisfies Readonly<Record<HostMethod, Capability>>;

export function requiredCapabilitiesForCall(
	method: HostMethod,
	params?: unknown,
): Capability[] {
	const required: Capability[] = [HOST_METHOD_CAPABILITY[method]];
	if (method === "lyrics.applyEdit" && containsRubyEdit(params))
		required.push("lyrics.ruby");
	return required;
}

const containsRubyEdit = (params: unknown): boolean => {
	if (typeof params !== "object" || params === null || !("ops" in params))
		return false;
	const ops = (params as { ops?: unknown }).ops;
	if (!Array.isArray(ops)) return false;
	return (ops as DocumentOpV0[]).some((op) => {
		switch (op.op) {
			case "updateWord":
				return Object.hasOwn(op.patch, "ruby");
			case "insertWord":
				return op.word.ruby !== undefined;
			case "insertLine":
				return op.line.words.some((word) => word.ruby !== undefined);
			case "replaceDocument":
				return op.lines.some((line) =>
					line.words.some((word) => word.ruby !== undefined),
				);
			default:
				return false;
		}
	});
};

export const hasCapabilities = (
	granted: ReadonlySet<Capability>,
	required: readonly Capability[],
): boolean => required.every((capability) => granted.has(capability));
