import type { CSSProperties } from 'octane';
import { mergeObjects } from '@octanejs/base-ui-utils/mergeObjects';

function assertStyleObject(style: unknown): asserts style is CSSProperties | null | undefined {
	if (style != null && (typeof style !== 'object' || Array.isArray(style))) {
		throw new TypeError('Base UI: merged styles must be objects.');
	}
}

/** Compose object styles without treating CSS text as numeric property names. */
export function mergeStyles(first: unknown, second: unknown): CSSProperties | undefined {
	assertStyleObject(first);
	assertStyleObject(second);
	return mergeObjects(first ?? undefined, second ?? undefined);
}
