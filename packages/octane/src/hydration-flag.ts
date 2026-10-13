// The hydration flags. This module imports nothing, so a bundler places it
// ahead of every reader. Only the hydrateRoot entry initializes the sticky
// flag; later island activations and streamed Suspense arms switch a pass
// created by that entry. A presentation writer may temporarily suppress and
// restore the transient flag without starting hydration.
//
// A client that only calls createRoot never starts hydration, so both flags
// stay `false` for its whole lifetime. Rolldown with Vite's default minifier
// then folds every guard and drops the hydration code behind it, but only
// while every reader follows these rules:
// - Read the binding itself. A getter is not inlined.
// - Read it only as a condition: an `if` or `?:` test, an operand of `!`, or
//   the left of `&&`/`||` inside one of those. Other code bundled ahead of
//   this module could call a reader before the flag is initialized, when it is
//   `undefined` rather than `false`, so the minifier folds a flag only where
//   both are the same. Write `hydrating ? x : false`, never a bare
//   `hydrating && x` value.
// - Never call a setter from client-reachable code, even behind a guard.
// esbuild never folds a module flag; measure both bundlers when changing the
// hydration entry point or a shared client primitive.

/**
 * Whether a hydration pass is on the stack. It is `true` exactly while
 * runtime.ts's `currentHydration` is set, so `hydrating ? activeHydration() :
 * null` is `activeHydration()` itself.
 */
export let hydrating = false;

/**
 * Sticky: this runtime has started hydrating. It guards hydration state that
 * outlives a pass, such as binding and control leases, preserved `<Hydrate>`
 * activations, native-signal adoptions released at commit, and streamed
 * Suspense arms that resume after the pass. None of that state exists before
 * the first hydration entry, so skipping it until then changes nothing.
 */
export let hydrationStarted = false;

/** Switch or temporarily suppress an already-owned hydration pass. */
export function setHydrating(value: boolean): void {
	hydrating = value;
}

/** Hydration entry points only: about to create hydration state that outlives a pass. */
export function startHydration(): void {
	hydrationStarted = true;
}
