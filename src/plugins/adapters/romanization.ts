import type { TrustedJsRomanizationPredictorV0 } from "@amll-ttml-tool/plugin-sdk-js";
import { useSyncExternalStore } from "react";

const predictors: TrustedJsRomanizationPredictorV0[] = [];
const listeners = new Set<() => void>();
const notify = () => {
	for (const listener of listeners) listener();
};

/** Latest registration wins; removing it falls back to the previous one. */
export const registerRomanizationPredictor = (
	predict: TrustedJsRomanizationPredictorV0,
) => {
	predictors.push(predict);
	notify();
	return () => {
		const index = predictors.lastIndexOf(predict);
		if (index < 0) return;
		predictors.splice(index, 1);
		notify();
	};
};

const subscribe = (listener: () => void) => {
	listeners.add(listener);
	return () => listeners.delete(listener);
};
const getPredictor = () => predictors.at(-1);

/** The active plugin predictor, or undefined while no provider is enabled. */
export const useRomanizationPredictor = () =>
	useSyncExternalStore(subscribe, getPredictor, getPredictor);
