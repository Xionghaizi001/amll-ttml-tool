import type { RubyGenerationEnginePort } from "$/application/lyrics";
import { generateRubyFromRomanWord } from "$/modules/lyric-editor/utils/ruby-generator";

export const rubyGenerationEngine: RubyGenerationEnginePort = {
	generate: generateRubyFromRomanWord,
};
