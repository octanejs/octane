// Ported verbatim from .base-ui/packages/utils/src/generateId.ts (v1.6.0). Pure.
//
// A non-`useId` identifier generator: toasts are created imperatively (from `toastManager.add()`,
// outside any render), so they cannot get an id from a hook.
let counter = 0;

export function generateId(prefix: string): string {
	counter += 1;
	return `${prefix}-${Math.random().toString(36).slice(2, 6)}-${counter}`;
}
