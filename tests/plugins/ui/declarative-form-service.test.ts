import { describe, expect, it, vi } from "vitest";
import { declarativeFormService } from "$/plugins/ui/declarative-form-service";

describe("declarativeFormService", () => {
	it("cancels on abort even during the initial render notification", async () => {
		const controller = new AbortController();
		const unsubscribe = declarativeFormService.subscribe(() => {
			if (declarativeFormService.getSnapshot()) controller.abort();
		});
		try {
			await expect(
				declarativeFormService.showForm(
					{ title: "Form", fields: [] },
					controller.signal,
				),
			).resolves.toEqual({ submitted: false });
			expect(declarativeFormService.getSnapshot()).toBeNull();
		} finally {
			unsubscribe();
		}
	});

	it("detaches a replaced form's abort listener and preserves the new form", async () => {
		const controller = new AbortController();
		const remove = vi.spyOn(controller.signal, "removeEventListener");
		const first = declarativeFormService.showForm(
			{ title: "Old", fields: [] },
			controller.signal,
		);
		const second = declarativeFormService.showForm({
			title: "New",
			fields: [],
		});
		await expect(first).resolves.toEqual({ submitted: false });
		expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
		controller.abort();
		const current = declarativeFormService.getSnapshot();
		expect(current?.schema.title).toBe("New");
		if (!current) throw new Error("missing request");
		declarativeFormService.complete(current.id, {
			submitted: true,
			values: {},
		});
		await expect(second).resolves.toEqual({ submitted: true, values: {} });
		remove.mockRestore();
	});

	it("does not replace the current form when a cancelled owner requests a form", async () => {
		const current = declarativeFormService.showForm({
			title: "Current",
			fields: [],
		});
		const request = declarativeFormService.getSnapshot();
		await expect(
			declarativeFormService.showForm(
				{ title: "Cancelled", fields: [] },
				AbortSignal.abort(),
			),
		).resolves.toEqual({ submitted: false });
		expect(declarativeFormService.getSnapshot()).toBe(request);
		if (!request) throw new Error("missing request");
		declarativeFormService.cancel(request.id);
		await expect(current).resolves.toEqual({ submitted: false });
	});

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
