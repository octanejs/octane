export { useFormStatus } from './server-shim.js';
export const version = '19.2.0-octane-compat';

export function createPortal(): never {
	throw new Error('[react-compat] Portals cannot be rendered in Octane SSR.');
}

export function flushSync<T>(fn: () => T): T {
	return fn();
}

export function unstable_batchedUpdates<T>(fn: (...args: any[]) => T, ...args: any[]): T {
	return fn(...args);
}

export default { createPortal, flushSync, unstable_batchedUpdates, version };
