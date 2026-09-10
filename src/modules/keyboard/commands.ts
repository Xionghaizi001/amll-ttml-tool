import { t } from "./i18n-helper";
import { registerCommand } from "./registry";

const IS_MAC = navigator.userAgent.includes("Mac");
const CONTROL_KEY = IS_MAC ? "Meta" : "Control";
const DELETE_KEY = IS_MAC ? "Backspace" : "Delete";

// =========================================================================================
//  文件操作
// =========================================================================================

export const cmdNewFile = registerCommand(
	"newFile",
	[CONTROL_KEY, "KeyN"],
	t("settingsDialog.keybindings.newFile"),
	"File",
);

export const cmdOpenFile = registerCommand(
	"openFile",
	[CONTROL_KEY, "KeyO"],
	t("settingsDialog.keybindings.openFile"),
	"File",
);

export const cmdSaveFile = registerCommand(
	"saveFile",
	[CONTROL_KEY, "KeyS"],
	t("settingsDialog.keybindings.saveFile"),
	"File",
);

export const cmdOpenAudio = registerCommand(
	"openAudio",
	[CONTROL_KEY, "KeyM"],
	t("settingsDialog.keybindings.openAudio"),
	"File",
);

// =========================================================================================
//  编辑与选择
// =========================================================================================

export const cmdUndo = registerCommand(
	"undo",
	[CONTROL_KEY, "KeyZ"],
	t("settingsDialog.keybindings.undo"),
	"Edit",
);

export const cmdRedo = registerCommand(
	"redo",
	IS_MAC ? ["Shift", CONTROL_KEY, "KeyZ"] : [CONTROL_KEY, "KeyY"],
	t("settingsDialog.keybindings.redo"),
	"Edit",
);

export const cmdSelectAll = registerCommand(
	"selectAll",
	[CONTROL_KEY, "KeyA"],
	t("settingsDialog.keybindings.selectAll"),
	"Edit",
);

export const cmdUnselectAll = registerCommand(
	"unselectAll",
	[CONTROL_KEY, "Escape"],
	t("settingsDialog.keybindings.unselectAll"),
	"Edit",
);

export const cmdSelectInverted = registerCommand(
	"selectInverted",
	[CONTROL_KEY, "KeyI"],
	t("settingsDialog.keybindings.selectInverted"),
	"Edit",
);

export const cmdSelectWordsOfMatchedSelection = registerCommand(
	"selectWordsOfMatchedSelection",
	[CONTROL_KEY, "F2"],
	t("settingsDialog.keybindings.selectWordsOfMatchedSelection"),
	"Edit",
);

export const cmdDeleteSelection = registerCommand(
	"deleteSelection",
	[DELETE_KEY],
	t("settingsDialog.keybindings.deleteSelection"),
	"Edit",
);

// =========================================================================================
//  视图模式
// =========================================================================================

export const cmdSwitchEditMode = registerCommand(
	"switchEditMode",
	["Shift", "Digit1"],
	t("settingsDialog.keybindings.switchEditMode"),
	"View",
);

export const cmdSwitchSyncMode = registerCommand(
	"switchSyncMode",
	["Shift", "Digit2"],
	t("settingsDialog.keybindings.switchSyncMode"),
	"View",
);

export const cmdSwitchPreviewMode = registerCommand(
	"switchPreviewMode",
	["Shift", "Digit3"],
	t("settingsDialog.keybindings.switchPreviewMode"),
	"View",
);

// =========================================================================================
//  打轴操作
// =========================================================================================

export const cmdMoveNextWord = registerCommand(
	"moveNextWord",
	["KeyD"],
	t("settingsDialog.keybindings.moveNextWord"),
	"Sync",
);

export const cmdMovePrevWord = registerCommand(
	"movePrevWord",
	["KeyA"],
	t("settingsDialog.keybindings.movePrevWord"),
	"Sync",
);

export const cmdMoveNextLine = registerCommand(
	"moveNextLine",
	["KeyS"],
	t("settingsDialog.keybindings.moveNextLine"),
	"Sync",
);

export const cmdMovePrevLine = registerCommand(
	"movePrevLine",
	["KeyW"],
	t("settingsDialog.keybindings.movePrevLine"),
	"Sync",
);

export const cmdMovePrevWordAndPlay = registerCommand(
	"movePrevWordAndPlay",
	["KeyR"],
	t("settingsDialog.keybindings.movePrevWordAndPlay"),
	"Sync",
);

export const cmdMoveNextWordAndPlay = registerCommand(
	"moveNextWordAndPlay",
	["KeyY"],
	t("settingsDialog.keybindings.moveNextWordAndPlay"),
	"Sync",
);

export const cmdSyncStart = registerCommand(
	"syncStart",
	["KeyF"],
	t("settingsDialog.keybindings.syncStart"),
	"Sync",
);

export const cmdSyncNext = registerCommand(
	"syncNext",
	["KeyG"],
	t("settingsDialog.keybindings.syncNext"),
	"Sync",
);

export const cmdSyncEnd = registerCommand(
	"syncEnd",
	["KeyH"],
	t("settingsDialog.keybindings.syncEnd"),
	"Sync",
);

export const cmdMoveFirstWordAndPlay = registerCommand(
	"moveFirstWordAndPlay",
	["KeyHome"],
	t("settingsDialog.keybindings.moveFirstWordAndPlay"),
	"Sync",
);

export const cmdMoveLastWordAndPlay = registerCommand(
	"moveLastWordAndPlay",
	["KeyEnd"],
	t("settingsDialog.keybindings.moveLastWordAndPlay"),
	"Sync",
);

