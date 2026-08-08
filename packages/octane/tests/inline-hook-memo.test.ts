import { describe, expect, it } from 'vitest';
import { act, createLog, mount } from './_helpers';
import {
	CallbackIdentity,
	ComputeCount,
	ConditionalMemo,
	EarlyReturnMemo,
	GeneratedCallbackAcrossSuspend,
	GeneratedCallbackIdentity,
	MemoAcrossSuspend,
	NanDep,
	NullDepsIdentity,
} from './_fixtures/inline-hook-memo.tsrx';

// Behavioral contract of the inline hook-memo tier. These run under BOTH
// vitest projects: `octane` exercises the runtime useMemo/useCallback path,
// `octane-prod` exercises the inline `_k$` cell regions — identical
// expectations in both is the tier's semantic-equivalence proof.

describe('inline hook-memo behavior', () => {
	it('recomputes only when deps change, not on unrelated re-renders', () => {
		const log = createLog();
		const r = mount(ComputeCount, { log: log.push });
		expect(log.drain()).toEqual(['compute:0']);
		r.click('#tick');
		expect(log.drain()).toEqual([]);
		expect(r.html()).toContain('v=0 t=1');
		r.click('#dep');
		expect(log.drain()).toEqual(['compute:1']);
		expect(r.html()).toContain('v=2');
		r.unmount();
	});

	it('treats NaN deps as equal (Object.is semantics)', () => {
		const log = createLog();
		const r = mount(NanDep, { log: log.push });
		expect(log.drain()).toEqual(['compute']);
		r.click('#tick');
		r.click('#tick');
		// `!==` would recompute every render; Object.is(NaN, NaN) must not.
		expect(log.drain()).toEqual([]);
		r.unmount();
	});

	it('supports early returns in block-body factories', () => {
		const log = createLog();
		const r = mount(EarlyReturnMemo, { log: log.push });
		expect(log.drain()).toEqual(['total:empty']);
		expect(r.html()).toContain('total=empty');
		r.click('#inc');
		expect(log.drain()).toEqual(['total:sum:1']);
		r.click('#inc');
		expect(log.drain()).toEqual(['total:sum:3']);
		expect(r.html()).toContain('total=sum:3');
		r.unmount();
	});

	it('recomputes explicit-null-deps sites every render (fresh identity)', () => {
		const log = createLog();
		const r = mount(NullDepsIdentity, { log: log.push });
		expect(log.drain()).toEqual(['fresh:0']);
		r.click('#tick');
		// `null` deps means recompute after every render — never `same`.
		expect(log.drain()).toEqual(['fresh:1']);
		r.click('#tick');
		expect(log.drain()).toEqual(['fresh:2']);
		r.unmount();
	});

	it('supports conditional sites and keeps their cache across deactivation', () => {
		const log = createLog();
		const r = mount(ConditionalMemo, { log: log.push });
		expect(log.drain()).toEqual([]);
		r.click('#on');
		expect(log.drain()).toEqual(['compute:1', 'render:1']);
		r.click('#d');
		expect(log.drain()).toEqual(['compute:2', 'render:2']);
		r.click('#on'); // off — site not reached
		expect(log.drain()).toEqual([]);
		r.click('#on'); // on again, deps unchanged — cached, no recompute
		expect(log.drain()).toEqual(['render:2']);
		r.unmount();
	});

	it('keeps callback identity stable until deps change (stale closure included)', () => {
		const log = createLog();
		const r = mount(CallbackIdentity, { log: log.push });
		expect(log.drain()).toEqual(['new']);
		r.click('#tick');
		expect(log.drain()).toEqual(['same']);
		r.click('#fire');
		// The cached closure captured d=0 (React staleness semantics).
		expect(log.drain()).toEqual(['cb:0']);
		r.click('#d');
		expect(log.drain()).toEqual(['new']);
		r.click('#fire');
		expect(log.drain()).toEqual(['cb:1']);
		r.unmount();
	});

	it('keeps generated callbacks and transitive captures stable while their state remains live', async () => {
		const observed: Array<[() => void, () => void]> = [];
		const root = mount(GeneratedCallbackIdentity, {
			observe: (increment: () => void, forward: () => void) => {
				observed.push([increment, forward]);
			},
		});
		const [increment, forward] = observed[0];

		root.click('#generated');
		expect(root.find('#generated').textContent).toBe('count=1');
		expect(observed.at(-1)).toEqual([increment, forward]);

		await act(() => increment());
		expect(root.find('#generated').textContent).toBe('count=2');
		expect(observed.at(-1)).toEqual([increment, forward]);
		root.unmount();
	});

	it('preserves generated callback identity across a suspended render and its replay', async () => {
		const observed: Array<() => void> = [];
		let resolve!: (value: string) => void;
		const promise = new Promise<string>((complete) => {
			resolve = complete;
		});
		const root = mount(GeneratedCallbackAcrossSuspend, {
			observe: (callback: () => void) => observed.push(callback),
			promise,
		});
		expect(root.html()).toContain('loading');
		expect(observed).toHaveLength(1);
		const first = observed[0];

		await act(() => resolve('ready'));
		expect(root.find('#resumed').textContent).toBe('ready:0');
		expect(observed.at(-1)).toBe(first);

		root.click('#resumed');
		expect(root.find('#resumed').textContent).toBe('ready:1');
		expect(observed.at(-1)).toBe(first);
		root.unmount();
	});

	it('publishes immediately: a memo computed before a suspension is not recomputed on replay', async () => {
		const log = createLog();
		let resolve: (value: string) => void;
		const promise = new Promise<string>((r) => {
			resolve = r;
		});
		const r = mount(MemoAcrossSuspend, { log: log.push, promise });
		expect(r.html()).toContain('loading');
		expect(log.drain()).toEqual(['compute']);
		await act(() => resolve!('ok'));
		expect(r.html()).toContain('v=6 data=ok');
		// Replay after resolution re-runs the body; the memo cell must hit.
		expect(log.drain()).toEqual([]);
		r.unmount();
	});
});
