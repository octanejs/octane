import { describe, expect, it } from 'vitest';
import { compile } from '../src/compiler/compile.js';
import { slotHooks } from '../src/compiler/slot-hooks.js';
import { compileToVolarMappings } from '../src/compiler/volar.js';

const RENDER_STATE_UPDATE = 'OCTANE_STRONG_RENDER_STATE_UPDATE';
const EFFECT_STATE_UPDATE = 'OCTANE_STRONG_EFFECT_STATE_UPDATE';
const RENDER_REF_WRITE = 'OCTANE_STRONG_RENDER_REF_WRITE';
const DIRECTIVE_PLACEMENT = 'OCTANE_STRONG_DIRECTIVE_PLACEMENT';

function stateComponent(setup: string, imports = 'useState'): string {
	return `import { ${imports} } from 'octane';
export function Counter() @{
  const [count, setCount] = useState(0);
  ${setup}
  <button onClick={() => setCount(count + 1)}>{count as string}</button>
}`;
}

describe('Strong mode compiler enforcement', () => {
	it('preserves existing behavior until the compiler or module opts in', () => {
		const source = stateComponent('setCount(count + 1);');

		expect(() => compile(source, '/src/Counter.tsrx')).not.toThrow();
		expect(() => compile(source, '/src/Counter.tsrx', { strong: false } as any)).not.toThrow();
		expect(() => compile(source, '/src/Counter.tsrx', { strong: true } as any)).toThrow(
			RENDER_STATE_UPDATE,
		);
		expect(() => compile(`"use strong";\n${source}`, '/src/Counter.tsrx')).toThrow(
			RENDER_STATE_UPDATE,
		);
		expect(() =>
			compile(`"use strong";\n${source}`, '/src/Counter.tsrx', { strong: false } as any),
		).toThrow(RENDER_STATE_UPDATE);
	});

	it('does not change emitted client or server code for valid globally opted-in modules', () => {
		const source = stateComponent('');

		for (const mode of ['client', 'server'] as const) {
			const standard = compile(source, '/src/Counter.tsrx', { mode });
			const strong = compile(source, '/src/Counter.tsrx', { mode, strong: true } as any);

			expect(strong.code).toBe(standard.code);
			expect(strong.diagnostics).toEqual(standard.diagnostics);
		}
	});

	it('only recognizes the exact module directive prologue', () => {
		const source = stateComponent('setCount(count + 1);');

		expect(() =>
			compile(`/* license */\n"use strict";\n"use strong";\n${source}`, '/src/Counter.tsrx'),
		).toThrow(RENDER_STATE_UPDATE);
		expect(() => compile(`\uFEFF'use strong';\n${source}`, '/src/Counter.tsrx')).toThrow(
			RENDER_STATE_UPDATE,
		);
		expect(() => compile(`"use\\x20strong";\n${source}`, '/src/Counter.tsrx')).not.toThrow();
		expect(() => compile(`"use stronger";\n${source}`, '/src/Counter.tsrx')).not.toThrow();
		expect(() =>
			compile(stateComponent('"use strong"; setCount(count + 1);'), '/src/Counter.tsrx'),
		).not.toThrow();
	});

	it('rejects misplaced top-level Strong directives instead of silently ignoring them', () => {
		const source = `${stateComponent('setCount(count + 1);')}\n"use strong";`;

		expect(() => compile(source, '/src/Counter.tsrx')).toThrow(DIRECTIVE_PLACEMENT);
		expect(() => slotHooks(source, '/src/Counter.ts')).toThrow(DIRECTIVE_PLACEMENT);
		expect(compileToVolarMappings(source, '/src/Counter.tsrx').diagnostics).toContainEqual(
			expect.objectContaining({ code: DIRECTIVE_PLACEMENT, severity: 'error' }),
		);
	});

	it.each([
		{ mode: 'client', dev: true },
		{ mode: 'client', dev: false },
		{ mode: 'server', dev: true },
		{ mode: 'server', dev: false },
	])('enforces render purity during $mode compilation with dev=$dev', (options) => {
		const source = `"use strong";\n${stateComponent('setCount(count + 1);')}`;

		expect(() => compile(source, '/src/Counter.tsrx?octane-hydrate=Counter', options)).toThrow(
			RENDER_STATE_UPDATE,
		);
	});

	it.each([
		[
			'aliased state imports',
			`import { useState as state } from 'octane';
       export function App() @{ const [value, update] = state(0); update(value); <div /> }`,
		],
		[
			'namespace state imports',
			`import * as Octane from 'octane';
       export function App() @{ const [value, update] = Octane.useState(0); update(value); <div /> }`,
		],
		[
			'reducer dispatch',
			`import { useReducer } from 'octane';
       export function App() @{ const [value, dispatch] = useReducer((value) => value, 0); dispatch(value); <div /> }`,
		],
		[
			'linked state setters',
			`import { useLinkedState } from 'octane';
       export function App(props) @{ const [value, update] = useLinkedState(props.value, (value) => value); update(value); <div /> }`,
		],
	])('rejects render-phase updates through %s', (_label, source) => {
		expect(() => compile(`"use strong";\n${source}`, '/src/App.tsrx')).toThrow(RENDER_STATE_UPDATE);
	});

	it('keeps event handlers, deferred callbacks, and shadowed setters legal', () => {
		const source = `"use strong";
import { useState } from 'octane';
export function App() @{
  const [count, setCount] = useState(0);
  const later = () => setCount(count + 1);
  setTimeout(() => setCount(count + 1), 0);
  Promise.resolve().then(() => setCount(count + 1));
  {
    const setCount = () => {};
    setCount();
  }
  <button onClick={() => setCount(count + 1)}>{count as string}</button>
}`;

		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
	});

	it('rejects render updates inside immediately executed functions and useMemo callbacks', () => {
		const immediate = `"use strong";\n${stateComponent('(() => setCount(count + 1))();')}`;
		const memo = `"use strong";\n${stateComponent(
			'useMemo(() => setCount(count + 1), [count]);',
			'useState, useMemo',
		)}`;
		const named = `"use strong";\n${stateComponent(
			'function apply() { setCount(count + 1); } apply();',
		)}`;
		const callback = `"use strong";\n${stateComponent(
			'const apply = () => setCount(count + 1); apply();',
		)}`;

		expect(() => compile(immediate, '/src/App.tsrx')).toThrow(RENDER_STATE_UPDATE);
		expect(() => compile(memo, '/src/App.tsrx')).toThrow(RENDER_STATE_UPDATE);
		expect(() => compile(named, '/src/App.tsrx')).toThrow(RENDER_STATE_UPDATE);
		expect(() => compile(callback, '/src/App.tsrx')).toThrow(RENDER_STATE_UPDATE);
	});

	it('recognizes state updater access through immutable state tuple aliases', () => {
		const source = `"use strong";
import { useState } from 'octane';
export function App() @{
  const tuple = useState(0);
  const pair = tuple;
  pair[1](1);
  <div />
}`;

		expect(() => compile(source, '/src/App.tsrx')).toThrow(RENDER_STATE_UPDATE);
	});

	it('follows immutable aliases of state setters and ref objects', () => {
		const setter = `"use strong";\n${stateComponent('const update = setCount; update(1);')}`;
		const ref = `"use strong";
import * as Octane from 'octane';
export function App() @{
  const initialRef = Octane.useRef(null);
  const ref = initialRef;
  ref.current = 1;
  <div />
}`;

		expect(() => compile(setter, '/src/App.tsrx')).toThrow(RENDER_STATE_UPDATE);
		expect(() => compile(ref, '/src/App.tsrx')).toThrow(RENDER_REF_WRITE);
	});

	it('does not mistake unrelated or lexically shadowed functions for Octane hooks', () => {
		const source = `"use strong";
import { useState as octaneState } from 'octane';
function useState(value) { return [value, () => {}]; }
export function App() @{
  const [value, update] = useState(0);
  update(value);
  <div />
}`;

		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
	});

	it.each(['useEffect', 'useLayoutEffect', 'useInsertionEffect'])(
		'rejects synchronous state updates in %s setup',
		(effect) => {
			const source = `"use strong";\n${stateComponent(
				`${effect}(() => { setCount(count + 1); }, [count]);`,
				`useState, ${effect}`,
			)}`;

			expect(() => compile(source, '/src/Counter.tsrx')).toThrow(EFFECT_STATE_UPDATE);
		},
	);

	it('recognizes aliased and namespace effect imports', () => {
		const aliased = `"use strong";
import { useState, useEffect as effect } from 'octane';
export function App() @{
  const [, update] = useState(0);
  effect(() => update(1));
  <div />
}`;
		const namespace = `"use strong";
import * as Octane from 'octane';
export function App() @{
  const [, update] = Octane.useState(0);
  Octane.useEffect(() => update(1));
  <div />
}`;

		expect(() => compile(aliased, '/src/App.tsrx')).toThrow(EFFECT_STATE_UPDATE);
		expect(() => compile(namespace, '/src/App.tsrx')).toThrow(EFFECT_STATE_UPDATE);
	});

	it('recognizes named effect callbacks without banning later cleanup callbacks', () => {
		const source = `"use strong";\n${stateComponent(
			'function syncCount() { setCount(count + 1); } useEffect(syncCount, [count]);',
			'useState, useEffect',
		)}`;

		expect(() => compile(source, '/src/Counter.tsrx')).toThrow(EFFECT_STATE_UPDATE);
	});

	it('rejects passing a state updater directly as an effect callback', () => {
		const source = `"use strong";\n${stateComponent(
			'useEffect(setCount, []);',
			'useState, useEffect',
		)}`;

		expect(() => compile(source, '/src/Counter.tsrx')).toThrow(EFFECT_STATE_UPDATE);
	});

	it('catches synchronous local callback invocation inside effect setup', () => {
		const source = `"use strong";\n${stateComponent(
			'useEffect(() => { const apply = () => setCount(1); apply(); }, []);',
			'useState, useEffect',
		)}`;

		expect(() => compile(source, '/src/Counter.tsrx')).toThrow(EFFECT_STATE_UPDATE);
	});

	it('allows cleanup callbacks and asynchronous state updates from effects', () => {
		const source = `"use strong";\n${stateComponent(
			`useEffect(() => {
      setTimeout(() => setCount(count + 1), 0);
      Promise.resolve().then(() => setCount(count + 1));
      return () => setCount(count + 1);
    }, [count]);`,
			'useState, useEffect',
		)}`;

		expect(() => compile(source, '/src/Counter.tsrx')).not.toThrow();
	});

	it('allows state updates after an async function has yielded', () => {
		const effect = `"use strong";\n${stateComponent(
			'useEffect(() => { (async () => { await Promise.resolve(); setCount(1); })(); }, []);',
			'useState, useEffect',
		)}`;
		const render = `"use strong";\n${stateComponent(
			'(async () => { await Promise.resolve(); setCount(1); })();',
		)}`;
		const synchronous = `"use strong";\n${stateComponent(
			'(async () => { setCount(1); await Promise.resolve(); })();',
		)}`;
		const awaitedArgument = `"use strong";\n${stateComponent(
			'(async () => { setCount(await Promise.resolve(1)); })();',
		)}`;
		const effectAwaitedArgument = `"use strong";\n${stateComponent(
			'useEffect(() => { (async () => { setCount(await Promise.resolve(1)); })(); }, []);',
			'useState, useEffect',
		)}`;
		const conditional = `"use strong";\n${stateComponent(
			'(async () => { if (false) await Promise.resolve(); setCount(1); })();',
		)}`;
		const awaitedObject = `"use strong";\n${stateComponent(
			'(async () => { setCount({ value: await Promise.resolve(1) }); })();',
		)}`;
		const awaitedArray = `"use strong";\n${stateComponent(
			'(async () => { setCount([await Promise.resolve(1)]); })();',
		)}`;
		const awaitedSpread = `"use strong";\n${stateComponent(
			'(async () => { setCount({ ...(await Promise.resolve({ value: 1 })) }); })();',
		)}`;
		const conditionalObject = `"use strong";\n${stateComponent(
			'(async () => { setCount({ value: false ? await Promise.resolve(1) : 1 }); })();',
		)}`;

		expect(() => compile(effect, '/src/Counter.tsrx')).not.toThrow();
		expect(() => compile(render, '/src/Counter.tsrx')).not.toThrow();
		expect(() => compile(awaitedArgument, '/src/Counter.tsrx')).not.toThrow();
		expect(() => compile(effectAwaitedArgument, '/src/Counter.tsrx')).not.toThrow();
		expect(() => compile(awaitedObject, '/src/Counter.tsrx')).not.toThrow();
		expect(() => compile(awaitedArray, '/src/Counter.tsrx')).not.toThrow();
		expect(() => compile(awaitedSpread, '/src/Counter.tsrx')).not.toThrow();
		expect(() => compile(synchronous, '/src/Counter.tsrx')).toThrow(RENDER_STATE_UPDATE);
		expect(() => compile(conditional, '/src/Counter.tsrx')).toThrow(RENDER_STATE_UPDATE);
		expect(() => compile(conditionalObject, '/src/Counter.tsrx')).toThrow(RENDER_STATE_UPDATE);
	});

	it.each(['ref.current = 1;', 'ref.current++;', "ref['current'] = 1;"])(
		'rejects render-phase useRef writes: %s',
		(write) => {
			const source = `"use strong";
import { useRef } from 'octane';
export function App() @{
  const ref = useRef(0);
  ${write}
  <div />
}`;

			expect(() => compile(source, '/src/App.tsrx')).toThrow(RENDER_REF_WRITE);
		},
	);

	it('preserves DOM refs and deferred imperative ref updates', () => {
		const source = `"use strong";
import { useRef } from 'octane';
export function App() @{
  const ref = useRef(null);
  const clear = () => { ref.current = null; };
  <button ref={ref} onClick={() => { ref.current = null; }} />
}`;

		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
	});

	it('applies the same rules to Octane-owned TSX component modules', () => {
		const source = `/** @jsxImportSource octane */
'use strong';
import { useState } from 'octane';
export function App() {
  const [count, setCount] = useState(0);
  setCount(count + 1);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}`;

		expect(() => compile(source, '/src/App.tsx')).toThrow(RENDER_STATE_UPDATE);
	});

	it('does not ban nondeterministic render values', () => {
		const source = `"use strong";
export function App() @{
  const value = Date.now() + Math.random() + crypto.randomUUID();
  <p>{value as string}</p>
}`;

		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
	});

	it('reports the original filename, location, stable code, and migration guidance', () => {
		const source = `"use strong";\n${stateComponent('setCount(count + 1);')}`;

		try {
			compile(source, '/src/Counter.tsrx');
			throw new Error('expected Strong mode to reject the render-phase update');
		} catch (error: any) {
			expect(error).toMatchObject({
				code: RENDER_STATE_UPDATE,
				filename: '/src/Counter.tsrx',
				loc: { line: 5 },
			});
			expect(error.message).toContain('useLinkedState');
		}
	});

	it('enforces Strong mode in plain TypeScript and JavaScript custom-hook modules', () => {
		const source = `import { useState } from 'octane';
export function useCounter() {
  const [count, update] = useState(0);
  update(count + 1);
  return count;
}`;

		expect(() => slotHooks(source, '/src/useCounter.ts')).not.toThrow();
		expect(() => slotHooks(source, '/src/useCounter.ts', { strong: true } as any)).toThrow(
			RENDER_STATE_UPDATE,
		);
		expect(() => slotHooks(`"use strong";\n${source}`, '/src/useCounter.js')).toThrow(
			RENDER_STATE_UPDATE,
		);
	});

	it('publishes matching source-located errors to Volar without throwing', () => {
		const source = `"use strong";\n${stateComponent('setCount(count + 1);')}`;
		const result = compileToVolarMappings(source, '/src/Counter.tsrx');

		expect(result.diagnostics).toContainEqual(
			expect.objectContaining({
				code: RENDER_STATE_UPDATE,
				severity: 'error',
				filename: '/src/Counter.tsrx',
				start: expect.objectContaining({ line: 5 }),
			}),
		);
		expect(result.errors).toContainEqual(
			expect.objectContaining({
				code: RENDER_STATE_UPDATE,
				type: 'usage',
				fileName: '/src/Counter.tsrx',
				pos: source.indexOf('setCount(count + 1);'),
				loc: { start: { line: 5, column: 2 }, end: { line: 5, column: 10 } },
			}),
		);
	});

	it('honors the compiler-wide option in Volar while leaving compatibility files unchanged', () => {
		const source = stateComponent('setCount(count + 1);');

		expect(compileToVolarMappings(source, '/src/Counter.tsrx').diagnostics).toEqual([]);
		expect(
			compileToVolarMappings(source, '/src/Counter.tsrx', { strong: true } as any).diagnostics,
		).toContainEqual(expect.objectContaining({ code: RENDER_STATE_UPDATE, severity: 'error' }));
	});
});
