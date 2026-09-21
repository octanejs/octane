import { describe, it, expect } from 'vitest';
import {
	createElement as h,
	Suspense,
	createContext,
	memo,
	startTransition,
	use,
	useContext,
	useEffect,
	useState,
} from '../src/index.js';
import { act, mount, nextPaint } from './_helpers';

// renderBlockInner's prologue guards per-subsystem bookkeeping behind the same
// dormancy predicates those subsystems check themselves (root-transaction
// captures, registered effect slots, …). These tests pin the contract from the
// consumer side: a block whose subsystems are all dormant must render exactly
// as before, and a block that ARMS mid-lifecycle — first effect, first use()
// suspension, first context read, first transition — must take the full armed
// path from that render on (dormancy is per-call state, not a cached verdict).

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

// Hook call-site slots must be stable identities — in plain .ts the caller
// supplies them (the compiler hoists them in .tsrx), so they live at module
// scope here rather than inside the bodies that use them.
const SLOT_COUNT = Symbol('count');
const SLOT_EFF = Symbol('eff');
const SLOT_PROMISE = Symbol('promise');

describe('first use of effects, context, suspension, and transitions', () => {
	it('re-renders a component that uses only state correctly', () => {
		// No effects, context reads, thenables, or transitions: every update pays
		// only the dormant prologue. Assert the plain render result is unchanged.
		function Counter(props: { base: number }) {
			const [count, setCount] = useState(0, SLOT_COUNT);
			return h(
				'span',
				{ className: 'c', onClick: () => setCount(count + 1) },
				`${props.base}:${count}`,
			);
		}
		const r = mount(Counter, { base: 0 });
		expect(r.find('.c').textContent).toBe('0:0');
		r.click('.c');
		expect(r.find('.c').textContent).toBe('0:1');
		r.update(Counter, { base: 3 });
		expect(r.find('.c').textContent).toBe('3:1');
		r.click('.c');
		r.click('.c');
		expect(r.find('.c').textContent).toBe('3:3');
		r.unmount();
	});

	it('fires a conditionally reached effect on the render that first registers it, and cleans it up when skipped', async () => {
		// The block renders dormant (effectSlots === null) until `on` opens the
		// guard — that render must still enqueue the new effect. Closing the
		// guard leaves a registered slot unreached, which finishEffectRender must
		// disconnect; reopening re-fires it.
		const log: string[] = [];
		function Guarded(props: { on: boolean; n: number }) {
			if (props.on) {
				useEffect(
					() => {
						log.push(`mount:${props.n}`);
						return () => {
							log.push(`cleanup:${props.n}`);
						};
					},
					[props.n],
					SLOT_EFF,
				);
			}
			return h('i', null, props.on ? 'on' : 'off');
		}
		const r = mount(Guarded, { on: false, n: 1 });
		await nextPaint();
		expect(log).toEqual([]);

		r.update(Guarded, { on: true, n: 1 });
		await nextPaint();
		expect(log).toEqual(['mount:1']);

		r.update(Guarded, { on: false, n: 1 });
		await nextPaint();
		expect(log).toEqual(['mount:1', 'cleanup:1']);

		r.update(Guarded, { on: true, n: 2 });
		await nextPaint();
		expect(log).toEqual(['mount:1', 'cleanup:1', 'mount:2']);
		r.unmount();
	});

	it("suspends to the fallback on a component's first use() call and resolves through it", async () => {
		// Mount and update with no thenable state at all (__thenables undefined),
		// then arm: a state update introduces the first use() call, which must
		// suspend, show the fallback, and resolve through the resume path.
		const d = deferred<string>();
		function Reader(props: { p: Promise<string> | null }) {
			const v = props.p === null ? 'idle' : use(props.p);
			return h('b', { className: 'v' }, v);
		}
		function App(props: { p: Promise<string> | null }) {
			return h(Suspense, {
				fallback: h('i', { className: 'f' }, 'loading'),
				children: h(Reader, { p: props.p }),
			});
		}
		const r = mount(App, { p: null });
		expect(r.find('.v').textContent).toBe('idle');
		// Dormant update before arming.
		r.update(App, { p: null });
		expect(r.find('.v').textContent).toBe('idle');
		// Arm: the update introduces the first use() — suspends to the fallback.
		r.update(App, { p: d.promise });
		expect(r.find('.f').textContent).toBe('loading');
		await act(async () => {
			d.resolve('ready');
		});
		expect(r.find('.v').textContent).toBe('ready');
		expect(r.findAll('.f')).toHaveLength(0);
		r.unmount();
	});

	it('still refreshes a memo component that first reads context mid-life on later provider commits', () => {
		// Reader is memo'd and props-stable after arming, so the only way the
		// second provider value reaches it is the lazy context-refresh path —
		// which needs $$ctxDirect/$$ctxReads recorded by the armed render and the
		// $$ctxDepsEpoch stamp to line up.
		const Ctx = createContext(0);
		const Reader = memo(function Reader(props: { armed: boolean }) {
			const v = props.armed ? useContext(Ctx) : -1;
			return h('u', { className: 'r' }, String(v));
		});
		function App(props: { v: number; armed: boolean }) {
			return h(Ctx, { value: props.v }, h(Reader, { armed: props.armed }));
		}
		const r = mount(App, { v: 1, armed: false });
		expect(r.find('.r').textContent).toBe('-1');
		// Arm mid-life: first context read happens on this update.
		r.update(App, { v: 1, armed: true });
		expect(r.find('.r').textContent).toBe('1');
		// Provider commits a new value with Reader's props unchanged — the memo
		// bail must see the recorded dep and re-run the reader.
		r.update(App, { v: 7, armed: true });
		expect(r.find('.r').textContent).toBe('7');
		r.unmount();
	});

	it('keeps committed content visible while a suspending transition resolves', async () => {
		// The transition's offscreen probe render arms a NON-root WIP_CAPTURE —
		// the capture-record path the dormant guard must not eat — and its
		// discard/commit exercises the journal entries that stay unconditional.
		const d1 = deferred<string>();
		const d2 = deferred<string>();
		d1.resolve('first');
		await Promise.resolve();
		function Child(props: { p: Promise<string> }) {
			return h('b', { className: 'v' }, use(props.p));
		}
		function App(props: { initial: Promise<string>; next: Promise<string> }) {
			const [p, setPromise] = useState(props.initial, SLOT_PROMISE);
			return h('div', null, [
				h(
					'button',
					{ id: 'swap', onClick: () => startTransition(() => setPromise(props.next)) },
					'swap',
				),
				h(Suspense, {
					fallback: h('i', { className: 'f' }, 'loading'),
					children: h(Child, { p }),
				}),
			]);
		}
		const r = mount(App, { initial: d1.promise, next: d2.promise });
		await act(() => {});
		expect(r.find('.v').textContent).toBe('first');
		// The committed content stays up while the transition's new subtree suspends.
		r.click('#swap');
		expect(r.find('.v').textContent).toBe('first');
		await act(() => {
			d2.resolve('second');
		});
		expect(r.find('.v').textContent).toBe('second');
		r.unmount();
	});
});
