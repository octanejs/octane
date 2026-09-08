import { describe, expect, it } from 'vitest';
import { act, createLog, mount } from './_helpers';
import { loadCompiledFixtureSource } from './_server-fixture';
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
	for (const inlineHookMemo of [false, true]) {
		const compileOptions = { hmr: false, dev: false, autoMemo: false, inlineHookMemo };

		it(`preserves an ordinary factory's invocation scope (inline=${inlineHookMemo})`, () => {
			const { App } = loadCompiledFixtureSource(
				`import { useMemo } from 'octane';
				export function App({ value }) @{
					const result = useMemo(function named() {
						return [this === null, arguments[0] === value, typeof named].join(':');
					}, [value]);
					<p>{result as string}</p>
				}`,
				{ id: 'memo-function-scope.tsrx', mode: 'client', compileOptions },
			);
			const root = mount(App, { value: 42 });
			expect(root.html()).toBe('<p>true:true:function</p>');
			root.update(App, { value: 43 });
			expect(root.html()).toBe('<p>true:true:function</p>');
			root.unmount();
		});

		it(`keeps the declared value uninitialized while its factory runs (inline=${inlineHookMemo})`, () => {
			const { App } = loadCompiledFixtureSource(
				`import { useMemo } from 'octane';
				export function App() @{
					const value = useMemo(() => value, []);
					<p>{String(value)}</p>
				}`,
				{ id: 'memo-declaration-tdz.tsrx', mode: 'client', compileOptions },
			);
			expect(() => mount(App)).toThrow(ReferenceError);
		});

		it(`preserves anonymous returned function names (inline=${inlineHookMemo})`, () => {
			const { App } = loadCompiledFixtureSource(
				`import { useCallback, useMemo } from 'octane';
				export function App() @{
					const callback = useCallback(() => 1, null);
					const expression = useMemo(() => () => 2, []);
					const block = useMemo(() => { const value = 3; return () => value; }, []);
					<p>{[callback.name, expression.name, block.name].join(':')}</p>
				}`,
				{ id: 'memo-anonymous-names.tsrx', mode: 'client', compileOptions },
			);
			const root = mount(App);
			expect(root.html()).toBe('<p>::</p>');
			root.unmount();
		});

		it(`preserves returns canceled or replaced by finally (inline=${inlineHookMemo})`, () => {
			const { App } = loadCompiledFixtureSource(
				`import { useMemo } from 'octane';
				export function App({ value }) @{
					const canceledBreak = useMemo(() => {
						done: { try { return 'canceled'; } finally { break done; } }
					}, [value]);
					const canceledContinue = useMemo(() => {
						for (let i = 0; i < 1; i++) {
							try { return 'canceled'; } finally { continue; }
						}
					}, [value]);
					const replaced = useMemo(() => {
						try { return 'canceled'; } finally { return 'replacement'; }
					}, [value]);
					<p>{String(canceledBreak) + ':' + String(canceledContinue) + ':' + replaced}</p>
				}`,
				{ id: 'memo-finally-completion.tsrx', mode: 'client', compileOptions },
			);
			const root = mount(App, { value: 1 });
			expect(root.html()).toBe('<p>undefined:undefined:replacement</p>');
			root.update(App, { value: 2 });
			expect(root.html()).toBe('<p>undefined:undefined:replacement</p>');
			root.unmount();
		});

		it(`does not expose private memo imports to a sibling direct eval (inline=${inlineHookMemo})`, () => {
			const { App } = loadCompiledFixtureSource(
				`import { useMemo } from 'octane';
				function read() { return eval('typeof _$hookMemoCreate'); }
				export function App({ value }) @{
					const result = useMemo(() => value, [value]);
					<p>{read() + ':' + result}</p>
				}`,
				{ id: 'memo-module-eval.tsrx', mode: 'client', compileOptions },
			);
			const root = mount(App, { value: 1 });
			expect(root.html()).toBe('<p>undefined:1</p>');
			root.update(App, { value: 2 });
			expect(root.html()).toBe('<p>undefined:2</p>');
			root.unmount();
		});

		it(`keeps nested expression order, short-circuiting, and stale callbacks (inline=${inlineHookMemo})`, () => {
			const { App } = loadCompiledFixtureSource(
				`import { useMemo, useCallback } from 'octane';
				function identity(value) { return value; }
				export function App({ value, salt, enabled, tick, mark, observe }) @{
					const [first] = useMemo(() => (mark('pair-compute', value), [value]), [mark('pair-dep', value)]),
						second = useMemo(() => (mark('second-compute', salt), salt), [mark('second-dep', salt)]);
					const nested = enabled && identity(useMemo(
						() => (mark('outer-compute', value), value + salt),
						[mark('outer-a', value), useMemo(() => (mark('inner-compute', salt), salt), [mark('inner-dep', salt)])],
					));
					const callback = identity(useCallback(() => value + salt, [mark('callback-dep', value)]));
					observe({ first, second, nested, callback });
					<p>{tick + ':' + first + ':' + second + ':' + String(nested)}</p>
				}`,
				{ id: 'memo-expression-order.tsrx', mode: 'client', compileOptions },
			);
			const log = createLog();
			const observed: Array<{
				first: number;
				second: number;
				nested: number | false;
				callback: () => number;
			}> = [];
			const shared = {
				mark: (name: string, value: number) => {
					log.push(`${name}:${value}`);
					return value;
				},
				observe: (value: (typeof observed)[number]) => observed.push(value),
			};
			const root = mount(App, { ...shared, value: 1, salt: 10, enabled: false, tick: 0 });
			const callback = observed[0].callback;
			expect(log.drain()).toEqual([
				'pair-dep:1',
				'pair-compute:1',
				'second-dep:10',
				'second-compute:10',
				'callback-dep:1',
			]);
			root.update(App, { ...shared, value: 1, salt: 10, enabled: true, tick: 1 });
			expect(log.drain()).toEqual([
				'pair-dep:1',
				'second-dep:10',
				'outer-a:1',
				'inner-dep:10',
				'inner-compute:10',
				'outer-compute:1',
				'callback-dep:1',
			]);
			root.update(App, { ...shared, value: 1, salt: 10, enabled: true, tick: 2 });
			expect(log.drain()).toEqual([
				'pair-dep:1',
				'second-dep:10',
				'outer-a:1',
				'inner-dep:10',
				'callback-dep:1',
			]);
			root.update(App, { ...shared, value: 1, salt: 11, enabled: true, tick: 3 });
			expect(log.drain()).toEqual([
				'pair-dep:1',
				'second-dep:11',
				'second-compute:11',
				'outer-a:1',
				'inner-dep:11',
				'inner-compute:11',
				'outer-compute:1',
				'callback-dep:1',
			]);
			expect(observed.at(-1)).toMatchObject({ first: 1, second: 11, nested: 12 });
			expect(observed.at(-1)!.callback).toBe(callback);
			expect(callback()).toBe(11);
			root.update(App, { ...shared, value: 2, salt: 11, enabled: true, tick: 4 });
			expect(log.drain()).toEqual([
				'pair-dep:2',
				'pair-compute:2',
				'second-dep:11',
				'outer-a:2',
				'inner-dep:11',
				'outer-compute:2',
				'callback-dep:2',
			]);
			expect(observed.at(-1)!.callback).not.toBe(callback);
			expect(observed.at(-1)!.callback()).toBe(13);
			expect(root.html()).toBe('<p>4:2:11:13</p>');
			root.unmount();
		});

		it(`keeps custom-hook paths distinct and explicit slots authoritative (inline=${inlineHookMemo})`, () => {
			const { App } = loadCompiledFixtureSource(
				`import { useMemo } from 'octane';
				const SHARED = Symbol('shared-memo');
				function useBox(value, mark) {
					return useMemo(() => (mark('box:' + value), { value }), [value]);
				}
				function useBlock(value, mark) {
					return useMemo(() => {
						mark('block:' + value);
						if (value < 0) return { value: -1 };
						const doubled = value * 2;
						return { value: doubled };
					}, [value]);
				}
				export function App({ left, right, tick, mark, observe }) @{
					const a = useBox(left, mark);
					const b = useBox(right, mark);
					const c = useBlock(left, mark);
					const explicitA = useMemo(() => { mark('explicit:first'); return { value: left }; }, [left], SHARED);
					const explicitB = useMemo(() => { mark('explicit:second'); return { value: 999 }; }, [left], SHARED);
					observe({ a, b, c, explicitA, explicitB });
					<p>{tick + ':' + a.value + ':' + b.value + ':' + c.value}</p>
				}`,
				{ id: 'memo-custom-explicit-slots.tsrx', mode: 'client', compileOptions },
			);
			const log = createLog();
			type Box = { value: number };
			const seen: Array<{ a: Box; b: Box; c: Box; explicitA: Box; explicitB: Box }> = [];
			const shared = {
				mark: log.push,
				observe: (value: (typeof seen)[number]) => seen.push(value),
			};
			const root = mount(App, { ...shared, left: 1, right: 1, tick: 0 });
			expect(log.drain()).toEqual(['box:1', 'box:1', 'block:1', 'explicit:first']);
			expect(seen[0].a).not.toBe(seen[0].b);
			expect(seen[0].explicitA).toBe(seen[0].explicitB);
			root.update(App, { ...shared, left: 1, right: 1, tick: 1 });
			expect(log.drain()).toEqual([]);
			for (const key of ['a', 'b', 'c', 'explicitA', 'explicitB'] as const) {
				expect(seen[1][key]).toBe(seen[0][key]);
			}
			root.update(App, { ...shared, left: 1, right: 2, tick: 2 });
			expect(log.drain()).toEqual(['box:2']);
			expect(seen[2].a).toBe(seen[0].a);
			expect(seen[2].b).not.toBe(seen[0].b);
			root.update(App, { ...shared, left: -1, right: 2, tick: 3 });
			expect(log.drain()).toEqual(['box:-1', 'block:-1', 'explicit:first']);
			expect(seen[3].explicitA).toBe(seen[3].explicitB);
			expect(seen[3].explicitA).not.toBe(seen[0].explicitA);
			expect(root.html()).toBe('<p>3:-1:2:-1</p>');
			root.unmount();
		});

		it(`keeps nested dependency hooks in their callable scope (inline=${inlineHookMemo})`, () => {
			const { App } = loadCompiledFixtureSource(
				`import { useMemo, useCallback } from 'octane';
				export function App({ left, right, tick, observe }) @{
					const useNested = useCallback((value) =>
						useMemo(() => ({ value }), [useMemo(() => ({ value }), [value])]),
					[]);
					const a = useNested(left);
					const b = useNested(right);
					observe(a, b);
					<p>{tick + ':' + a.value + ':' + b.value}</p>
				}`,
				{ id: 'memo-nested-callable-scope.tsrx', mode: 'client', compileOptions },
			);
			const seen: Array<[{ value: number }, { value: number }]> = [];
			const observe = (a: (typeof seen)[number][0], b: (typeof seen)[number][1]) =>
				seen.push([a, b]);
			const root = mount(App, { left: 1, right: 2, tick: 0, observe });
			root.update(App, { left: 1, right: 2, tick: 1, observe });
			expect(seen[1][0]).toBe(seen[0][0]);
			expect(seen[1][1]).toBe(seen[0][1]);
			expect(seen[1][0]).not.toBe(seen[1][1]);
			root.update(App, { left: 3, right: 2, tick: 2, observe });
			expect(seen[2][0]).not.toBe(seen[0][0]);
			expect(seen[2][1]).toBe(seen[0][1]);
			expect(root.html()).toBe('<p>2:3:2</p>');
			root.unmount();
		});

		it(`uses unshadowed cache intrinsics and compiler bindings (inline=${inlineHookMemo})`, () => {
			const { App } = loadCompiledFixtureSource(
				`import { useMemo } from 'octane';
				export function App({ value, read, observe, Object, Array, undefined, _$hookMemoCreate, _$hookMemoEqual, _$hookMemoPublish1 }) @{
					const result = useMemo(() => read(value), [value]);
					observe(result);
					return null;
				}`,
				{ id: 'memo-shadowed-intrinsics.tsrx', mode: 'client', compileOptions },
			);
			const computed: number[] = [];
			const observed: number[] = [];
			const fail = () => {
				throw new Error('authored shadow was invoked');
			};
			const shared = {
				read: (value: number) => (computed.push(value), value),
				observe: (value: number) => observed.push(value),
				Object: { is: fail },
				Array: fail,
				undefined: 123,
				_$hookMemoCreate: fail,
				_$hookMemoEqual: fail,
				_$hookMemoPublish1: fail,
			};
			const root = mount(App, { ...shared, value: NaN });
			root.update(App, { ...shared, value: NaN });
			root.update(App, { ...shared, value: 0 });
			root.update(App, { ...shared, value: -0 });
			expect(computed).toEqual([NaN, 0, -0]);
			expect(observed).toEqual([NaN, NaN, 0, -0]);
			root.unmount();
		});

		it(`preserves anonymous dependency names during class initialization (inline=${inlineHookMemo})`, () => {
			const { App } = loadCompiledFixtureSource(
				`import { useMemo } from 'octane';
				const SLOT = Symbol('dependency-name');
				export function App({ value, observe }) @{
					const first = useMemo(() => value, [class { static observed = observe(this.name); }]);
					const second = useMemo(() => { const next = value + 1; return next; }, [class { static observed = observe(this.name); }], SLOT);
					<p>{first + ':' + second}</p>
				}`,
				{ id: 'memo-dependency-names.tsrx', mode: 'client', compileOptions },
			);
			const names: string[] = [];
			const observe = (name: string) => names.push(name);
			const root = mount(App, { value: 1, observe });
			root.update(App, { value: 2, observe });
			expect(names).toEqual(['', '', '', '']);
			expect(root.html()).toBe('<p>2:3</p>');
			root.unmount();
		});

		it(`keeps returned-JSX memo values and event callbacks stable (inline=${inlineHookMemo})`, () => {
			const { App } = loadCompiledFixtureSource(
				`/** @jsxImportSource octane */
				import { useMemo, useCallback } from 'octane';
				function View({ box, callback, tick, observe }) {
					observe(box, callback);
					return <button onClick={callback}>{tick + ':' + box.value}</button>;
				}
				export function App({ value, tick, observe, fire }) {
					return <View
						box={useMemo(() => ({ value, tick }), [value])}
						callback={useCallback(() => fire(value + ':' + tick), [value])}
						tick={tick}
						observe={observe}
					/>;
				}`,
				{ id: 'memo-returned-jsx.tsx', mode: 'client', compileOptions },
			);
			const log = createLog();
			const seen: Array<[{ value: number; tick: number }, () => void]> = [];
			const shared = {
				fire: log.push,
				observe: (box: (typeof seen)[number][0], callback: () => void) =>
					seen.push([box, callback]),
			};
			const root = mount(App, { ...shared, value: 1, tick: 0 });
			root.update(App, { ...shared, value: 1, tick: 1 });
			expect(seen.at(-1)![0]).toBe(seen[0][0]);
			expect(seen.at(-1)![1]).toBe(seen[0][1]);
			root.click('button');
			expect(log.drain()).toEqual(['1:0']);
			root.update(App, { ...shared, value: 2, tick: 2 });
			expect(seen.at(-1)![0]).not.toBe(seen[0][0]);
			expect(seen.at(-1)![1]).not.toBe(seen[0][1]);
			root.click('button');
			expect(log.drain()).toEqual(['2:2']);
			expect(root.html()).toBe('<button>2:2</button>');
			root.unmount();
		});

		it(`retains the prior custom-hook entry when a factory throws (inline=${inlineHookMemo})`, () => {
			const { App } = loadCompiledFixtureSource(
				`import { useMemo } from 'octane';
				function useBox(value, fail, mark) {
					return useMemo(() => {
						mark(value);
						if (fail) throw new Error('expected');
						return { value };
					}, [value]);
				}
				export function App({ value, fail, tick, mark, observe }) @{
					let result = null;
					try { result = useBox(value, fail, mark); } catch {}
					observe(result);
					<p>{tick + ':' + (result === null ? 'caught' : result.value)}</p>
				}`,
				{ id: 'memo-throw-preserves-entry.tsrx', mode: 'client', compileOptions },
			);
			const calls: number[] = [];
			const seen: Array<{ value: number } | null> = [];
			const shared = {
				mark: (value: number) => calls.push(value),
				observe: (value: (typeof seen)[number]) => seen.push(value),
			};
			const root = mount(App, { ...shared, value: 1, fail: false, tick: 0 });
			root.update(App, { ...shared, value: 2, fail: true, tick: 1 });
			expect(root.html()).toBe('<p>1:caught</p>');
			root.update(App, { ...shared, value: 1, fail: false, tick: 2 });
			expect(seen.at(-1)).toBe(seen[0]);
			expect(calls).toEqual([1, 2]);
			root.update(App, { ...shared, value: 2, fail: false, tick: 3 });
			expect(calls).toEqual([1, 2, 2]);
			expect(seen.at(-1)).not.toBe(seen[0]);
			expect(root.html()).toBe('<p>3:2</p>');
			root.unmount();
		});

		it(`caches arbitrary values without a value-sentinel collision (inline=${inlineHookMemo})`, () => {
			const { App, sentinel } = loadCompiledFixtureSource(
				`import { useMemo, puMiss } from 'octane';
				export const sentinel = puMiss;
				function useValue(value, mark) {
					return useMemo(() => (mark(), value), [value]);
				}
				export function App({ tick, mark, observe }) @{
					const a = useValue(undefined, mark);
					const b = useValue(null, mark);
					const c = useValue(puMiss, mark);
					observe(a, b, c);
					<p>{tick as string}</p>
				}`,
				{ id: 'memo-arbitrary-values.tsrx', mode: 'client', compileOptions },
			);
			let calls = 0;
			const seen: unknown[][] = [];
			const shared = {
				mark: () => calls++,
				observe: (...values: unknown[]) => seen.push(values),
			};
			const root = mount(App, { ...shared, tick: 0 });
			root.update(App, { ...shared, tick: 1 });
			expect(calls).toBe(3);
			expect(seen).toEqual([
				[undefined, null, sentinel],
				[undefined, null, sentinel],
			]);
			root.unmount();
		});
	}

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
