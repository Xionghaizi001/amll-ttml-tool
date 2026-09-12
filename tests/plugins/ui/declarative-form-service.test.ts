import { describe, expect, it } from "vitest";
import { declarativeFormService } from "$/plugins/ui/declarative-form-service";

describe("declarativeFormService", () => {
	it("rejects schemas that fail protocol validation before rendering", async () => {
		await expect(
			declarativeFormService.showForm({
				title: "Broken",
				fields: [
					{ kind: "text", key: "same", label: "A" },
					{ kind: "text", key: "same", label: "B" },
				],
			}),
		).rejects.toThrow("Invalid form schema");
		expect(declarativeFormService.getSnapshot()).toBeNull();
	});

	it("rejects duplicate footer action ids", async () => {
		await expect(
			declarativeFormService.showForm({
				title: "Broken actions",
				fields: [],
				actions: [
					{ id: "remove", label: "Delete", tone: "danger" },
					{ id: "remove", label: "Delete again" },
				],
			}),
		).rejects.toThrow("Invalid form schema");
		expect(declarativeFormService.getSnapshot()).toBeNull();
	});

	it("resolves with the id of the clicked custom action", async () => {
		const promise = declarativeFormService.showForm({
			title: "Manage entry",
			fields: [],
			actions: [
				{ id: "dismiss", label: "取消", role: "cancel" },
				{
					id: "remove",
					label: "删除",
					tone: "danger",
					icon: { source: "@fluentui/react-icons", name: "DeleteRegular" },
				},
				{ id: "confirm", label: "确认" },
			],
		});
		const request = declarativeFormService.getSnapshot();
		if (!request) throw new Error("missing request");
		declarativeFormService.complete(request.id, {
			submitted: true,
			action: "remove",
			values: {},
		});
		await expect(promise).resolves.toEqual({
			submitted: true,
			action: "remove",
			values: {},
		});
	});

	it("ignores completions carrying a stale request id", async () => {
		const first = declarativeFormService.showForm({
			title: "First",
			fields: [],
		});
		const firstRequest = declarativeFormService.getSnapshot();
		if (!firstRequest) throw new Error("missing request");
		const second = declarativeFormService.showForm({
			title: "Second",
			fields: [],
		});
		await expect(first).resolves.toEqual({ submitted: false });
		const secondRequest = declarativeFormService.getSnapshot();
		if (!secondRequest) throw new Error("missing request");

		declarativeFormService.complete(firstRequest.id, {
			submitted: true,
			values: { stale: true },
		});
		expect(declarativeFormService.getSnapshot()?.id).toBe(secondRequest.id);

		declarativeFormService.complete(secondRequest.id, {
			submitted: true,
			values: {},
		});
		await expect(second).resolves.toEqual({ submitted: true, values: {} });
		expect(declarativeFormService.getSnapshot()).toBeNull();
	});
});
