import type { ParseIssue, ParseResult } from "../types";

export type JsonSchema = boolean | { [keyword: string]: unknown };

const typeMatches = (type: string, value: unknown): boolean => {
	switch (type) {
		case "null":
			return value === null;
		case "array":
			return Array.isArray(value);
		case "object":
			return (
				typeof value === "object" && value !== null && !Array.isArray(value)
			);
		case "integer":
			return typeof value === "number" && Number.isInteger(value);
		case "number":
			return typeof value === "number" && Number.isFinite(value);
		default:
			return typeof value === type;
	}
};

const sameJson = (left: unknown, right: unknown): boolean =>
	JSON.stringify(left) === JSON.stringify(right);

function validateAt(
	schema: JsonSchema,
	value: unknown,
	path: string,
	root: JsonSchema,
): ParseIssue[] {
	if (schema === true) return [];
	if (schema === false) return [{ path, message: "value is not allowed" }];
	const activeRoot = schema.$defs === undefined ? root : schema;
	const issues: ParseIssue[] = [];

	if (typeof schema.$ref === "string") {
		const prefix = "#/$defs/";
		if (!schema.$ref.startsWith(prefix) || typeof activeRoot === "boolean") {
			return [{ path, message: `unsupported schema reference ${schema.$ref}` }];
		}
		const definition = (
			activeRoot.$defs as Record<string, JsonSchema> | undefined
		)?.[schema.$ref.slice(prefix.length)];
		return definition
			? validateAt(definition, value, path, activeRoot)
			: [{ path, message: `unknown schema reference ${schema.$ref}` }];
	}

	if (schema.nullable === true && value === null) return [];
	if (Array.isArray(schema.allOf)) {
		for (const child of schema.allOf as JsonSchema[])
			issues.push(...validateAt(child, value, path, activeRoot));
	}
	if (Array.isArray(schema.anyOf)) {
		const matches = (schema.anyOf as JsonSchema[]).filter(
			(child) => validateAt(child, value, path, activeRoot).length === 0,
		);
		if (matches.length === 0)
			issues.push({ path, message: "value does not match any allowed schema" });
	}
	if (Array.isArray(schema.oneOf)) {
		const matches = (schema.oneOf as JsonSchema[]).filter(
			(child) => validateAt(child, value, path, activeRoot).length === 0,
		);
		if (matches.length !== 1)
			issues.push({ path, message: "value must match exactly one schema" });
	}
	if (
		schema.not !== undefined &&
		validateAt(schema.not as JsonSchema, value, path, activeRoot).length === 0
	)
		issues.push({ path, message: "value matches a forbidden schema" });

	if (schema.const !== undefined && !sameJson(schema.const, value))
		issues.push({
			path,
			message: `expected constant ${JSON.stringify(schema.const)}`,
		});
	if (
		Array.isArray(schema.enum) &&
		!schema.enum.some((item) => sameJson(item, value))
	)
		issues.push({ path, message: "value is not in the allowed enum" });

	const types = Array.isArray(schema.type) ? schema.type : [schema.type];
	if (
		schema.type !== undefined &&
		!types.some((type) => typeMatches(String(type), value))
	) {
		issues.push({ path, message: `expected type ${types.join(" or ")}` });
		return issues;
	}

	if (typeof value === "string") {
		if (typeof schema.minLength === "number" && value.length < schema.minLength)
			issues.push({
				path,
				message: `must contain at least ${schema.minLength} characters`,
			});
		if (typeof schema.maxLength === "number" && value.length > schema.maxLength)
			issues.push({
				path,
				message: `must contain at most ${schema.maxLength} characters`,
			});
		if (
			typeof schema.pattern === "string" &&
			!new RegExp(schema.pattern).test(value)
		)
			issues.push({ path, message: `must match ${schema.pattern}` });
	}
	if (typeof value === "number") {
		if (typeof schema.minimum === "number" && value < schema.minimum)
			issues.push({ path, message: `must be >= ${schema.minimum}` });
		if (typeof schema.maximum === "number" && value > schema.maximum)
			issues.push({ path, message: `must be <= ${schema.maximum}` });
	}
	if (Array.isArray(value)) {
		if (typeof schema.minItems === "number" && value.length < schema.minItems)
			issues.push({
				path,
				message: `must contain at least ${schema.minItems} items`,
			});
		if (typeof schema.maxItems === "number" && value.length > schema.maxItems)
			issues.push({
				path,
				message: `must contain at most ${schema.maxItems} items`,
			});
		if (schema.items !== undefined) {
			value.forEach((item, index) => {
				issues.push(
					...validateAt(
						schema.items as JsonSchema,
						item,
						`${path}/${index}`,
						activeRoot,
					),
				);
			});
		}
	}
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		const record = value as Record<string, unknown>;
		const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;
		for (const required of (schema.required ?? []) as string[]) {
			if (!(required in record))
				issues.push({
					path: `${path}/${required}`,
					message: "required property is missing",
				});
		}
		for (const [key, childValue] of Object.entries(record)) {
			if (properties[key] !== undefined) {
				issues.push(
					...validateAt(
						properties[key],
						childValue,
						`${path}/${key}`,
						activeRoot,
					),
				);
			} else if (schema.additionalProperties === false) {
				issues.push({
					path: `${path}/${key}`,
					message: "additional property is not allowed",
				});
			} else if (
				typeof schema.additionalProperties === "object" ||
				typeof schema.additionalProperties === "boolean"
			) {
				issues.push(
					...validateAt(
						schema.additionalProperties as JsonSchema,
						childValue,
						`${path}/${key}`,
						activeRoot,
					),
				);
			}
		}
	}
	return issues;
}

export function validate<T = unknown>(
	schema: JsonSchema,
	value: unknown,
): ParseResult<T> {
	const issues = validateAt(schema, value, "", schema);
	return issues.length === 0
		? { ok: true, value: value as T }
		: { ok: false, issues };
}
