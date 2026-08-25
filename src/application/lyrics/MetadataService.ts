import type { EditorDocumentService } from "../../kernel/editor";
import type { TTMLMetadata } from "../../types/ttml";

export type MetadataDocumentPort = Pick<
	EditorDocumentService,
	"getRevision" | "transact"
>;

const transact = (
	document: MetadataDocumentPort,
	label: string,
	update: (metadata: TTMLMetadata[]) => void,
) =>
	document.transact(
		{
			source: "user",
			label: `Metadata ${label}`,
			expectedRevision: document.getRevision(),
		},
		(draft) => {
			update(draft.metadata);
		},
	);

export const splitDroppedMetadataValues = (text: string) =>
	text
		.split(/[\n,;/，；、|\\]/)
		.map((value) => value.trim())
		.filter(Boolean);

export function hasDuplicateMetadataValues(values: readonly string[]) {
	const filled = values.filter((value) => value.trim());
	return new Set(filled).size !== filled.length;
}

export function updateMetadataValue(
	document: MetadataDocumentPort,
	key: string,
	index: number,
	value: string,
) {
	return transact(document, "update value", (metadata) => {
		let entry = metadata.find((item) => item.key === key);
		if (!entry) {
			entry = { key, value: [] };
			metadata.push(entry);
		}
		entry.value[index] = value;
	});
}

export function addMetadataValue(
	document: MetadataDocumentPort,
	key: string,
	value = "",
) {
	return transact(document, "add value", (metadata) => {
		let entry = metadata.find((item) => item.key === key);
		if (!entry) {
			entry = { key, value: [] };
			metadata.push(entry);
		}
		entry.value.push(value);
	});
}

export function removeMetadataValue(
	document: MetadataDocumentPort,
	key: string,
	index: number,
) {
	return transact(document, "remove value", (metadata) => {
		const entryIndex = metadata.findIndex((item) => item.key === key);
		if (entryIndex < 0) return;
		metadata[entryIndex].value.splice(index, 1);
		if (!metadata[entryIndex].value.length) metadata.splice(entryIndex, 1);
	});
}

export function appendDroppedMetadataValues(
	document: MetadataDocumentPort,
	key: string,
	text: string,
) {
	const values = splitDroppedMetadataValues(text);
	if (!values.length) return;
	return transact(document, "append dropped values", (metadata) => {
		let entry = metadata.find((item) => item.key === key);
		if (!entry) {
			entry = { key, value: [] };
			metadata.push(entry);
		}
		const existing = new Set(entry.value.filter((value) => value.trim()));
		const emptyIndices = entry.value.flatMap((value, index) =>
			value.trim() ? [] : [index],
		);
		for (const value of values) {
			if (existing.has(value)) continue;
			const emptyIndex = emptyIndices.shift();
			if (emptyIndex == null) entry.value.push(value);
			else entry.value[emptyIndex] = value;
			existing.add(value);
		}
	});
}

export function addMetadataKey(document: MetadataDocumentPort, key: string) {
	const normalized = key.trim();
	if (!normalized) return false;
	transact(document, "add custom key", (metadata) => {
		if (!metadata.some((entry) => entry.key === normalized))
			metadata.push({ key: normalized, value: [] });
	});
	return true;
}

export function clearMetadata(document: MetadataDocumentPort) {
	return transact(document, "clear all", (metadata) => {
		metadata.splice(0);
	});
}
