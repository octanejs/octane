// Eager useState bailout edges, ported from ReactHooks-test.internal.js
// ("bails out in the render phase if all of the state is the same", "bails
// out multiple times in a row", "a change in context defeats the bailout")
// and ReactHooksWithNoopRenderer-test.js (no-op reducer actions applied when
// batched with real ones).
//
// One documented DIVERGENCE, noted inline: after the last real update, React
// re-enters the render phase one extra time for a same-value set (a fiber
// double-buffering artifact — the alternate still carries lanes) and only
// then bails before commit, logging a lone parent render. Octane has no
// double buffering, so the same set skips the render phase entirely. Both
// satisfy React's public bailout contract (children do not re-render,
// effects do not re-fire, nothing commits); only the parent-body invocation
// count differs. React's rebase-of-skipped-updates cases are concurrent-only
// and do not apply to octane's synchronous scheduler.
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, createLog } from '../_helpers';
import { flushSync } from '../../src/index.js';
import {
	BailParent,
	getSetC1,
	getSetC2,
	ContextDefeatsBailout,
	getSetTheme,
	getSetVal,
	ReducerBatchedNoop,
	getDispatch,
	getRenderCount,
	resetRenderCount,
} from './_fixtures/eager-bailout.tsrx';

beforeEach(() => {
	resetRenderCount();
});

describe('useState — render-phase bailout when all state is the same', () => {
	it('same-value sets do not re-render the child, re-fire effects, or commit', () => {
		const log = createLog();
		const r = mount(BailParent, { log: log.push });
		expect(log.drain()).toEqual(['Parent: 0, 0', 'Child: 0, 0', 'Effect']);

		flushSync(() => {
			getSetC1()(1);
			getSetC2()(1);
		});
		expect(log.drain()).toEqual(['Parent: 1, 1', 'Child: 1, 1', 'Effect']);
		expect(r.find('#child').textContent).toBe('1, 1');

		// Same values again. DIVERGENCE (see header): React logs one extra
		// 'Parent: 1, 1' here before bailing; octane skips the render phase
		// entirely. No child render, no effect, no commit in either.
		flushSync(() => {
			getSetC1()(1);
			getSetC2()(1);
		});
		expect(log.drain()).toEqual([]);

		// Bails out multiple times in a row without entering the render phase
		// (React also logs nothing from the second identical set onward).
		flushSync(() => {
			getSetC1()(1);
			getSetC2()(1);
		});
		expect(log.drain()).toEqual([]);

		// A later REAL change must still render the full tree and re-fire the
		// every-render layout effect — the bailed sets must not poison the slot.
		flushSync(() => getSetC1()(2));
		expect(log.drain()).toEqual(['Parent: 2, 1', 'Child: 2, 1', 'Effect']);
		expect(r.find('#child').textContent).toBe('2, 1');
		r.unmount();
	});
});

describe('useState — a change in context defeats the bailout', () => {
	it('same-value set batched with a provider change still re-renders the consumer', () => {
		const log = createLog();
		const r = mount(ContextDefeatsBailout, { log: log.push });
		expect(log.drain()).toEqual(['render:light:0']);

		// The same-value set alone bails.
		flushSync(() => getSetVal()(0));
		expect(log.drain()).toEqual([]);

		// Batched with a context change it must re-render, seeing the new
		// context value and the (unchanged) state.
		flushSync(() => {
			getSetVal()(0);
			getSetTheme()('dark');
		});
		expect(log.drain()).toEqual(['render:dark:0']);
		expect(r.find('#themed').textContent).toBe('dark:0');
		r.unmount();
	});
});

describe('useReducer — no-op actions apply in order within a batch', () => {
	it('a no-op dispatch batched before a real one yields the real result', () => {
		const r = mount(ReducerBatchedNoop);
		const renders = getRenderCount();
		flushSync(() => {
			getDispatch()(-1);
			getDispatch()(5);
		});
		expect(r.find('#out').textContent).toBe('5');
		expect(getRenderCount()).toBe(renders + 1);
		r.unmount();
	});

	it('a no-op dispatch batched after a real one leaves the real result intact', () => {
		const r = mount(ReducerBatchedNoop);
		const renders = getRenderCount();
		flushSync(() => {
			getDispatch()(5);
			getDispatch()(-1);
		});
		expect(r.find('#out').textContent).toBe('5');
		expect(getRenderCount()).toBe(renders + 1);
		r.unmount();
	});
});
