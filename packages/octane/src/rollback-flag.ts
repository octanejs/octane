// The render rollback flag. This module imports nothing, so a bundler places it
// ahead of every reader and evaluates it before any module that sets it, even
// one that a cycle or a skipped facade evaluates early.
//
// Only an entry that can drop a render sets it, before that render: the public
// bindings of use, useBatch, Suspense, @try, Hydrate, ViewTransition and
// renderer regions call rollbackEntry as their module loads, and lazy,
// hydration, native reads and ViewTransition call installRootRollback. A
// client with none of them never sets it, so Rolldown with Vite's default
// minifier folds every guard on it and drops the root render journal, its
// replay and suspension behind them (runtime/drivers.ts). Read it only as a
// condition, as hydration-flag.ts explains.

/** A render can be dropped, so root renders record what they change. */
export let ROOT_ROLLBACK = false;

/** Called by an entry point that can drop a render, before its first render. */
export function installRootRollback(): void {
	ROOT_ROLLBACK = true;
}

/**
 * The public binding of a rendering entry that can drop the render. Call it
 * at module scope behind a pure annotation: a bundle that keeps the entry
 * installs the rollback as the entry's module loads, and one that never uses
 * the entry drops the call.
 */
export function rollbackEntry<T>(entry: T): T {
	ROOT_ROLLBACK = true;
	return entry;
}
