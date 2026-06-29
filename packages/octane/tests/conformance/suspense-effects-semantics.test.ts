import { describe, it, expect } from 'vitest';
import { mount, act, createLog } from '../_helpers';
import { App } from './_fixtures/suspense-effects-semantics.tsrx';

function deferred<T>() {
	let resolve!: (v: T) => void;
	const promise = new Promise<T>((res) => (resolve = res));
	return { promise, resolve };
}

describe('conformance: Suspense effect semantics (re-suspend destroys + recreates)', () => {
	// Per ReactSuspenseEffectsSemantics-test.js:611. When an already-committed boundary
	// re-suspends, its content is hidden behind the fallback and its layout effects are
	// DESTROYED (cleanups run); they are RECREATED when the content reveals again. octane
	// matches: the suspend hold's softDetach now runs the hidden subtree's effect cleanups
	// (`deactivateScope`) + clears their deps, and the resume re-render recreates + commits
	// them (`attachResume` commits effects). State (useState/useMemo/useRef) is still
	// preserved across the suspend — only effects destroy/recreate, like React.
	it('destroys the committed layout effect on re-suspend, recreates on reveal', async () => {
		const d = deferred<string>();
		const log = createLog();
		let go!: () => void;
		const r = mount(App as any, {
			promise: d.promise,
			log,
			bind: (f: () => void) => {
				go = f;
			},
		});
		await act(() => {});
		expect(log.drain()).toEqual(['Before create layout']);

		// Update adds a suspending child → the boundary re-suspends (fallback shown).
		await act(() => go());
		expect(r.findAll('.fallback').length).toBe(1);
		expect(log.drain()).toEqual(['Before destroy layout']); // React destroys; octane does NOT (gap)

		// Resolve → content revealed, layout effect recreated.
		await act(() => d.resolve('x'));
		expect(log.drain()).toEqual(['Before create layout']);
	});
});
