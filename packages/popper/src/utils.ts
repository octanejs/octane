import type { Ref } from './types';

export function setRef<T>(ref: Ref<T>, value: T | null): void {
	if (typeof ref === 'function') {
		ref(value);
	} else if (ref != null) {
		ref.current = value;
	}
}
