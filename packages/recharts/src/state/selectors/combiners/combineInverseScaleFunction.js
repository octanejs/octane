// Vendored verbatim from recharts@3.9.2 es6/state/selectors/combiners/combineInverseScaleFunction.js (framework-agnostic).
// Do not edit — update by re-vendoring when the recharts devDependency moves.
import { createCategoricalInverse } from '../../../util/scale/createCategoricalInverse';
export function combineInverseScaleFunction(configuredScale) {
	if (configuredScale == null) {
		return undefined;
	}
	if ('invert' in configuredScale && typeof configuredScale.invert === 'function') {
		return configuredScale.invert.bind(configuredScale);
	}
	return createCategoricalInverse(configuredScale, undefined);
}
