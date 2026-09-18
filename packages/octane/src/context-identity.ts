// Contexts can cross bundled copies and ESM/CJS loads in the same realm.
// Share exact identities without accepting copied component metadata.
const CONTEXT_IDENTITIES = Symbol.for('octane.contextIdentities');

export function registerContext(context: Function): void {
	((globalThis as any)[CONTEXT_IDENTITIES] ??= new WeakSet<Function>()).add(context);
}

export function isContext(value: unknown): boolean {
	return (
		typeof value === 'function' && (globalThis as any)[CONTEXT_IDENTITIES]?.has(value) === true
	);
}
