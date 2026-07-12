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

describe('compiler-driven state getters', () => {
	it('keeps the existing hook path when tuple index 2 is provably unobserved', () => {
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
});

describe('state getter runtime semantics', () => {
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
});