// =========================================================================================
//  音频控制
// =========================================================================================

export const cmdPlayPause = registerCommand(
	"playPause",
	["Space"],
	t("settingsDialog.keybindings.playPause"),
	"Audio",
);

export const cmdSeekForward = registerCommand(
	"seekForward",
	["ArrowRight"],
	t("settingsDialog.keybindings.seekForward"),
	"Audio",
);

export const cmdSeekBackward = registerCommand(
	"seekBackward",
	["ArrowLeft"],
	t("settingsDialog.keybindings.seekBackward"),
	"Audio",
);

export const cmdVolumeUp = registerCommand(
	"volumeUp",
	["ArrowUp"],
	t("settingsDialog.keybindings.volumeUp"),
	"Audio",
);

export const cmdVolumeDown = registerCommand(
	"volumeDown",
	["ArrowDown"],
	t("settingsDialog.keybindings.volumeDown"),
	"Audio",
);

export const cmdPlaybackRateUp = registerCommand(
	"playbackRateUp",
	["BracketRight"],
	t("settingsDialog.keybindings.playbackRateUp"),
	"Audio",
);

export const cmdPlaybackRateDown = registerCommand(
	"playbackRateDown",
	["BracketLeft"],
	t("settingsDialog.keybindings.playbackRateDown"),
	"Audio",
);

export const cmdPlaybackRateReset = registerCommand(
	"playbackRateReset",
	["Quote"],
	t("settingsDialog.keybindings.playbackRateReset"),
	"Audio",
);

// =========================================================================================
//  频谱图/试听
// =========================================================================================

export const cmdAuditionSelectionBefore = registerCommand(
	"auditionSelectionBefore",
	["KeyQ"],
	t("settingsDialog.keybindings.auditionSelectionBefore"),
	"Spectrogram",
);

export const cmdAuditionSelection = registerCommand(
	"auditionSelection",
	["KeyS"],
	t("settingsDialog.keybindings.auditionSelection"),
	"Spectrogram",
);

export const cmdAuditionSelectionAfter = registerCommand(
	"auditionSelectionAfter",
	["KeyW"],
	t("settingsDialog.keybindings.auditionSelectionAfter"),
	"Spectrogram",
);

// =========================================================================================
//  菜单命令（无默认快捷键，不显示在快捷键设置页）
// =========================================================================================

const registerMenuCommand = (id: string, description: ReturnType<typeof t>) =>
	registerCommand(id, [], description, "General", false);

export const cmdOpenFileFromClipboard = registerMenuCommand(
	"file.openFromClipboard",
	t("topBar.menu.openFromClipboard"),
);
export const cmdOpenHistoryRestore = registerMenuCommand(
	"file.openHistoryRestore",
	t("topBar.menu.restoreFromHistory"),
);
export const cmdSaveFileToClipboard = registerMenuCommand(
	"file.saveToClipboard",
	t("topBar.menu.saveLyricToClipboard"),
);
export const cmdSubmitToAMLLDB = registerMenuCommand(
	"file.submitToAMLLDB",
	t("topBar.menu.uploadToAMLLDB"),
);
export const cmdOpenMetadataEditor = registerMenuCommand(
	"edit.openMetadataEditor",
	t("topBar.menu.editMetadata"),
);
export const cmdOpenSettings = registerMenuCommand(
	"edit.openSettings",
	t("settingsDialog.title"),
);
export const cmdAutoSegment = registerMenuCommand(
	"tool.autoSegment",
	t("topBar.menu.autoSegment"),
);
export const cmdRubySegment = registerMenuCommand(
	"tool.rubySegment",
	t("topBar.menu.rubySegment"),
);
export const cmdOpenAdvancedSegmentation = registerMenuCommand(
	"tool.openAdvancedSegmentation",
	t("topBar.menu.advancedSegment"),
);
export const cmdOpenSyllableSmoothing = registerMenuCommand(
	"tool.openSyllableSmoothing",
	t("topBar.menu.syllableSmoothing"),
);
export const cmdSyncLineTimestamps = registerMenuCommand(
	"tool.syncLineTimestamps",
	t("topBar.menu.syncLineTimestamps"),
);
export const cmdDistributeRomanization = registerMenuCommand(
	"tool.distributeRomanization",
	t("topBar.menu.perWordRomanization.distribute"),
);
export const cmdCheckRomanizationWarnings = registerMenuCommand(
	"tool.checkRomanizationWarnings",
	t("topBar.menu.perWordRomanization.check"),
);
export const cmdAutoRuby = registerMenuCommand(
	"tool.autoRuby",
	t("topBar.menu.perWordRomanization.autoRuby"),
);
export const cmdOpenLatencyTest = registerMenuCommand(
	"tool.openLatencyTest",
	t("settingsDialog.common.latencyTest"),
);
export const cmdOpenPluginStore = registerMenuCommand(
	"tool.openPluginStore",
	t("topBar.menu.pluginStore"),
);
export const cmdOpenGitHub = registerMenuCommand(
	"help.openGitHub",
	t("topBar.menu.help"),
);
export const cmdOpenWiki = registerMenuCommand(
	"help.openWiki",
	t("topBar.menu.helpDoc"),
);

if (import.meta.env.DEV) {
	t("settingsDialog.keybindings.category.File");
	t("settingsDialog.keybindings.category.Edit");
	t("settingsDialog.keybindings.category.View");
	t("settingsDialog.keybindings.category.Sync");
	t("settingsDialog.keybindings.category.Audio");
	t("settingsDialog.keybindings.category.Spectrogram");
}
