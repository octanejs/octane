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

	it.each([
		[
			'named function declarations',
			'function apply() { setCount(count + 1); } useMemo(apply, [count]);',
		],
		[
			'named function expressions',
			'const apply = () => setCount(count + 1); useMemo(apply, [count]);',
		],
		[
			'aliased named callbacks',
			'const apply = () => setCount(count + 1); const calculate = apply; useMemo(calculate, [count]);',
		],
		['state updaters', 'useMemo(setCount, [count]);'],
		['aliased state updaters', 'const update = setCount; useMemo(update, [count]);'],
		[
			'TypeScript-wrapped named callbacks',
			'const apply = () => setCount(count + 1); useMemo((apply as () => void), [count]);',
		],
	])('rejects render updates through useMemo %s', (_label, setup) => {
		const source = `"use strong";\n${stateComponent(setup, 'useState, useMemo')}`;

		expect(() => compile(source, '/src/Counter.tsrx')).toThrow(RENDER_STATE_UPDATE);
	});

	it.each([
		[
			'aliased imports',
			`import { useMemo as memo, useState } from 'octane';
export function App() @{ const [, update] = useState(0); memo(update, []); <div /> }`,
		],
		[
			'namespace imports',
			`import * as Octane from 'octane';
export function App() @{ const [, update] = Octane.useState(0); Octane.useMemo(update, []); <div /> }`,
		],
		[
			'wrapped namespace properties',
			`import * as Octane from 'octane';
export function App() @{ const [, update] = Octane.useState(0); Octane['useMemo' as const](update, []); <div /> }`,
		],
	])('tracks named memo callbacks through %s', (_label, source) => {
		expect(() => compile(`"use strong";\n${source}`, '/src/App.tsrx')).toThrow(RENDER_STATE_UPDATE);
	});

	it('keeps deferred, unknown, and shadowed named memo callbacks legal', () => {
		const source = `"use strong";
import { useMemo, useState } from 'octane';
export function App(props) @{
  const [count, setCount] = useState(0);
  const apply = () => setTimeout(() => setCount(count + 1), 0);
  const external = props.calculate;
  useMemo(apply, [count]);
  useMemo(external, [count]);
  useMemo(() => () => setCount(count + 1), [count]);
  <div />
}`;

		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
	});

	it('publishes named memo state updates as editor errors', () => {
		const source = `"use strong";\n${stateComponent(
			'const apply = () => setCount(count + 1); useMemo(apply, [count]);',
			'useState, useMemo',
		)}`;
		const result = compileToVolarMappings(source, '/src/Counter.tsrx');

		expect(result.diagnostics).toContainEqual(
			expect.objectContaining({ code: RENDER_STATE_UPDATE, severity: 'error' }),
		);
		expect(result.errors).toContainEqual(
			expect.objectContaining({ code: RENDER_STATE_UPDATE, type: 'usage' }),
		);
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

	it.each([
		['const assertions', '1 as const'],
		['satisfies expressions', '1 satisfies number'],
		['non-null assertions', '(1)!'],
		['nested transparent wrappers', '((1 as const)!) satisfies number'],
	])('rejects state tuple updates through computed keys with %s', (_label, key) => {
		const source = `"use strong";
import { useState } from 'octane';
export function App() @{
  const tuple = useState(0);
  tuple[${key}](1);
  <div />
}`;

		expect(() => compile(source, '/src/App.tsrx')).toThrow(RENDER_STATE_UPDATE);
	});

	it.each([
		['const assertions', "'current' as const", '= 1'],
		['satisfies expressions', "'current' satisfies string", '++'],
		['non-null assertions', "'current'!", '= 1'],
		['nested transparent wrappers', "(('current' as const)!) satisfies string", '++'],
	])('rejects render-phase ref writes through computed keys with %s', (_label, key, operation) => {
		const source = `"use strong";
import { useRef } from 'octane';
export function App() @{
  const ref = useRef(0);
  ref[${key}] ${operation};
  <div />
}`;

		expect(() => compile(source, '/src/App.tsrx')).toThrow(RENDER_REF_WRITE);
	});

	it.each([
		[
			'state hook names',
			`const tuple = Octane['useState' as const](0); tuple[1](1);`,
			RENDER_STATE_UPDATE,
		],
		[
			'effect hook names',
			`const [, update] = Octane.useState(0); Octane['useEffect'!](() => update(1));`,
			EFFECT_STATE_UPDATE,
		],
		[
			'memo hook names',
			`const [, update] = Octane.useState(0); Octane[('useMemo' satisfies string)](() => update(1));`,
			RENDER_STATE_UPDATE,
		],
		[
			'ref hook names',
			`const ref = Octane['useRef' as const](0); ref.current = 1;`,
			RENDER_REF_WRITE,
		],
	])('recognizes namespace hooks behind wrapped computed %s', (_label, setup, code) => {
		const source = `"use strong";
import * as Octane from 'octane';
export function App() @{
  ${setup}
  <div />
}`;

		expect(() => compile(source, '/src/App.tsrx')).toThrow(code);
	});

	it('does not mistake genuinely dynamic computed keys for known hooks, setters, or refs', () => {
		const source = `"use strong";
import * as Octane from 'octane';
export function App() @{
  const tuple = Octane.useState(0);
  const index = 0;
  const ref = Octane.useRef({});
  const property = 'value';
  tuple[index];
  ref[property] = 1;
  <div />
}`;

		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
	});

	it('reports wrapped computed-key violations in plain TypeScript and editor diagnostics', () => {
		const source = `"use strong";
import * as Octane from 'octane';
export function useCounter() {
  const tuple = Octane['useState' as const](0);
  tuple[1 as const](1);
  return tuple[0];
}`;
		const editorSource = `"use strong";
import { useRef } from 'octane';
export function App() @{
  const ref = useRef(0);
  ref['current'!] = 1;
  <div />
}`;
		const diagnostics = compileToVolarMappings(editorSource, '/src/App.tsrx');

		expect(() => slotHooks(source, '/src/useCounter.ts')).toThrow(RENDER_STATE_UPDATE);
		expect(diagnostics.diagnostics).toContainEqual(
			expect.objectContaining({ code: RENDER_REF_WRITE, severity: 'error' }),
		);
		expect(diagnostics.errors).toContainEqual(
			expect.objectContaining({ code: RENDER_REF_WRITE, type: 'usage' }),
		);
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

	it.each([
		['memo callbacks', 'useMemo(state[1], []);', RENDER_STATE_UPDATE],
		['wrapped memo callback indices', 'useMemo(state[1 as const], []);', RENDER_STATE_UPDATE],
		['effect callbacks', 'useEffect(state[1], []);', EFFECT_STATE_UPDATE],
		['wrapped effect callback indices', 'useEffect(state[1 as const], []);', EFFECT_STATE_UPDATE],
	])('rejects state tuple updaters used as %s', (_label, callback, code) => {
		const source = `"use strong";
import { useEffect, useMemo, useState } from 'octane';
export function App() @{
  const state = useState(0);
  ${callback}
  <div />
}`;

		expect(() => compile(source, '/src/App.tsrx')).toThrow(code);
	});

	it('allows state tuple memo callbacks after yielded dependency arguments', () => {
		const source = `"use strong";
import { useMemo, useState } from 'octane';
export function App() @{
  const state = useState(0);
  (async () => { useMemo(state[1], [await Promise.resolve(state[0])]); })();
  <div />
}`;

		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
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

	it.each([
		['standalone blocks', '{ await Promise.resolve(); setCount(1); }'],
		['statements after standalone blocks', '{ await Promise.resolve(); } setCount(1);'],
		[
			'deeply nested blocks',
			'{ { const next = await Promise.resolve(count + 1); setCount(next); } }',
		],
		['conditional branches', 'if (count > -1) { await Promise.resolve(); setCount(1); }'],
		[
			'branches that both yield',
			'if (count > 0) { await Promise.resolve(); } else { await Promise.resolve(); } setCount(1);',
		],
		['awaited conditional tests', 'if (await Promise.resolve(count > -1)) setCount(1);'],
		[
			'awaited optional-chain receivers',
			'const target = { update: () => {} }; (await Promise.resolve(target))?.update(); setCount(1);',
		],
		[
			'try blocks',
			'try { const next = await Promise.resolve(count + 1); setCount(next); } catch {}',
		],
		[
			'catch blocks',
			'try { throw new Error("retry"); } catch { const next = await Promise.resolve(1); setCount(next); }',
		],
		[
			'try and catch branches that both yield',
			'try { await Promise.resolve(); } catch { await Promise.resolve(); } setCount(1);',
		],
		['finally blocks', 'try {} finally { await Promise.resolve(); setCount(1); }'],
		[
			'statements after awaited finally blocks',
			'try {} finally { await Promise.resolve(); } setCount(1);',
		],
	])('allows updates after guaranteed awaits in nested %s', (_label, body) => {
		const render = `"use strong";\n${stateComponent(`(async () => { ${body} })();`)}`;
		const effect = `"use strong";\n${stateComponent(
			`useEffect(() => { (async () => { ${body} })(); }, [count]);`,
			'useState, useEffect',
		)}`;
		const asyncEffect = `"use strong";\n${stateComponent(
			`useEffect(async () => { ${body} }, [count]);`,
			'useState, useEffect',
		)}`;

		for (const source of [render, effect, asyncEffect]) {
			expect(() => compile(source, '/src/Counter.tsrx')).not.toThrow();
		}
	});

	it.each([
		[
			'awaited ternary conditions',
			'(await Promise.resolve(count > 0)) ? setCount(1) : setCount(2);',
		],
		[
			'conditionally selected branches that yield before updating',
			'count > 0 ? (await Promise.resolve(), setCount(1)) : count;',
		],
		[
			'ternary branches that both yield before a later operand',
			'(count > 0 ? await Promise.resolve(1) : await Promise.resolve(2), setCount(3));',
		],
		['awaited logical AND operands', '(await Promise.resolve(true)) && setCount(1);'],
		['awaited logical OR operands', '(await Promise.resolve(false)) || setCount(1);'],
		['awaited nullish-coalescing operands', '(await Promise.resolve(null)) ?? setCount(1);'],
		[
			'conditionally selected logical branches that yield before updating',
			'count > 0 && (await Promise.resolve(), setCount(1));',
		],
		['comma expressions', '(await Promise.resolve(), setCount(1));'],
		['later comma operands', '(count, await Promise.resolve(), setCount(1));'],
		[
			'transparently wrapped awaited operands',
			'((await Promise.resolve(true)) as boolean) ? setCount(1) : setCount(2);',
		],
		['binary operands', '(await Promise.resolve(1)) + setCount(1);'],
		['array elements', '[await Promise.resolve(count), setCount(1)];'],
		['object properties', 'void ({ first: await Promise.resolve(count), second: setCount(1) });'],
		['computed object properties', 'void ({ [await Promise.resolve("value")]: setCount(1) });'],
		[
			'object spread properties',
			'void ({ ...(await Promise.resolve({ count })), value: setCount(1) });',
		],
		['function arguments', 'Promise.resolve(await Promise.resolve(count), setCount(1));'],
		['callee expressions', '([() => {}][await Promise.resolve(0)])(setCount(1));'],
		[
			'immediately invoked function arguments',
			'(() => setCount(1))(await Promise.resolve(count));',
		],
		[
			'named synchronously invoked function arguments',
			'const apply = () => setCount(1); apply(await Promise.resolve(count));',
		],
		[
			'default parameters after yielded function arguments',
			'((value = setCount(1)) => value)(await Promise.resolve(undefined));',
		],
		[
			'constructor arguments',
			'new Error(await Promise.resolve("message"), { cause: setCount(1) });',
		],
		[
			'named constructors after yielded arguments',
			'function Update() { setCount(1); } new Update(await Promise.resolve(count));',
		],
		[
			'inline constructors after yielded arguments',
			'new (function Update() { setCount(1); })(await Promise.resolve(count));',
		],
		[
			'constructor arguments after yielded class heritage',
			'new (class extends (await Promise.resolve(Object)) { constructor(value) { super(); } })(setCount(1));',
		],
		[
			'optional-call arguments when their earlier arguments yield',
			'const target = { update() {} }; target?.update(await Promise.resolve(count), setCount(1));',
		],
		['computed member properties', '(await Promise.resolve({}))[setCount(1)];'],
		['optional computed member properties', '(await Promise.resolve({}))?.[setCount(1)];'],
		[
			'later properties in a continuous optional chain',
			'const target = count > 0 ? { value: {} } : null; target?.[await Promise.resolve("value")][setCount(1)];',
		],
		[
			'optional properties after a grouped optional chain',
			'const target = count > 0 ? { value: {} } : null; (target?.[await Promise.resolve("value")])?.[setCount(1)];',
		],
		[
			'optional calls after a grouped optional property',
			'const target = count > 0 ? { update() {} } : null; (target?.[await Promise.resolve("update")])?.(setCount(1));',
		],
		[
			'optional properties after a grouped optional call',
			'const target = count > 0 ? () => ({}) : null; (target?.(await Promise.resolve(count)))?.[setCount(1)];',
		],
		[
			'assignment expressions',
			'const target = {}; target[await Promise.resolve("value")] = setCount(1);',
		],
		[
			'conditionally evaluated logical-assignment branches',
			'let value = count; value &&= (await Promise.resolve(), setCount(1));',
		],
		['template expressions', '`first ${await Promise.resolve(count)} second ${setCount(1)}`;'],
		['tagged template expressions', '(await Promise.resolve(String.raw))`count ${setCount(1)}`;'],
		[
			'tagged callbacks after yielded substitutions',
			'const apply = () => setCount(1); apply`count ${await Promise.resolve(count)}`;',
		],
		[
			'later variable declarators',
			'const previous = await Promise.resolve(count), next = setCount(1);',
		],
		[
			'destructuring defaults after yielded initializers',
			'const { value = setCount(1) } = await Promise.resolve({});',
		],
		[
			'destructuring defaults after yielded computed keys',
			'const { [await Promise.resolve("value")]: value = setCount(1) } = {};',
		],
		[
			'destructuring assignments after yielded values',
			'let value; ({ value = setCount(1) } = await Promise.resolve({}));',
		],
		[
			'destructuring assignments after yielded computed keys',
			'let value; ({ [await Promise.resolve("value")]: value = setCount(1) } = {});',
		],
		[
			'array destructuring assignments after yielded values',
			'let value; [value = setCount(1)] = await Promise.resolve([]);',
		],
	])('allows expression updates after guaranteed yields in %s', (_label, body) => {
		const render = `"use strong";\n${stateComponent(`(async () => { ${body} })();`)}`;
		const effect = `"use strong";\n${stateComponent(
			`useEffect(() => { (async () => { ${body} })(); }, [count]);`,
			'useState, useEffect',
		)}`;
		const asyncEffect = `"use strong";\n${stateComponent(
			`useEffect(async () => { ${body} }, [count]);`,
			'useState, useEffect',
		)}`;

		for (const source of [render, effect, asyncEffect]) {
			expect(() => compile(source, '/src/Counter.tsrx')).not.toThrow();
		}
	});

	it.each([
		[
			'ternary updates before their branch yields',
			'count > 0 ? (setCount(1), await Promise.resolve()) : count;',
		],
		[
			'ternary updates when only the other branch yields',
			'count > 0 ? setCount(1) : await Promise.resolve();',
		],
		[
			'updates after conditionally awaited ternary expressions',
			'(count > 0 ? await Promise.resolve() : count, setCount(1));',
		],
		[
			'updates after conditionally awaited logical expressions',
			'(count > 0 && await Promise.resolve(), setCount(1));',
		],
		[
			'logical updates before their selected branch yields',
			'count > 0 && (setCount(1), await Promise.resolve());',
		],
		['comma operands before their await', '(setCount(1), await Promise.resolve());'],
		['binary operands before their await', 'setCount(1) + (await Promise.resolve(count));'],
		['array elements before their await', '[setCount(1), await Promise.resolve(count)];'],
		[
			'object properties before their await',
			'void ({ first: setCount(1), second: await Promise.resolve(count) });',
		],
		[
			'function arguments before their await',
			'Promise.resolve(setCount(1), await Promise.resolve(count));',
		],
		[
			'optional calls whose arguments can be skipped',
			'const target = count > 0 ? { update() {} } : null; (target?.update(await Promise.resolve()), setCount(1));',
		],
		[
			'optional computed properties that can be skipped',
			'const target = count > 0 ? {} : null; (target?.[await Promise.resolve("value")], setCount(1));',
		],
		[
			'grouped optional chains whose computed properties can be skipped',
			'const target = count > 0 ? {} : null; (target?.[await Promise.resolve("value")])[setCount(1)];',
		],
		[
			'grouped optional calls whose arguments can be skipped',
			'const target = count > 0 ? () => ({}) : null; (target?.(await Promise.resolve(count)))[setCount(1)];',
		],
		[
			'assignment operands before their await',
			'const target = {}; target[setCount(1)] = await Promise.resolve(count);',
		],
		[
			'logical AND assignments whose awaited right side can be skipped',
			'let value = count; value &&= await Promise.resolve(1); setCount(1);',
		],
		[
			'logical OR assignments whose awaited right side can be skipped',
			'let value = count; value ||= await Promise.resolve(1); setCount(1);',
		],
		[
			'nullish assignments whose awaited right side can be skipped',
			'let value = count; value ??= await Promise.resolve(1); setCount(1);',
		],
		[
			'template expressions before their await',
			'`first ${setCount(1)} second ${await Promise.resolve(count)}`;',
		],
		[
			'variable declarators before their await',
			'const previous = setCount(1), next = await Promise.resolve(count);',
		],
		[
			'destructuring assignments whose defaults run synchronously',
			'let value; ({ value = setCount(1) } = {});',
		],
		[
			'destructuring assignment defaults before a later computed-key await',
			'let first, second; ({ first = setCount(1), [await Promise.resolve("second")]: second } = {});',
		],
		[
			'immediately invoked tagged callbacks before an await',
			'const apply = () => setCount(1); apply`count`;',
		],
		[
			'named constructors invoked before an await',
			'function Update() { setCount(1); } new Update();',
		],
		['inline constructors invoked before an await', 'new (function Update() { setCount(1); })();'],
	])('still rejects expression updates in %s', (_label, body) => {
		const render = `"use strong";\n${stateComponent(`(async () => { ${body} })();`)}`;
		const effect = `"use strong";\n${stateComponent(
			`useEffect(async () => { ${body} }, [count]);`,
			'useState, useEffect',
		)}`;

		expect(() => compile(render, '/src/Counter.tsrx')).toThrow(RENDER_STATE_UPDATE);
		expect(() => compile(effect, '/src/Counter.tsrx')).toThrow(EFFECT_STATE_UPDATE);
	});

	it.each([
		['inline memo callbacks', 'useMemo(() => setCount(1), [await Promise.resolve(count)]);'],
		[
			'named memo callbacks',
			'const calculate = () => setCount(1); useMemo(calculate, [await Promise.resolve(count)]);',
		],
		['state updaters as memo callbacks', 'useMemo(setCount, [await Promise.resolve(count)]);'],
	])('allows %s when earlier arguments have yielded', (_label, body) => {
		const source = `"use strong";\n${stateComponent(
			`(async () => { ${body} })();`,
			'useState, useMemo',
		)}`;

		expect(() => compile(source, '/src/Counter.tsrx')).not.toThrow();
	});

	it('still rejects memo callbacks when awaited arguments can be skipped', () => {
		const source = `"use strong";\n${stateComponent(
			'(async () => { useMemo(() => setCount(1), [count > 0 && await Promise.resolve(count)]); })();',
			'useState, useMemo',
		)}`;

		expect(() => compile(source, '/src/Counter.tsrx')).toThrow(RENDER_STATE_UPDATE);
	});

	it.each([
		['inline arrow functions', 'new (() => setCount(1))();'],
		['named arrow functions', 'const Update = () => setCount(1); new Update();'],
		['inline async functions', 'new (async function Update() { setCount(1); })();'],
		['named async functions', 'async function Update() { setCount(1); } new Update();'],
		['generator functions', 'new (function* Update() { setCount(1); })();'],
	])('does not invoke nonconstructable %s during render', (_label, body) => {
		const source = `"use strong";\n${stateComponent(`(async () => { ${body} })();`)}`;

		expect(() => compile(source, '/src/Counter.tsrx')).not.toThrow();
	});

	it.each([
		['updates before a nested await', '{ setCount(1); await Promise.resolve(); }'],
		[
			'conditionally executed nested awaits',
			'{ if (count > 0) await Promise.resolve(); setCount(1); }',
		],
		[
			'conditional branches without an alternative',
			'if (count > 0) { await Promise.resolve(); } setCount(1);',
		],
		[
			'branches where only one arm yields',
			'if (count > 0) { await Promise.resolve(); } else {} setCount(1);',
		],
		['short-circuited awaits', 'count > 0 && await Promise.resolve(); setCount(1);'],
		[
			'optional chains that can skip awaited arguments',
			'const target = count > 0 ? { update: () => {} } : null; target?.update(await Promise.resolve()); setCount(1);',
		],
		[
			'updates before awaits in try blocks',
			'try { setCount(1); await Promise.resolve(); } catch {}',
		],
		[
			'updates before awaits in catch blocks',
			'try { throw new Error("retry"); } catch { setCount(1); await Promise.resolve(); }',
		],
		[
			'catch branches that can continue without yielding',
			'try { await Promise.resolve(); } catch {} setCount(1);',
		],
		[
			'finally blocks that can run synchronously',
			'try { await Promise.resolve(); } finally { setCount(1); }',
		],
	])('still rejects %s', (_label, body) => {
		const render = `"use strong";\n${stateComponent(`(async () => { ${body} })();`)}`;
		const effect = `"use strong";\n${stateComponent(
			`useEffect(async () => { ${body} }, [count]);`,
			'useState, useEffect',
		)}`;

		expect(() => compile(render, '/src/Counter.tsrx')).toThrow(RENDER_STATE_UPDATE);
		expect(() => compile(effect, '/src/Counter.tsrx')).toThrow(EFFECT_STATE_UPDATE);
	});

	it.each([
		['async iterator bodies', 'for await (const value of [count]) { setCount(value); }'],
		[
			'statements after empty async iterations',
			'for await (const value of []) {} setCount(count + 1);',
		],
		[
			'async iterator destructuring defaults',
			'for await (const { value = setCount(count + 1) } of [{}]) {}',
		],
		[
			'ordinary iterator bodies after an awaited iterable',
			'for (const value of await Promise.resolve([count])) { setCount(value); }',
		],
		[
			'statements after empty awaited iterables',
			'for (const value of await Promise.resolve([])) {} setCount(count + 1);',
		],
		[
			'ordinary iterator destructuring defaults after an awaited iterable',
			'for (const { value = setCount(count + 1) } of await Promise.resolve([{}])) {}',
		],
		[
			'for-in bodies after an awaited object',
			'for (const key in await Promise.resolve({ count })) { setCount(count + 1); }',
		],
		[
			'statements after empty awaited for-in objects',
			'for (const key in await Promise.resolve({})) {} setCount(count + 1);',
		],
		[
			'for-loop bodies after an awaited initializer',
			'for (let index = await Promise.resolve(count); index < 1; index++) { setCount(index); }',
		],
		[
			'statements after skipped loops with an awaited initializer',
			'for (let index = await Promise.resolve(count); index < 0; index++) {} setCount(count + 1);',
		],
		[
			'for-loop bodies after an awaited test',
			'for (let index = 0; await Promise.resolve(index < 1); index++) { setCount(index); }',
		],
		[
			'statements after an awaited false for-loop test',
			'for (let index = 0; await Promise.resolve(index < 0); index++) {} setCount(count + 1);',
		],
		[
			'while-loop bodies after an awaited test',
			'while (await Promise.resolve(count > -1)) { setCount(count); break; }',
		],
		[
			'statements after an awaited false while-loop test',
			'while (await Promise.resolve(false)) {} setCount(count + 1);',
		],
		[
			'statements after an awaited false do-while test',
			'do {} while (await Promise.resolve(false)); setCount(count + 1);',
		],
		[
			'labeled do-while loops with awaited tests',
			'outer: do {} while (await Promise.resolve(false)); setCount(count + 1);',
		],
		['labeled await expressions', 'completed: await Promise.resolve(); setCount(count + 1);'],
		[
			'labeled blocks with unavoidable awaits',
			'completed: { await Promise.resolve(); } setCount(count + 1);',
		],
		[
			'nested labeled blocks with unavoidable awaits',
			'outer: { inner: { await Promise.resolve(); } } setCount(count + 1);',
		],
		[
			'labeled while loops with awaited tests',
			'outer: while (await Promise.resolve(false)) {} setCount(count + 1);',
		],
		[
			'switch cases after an awaited discriminant',
			'switch (await Promise.resolve(count)) { case 0: setCount(count + 1); break; }',
		],
		[
			'statements after awaited switch discriminants',
			'switch (await Promise.resolve(count)) {} setCount(count + 1);',
		],
		[
			'switch case updates after an awaited case label',
			'switch (count) { case await Promise.resolve(0): setCount(count + 1); break; }',
		],
		[
			'statements after an unavoidable awaited first case label',
			'switch (count) { case await Promise.resolve(0): break; } setCount(count + 1);',
		],
		[
			'switch case updates after their own awaits',
			'switch (count) { case 0: await Promise.resolve(); setCount(count + 1); break; }',
		],
		[
			'statements after switches where every branch awaits',
			'switch (count) { case 0: await Promise.resolve(); break; default: await Promise.resolve(); } setCount(count + 1);',
		],
		[
			'fall-through switch branches with a shared unavoidable await',
			'switch (count) { case 0: case 1: await Promise.resolve(); setCount(count + 1); break; default: await Promise.resolve(); }',
		],
		[
			'labeled switches with an awaited discriminant',
			'outer: switch (await Promise.resolve(count)) { case 0: break outer; } setCount(count + 1);',
		],
		[
			'do-while tests after an awaited loop body',
			'do { await Promise.resolve(); } while (false); setCount(count + 1);',
		],
		[
			'continue paths that still reach the awaited do-while test',
			'do { if (count > 0) continue; } while (await Promise.resolve(false)); setCount(count + 1);',
		],
		[
			'do-while test updates after yielding paths while other paths break',
			'do { if (count > 0) break; await Promise.resolve(); } while ((setCount(count + 1), false));',
		],
		[
			'breaks belonging to a nested while loop',
			'do { while (true) { break; } } while (await Promise.resolve(false)); setCount(count + 1);',
		],
		[
			'breaks belonging to a nested for loop',
			'do { for (;;) { break; } } while (await Promise.resolve(false)); setCount(count + 1);',
		],
		[
			'breaks belonging to a nested switch',
			'do { switch (count) { case 0: break; default: break; } } while (await Promise.resolve(false)); setCount(count + 1);',
		],
		[
			'breaks after an unavoidable await in the do-while body',
			'do { await Promise.resolve(); break; } while (false); setCount(count + 1);',
		],
		[
			'nested yielding loop heads',
			'for (const values of [[count]]) { for (const value of await Promise.resolve(values)) { setCount(value); } }',
		],
		[
			'awaited setter arguments in loop updates',
			'for (let index = 0; index < 1; setCount(await Promise.resolve(++index))) {}',
		],
	])('allows updates after guaranteed yields in %s', (_label, body) => {
		const render = `"use strong";\n${stateComponent(`(async () => { ${body} })();`)}`;
		const effect = `"use strong";\n${stateComponent(
			`useEffect(() => { (async () => { ${body} })(); }, [count]);`,
			'useState, useEffect',
		)}`;
		const asyncEffect = `"use strong";\n${stateComponent(
			`useEffect(async () => { ${body} }, [count]);`,
			'useState, useEffect',
		)}`;

		for (const source of [render, effect, asyncEffect]) {
			expect(() => compile(source, '/src/Counter.tsrx')).not.toThrow();
		}
	});

	it.each([
		[
			'async iterable expressions before the iterator yields',
			'for await (const value of (setCount(count + 1), [count])) {}',
		],
		[
			'ordinary iterable expressions before their awaited values',
			'for (const value of (setCount(count + 1), await Promise.resolve([count]))) {}',
		],
		[
			'ordinary iterator destructuring defaults before any await',
			'for (const { value = setCount(count + 1) } of [{}]) {}',
		],
		[
			'for-in sources before their awaited values',
			'for (const key in (setCount(count + 1), await Promise.resolve({ count }))) {}',
		],
		[
			'for-loop initializers before their awaited values',
			'for (let index = (setCount(count + 1), await Promise.resolve(count)); index < 0; index++) {}',
		],
		[
			'for-loop tests before their awaited values',
			'for (; (setCount(count + 1), await Promise.resolve(false));) {}',
		],
		[
			'first loop bodies before an awaited update',
			'for (let index = 0; index < 1; await Promise.resolve(index++)) { setCount(index); }',
		],
		[
			'statements after skipped loops with only an awaited update',
			'for (let index = 0; index < 0; await Promise.resolve(index++)) {} setCount(count + 1);',
		],
		[
			'statements after skipped loops whose only await is in the body',
			'for (const value of []) { await Promise.resolve(); } setCount(count + 1);',
		],
		[
			'conditionally awaited ordinary iterable expressions',
			'for (const value of count > 0 ? await Promise.resolve([count]) : []) {} setCount(count + 1);',
		],
		[
			'conditionally awaited for-in sources',
			'for (const key in count > 0 ? await Promise.resolve({ count }) : {}) {} setCount(count + 1);',
		],
		[
			'conditionally awaited for-loop initializers',
			'for (let index = count > 0 ? await Promise.resolve(count) : 0; index < 0; index++) {} setCount(count + 1);',
		],
		[
			'conditionally awaited for-loop tests',
			'for (let index = 0; count > 0 && await Promise.resolve(index < 0); index++) {} setCount(count + 1);',
		],
		[
			'conditionally awaited while-loop tests',
			'while (count > 0 && await Promise.resolve(false)) {} setCount(count + 1);',
		],
		[
			'do-while bodies before the first awaited test',
			'do { setCount(count + 1); } while (await Promise.resolve(false));',
		],
		[
			'breaks that bypass an awaited do-while test',
			'do { if (count > 0) break; } while (await Promise.resolve(false)); setCount(count + 1);',
		],
		[
			'direct breaks that bypass an awaited do-while test',
			'do { break; } while (await Promise.resolve(false)); setCount(count + 1);',
		],
		[
			'labeled breaks that bypass an awaited do-while test',
			'outer: do { break outer; } while (await Promise.resolve(false)); setCount(count + 1);',
		],
		[
			'labeled block exits before their awaited statements',
			'outer: { if (count > 0) break outer; await Promise.resolve(); } setCount(count + 1);',
		],
		[
			'switches without a default when no awaited case matches',
			'switch (count) { case 0: await Promise.resolve(); break; } setCount(count + 1);',
		],
		[
			'switch cases that can break before their await',
			'switch (count) { case 0: break; default: await Promise.resolve(); } setCount(count + 1);',
		],
		[
			'direct switch-case entries that skip an earlier awaited fall-through',
			'switch (count) { case 0: await Promise.resolve(); case 1: setCount(count + 1); break; }',
		],
		[
			'conditionally awaited switch discriminants',
			'switch (count > 0 ? await Promise.resolve(count) : count) {} setCount(count + 1);',
		],
		[
			'labeled switch breaks before their awaited statements',
			'outer: switch (count) { case 0: break outer; default: await Promise.resolve(); } setCount(count + 1);',
		],
		[
			'conditionally awaited do-while tests',
			'do {} while (count > 0 && await Promise.resolve(false)); setCount(count + 1);',
		],
		[
			'conditionally awaited do-while bodies with synchronous tests',
			'do { if (count > 0) await Promise.resolve(); } while (false); setCount(count + 1);',
		],
		[
			'unreachable awaits after escaping do-while breaks',
			'do { break; await Promise.resolve(); } while (false); setCount(count + 1);',
		],
		[
			'unreachable awaits after do-while continues',
			'do { continue; await Promise.resolve(); } while (false); setCount(count + 1);',
		],
		[
			'do-while test updates before their awaited condition',
			'do {} while ((setCount(count + 1), await Promise.resolve(false)));',
		],
	])('still rejects updates in %s', (_label, body) => {
		const render = `"use strong";\n${stateComponent(`(async () => { ${body} })();`)}`;
		const effect = `"use strong";\n${stateComponent(
			`useEffect(async () => { ${body} }, [count]);`,
			'useState, useEffect',
		)}`;

		expect(() => compile(render, '/src/Counter.tsrx')).toThrow(RENDER_STATE_UPDATE);
		expect(() => compile(effect, '/src/Counter.tsrx')).toThrow(EFFECT_STATE_UPDATE);
	});

	it.each([
		[
			'classic loop initializers',
			'for (let setCount = () => {}, index = 0; index < 1; index++) { setCount(); }',
		],
		['ordinary iteration bindings', 'for (const setCount of [() => {}]) { setCount(); }'],
		['async iteration bindings', 'for await (const setCount of [() => {}]) { setCount(); }'],
	])('does not mistake state updaters shadowed by %s', (_label, body) => {
		const source = `"use strong";\n${stateComponent(`(async () => { ${body} })();`)}`;

		expect(() => compile(source, '/src/Counter.tsrx')).not.toThrow();
	});

	it('does not mistake ref objects shadowed by iteration bindings', () => {
		const source = `"use strong";
import { useRef } from 'octane';
export function App() @{
  const ref = useRef(0);
  for (const ref of [{ current: 0 }]) {
    ref.current = 1;
  }
  <div />
}`;

		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
	});

	it('does not mistake state updaters shadowed by switch-scope declarations', () => {
		const source = `"use strong";\n${stateComponent(
			'switch (count) { case 0: { const setCount = () => {}; setCount(); break; } }',
		)}`;

		expect(() => compile(source, '/src/Counter.tsrx')).not.toThrow();
	});

	it.each([
		{ mode: 'client', dev: true },
		{ mode: 'client', dev: false },
		{ mode: 'server', dev: true },
		{ mode: 'server', dev: false },
	])('preserves yielding loop heads during $mode compilation with dev=$dev', (options) => {
		const source = `"use strong";\n${stateComponent(
			`useEffect(async () => {
      for await (const value of [count]) {
        setCount(value);
      }
      for (const value of await Promise.resolve([])) {}
      setCount(count + 1);
    }, [count]);`,
			'useState, useEffect',
		)}`;

		expect(() => compile(source, '/src/Counter.tsrx', options)).not.toThrow();
	});

	it('applies yielding loop rules to plain TypeScript custom hooks', () => {
		const source = `"use strong";
import { useEffect, useState } from 'octane';
export function useCounter() {
  const [count, setCount] = useState(0);
  useEffect(async () => {
    for await (const value of [count]) {
      setCount(value);
    }
    for (const value of await Promise.resolve([])) {}
    setCount(count + 1);
  }, [count]);
  return count;
}`;
		const synchronous = source.replace(
			'for await (const value of [count])',
			'for await (const value of (setCount(count + 1), [count]))',
		);

		expect(() => slotHooks(source, '/src/useCounter.ts')).not.toThrow();
		expect(() => slotHooks(synchronous, '/src/useCounter.ts')).toThrow(EFFECT_STATE_UPDATE);
	});

	it('publishes editor errors only for synchronous updates in yielding loops', () => {
		const source = `"use strong";\n${stateComponent(
			`useEffect(async () => {
      for await (const value of [count]) {
        setCount(value);
      }
    }, [count]);`,
			'useState, useEffect',
		)}`;
		const synchronous = source.replace(
			'for await (const value of [count])',
			'for await (const value of (setCount(count + 1), [count]))',
		);
		const valid = compileToVolarMappings(source, '/src/Counter.tsrx');
		const rejected = compileToVolarMappings(synchronous, '/src/Counter.tsrx');

		expect(valid.diagnostics).toEqual([]);
		expect(valid.errors).toEqual([]);
		expect(rejected.diagnostics).toContainEqual(
			expect.objectContaining({ code: EFFECT_STATE_UPDATE, severity: 'error' }),
		);
		expect(rejected.errors).toContainEqual(
			expect.objectContaining({ code: EFFECT_STATE_UPDATE, type: 'usage' }),
		);
	});

	it.each([
		{ mode: 'client', dev: true },
		{ mode: 'client', dev: false },
		{ mode: 'server', dev: true },
		{ mode: 'server', dev: false },
	])('preserves nested async effect updates during $mode compilation with dev=$dev', (options) => {
		const source = `"use strong";\n${stateComponent(
			`useEffect(() => {
      (async () => {
        try {
          const next = await Promise.resolve(count + 1);
          setCount(next);
        } catch {
          await Promise.resolve();
          setCount(0);
        }
      })();
    }, [count]);`,
			'useState, useEffect',
		)}`;

		expect(() => compile(source, '/src/Counter.tsrx', options)).not.toThrow();
	});

	it('accepts nested async effect updates in plain TypeScript custom hooks', () => {
		const source = `"use strong";
import { useEffect, useState } from 'octane';
export function useCounter() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    (async () => {
      try {
        const next = await Promise.resolve(count + 1);
        setCount(next);
      } catch {
        await Promise.resolve();
        setCount(0);
      }
    })();
  }, [count]);
  return count;
}`;
		const synchronous = source.replace(
			'const next = await Promise.resolve(count + 1);\n        setCount(next);',
			'setCount(count + 1);\n        await Promise.resolve();',
		);

		expect(() => slotHooks(source, '/src/useCounter.ts')).not.toThrow();
		expect(() => slotHooks(synchronous, '/src/useCounter.ts')).toThrow(EFFECT_STATE_UPDATE);
	});

	it('does not publish editor errors for legitimately deferred nested async updates', () => {
		const source = `"use strong";\n${stateComponent(
			`useEffect(async () => {
      try {
        const next = await Promise.resolve(count + 1);
        setCount(next);
      } catch {
        await Promise.resolve();
        setCount(0);
      }
    }, [count]);`,
			'useState, useEffect',
		)}`;
		const result = compileToVolarMappings(source, '/src/Counter.tsrx');
		const synchronous = source.replace(
			'const next = await Promise.resolve(count + 1);\n        setCount(next);',
			'setCount(count + 1);\n        await Promise.resolve();',
		);
		const rejected = compileToVolarMappings(synchronous, '/src/Counter.tsrx');

		expect(result.diagnostics).toEqual([]);
		expect(result.errors).toEqual([]);
		expect(rejected.diagnostics).toContainEqual(
			expect.objectContaining({ code: EFFECT_STATE_UPDATE, severity: 'error' }),
		);
		expect(rejected.errors).toContainEqual(
			expect.objectContaining({ code: EFFECT_STATE_UPDATE, type: 'usage' }),
		);
	});

	it.each([
		{ mode: 'client', dev: true },
		{ mode: 'client', dev: false },
		{ mode: 'server', dev: true },
		{ mode: 'server', dev: false },
	])(
		'preserves yielded expression evaluation during $mode compilation with dev=$dev',
		(options) => {
			const source = `"use strong";\n${stateComponent(
				`useEffect(async () => {
      (await Promise.resolve(count > 0)) ? setCount(1) : setCount(2);
      Promise.resolve(await Promise.resolve(count), setCount(3));
      const { value = setCount(4) } = await Promise.resolve({});
    }, [count]);`,
				'useState, useEffect',
			)}`;

			expect(() => compile(source, '/src/Counter.tsrx', options)).not.toThrow();
		},
	);

	it('applies yielded expression ordering to plain TypeScript custom hooks', () => {
		const source = `"use strong";
import { useEffect, useState } from 'octane';
export function useCounter() {
  const [count, setCount] = useState(0);
  useEffect(async () => {
    (await Promise.resolve(count > 0)) ? setCount(1) : setCount(2);
    Promise.resolve(await Promise.resolve(count), setCount(3));
  }, [count]);
  return count;
}`;
		const synchronous = source.replace(
			'(await Promise.resolve(count > 0)) ? setCount(1) : setCount(2);',
			'count > 0 ? setCount(1) : await Promise.resolve(count);',
		);

		expect(() => slotHooks(source, '/src/useCounter.ts')).not.toThrow();
		expect(() => slotHooks(synchronous, '/src/useCounter.ts')).toThrow(EFFECT_STATE_UPDATE);
	});

	it('publishes editor errors only for synchronously evaluated expression updates', () => {
		const source = `"use strong";\n${stateComponent(
			`useEffect(async () => {
      (await Promise.resolve(count > 0)) ? setCount(1) : setCount(2);
    }, [count]);`,
			'useState, useEffect',
		)}`;
		const synchronous = source.replace(
			'(await Promise.resolve(count > 0)) ? setCount(1) : setCount(2);',
			'count > 0 ? setCount(1) : await Promise.resolve(count);',
		);
		const valid = compileToVolarMappings(source, '/src/Counter.tsrx');
		const rejected = compileToVolarMappings(synchronous, '/src/Counter.tsrx');

		expect(valid.diagnostics).toEqual([]);
		expect(valid.errors).toEqual([]);
		expect(rejected.diagnostics).toContainEqual(
			expect.objectContaining({ code: EFFECT_STATE_UPDATE, severity: 'error' }),
		);
		expect(rejected.errors).toContainEqual(
			expect.objectContaining({ code: EFFECT_STATE_UPDATE, type: 'usage' }),
		);
	});

	it.each([
		['assignments', 'ref.current = await Promise.resolve(1);'],
		['compound assignments', 'ref.current += await Promise.resolve(1);'],
		[
			'awaited conditional tests',
			'(await Promise.resolve(true)) ? (ref.current = 1) : (ref.current = 2);',
		],
		['later comma operands', '(await Promise.resolve(), ref.current++);'],
	])('allows ref writes after yields in %s', (_label, body) => {
		const source = `"use strong";
import { useRef } from 'octane';
export function App() @{
  const ref = useRef(0);
  (async () => { ${body} })();
  <div />
}`;

		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
	});

	it('still rejects ref writes evaluated before a later yield', () => {
		const source = `"use strong";
import { useRef } from 'octane';
export function App() @{
  const ref = useRef(0);
  (async () => { ref.current = (ref.current++, await Promise.resolve(1)); })();
  <div />
}`;

		expect(() => compile(source, '/src/App.tsrx')).toThrow(RENDER_REF_WRITE);
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
