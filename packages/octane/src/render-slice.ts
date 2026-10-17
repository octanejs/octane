// An early binding program (dom-bindings.ts, dom-binding-program.ts) writes the
// DOM it owns as its source publishes, with no renderer loaded. Render never
// writes the document (#2043), so a publication made while an Octane render
// slice is open defers the program's drain until that render's commit has run,
// whether the root committed the render or dropped it. The source really
// changed, so the write lands either way, on the same task, before any paint.
//
// This module imports nothing, so an early program carries it without the
// runtime. Only an early program creates the slice record, so the runtime's
// guards and drain fold away (under Vite) for an application that never adopts
// one, as long as every reader tests `renderSlice` for truthiness: before this
// module initializes the binding reads `undefined`, so `!== null` cannot fold.

export interface RenderSlice {
	/** An Octane render slice is open. */
	open: boolean;
	/** Drains a slice deferred, until its commit. A program stays busy until its own runs, so it queues once. */
	drains: Array<() => void>;
}

/** Created by the first early program to adopt; only the runtime opens and drains it. */
export let renderSlice: RenderSlice | null = null;

/** Early programs only, as each adopts. */
export function watchRenderSlices(): void {
	renderSlice ??= { open: false, drains: [] };
}
