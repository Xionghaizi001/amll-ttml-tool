import { useEffect, useRef } from "react";
import { commandRegistry } from "$/modules/keyboard/registry";

/** Registers a component-scoped core command while keeping its latest closure. */
export const useLocalCommand = (
	id: string,
	handler: (args?: unknown) => unknown | Promise<unknown>,
	enablement?: () => boolean,
) => {
	const handlerRef = useRef(handler);
	const enablementRef = useRef(enablement);
	handlerRef.current = handler;
	enablementRef.current = enablement;

	useEffect(() => {
		const registration = commandRegistry.register({
			id,
			handler: (args) => handlerRef.current(args),
			enablement: () => enablementRef.current?.() ?? true,
			source: { kind: "builtin", id: "core-ui" },
		});
		return () => registration.dispose();
	}, [id]);

	useEffect(() => commandRegistry.notifyEnablementChanged());
};
