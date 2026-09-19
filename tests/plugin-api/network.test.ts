import { parseHttpRequest } from "@amll-ttml-tool/plugin-api";
import { describe, expect, it } from "vitest";

describe("portable HTTP policy", () => {
	it.each([
		"https://example.com/path?q=1",
		"http://localhost:3000",
		"http://127.0.0.1",
		"http://[::1]:8080",
	])("allows %s", (url) => {
		expect(parseHttpRequest({ url }).ok).toBe(true);
	});
	it.each([
		"http://example.com",
		"https://user:password@example.com",
		"file:///tmp/a",
		"https://example.com:99999",
		"https://example.com\\@evil.test",
		" https://example.com",
	])("rejects %s", (url) => {
		expect(parseHttpRequest({ url }).ok).toBe(false);
	});
});
