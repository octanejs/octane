// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
import { InverseScaleFunction } from '../../../hooks';
import { createCategoricalInverse } from '../../../util/scale/createCategoricalInverse';
import { CustomScaleDefinition } from '../../../util/scale/CustomScaleDefinition';

export function combineInverseScaleFunction(
	configuredScale: CustomScaleDefinition | undefined,
): InverseScaleFunction | undefined {
	if (configuredScale == null) {
		return undefined;
	}
	if ('invert' in configuredScale && typeof configuredScale.invert === 'function') {
		return configuredScale.invert.bind(configuredScale);
	}
	return createCategoricalInverse(configuredScale, undefined);
}
