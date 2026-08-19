import { describe, expect, it } from 'vitest';
import { mount } from './_helpers';
import { loadPlainHookFixtureSource } from './_server-fixture';

describe('memo hooks in plain modules', () => {
	for (const inlineHookMemo of [false, true]) {
		const load = (source: string, manualSlots = false) =>
			loadPlainHookFixtureSource(source, {
				id: 'plain-hook-memo.ts',
				inlineHookMemo,
				manualSlots,
			});

		it(`keeps repeated custom-hook calls independent and their getters live (inline=${inlineHookMemo})`, () => {
			const { App } = load(`
				import { createElement, useCallback, useMemo, useState, withSlot } from 'octane';
				const leftSlot = Symbol('left');
				const rightSlot = Symbol('right');
				interface Counter { value: number; }
				function useCounter(start: number, report: (value: number) => void) {
					const [value, setValue, getValue] = useState(start);
					const result = useMemo(() => ({ value } as Counter), [value]);
					const callback = useCallback(() => report(value), [report, value]);
					const label = useMemo(() => value.toFixed(1));
					return { result, callback, label, increment: () => setValue(getValue() + 1) };
				}
				export function App(props) {
					const left = withSlot(leftSlot, useCounter, 1, props.report);
					const right = withSlot(rightSlot, useCounter, 10, props.report);
					props.observe(left, right);
					return createElement('div', null,
						createElement('button', { id: 'left', onClick: left.increment }, left.label),
						createElement('button', { id: 'right', onClick: right.increment }, right.label));
				}
			`);
			const observations: any[][] = [];
			const reported: number[] = [];
			const props = {
				observe: (...values: any[]) => observations.push(values),
				report: (value: number) => reported.push(value),
			};
			const root = mount(App, props);
			const [firstLeft, firstRight] = observations.at(-1)!;
			expect(root.find('#left').textContent).toBe('1.0');
			expect(root.find('#right').textContent).toBe('10.0');
			root.update(App, props);
			expect(observations.at(-1)![0].result).toBe(firstLeft.result);
			expect(observations.at(-1)![1].callback).toBe(firstRight.callback);
			root.click('#left');
			expect(root.find('#left').textContent).toBe('2.0');
			expect(root.find('#right').textContent).toBe('10.0');
			firstLeft.callback();
			observations.at(-1)![0].callback();
			expect(reported).toEqual([1, 2]);
			root.click('#right');
			expect(root.find('#right').textContent).toBe('11.0');
			root.unmount();
		});

		it(`preserves short-circuit and nested argument evaluation order (inline=${inlineHookMemo})`, () => {
			const { App } = load(`
				import { createElement, useMemo } from 'octane';
				export function App(props) {
					const mark = (name: string) => { props.log(name); return name; };
					const value = props.enabled && [
						mark('before'),
						useMemo(() => mark('outer'), [
							useMemo(() => mark('inner'), []),
							mark('dependency'),
						]),
						mark('after'),
					].join(':');
					return createElement('p', null, String(value));
				}
			`);
			const log: string[] = [];
			const props = { enabled: false, log: (value: string) => log.push(value) };
			const root = mount(App, props);
			expect(log).toEqual([]);
			expect(root.html()).toBe('<p>false</p>');
			root.update(App, { ...props, enabled: true });
			expect(log.splice(0)).toEqual(['before', 'inner', 'dependency', 'outer', 'after']);
			expect(root.html()).toBe('<p>before:outer:after</p>');
			root.update(App, { ...props, enabled: true });
			expect(log).toEqual(['before', 'dependency', 'after']);
			root.unmount();
		});

		it(`keeps block returns, finally, and multi-declarator order (inline=${inlineHookMemo})`, () => {
			const { App } = load(`
				import { createElement, useMemo } from 'octane';
				export function App(props) {
					const first = props.log('first'), value = useMemo(() => {
						try {
							props.log('compute');
							if (props.value < 0) return 'negative';
							return 'value:' + props.value;
						} finally { props.log('finally'); }
					}, [props.value, props.log('dependency')]), last = props.log('last');
					return createElement('p', null, value);
				}
			`);
			const log: string[] = [];
			const record = (value: string) => {
				log.push(value);
				return value;
			};
			const root = mount(App, { value: 1, log: record });
			expect(log.splice(0)).toEqual(['first', 'dependency', 'compute', 'finally', 'last']);
			expect(root.html()).toBe('<p>value:1</p>');
			root.update(App, { value: 1, log: record });
			expect(log.splice(0)).toEqual(['first', 'dependency', 'last']);
			root.update(App, { value: -1, log: record });
			expect(log).toEqual(['first', 'dependency', 'compute', 'finally', 'last']);
			expect(root.html()).toBe('<p>negative</p>');
			root.unmount();
		});

		it(`keeps the authored declaration in its temporal dead zone (inline=${inlineHookMemo})`, () => {
			const { App } = load(`
				import { createElement, useMemo } from 'octane';
				export function App() {
					const value = useMemo(() => { const read = true; if (read) return value; }, []);
					return createElement('p', null, String(value));
				}
			`);
			expect(() => mount(App)).toThrow(ReferenceError);
		});

		it(`discards returns canceled by finally control flow (inline=${inlineHookMemo})`, () => {
			const { App } = load(`
				import { createElement, useMemo } from 'octane';
				export function App() {
					const broken = useMemo(() => {
						done: { try { return 'canceled'; } finally { break done; } }
					}, []);
					const continued = useMemo(() => {
						for (let index = 0; index < 1; index++) {
							try { return 'canceled'; } finally { continue; }
						}
					}, []);
					const replaced = useMemo(() => {
						try { return 'canceled'; } finally { return 'replacement'; }
					}, []);
					return createElement('p', null, [String(broken), String(continued), replaced].join(':'));
				}
			`);
			const root = mount(App);
			expect(root.html()).toBe('<p>undefined:undefined:replacement</p>');
			root.update(App);
			expect(root.html()).toBe('<p>undefined:undefined:replacement</p>');
			root.unmount();
		});

		it(`preserves ordinary factory scope and anonymous result names (inline=${inlineHookMemo})`, () => {
			const { App } = load(`
				import { createElement, useCallback, useMemo } from 'octane';
				export function App({ value }) {
					const scope = useMemo(function named() {
						return [this === null, arguments[0] === value, typeof named].join(':');
					}, [value]);
					const callback = useCallback(() => 1, null);
					const expression = useMemo(() => () => 2, []);
					const block = useMemo(() => { const captured = 3; return () => captured; }, []);
					const klass = useMemo(() => { const captured = 4; return class { get() { return captured; } }; }, []);
					return createElement('p', null, [scope, callback.name, expression.name, block.name, klass.name].join('|'));
				}
			`);
			const root = mount(App, { value: 42 });
			expect(root.html()).toBe('<p>true:true:function||||</p>');
			root.update(App, { value: 43 });
			expect(root.html()).toBe('<p>true:true:function||||</p>');
			root.unmount();
		});

		it(`does not invent names for anonymous dependency values (inline=${inlineHookMemo})`, () => {
			const { App } = load(`
				import { createElement, useMemo } from 'octane';
				export function App() {
					let expressionName = 'unset', blockName = 'unset';
					const expression = useMemo(() => 1, [class { static observed = (expressionName = this.name); }]);
					const block = useMemo(() => { const value = 2; return value; }, [class { static observed = (blockName = this.name); }]);
					return createElement('p', null, [expressionName, blockName, expression + block].join('|'));
				}
			`);
			const root = mount(App);
			expect(root.html()).toBe('<p>||3</p>');
			root.unmount();
		});

		it(`keeps generated bindings invisible to descendant direct eval (inline=${inlineHookMemo})`, () => {
			const { App } = load(`
				import { createElement, useMemo } from 'octane';
				export function App({ value }) {
					const read = () => eval('typeof __hks');
					const memo = useMemo(() => value, [value]);
					return createElement('p', null, read() + ':' + memo);
				}
			`);
			const root = mount(App, { value: 1 });
			expect(root.html()).toBe('<p>undefined:1</p>');
			root.update(App, { value: 2 });
			expect(root.html()).toBe('<p>undefined:2</p>');
			root.unmount();
		});

		it(`keeps new runtime imports invisible to sibling direct eval (inline=${inlineHookMemo})`, () => {
			const { App } = load(`
				import { createElement, useMemo } from 'octane';
				function read() { return eval('typeof _$memoSlot'); }
				export function App({ value }) {
					const memo = useMemo(() => value, [value]);
					return createElement('p', null, read() + ':' + memo);
				}
			`);
			const root = mount(App, { value: 1 });
			expect(root.html()).toBe('<p>undefined:1</p>');
			root.update(App, { value: 2 });
			expect(root.html()).toBe('<p>undefined:2</p>');
			root.unmount();
		});

		it(`respects namespace import shadowing (inline=${inlineHookMemo})`, () => {
			const { App } = load(`
				import * as Octane from 'octane';
				function local(Octane, value) {
					return Octane.useMemo(() => value, [value]);
				}
				export function App(props) {
					const localValue = local({ useMemo(compute) { return 'local:' + compute(); } }, props.value);
					const realValue = Octane.useMemo(() => props.value * 2, [props.value]);
					return Octane.createElement('p', null, localValue + ':' + realValue);
				}
			`);
			const root = mount(App, { value: 2 });
			expect(root.html()).toBe('<p>local:2:4</p>');
			root.update(App, { value: 3 });
			expect(root.html()).toBe('<p>local:3:6</p>');
			root.unmount();
		});

		it(`retains manual slots and the omitted-dependency runtime behavior (inline=${inlineHookMemo})`, () => {
			const { App } = load(
				`
				import { createElement, useCallback, useMemo, withSlot } from 'octane';
				const leftSlot = Symbol('left');
				const rightSlot = Symbol('right');
				const valueSlot = Symbol('value');
				const callbackSlot = Symbol('callback');
				function makeFactory(value) { return () => ({ value }); }
				function useValue(value) {
					const stable = useMemo(() => ({ value }), [value], valueSlot);
					const always = useMemo(makeFactory(value));
					return { stable, always, callback: useCallback(() => value, [value], callbackSlot) };
				}
				export function App(props) {
					const left = withSlot(leftSlot, useValue, props.left);
					const right = withSlot(rightSlot, useValue, props.right);
					props.observe(left, right);
					return createElement('p', null, left.callback() + ':' + right.callback());
				}
			`,
				true,
			);
			const observations: any[][] = [];
			const props = {
				left: 1,
				right: 10,
				observe: (...values: any[]) => observations.push(values),
			};
			const root = mount(App, props);
			const [left, right] = observations.at(-1)!;
			expect(root.html()).toBe('<p>1:10</p>');
			root.update(App, props);
			expect(observations.at(-1)![0].stable).toBe(left.stable);
			expect(observations.at(-1)![1].callback).toBe(right.callback);
			expect(observations.at(-1)![0].always).not.toBe(left.always);
			root.update(App, { ...props, left: 2 });
			expect(root.html()).toBe('<p>2:10</p>');
			expect(left.callback()).toBe(1);
			expect(observations.at(-1)![1].stable).toBe(right.stable);
			root.unmount();
		});

		it(`retains a previous manual memo when a replacement throws (inline=${inlineHookMemo})`, () => {
			const { App } = load(
				`
				import { createElement, useMemo, withSlot } from 'octane';
				const caller = Symbol('caller');
				const valueSlot = Symbol('value');
				function useValue(value) {
					try {
						return useMemo(() => { if (value === 2) throw new Error('retry'); return value; }, [value], valueSlot);
					} catch {
						return useMemo(() => 'lost previous value', [1], valueSlot);
					}
				}
				export function App(props) {
					return createElement('p', null, withSlot(caller, useValue, props.value));
				}
			`,
				true,
			);
			const root = mount(App, { value: 1 });
			root.update(App, { value: 2 });
			expect(root.html()).toBe('<p>1</p>');
			root.update(App, { value: 3 });
			expect(root.html()).toBe('<p>3</p>');
			root.unmount();
		});

		it(`caches every return value with Object.is dependency semantics (inline=${inlineHookMemo})`, () => {
			const { App, missValue } = load(
				`
				import { createElement, puMiss, useMemo, withSlot } from 'octane';
				const caller = Symbol('caller');
				const valueSlot = Symbol('value');
				function useValue(dep, value, record) {
					return useMemo(() => { record(value); return value; }, [dep], valueSlot);
				}
				export function missValue() { return puMiss; }
				export function App(props) {
					const value = withSlot(caller, useValue, props.dep, props.value, props.record);
					props.observe(value);
					return createElement('p', null, value === puMiss ? 'miss' : String(value));
				}
			`,
				true,
			);
			const computed: unknown[] = [];
			const observed: unknown[] = [];
			const props = {
				record: (value: unknown) => computed.push(value),
				observe: (value: unknown) => observed.push(value),
			};
			const miss = missValue();
			const root = mount(App, { ...props, dep: NaN, value: undefined });
			root.update(App, { ...props, dep: NaN, value: null });
			expect(root.html()).toBe('<p>undefined</p>');
			root.update(App, { ...props, dep: 0, value: null });
			expect(root.html()).toBe('<p>null</p>');
			root.update(App, { ...props, dep: -0, value: miss });
			root.update(App, { ...props, dep: -0, value: 'changed' });
			expect(root.html()).toBe('<p>miss</p>');
			expect(observed.at(-1)).toBe(miss);
			expect(computed).toEqual([undefined, null, miss]);
			root.unmount();
		});
	}
});
