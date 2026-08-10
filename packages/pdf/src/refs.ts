import type { OctaneRef } from './types.js';

export function setRef<T>(ref: OctaneRef<T> | undefined, value: T | null): void {
	if (!ref) return;
	if (Array.isArray(ref)) {
		for (const child of ref) setRef(child, value);
		return;
	}
	if (typeof ref === 'function') {
		ref(value);
		return;
	}
	(ref as { current: T | null }).current = value;
}
