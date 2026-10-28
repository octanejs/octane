// Render rollback is installed by the runtime entries that can drop a render
// (packages/octane/src/rollback-flag.ts): the root
// render journal, its replay, and suspension. A client that keeps none of them
// renders only renders that commit or go with their root's teardown, so it must
// retain none of these top-level declarations. The oracle is the bundle's
// source map (hydration-free-gates.mjs): run-minimal.mjs requires its
// suspense-transition control to retain every one and its render-errors client
// none, and run.mjs holds the js-framework and chat-stream applications to the
// same list. A `runtime.ts` source resolves to the runtime module that
// declares the name.
export const RENDER_ROLLBACK_DECLARATIONS = Object.freeze(
	[
		// The journal state only the capability writes.
		'TRANSITION_JOURNAL',
		'ROOT_RENDER_ROLLBACK',
		'enterRootJournal',
		'exitRootJournal',
		'openJournalWindow',
		'closeJournalWindow',
		'markRootRenderRollback',
		// Journal writers.
		'journalUndo',
		'journalRootProperty',
		'journalBag',
		'journalObjectOnce',
		'cloneBindingBag',
		'journalForSlot',
		'journalForListClear',
		// Replay.
		'rollbackTransitionJournal',
		'restoreForSlot',
		'dropRootOps',
		'armTransitionJournal',
		// Suspension.
		'SuspenseException',
		'suspendRootRender',
		'resumeOnSettle',
	]
		.map((name) => ({ name, source: 'runtime.ts' }))
		// The flag itself, which only those entries set.
		.concat(
			['ROOT_ROLLBACK', 'rollbackEntry'].map((name) => ({
				name,
				source: 'rollback-flag.ts',
			})),
		),
);

export const RENDER_ROLLBACK_NAMES = Object.freeze(
	RENDER_ROLLBACK_DECLARATIONS.map(({ name }) => name),
);
