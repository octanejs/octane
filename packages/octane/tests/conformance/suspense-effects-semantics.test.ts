import { describe, it, expect } from 'vitest';
import { mount, act, createLog } from '../_helpers';
import { App, MultiApp } from './_fixtures/suspense-effects-semantics.tsrx';

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
		expect(log.drain()).toEqual(['Before destroy layout']); // destroyed on hide, like React

		// Resolve → content revealed, layout effect recreated.
		await act(() => d.resolve('x'));
		expect(log.drain()).toEqual(['Before create layout']);
	});
});

describe('conformance: Suspense effect semantics — destroy ONCE across multiple suspends', () => {
	// Per ReactSuspenseEffectsSemantics-test.js:2438 "should be only destroy layout
	// effects once if a tree suspends in multiple places". A boundary with two
	// suspending children: the committed sibling's layout effect is destroyed exactly
	// once on suspend, NOT re-destroyed/recreated on a partial resolve, recreated once
	// on full reveal.
	it('destroys committed effects once when a tree suspends in multiple places', async () => {
		const d1 = deferred<string>();
		const d2 = deferred<string>();
		const promises = new Map<number, Promise<string>>([
			[1, d1.promise],
			[2, d2.promise],
		]);
		const log = createLog();
		let go!: () => void;
		mount(MultiApp as any, {
			promiseFor: (id: number) => promises.get(id)!,
			log,
			bind: (f: () => void) => {
				go = f;
			},
		});
		await act(() => {});
		expect(log.drain()).toEqual(['Before create layout']);

		await act(() => go()); // both children suspend → boundary hidden
		expect(log.drain()).toEqual(['Before destroy layout']); // destroyed ONCE

		await act(() => d1.resolve('1')); // partial — still suspended
		expect(log.drain()).toEqual([]); // NOT re-destroyed, NOT recreated

		await act(() => d2.resolve('2')); // full reveal
		expect(log.drain()).toEqual(['Before create layout']); // recreated ONCE
	});
});

import { NestedApp } from './_fixtures/suspense-effects-semantics.tsrx';

describe('conformance: Suspense effect semantics — nested boundaries', () => {
	// Per ReactSuspenseEffectsSemantics-test.js:1138. An inner-boundary re-suspend
	// destroys only the inner subtree's effects; the outer boundary's effects stay.
	it('inner re-suspend destroys only the inner effect, not the outer one', async () => {
		function fulfilled<T>(value: T): PromiseLike<T> {
			return { then() {}, status: 'fulfilled', value } as any;
		}
		const d2 = deferred<string>();
		const promises = new Map<number, PromiseLike<string>>([
			[1, fulfilled('1')],
			[2, d2.promise],
		]);
		const log = createLog();
		let setInner!: (n: number) => void;
		mount(NestedApp as any, {
			promiseFor: (n: number) => promises.get(n)!,
			log,
			bindInner: (f: (n: number) => void) => {
				setInner = f;
			},
		});
		await act(() => {});
		// Post-order (Before is the first sibling subtree, Inner is deeper in the second):
		// Before fires before Inner even though Inner is deeper. See effect-order.test.ts.
		expect(log.drain()).toEqual(['Before create layout', 'Inner create']);

		await act(() => setInner(2)); // inner re-suspends on a pending promise
		expect(log.drain()).toEqual(['Inner destroy']); // ONLY the inner effect; Before stays

		await act(() => d2.resolve('2'));
		expect(log.drain()).toEqual(['Inner create']);
	});
});
