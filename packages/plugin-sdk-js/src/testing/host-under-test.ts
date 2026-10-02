import type { TrustedJsHostV0 } from "../host";

/** Exposes the SDK document port to the shared contract without a wire bridge. */
export const createTrustedJsHostUnderTest = (
	host: TrustedJsHostV0,
	options: { undo(): boolean | Promise<boolean> },
) => ({
	readDocument: () => host.document.readSnapshot(),
	applyEdit: host.document.applyEdit,
	undo: async () => options.undo(),
});
