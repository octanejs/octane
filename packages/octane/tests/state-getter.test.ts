import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';
import * as ServerRuntime from 'octane/server';
import { mount } from './_helpers';
import { ReducerGetter, StateGetter } from './_fixtures/state-getter.tsrx';
import { slotHooks } from '../src/compiler/slot-hooks.js';
import { useReducer, useState } from '../src/index.js';

function assertStateGetterTypes(): void {
	const [, , getState] = useState(0, Symbol.for('type.state'));
	const state: number = getState();
	const [, , getReduced] = useReducer(
		(value: number, amount: number) => value + amount,
		0,
		Symbol.for('type.reducer'),
	);
	const reduced: number = getReduced();
	void state;
	void reduced;
}
void assertStateGetterTypes;

function evalServer(source: string, filename: string): Record<string, any> {
	let code = compile(source, filename, { mode: 'server' }).code;
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane(?:\/server)?['"];?/g,
		(_match, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	return new Function('__rt', '__exports', code + '\nreturn __exports;')(ServerRuntime, {});
}

describe('compiler-driven state getters', () => {
	it('keeps the public base-hook path when tuple index 2 is provably unobserved', () => {
		const source = `
      import { useState, useReducer } from 'octane';
      export function App() @{
        const [state, setState] = useState(0);
        const [reduced, dispatch] = useReducer((s, a) => s + a, 0);
        <p>{state + reduced + ''}</p>
      }
    `;
		for (const mode of ['client', 'server'] as const) {
			const code = compile(source, 'lean-state.tsrx', { mode }).code;
			expect(code).not.toContain('__useStateWithGetter');
			expect(code).not.toContain('__useReducerWithGetter');
			expect(code).toMatch(/useState\(0, _h\$\d+\)/);
			expect(code).toMatch(/useReducer\([^;]+, _h\$\d+\)/);
		}
	});

	it('selects getter helpers for third bindings and escaped tuples', () => {
		const source = `
      import { useState, useReducer } from 'octane';
      export function Direct() @{
        const [state, setState, getState] = useState(0);
        const [reduced, dispatch, getReduced] = useReducer((s, a) => s + a, 0);
        <p>{getState() + getReduced() + ''}</p>
      }
      export function Escaped() { return useState(0); }
    `;
		for (const mode of ['client', 'server'] as const) {
			const code = compile(source, 'getter-state.tsrx', { mode }).code;
			expect(code).toContain('__useStateWithGetter as _$__useStateWithGetter');
			expect(code).toContain('__useReducerWithGetter as _$__useReducerWithGetter');
			expect(code).toMatch(/_\$__useStateWithGetter\(0, _h\$\d+\)/);
			expect(code).toMatch(/_\$__useReducerWithGetter\([^;]+, _h\$\d+\)/);
		}
	});

	it('classifies static tuple indexing and rest destructuring', () => {
		const code = compile(
			`
        import { useState } from 'octane';
        export function First() @{
          const first = useState(0)[0];
          <p>{first as string}</p>
        }
        export function Third() @{
          const getState = useState(0)[2];
          <p>{getState() as string}</p>
        }
        export function Rest() @{
          const [state, ...rest] = useState(0);
          <p>{state + rest.length + ''}</p>
        }
      `,
			'tuple-state.tsrx',
		).code;
		expect(code).toMatch(/const first = useState\(0, _h\$\d+\)\[0\]/);
		expect(code).toMatch(/const getState = _\$__useStateWithGetter\(0, _h\$\d+\)\[2\]/);
		expect(code).toMatch(/\[state, \.\.\.rest\] = _\$__useStateWithGetter\(0, _h\$\d+\)/);
	});

	it('handles aliases and preserves the surgical TypeScript pass', () => {
		const source = `import { useState as state } from 'octane';
export function useValue() {
  const [value, setValue, getValue] = state<number>(0);
  return { value, setValue, getValue };
	}`;
		const code = slotHooks(source, 'state-getter.ts')!.code;
		expect(code).toMatch(/_\$__useStateWithGetter<number>\(0, _h\$\d+\)/);
		expect(code).toContain(
			"import { __useStateWithGetter as _$__useStateWithGetter } from 'octane';",
		);
		expect(code).not.toContain('state<number>');
	});

	it('does not slot a lexically shadowed named import in plain TypeScript', () => {
		const source = `import { useState as state } from 'octane';
export function value() {
  function state(initial: number) { return [initial, 'local'] as const; }
  return state(1);
}`;
		expect(slotHooks(source, 'shadowed-state.ts')).toBeNull();
	});

	it('slots aliased and namespace-imported hooks in full client/server compilation', () => {
		const source = `
      import { useState as state } from 'octane';
      import * as Octane from 'octane';
      export function App() @{
        const [left, setLeft] = state(0);
        const [right, setRight, getRight] = Octane.useState(1);
        const id = Octane.useId();
        <button id={id} onClick={() => { setLeft(left + 1); setRight(right + 1); }}>
          {left + getRight() + ''}
        </button>
      }
    `;
		for (const mode of ['client', 'server'] as const) {
			const code = compile(source, 'aliased-hooks.tsrx', { mode }).code;
			expect(code).toContain('useState as state');
			expect(code).toContain(
				`import * as Octane from 'octane${mode === 'server' ? '/server' : ''}'`,
			);
			expect(code).toMatch(/state\(0, _h\$\d+\)/);
			expect(code).toContain('__useStateWithGetter as _$__useStateWithGetter');
			expect(code).toMatch(/_\$__useStateWithGetter\(1, _h\$\d+\)/);
			expect(code).toMatch(/Octane\.useId\(_h\$\d+\)/);
		}
	});

	it('resolves imported aliases and namespaces through lexical shadowing', () => {
		const source = `
      import { useState as state } from 'octane';
      import * as Octane from 'octane';
      export function App() @{
        function state(value) { return [value, 'local']; }
        const Octane = { useState(value) { return [value, 'local']; } };
        const [left, leftTag] = state(7);
        const [right, rightTag] = Octane.useState(8);
        <p>{left + right + leftTag + rightTag + ''}</p>
      }
    `;
		for (const mode of ['client', 'server'] as const) {
			const code = compile(source, 'shadowed-hooks.tsrx', { mode }).code;
			expect(code).not.toContain('__useStateWithGetter');
			expect(code).toContain('state(7)');
			// The method still follows the custom-hook naming convention, but it must
			// not be rewritten as the imported Octane base hook.
			expect(code).toContain('Octane.useState(8, _h$');
		}
	});
});

describe('state getter runtime semantics', () => {
	it('keeps public state hooks on the physical two-item path', () => {
		const seen: unknown[] = [];
		const Probe = (_props: unknown, _scope: any) => {
			const stateTuple = useState(1, Symbol.for('physical.state'));
			const reducerTuple = useReducer(
				(value: number, amount: number) => value + amount,
				1,
				Symbol.for('physical.reducer'),
			);
			seen.push(
				(stateTuple as unknown[]).length,
				(stateTuple as unknown[])[2],
				(reducerTuple as unknown[]).length,
				(reducerTuple as unknown[])[2],
			);
			return null;
		};
		const r = mount(Probe as any, {});
		expect(seen).toEqual([2, undefined, 2, undefined]);
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
