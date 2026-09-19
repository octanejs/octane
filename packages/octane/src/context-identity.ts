// Contexts can cross bundled copies and ESM/CJS loads in the same realm.
// Share exact identities without accepting copied component metadata.
const CONTEXT_IDENTITIES = Symbol.for('octane.contextIdentities');

export function registerContext(context: Function): void {
	let identities: WeakSet<Function> | undefined = (globalThis as any)[CONTEXT_IDENTITIES];
	if (identities == null) {
		identities = new WeakSet<Function>();
		(globalThis as any)[CONTEXT_IDENTITIES] = identities;
	}
	identities.add(context);
}

export function isContext(value: unknown): boolean {
	if (typeof value !== 'function') return false;
	const identities: WeakSet<Function> | undefined = (globalThis as any)[CONTEXT_IDENTITIES];
	return identities != null && identities.has(value) === true;
}
