import { useEffect } from "react";
import { toast } from "react-toastify";
import { selectedLinesAtom } from "$/states/main";
import { globalStore } from "$/states/store";
import { editorDocumentAdapter } from "../adapters/editor-document";
import { extensionRegistry } from "../adapters/extension-host";
import { declarativeFormService } from "../ui/declarative-form-service";
import { activateTimeShiftBuiltin, TIME_SHIFT_PLUGIN_ID } from "./time-shift";

export const BuiltinPluginHost = () => {
	useEffect(() => {
		const scope = extensionRegistry.createScope({
			kind: "builtin",
			id: TIME_SHIFT_PLUGIN_ID,
			trusted: true,
		});
		activateTimeShiftBuiltin(scope, {
			document: editorDocumentAdapter,
			getSelectedLineIds: () => globalStore.get(selectedLinesAtom),
			showForm: (schema) => declarativeFormService.showForm(schema),
			notify: ({ level, message, detail, timeoutMs }) => {
				toast[level]([message, detail].filter(Boolean).join("\n"), {
					autoClose: timeoutMs,
				});
			},
		});
		return () => scope.dispose();
	}, []);
	return null;
};
