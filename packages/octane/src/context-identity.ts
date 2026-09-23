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

/**
 * Development-only diagnostics for the React context members Octane removed.
 * Every call site sits behind the production-build guard, so production
 * bundles retain neither the call nor this function.
 *
 * - `Consumer` (never supported): warns once per context and returns
 *   `undefined`, so feature probes (`Ctx.Consumer || fallback`) behave as in
 *   production.
 * - `Provider` (removed in favor of `<Ctx value>`): throws. The compiler rejects
 *   `<Ctx.Provider>` only when the context is created in the same module; an
 *   imported context would otherwise fail later with an opaque
 *   "element type is invalid" (client) or "comp is not a function" (server).
 */
export function defineRemovedContextMembers(context: Function): void {
	let consumerWarned = false;
	Object.defineProperties(context, {
		Consumer: {
			configurable: true,
			get() {
				if (!consumerWarned) {
					consumerWarned = true;
					console.error(
						'Octane has no Context.Consumer. Read the context directly with use(Context) or ' +
							'useContext(Context) in the child component — Octane hooks are call-site keyed, ' +
							'so the read is legal behind any condition the render-prop form was working around.',
					);
				}
				return undefined;
			},
		},
		Provider: {
			configurable: true,
			get() {
				const error = new Error(
					'[OCTANE_CONTEXT_PROVIDER] Context.Provider was removed. Render the context itself ' +
						'as the provider: <Context value={...}>...</Context>.',
				);
				(error as any).code = 'OCTANE_CONTEXT_PROVIDER';
				throw error;
			},
		},
	});
}
