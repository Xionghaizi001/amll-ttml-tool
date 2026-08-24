export type EnablementValue = string | number | boolean | undefined;
export type EnablementContext = Readonly<Record<string, EnablementValue>>;
export type EnablementAst =
	| { kind: "identifier"; name: string }
	| { kind: "literal"; value: string | number | boolean }
	| { kind: "not"; value: EnablementAst }
	| {
			kind: "and" | "or" | "equal" | "notEqual";
			left: EnablementAst;
			right: EnablementAst;
	  };

export interface ParsedEnablement {
	ast: EnablementAst;
	unknownIdents: string[];
}

const KNOWN_IDENTIFIERS = new Set([
	"mode",
	"hasSelection",
	"hasLineSelection",
	"hasWordSelection",
	"documentEmpty",
	"audioLoaded",
	"canUndo",
	"canRedo",
]);

type Token = {
	type: "identifier" | "literal" | "operator" | "paren";
	value: string | number | boolean;
};

function tokenize(input: string): Token[] {
	const tokens: Token[] = [];
	let index = 0;
	while (index < input.length) {
		const rest = input.slice(index);
		const whitespace = /^\s+/.exec(rest);
		if (whitespace) {
			index += whitespace[0].length;
			continue;
		}
		const operator = /^(\|\||&&|==|!=|!|\(|\))/.exec(rest);
		if (operator) {
			tokens.push({
				type: operator[1] === "(" || operator[1] === ")" ? "paren" : "operator",
				value: operator[1],
			});
			index += operator[1].length;
			continue;
		}
		const quoted = /^'([^']*)'/.exec(rest);
		if (quoted) {
			tokens.push({ type: "literal", value: quoted[1] });
			index += quoted[0].length;
			continue;
		}
		const number = /^-?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)/.exec(rest);
		if (number) {
			tokens.push({ type: "literal", value: Number(number[0]) });
			index += number[0].length;
			continue;
		}
		const identifier = /^[a-zA-Z][a-zA-Z0-9.]*/.exec(rest);
		if (identifier) {
			const value = identifier[0];
			tokens.push(
				value === "true" || value === "false"
					? { type: "literal", value: value === "true" }
					: { type: "identifier", value },
			);
			index += value.length;
			continue;
		}
		throw new Error(`unexpected token at character ${index + 1}`);
	}
	return tokens;
}

class Parser {
	private index = 0;
	constructor(private readonly tokens: readonly Token[]) {}

	parse(): EnablementAst {
		const result = this.parseOr();
		if (this.index !== this.tokens.length)
			throw new Error("unexpected trailing token");
		return result;
	}

	private parseOr(): EnablementAst {
		let left = this.parseAnd();
		while (this.take("||")) left = { kind: "or", left, right: this.parseAnd() };
		return left;
	}

	private parseAnd(): EnablementAst {
		let left = this.parseUnary();
		while (this.take("&&"))
			left = { kind: "and", left, right: this.parseUnary() };
		return left;
	}

	private parseUnary(): EnablementAst {
		if (this.take("!")) return { kind: "not", value: this.parseUnary() };
		if (this.take("(")) {
			const value = this.parseOr();
			if (!this.take(")")) throw new Error("missing closing parenthesis");
			return value;
		}
		const left = this.parseValue();
		if (this.take("=="))
			return { kind: "equal", left, right: this.parseValue() };
		if (this.take("!="))
			return { kind: "notEqual", left, right: this.parseValue() };
		return left;
	}

	private parseValue(): EnablementAst {
		const token = this.tokens[this.index++];
		if (!token) throw new Error("expected a value");
		if (token.type === "identifier")
			return { kind: "identifier", name: String(token.value) };
		if (token.type === "literal")
			return {
				kind: "literal",
				value: token.value as string | number | boolean,
			};
		throw new Error("expected an identifier or literal");
	}

	private take(value: string): boolean {
		if (this.tokens[this.index]?.value !== value) return false;
		this.index += 1;
		return true;
	}
}

const collectIdentifiers = (ast: EnablementAst, result: Set<string>): void => {
	switch (ast.kind) {
		case "identifier":
			if (!KNOWN_IDENTIFIERS.has(ast.name)) result.add(ast.name);
			return;
		case "literal":
			return;
		case "not":
			collectIdentifiers(ast.value, result);
			return;
		default:
			collectIdentifiers(ast.left, result);
			collectIdentifiers(ast.right, result);
	}
};

export function parseEnablement(input?: string): ParsedEnablement {
	const ast: EnablementAst =
		input === undefined || input.trim() === ""
			? { kind: "literal", value: true }
			: new Parser(tokenize(input)).parse();
	const unknown = new Set<string>();
	collectIdentifiers(ast, unknown);
	return { ast, unknownIdents: [...unknown] };
}

const resolve = (
	ast: EnablementAst,
	context: EnablementContext,
): EnablementValue => {
	switch (ast.kind) {
		case "literal":
			return ast.value;
		case "identifier":
			return context[ast.name];
		case "not":
			return !resolve(ast.value, context);
		case "and":
			return (
				Boolean(resolve(ast.left, context)) &&
				Boolean(resolve(ast.right, context))
			);
		case "or":
			return (
				Boolean(resolve(ast.left, context)) ||
				Boolean(resolve(ast.right, context))
			);
		case "equal":
			return resolve(ast.left, context) === resolve(ast.right, context);
		case "notEqual":
			return resolve(ast.left, context) !== resolve(ast.right, context);
	}
};

export const evaluateEnablement = (
	ast: EnablementAst,
	context: EnablementContext,
	unknownIdents: readonly string[] = [],
): boolean => unknownIdents.length === 0 && Boolean(resolve(ast, context));
