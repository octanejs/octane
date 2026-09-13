import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';
import * as ServerRuntime from 'octane/server';
import { act, mount } from './_helpers';
import {
	ConditionalGetters,
	ReducerGetter,
	RenderPhaseNullableReducerGetter,
	StateGetter,
} from './_fixtures/state-getter.tsrx';

function evalServer(source: string, filename: string): Record<string, any> {
	let code = compile(source, filename, { mode: 'server' }).code;
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane(?:\/server)?['"];?/g,
		(_match, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	return new Function('__rt', '__exports', code + '\nreturn __exports;')(ServerRuntime, {});
}

describe('state getter runtime semantics', () => {
	it('keeps retained getters associated with their custom-hook call site across conditional renders', () => {
		let current: any;
		const bind = (value: any) => {
			current = value;
		};
		const r = mount(ConditionalGetters, { visible: true, step: 1, bind });
		const first = current.first;
		const second = current.second;
		act(() => {
			first.state[1]((value: number) => value + 3);
			second.state[1]((value: number) => value + 7);
			first.reducer[1](2);
			second.reducer[1](4);
		});
		expect(r.container.textContent).toBe('13:12|27:24');
		expect([first.state[2](), first.reducer[2](), second.state[2](), second.reducer[2]()]).toEqual([
			13, 12, 27, 24,
		]);
		r.update(ConditionalGetters, { visible: false, step: 3, bind });
		act(() => {
			second.reducer[1](2);
			second.state[1](31);
		});
		expect(r.container.textContent).toBe('hidden|31:30');
		expect([second.state[2](), second.reducer[2]()]).toEqual([31, 30]);
		r.update(ConditionalGetters, { visible: true, step: 4, bind });
		act(() => first.reducer[1](3));
		expect(r.container.textContent).toBe('13:24|31:30');
		expect([first.state[2](), first.reducer[2](), second.state[2](), second.reducer[2]()]).toEqual([
			13, 24, 31, 30,
		]);
		r.unmount();
	});

	it('reads sequential useState updates immediately and stays stable', () => {
		const values: number[] = [];
		const getters: Array<() => number> = [];
		const r = mount(StateGetter, {
			initial: 0,
			observeValue: (value: number) => values.push(value),
			observeGetter: (getter: () => number) => getters.push(getter),
		});
		r.click('#state');
		expect(values).toEqual([1, 2]);
		expect(r.find('#state').textContent).toBe('2');
		expect(getters.length).toBeGreaterThan(1);
		expect(getters.every((getter) => getter === getters[0])).toBe(true);
		expect(getters[0]()).toBe(2);
		r.unmount();
	});

	it('reads useReducer dispatches immediately and uses the latest reducer', () => {
		const values: number[] = [];
		const getters: Array<() => number> = [];
		const props = {
			initial: 1,
			step: 1,
			observeValue: (value: number) => values.push(value),
			observeGetter: (getter: () => number) => getters.push(getter),
		};
		const r = mount(ReducerGetter, props);
		expect(r.find('#reducer').textContent).toBe('10');
		r.update(ReducerGetter, { ...props, step: 3 });
		r.click('#reducer');
		expect(values).toEqual([16]);
		expect(r.find('#reducer').textContent).toBe('16');
		expect(getters.every((getter) => getter === getters[0])).toBe(true);
		expect(getters[0]()).toBe(16);
		r.unmount();
	});

	it.each([
		{ label: 'null', empty: null, expected: 'saw:null' },
		{ label: 'undefined', empty: undefined, expected: 'saw:undefined' },
	])('preserves a $label reducer result in render-phase getter reads', ({ empty, expected }) => {
		const observed: unknown[] = [];
		const r = mount(RenderPhaseNullableReducerGetter, {
			empty,
			observe: (value: unknown) => observed.push(value),
		});

		expect(observed).toEqual([empty, expected]);
		expect(r.find('#nullable-reducer').textContent).toBe(expected);
		r.unmount();
	});

	it('tracks the converged render-phase state on the server', () => {
		const source = `
      import { useState } from 'octane';
      export function App() @{
        const [count, setCount, getCount] = useState(0);
        if (count < 2) setCount(count + 1);
        <span>{'Count: ' + getCount()}</span>
      }
    `;
		let code = compile(source, 'server-getter.tsrx', { mode: 'server' }).code;
		code = code.replace(
			/import\s*\{([^}]*)\}\s*from\s*['"]octane(?:\/server)?['"];?/g,
			(_match, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
		);
		code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
		const mod = new Function('__rt', '__exports', code + '\nreturn __exports;')(ServerRuntime, {});
		expect(ServerRuntime.renderToString(mod.App).html).toContain('Count: 2');
	});

	it('treats a compiled zero-argument useState slot as the slot on the server', () => {
		const mod = evalServer(
			`
      import { useState } from 'octane';
      export function App() @{
        const [pairValue] = useState();
        const tuple = useState();
        <span>{String(pairValue) + '|' + String(tuple[0]) + '|' + tuple.length}</span>
      }
    `,
			'server-zero-state.tsrx',
		);
		expect(ServerRuntime.renderToString(mod.App).html).toContain('undefined|undefined|3');
	});

	it('server getters observe each render-phase update immediately', () => {
		const mod = evalServer(
			`
      import { useReducer, useState } from 'octane';
      export function App() @{
        const [count, setCount, getCount] = useState(0);
        const [total, dispatch, getTotal] = useReducer((value, amount) => value + amount, 0);
        if (count === 0) {
          setCount(1);
          if (getCount() !== 1) throw new Error('stale state getter');
          setCount((value) => value + 1);
          if (getCount() !== 2) throw new Error('stale functional state getter');
        }
        if (total === 0) {
          dispatch(2);
          if (getTotal() !== 2) throw new Error('stale reducer getter');
          dispatch(3);
          if (getTotal() !== 5) throw new Error('stale sequential reducer getter');
        }
        <span>{count + '|' + total}</span>
      }
    `,
			'server-immediate-getter.tsrx',
		);
		expect(ServerRuntime.renderToString(mod.App).html).toContain('2|5');
	});

	it('server functional updaters and reducers run once while getters update immediately', () => {
		const mod = evalServer(
			`
      import { useReducer, useState } from 'octane';
      export function App(props) @{
        const [count, setCount, getCount] = useState(0);
        const [total, dispatch, getTotal] = useReducer(props.reducer, 0);
        if (count === 0) {
          setCount(props.updater);
          props.observe('state', getCount());
        }
        if (total === 0) {
          dispatch(2);
          props.observe('reducer', getTotal());
        }
        <span>{count + '|' + total}</span>
      }
    `,
			'server-single-apply-getter.tsrx',
		);
		let updaterCalls = 0;
		let reducerCalls = 0;
		const observed: Array<[string, number]> = [];
		const { html } = ServerRuntime.renderToString(mod.App, {
			updater: (value: number) => {
				updaterCalls++;
				return value + 1;
			},
			reducer: (value: number, amount: number) => {
				reducerCalls++;
				return value + amount;
			},
			observe: (kind: string, value: number) => observed.push([kind, value]),
		});

		expect(observed).toEqual([
			['state', 1],
			['reducer', 2],
		]);
		expect(updaterCalls).toBe(1);
		expect(reducerCalls).toBe(1);
		expect(html).toContain('1|2');
	});

	it('keeps getter-free server updates on the deferred retry path', () => {
		const mod = evalServer(
			`
      import { useReducer, useState } from 'octane';
      export function App(props) @{
        const [count, setCount] = useState(0);
        const [total, dispatch] = useReducer(props.reducer, 0);
        if (count === 0 && total === 0) {
          setCount(props.updater);
          dispatch(2);
          props.observe();
        }
        <span>{count + '|' + total}</span>
      }
    `,
			'server-lean-state.tsrx',
		);
		let updaterCalls = 0;
		let reducerCalls = 0;
		const observed: Array<[number, number]> = [];
		const { html } = ServerRuntime.renderToString(mod.App, {
			updater: (value: number) => {
				updaterCalls++;
				return value + 1;
			},
			reducer: (value: number, amount: number) => {
				reducerCalls++;
				return value + amount;
			},
			observe: () => observed.push([updaterCalls, reducerCalls]),
		});

		expect(observed).toEqual([[0, 0]]);
		expect(updaterCalls).toBe(1);
		expect(reducerCalls).toBe(1);
		expect(html).toContain('1|2');
	});
});
