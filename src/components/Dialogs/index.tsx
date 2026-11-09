import { LatencyTestDialog } from "$/modules/audio/modals/LatencyTest.tsx";
import { HistoryRestoreDialog } from "$/modules/project/modals/HistoryRestore.tsx";
import { SubmitToAMLLDBDialog } from "$/modules/project/modals/SubmitToAmll.tsx";
import { SettingsDialog } from "$/modules/settings/modals/index.tsx";
import { DeclarativeFormHost } from "$/plugins/ui/DeclarativeFormHost";
import { PluginDialogViewHost } from "$/plugins/ui/PluginDialogViewHost";
import { ConfirmationDialog } from "./confirmation.tsx";
import { TtmlErrorDialog } from "./TtmlErrorDialog.tsx";

export const Dialogs = () => {
	return (
		<>
			<SettingsDialog />
			<SubmitToAMLLDBDialog />
			<LatencyTestDialog />
			<ConfirmationDialog />
			<HistoryRestoreDialog />
			<DeclarativeFormHost />
			<PluginDialogViewHost />
			<TtmlErrorDialog />
		</>
	);
};

export default Dialogs;
