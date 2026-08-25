import { useEffect } from "react";
import { createRomanizationDebugReport } from "$/application/lyrics";
import { romanizationEngine } from "$/modules/segmentation/adapters/romanization-engine";
import { editorDocumentAdapter } from "$/plugins/adapters/editor-document";
import { segmentationLogger } from "../../logger";

export const useRomanDebugger = () => {
	useEffect(() => {
		// biome-ignore lint/suspicious/noExplicitAny: 调试用
		(window as any).debugRoman = (startLine = 0, endLine = 100) => {
			const report = createRomanizationDebugReport(
				editorDocumentAdapter.readSnapshot(),
				romanizationEngine,
				startLine,
				endLine,
			);
			const jsonOutput = JSON.stringify(report, null, 2);
			segmentationLogger.log(jsonOutput);
		};
		return () => {
			// biome-ignore lint/suspicious/noExplicitAny: debug global cleanup
			delete (window as any).debugRoman;
		};
	}, []);
};
