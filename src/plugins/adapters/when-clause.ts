import { evaluateEnablement, parseEnablement } from "@amll-ttml-tool/plugin-api";
import { getHostEnablementContext } from "./enablement-context";

/**
 * Fail closed: a `when` clause that does not parse or references unknown
 * identifiers hides/disables the entry instead of showing it unconditionally.
 * Unknown mode ids compare unequal to the active mode, so expressions written
 * against a mode that is not registered also stay disabled.
 */
export const matchesWhenClause = (when: string | undefined): boolean => {
	if (when === undefined) return true;
	try {
		const parsed = parseEnablement(when);
		return evaluateEnablement(
			parsed.ast,
			getHostEnablementContext(),
			parsed.unknownIdents,
		);
	} catch {
		return false;
	}
};
