import type {
	FormConditionV0,
	FormFieldV0,
	FormValueV0,
} from "@amll-ttml-tool/plugin-api";

export const collectFormDefaultValues = (
	fields: readonly FormFieldV0[],
): Record<string, FormValueV0> => {
	const values: Record<string, FormValueV0> = {};
	for (const field of fields) {
		if (field.kind === "group") {
			Object.assign(values, collectFormDefaultValues(field.fields));
			continue;
		}
		if (field.kind === "note") continue;
		if (field.default !== undefined) values[field.key] = field.default;
		else if (field.kind === "boolean") values[field.key] = false;
		else if (field.kind === "number") values[field.key] = 0;
		else values[field.key] = "";
	}
	return values;
};

export const matchesFormCondition = (
	condition: FormConditionV0 | undefined,
	values: Readonly<Record<string, FormValueV0>>,
): boolean =>
	condition === undefined || values[condition.field] === condition.equals;

export const clampFormNumber = (
	value: number,
	min?: number,
	max?: number,
): number =>
	Math.min(
		max ?? Number.POSITIVE_INFINITY,
		Math.max(min ?? Number.NEGATIVE_INFINITY, value),
	);

type KeyedFormField = Exclude<FormFieldV0, { kind: "note" | "group" }>;

const visitKeyedFields = (
	fields: readonly FormFieldV0[],
	visit: (field: KeyedFormField, visible: boolean) => void,
	values: Readonly<Record<string, FormValueV0>>,
	parentVisible = true,
): void => {
	for (const field of fields) {
		const visible =
			parentVisible && matchesFormCondition(field.visibleWhen, values);
		if (field.kind === "group") {
			visitKeyedFields(field.fields, visit, values, visible);
			continue;
		}
		if (field.kind === "note") continue;
		visit(field, visible);
	}
};

const sanitizeChoice = (field: KeyedFormField, value: FormValueV0): string => {
	if (field.kind !== "select" && field.kind !== "radio") return String(value);
	const enabled = field.options.filter((option) => !option.disabled);
	if (enabled.some((option) => option.value === value)) return String(value);
	if (enabled.some((option) => option.value === field.default))
		return String(field.default);
	return enabled[0]?.value ?? "";
};

/**
 * Produces the values handed back to the plugin: only schema-declared keys,
 * coerced to the declared type and clamped to the declared constraints. The
 * rendered React state is never trusted as-is.
 */
export const sanitizeFormValues = (
	fields: readonly FormFieldV0[],
	values: Readonly<Record<string, FormValueV0>>,
): Record<string, FormValueV0> => {
	const result: Record<string, FormValueV0> = {};
	visitKeyedFields(
		fields,
		(field) => {
			const value = values[field.key];
			if (field.kind === "boolean") result[field.key] = Boolean(value);
			else if (field.kind === "number") {
				const numeric = Number(value);
				result[field.key] = clampFormNumber(
					Number.isFinite(numeric) ? numeric : (field.default ?? 0),
					field.min,
					field.max,
				);
			} else if (field.kind === "text")
				result[field.key] = String(value ?? "").slice(
					0,
					field.maxLength ?? 65536,
				);
			else result[field.key] = sanitizeChoice(field, value);
		},
		values,
	);
	return result;
};

/** Submit gate: every visible field must satisfy its declared constraints. */
export const isFormValid = (
	fields: readonly FormFieldV0[],
	values: Readonly<Record<string, FormValueV0>>,
): boolean => {
	let valid = true;
	visitKeyedFields(
		fields,
		(field, visible) => {
			if (!visible || !valid) return;
			const value = values[field.key];
			if (field.kind === "text") {
				const text = String(value ?? "");
				if (field.required && text.trim() === "") valid = false;
				if (field.maxLength !== undefined && text.length > field.maxLength)
					valid = false;
			} else if (field.kind === "number") {
				const numeric = Number(value);
				if (!Number.isFinite(numeric)) valid = false;
				else if (
					(field.min !== undefined && numeric < field.min) ||
					(field.max !== undefined && numeric > field.max)
				)
					valid = false;
			} else if (field.kind === "select" || field.kind === "radio") {
				if (
					!field.options.some(
						(option) => !option.disabled && option.value === value,
					)
				)
					valid = false;
			}
		},
		values,
	);
	return valid;
};
