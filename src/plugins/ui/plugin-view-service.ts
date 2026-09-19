import type { Disposable } from "$/kernel/commands";
import type {
	ContributionOwner,
	TrustedViewContributionRecord,
} from "$/kernel/extensions";

/**
 * Open-state of plugin `dialog-view` trusted views. Plugins call
 * `ui.openView(id)` / `ui.closeView(id)` through the SDK; the host renders
 * whatever is open in `PluginDialogViewHost`. Pure logic over a registry
 * port so the ownership rules run under Node tests.
 *
 * Rules: a plugin may only open views it registered itself (namespace and
 * owner both checked); a view whose contribution disappears (plugin disabled
 * or unloaded) is closed automatically — there is no way to keep a dialog on
 * screen after its owner's scope is disposed.
 */

export interface PluginViewRegistryPort {
	getTrustedViews(kind: "dialog-view"): TrustedViewContributionRecord[];
	subscribe(listener: () => void): Disposable;
}

export interface OpenPluginDialogView {
	/** Contribution id (`<pluginId>.<name>`). */
	id: string;
	pluginId: string;
	record: TrustedViewContributionRecord;
}

const ownerPluginId = (owner: ContributionOwner): string =>
	owner.kind === "plugin" ? owner.pluginId : owner.id;

export class PluginViewService {
	private readonly openIds: string[] = [];
	private readonly listeners = new Set<() => void>();
	private snapshot: OpenPluginDialogView[] = [];

	constructor(private readonly registry: PluginViewRegistryPort) {
		registry.subscribe(() => this.prune());
	}

	/** Opens `viewId` on behalf of `pluginId`; throws when the plugin does not own such a dialog view. */
	open(pluginId: string, viewId: string): void {
		if (!viewId.startsWith(`${pluginId}.`))
			throw new Error(
				`Plugin ${pluginId} cannot open view ${viewId} outside its own namespace`,
			);
		const record = this.registry
			.getTrustedViews("dialog-view")
			.find((view) => view.id === viewId);
		if (record === undefined || ownerPluginId(record.owner) !== pluginId)
			throw new Error(
				`Plugin ${pluginId} has no dialog-view registered as ${viewId}`,
			);
		if (this.openIds.includes(viewId)) return;
		this.openIds.push(viewId);
		this.refresh();
	}

	close(viewId: string, pluginId?: string): void {
		if (
			pluginId !== undefined &&
			this.snapshot.find((view) => view.id === viewId)?.pluginId !== pluginId
		)
			return;
		const index = this.openIds.indexOf(viewId);
		if (index < 0) return;
		this.openIds.splice(index, 1);
		this.refresh();
	}

	/** Closes every open view owned by `pluginId` (host handle disposal). */
	closeAllOf(pluginId: string): void {
		const remaining = this.openIds.filter(
			(id) =>
				this.snapshot.find((view) => view.id === id)?.pluginId !== pluginId,
		);
		if (remaining.length === this.openIds.length) return;
		this.openIds.splice(0, this.openIds.length, ...remaining);
		this.refresh();
	}

	/** Stable snapshot for `useSyncExternalStore`; same reference until it changes. */
	getSnapshot = (): OpenPluginDialogView[] => this.snapshot;

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	private prune(): void {
		const live = new Set(
			this.registry.getTrustedViews("dialog-view").map((view) => view.id),
		);
		const remaining = this.openIds.filter((id) => live.has(id));
		if (remaining.length === this.openIds.length) return;
		this.openIds.splice(0, this.openIds.length, ...remaining);
		this.refresh();
	}

	private refresh(): void {
		const records = new Map(
			this.registry
				.getTrustedViews("dialog-view")
				.map((view) => [view.id, view] as const),
		);
		this.snapshot = this.openIds.flatMap((id) => {
			const record = records.get(id);
			return record === undefined
				? []
				: [{ id, pluginId: ownerPluginId(record.owner), record }];
		});
		for (const listener of [...this.listeners]) listener();
	}
}
