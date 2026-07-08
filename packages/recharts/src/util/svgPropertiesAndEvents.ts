// Port of recharts' util/svgPropertiesAndEvents.ts — filters a props object to
// valid SVG attributes + data-* attributes + event handlers. The key
// classifiers are vendored verbatim; only the descriptor check is octane's.
import { isValidElement } from 'octane';
import { isEventKey } from '../vendor/util/excludeEventProps';
import { isDataAttribute, isSvgElementPropKey } from '../vendor/util/svgPropertiesNoEvents';

export function svgPropertiesAndEvents(obj: Record<string, any>): Record<string, any> {
	const result: Record<string, any> = {};
	for (const key in obj) {
		if (Object.prototype.hasOwnProperty.call(obj, key)) {
			if (isSvgElementPropKey(key) || isDataAttribute(key) || isEventKey(key)) {
				result[key] = obj[key];
			}
		}
	}
	return result;
}

export function svgPropertiesAndEventsFromUnknown(input: unknown): Record<string, any> | null {
	if (input == null) return null;
	if (isValidElement(input)) {
		return svgPropertiesAndEvents((input as any).props);
	}
	if (typeof input === 'object' && !Array.isArray(input)) {
		return svgPropertiesAndEvents(input as Record<string, any>);
	}
	return null;
}
