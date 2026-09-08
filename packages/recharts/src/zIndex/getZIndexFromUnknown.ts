// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
import { isWellBehavedNumber } from '../util/isWellBehavedNumber';

export function getZIndexFromUnknown(input: unknown, defaultZIndex: number): number {
	if (
		input &&
		typeof input === 'object' &&
		'zIndex' in input &&
		typeof input.zIndex === 'number' &&
		isWellBehavedNumber(input.zIndex)
	) {
		return input.zIndex;
	}
	return defaultZIndex;
}
