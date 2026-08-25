import { LyricSubmissionService } from "$/application/project";
import { amllToTTML, ttmlLyricToAmllResult } from "$/modules/ttml-processor";
import { FetchHttpClient } from "$/platform/network/FetchHttpClient";

export const amllSubmissionService = new LyricSubmissionService(
	{
		generate(document) {
			return amllToTTML(ttmlLyricToAmllResult(document));
		},
	},
	new FetchHttpClient(),
	{
		uploadEndpoint: "https://amll-ttml-db.stevexmh.com/api/upload",
		issueEndpoint: "https://github.com/amll-dev/amll-ttml-lyrics/issues/new",
	},
);
