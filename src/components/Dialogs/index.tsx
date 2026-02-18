import { LatencyTestDialog } from "$/modules/audio/modals/LatencyTest.tsx";
import { ImportFromLRCLIB } from "$/modules/lrclib/modals/ImportDialog.tsx";
import { ReplaceWordDialog } from "$/modules/lyric-editor/tools/ReplaceWordDialog.tsx";
import { TimeShiftDialog } from "$/modules/lyric-editor/tools/TimeShift.tsx";
import { DistributeRomanizationDialog } from "$/modules/project/modals/DistributeRomanization.tsx";
import { HistoryRestoreDialog } from "$/modules/project/modals/HistoryRestore.tsx";
import { ImportFromText } from "$/modules/project/modals/ImportFromText.tsx";
import { MetadataEditor } from "$/modules/project/modals/MetadataEditor.tsx";
import { VocalTagsEditor } from "$/modules/project/modals/VocalTagsEditor.tsx";
import { SubmitToAMLLDBDialog } from "$/modules/user/modals/SubmitToAmll.tsx";
import { ReviewReportDialog } from "$/modules/review/modals/ReviewReportDialog.tsx";
import { AdvancedSegmentationDialog } from "$/modules/segmentation/components/AdvancedSegmentation.tsx";
import { SplitWordDialog } from "$/modules/segmentation/components/split-word.tsx";
import { SettingsDialog } from "$/modules/settings/modals/index.tsx";
import { AddLanguageDialog } from "./add-language.tsx";
import { ConfirmationDialog } from "./confirmation.tsx";
import { RiskConfirmationDialog } from "./risk-confirmation.tsx";
import { NotificationCenterDialog } from "./notification-center.tsx";
import { MetaSuggestionManagerDialog } from "./meta-suggestion-manager.tsx";

export const Dialogs = () => {
	return (
		<>
			<ImportFromText />
			<ImportFromLRCLIB />
			<MetadataEditor />
			<VocalTagsEditor />
			<SettingsDialog />
			<SplitWordDialog />
			<ReplaceWordDialog />
			<SubmitToAMLLDBDialog />
			<LatencyTestDialog />
			<ConfirmationDialog />
			<HistoryRestoreDialog />
			<AdvancedSegmentationDialog />
			<TimeShiftDialog />
			<DistributeRomanizationDialog />
			<AddLanguageDialog />
			<NotificationCenterDialog />
			<ReviewReportDialog />
			<RiskConfirmationDialog />
			<MetaSuggestionManagerDialog />
		</>
	);
};

export default Dialogs;
