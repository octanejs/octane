import { describe, it, expect } from 'vitest';
import { mount, act, flushEffects } from './_helpers';
import { flushSync } from '../src/index.js';
import { ImpHandle, DeferNaN, CallbackLabels } from './_fixtures/hook-bugfixes.tsrx';

describe('hook bug fixes', () => {
	it('useImperativeHandle re-attaches when the ref identity changes with stable deps', () => {
		const refA = { current: null as any };
		const refB = { current: null as any };
		const r = mount(ImpHandle as any, { handleRef: refA, tag: 'A' });
		flushEffects();
		expect(refA.current).toEqual({ tag: 'A' });

		// Swap the ref object; deps stay `[]`. Old ref must clear, new ref must populate.
		r.update(ImpHandle as any, { handleRef: refB, tag: 'A' });
		flushEffects();
		expect(refA.current).toBe(null);
		expect(refB.current).toEqual({ tag: 'A' });
		r.unmount();
	});

	it('useDeferredValue does not loop forever on NaN (Object.is, not ===)', async () => {
		const r = mount(DeferNaN as any, { value: 1 });
		await act(() => {});
		expect(r.find('.d').textContent).toBe('1');
		// Update to NaN: with `===`, NaN !== NaN reschedules a deferred render every tick
		// (act never stabilizes). Object.is(NaN, NaN) === true → settles.
		r.update(DeferNaN as any, { value: NaN });
		await act(() => {});
		expect(r.find('.d').textContent).toBe('NaN');
		r.unmount();
	});

	it('useCallback(fn) with no deps inside a custom hook recomputes (no stale closure)', () => {
		let setLabel!: (x: string) => void;
		let result = '';
		const r = mount(CallbackLabels as any, {
			bind: (f: any) => (setLabel = f),
			onResult: (s: string) => (result = s),
		});
		flushSync(() => (r.find('.cb') as HTMLElement).click());
		expect(result).toBe('nd:a|wd:a');

		// Change the label; the NO-DEPS callback must see the new label (recompute), and
		// the WITH-DEPS callback updates because its dep changed.
		flushSync(() => setLabel('b'));
		flushSync(() => (r.find('.cb') as HTMLElement).click());
		expect(result).toBe('nd:b|wd:b');
		r.unmount();
	});
});
