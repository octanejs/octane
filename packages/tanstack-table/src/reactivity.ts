// `@octanejs/tanstack-store` re-exports all of `@tanstack/store`, so the core
// primitives come through the octane binding. Importing them from
// `@tanstack/store` directly would add a second path to the same package and
// risk resolving a second copy — atoms compare by identity, so a duplicate
// would silently break every subscription.
import { batch, createAtom } from '@octanejs/tanstack-store';
import type { TableAtomOptions, TableReactivityBindings } from '@tanstack/table-core/reactivity';

/**
 * Creates the table-core reactivity bindings used by the octane adapter.
 *
 * Table state lives in TanStack Store atoms; options stay plain resolved data
 * (`createOptionsStore: false`) because `useTable` synchronizes options during
 * render, exactly like the upstream React adapter.
 *
 * `schedule` uses `queueMicrotask` rather than an octane-specific scheduler:
 * table-core only uses it to defer work past the current call stack, and octane
 * already batches the resulting atom notifications through its own renderer.
 */
export function octaneReactivity(): TableReactivityBindings {
	return {
		createOptionsStore: false,
		wrapExternalAtoms: false,
		addSubscription: () => {
			throw new Error('Feature not supported in current reactivity implementation');
		},
		unmount: () => {
			throw new Error('Feature not supported in current reactivity implementation');
		},
		schedule: (fn) => queueMicrotask(fn),
		batch,
		untrack: (fn) => fn(),
		createReadonlyAtom: <T>(fn: () => T, options?: TableAtomOptions<T>) => {
			return createAtom(() => fn(), {
				compare: options?.compare,
			});
		},
		createWritableAtom: <T>(value: T, options?: TableAtomOptions<T>) => {
			return createAtom(value, {
				compare: options?.compare,
			});
		},
	};
}
