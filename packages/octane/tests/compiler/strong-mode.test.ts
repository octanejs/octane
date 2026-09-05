import { describe, expect, it } from 'vitest';
import { compile } from '../../src/compiler/compile.js';
import { slotHooks } from '../../src/compiler/slot-hooks.js';
import { compileToVolarMappings } from '../../src/compiler/volar.js';

const RENDER_STATE_UPDATE = 'OCTANE_STRONG_RENDER_STATE_UPDATE';
const EFFECT_STATE_UPDATE = 'OCTANE_STRONG_EFFECT_STATE_UPDATE';
const RENDER_REF_WRITE = 'OCTANE_STRONG_RENDER_REF_WRITE';
const RENDER_SNAPSHOT_MUTATION = 'OCTANE_STRONG_RENDER_SNAPSHOT_MUTATION';
const RETAINED_ROW_MUTATION = 'OCTANE_STRONG_RETAINED_ROW_MUTATION';
const RENDER_IMPURE_CALL = 'OCTANE_STRONG_RENDER_IMPURE_CALL';
const RENDER_EFFECT_EVENT_CALL = 'OCTANE_STRONG_RENDER_EFFECT_EVENT_CALL';
const EFFECT_EVENT_DEPENDENCY = 'OCTANE_STRONG_EFFECT_EVENT_DEPENDENCY';
const DIRECTIVE_PLACEMENT = 'OCTANE_STRONG_DIRECTIVE_PLACEMENT';
const HOOK_LOCALITY = 'OCTANE_STRONG_HOOK_LOCALITY';
const EVENT_HANDLER_LOCALITY = 'OCTANE_STRONG_EVENT_HANDLER_LOCALITY';

describe('Strong mode immutable render inputs', () => {
	const component = (
		setup: string,
	) => `import { useState, useReducer, useLinkedState } from 'octane';
export function App(props) @{
  ${setup}
  <div />
}`;

	it.each([
		['property assignments', 'const [state] = useState({ count: 0 }); state.count = 1;'],
		['compound assignments', 'const [state] = useState({ count: 0 }); state.count += 1;'],
		['updates', 'const [state] = useState({ count: 0 }); state.count++;'],
		['deletions', 'const [state] = useState({ count: 0 }); delete state.count;'],
		[
			'destructuring assignment targets',
			'const [state] = useState({ count: 0 }); [state.count] = [1];',
		],
		[
			'nested property aliases',
			'const [state] = useState({ nested: { count: 0 } }); const nested = state.nested; const alias = nested; alias.count++;',
		],
		[
			'destructured property aliases',
			'const [state] = useState({ nested: { count: 0 } }); const { nested } = state; nested.count++;',
		],
		[
			'destructured snapshot properties',
			'const [{ nested }] = useState({ nested: { count: 0 } }); nested.count++;',
		],
		[
			'aliased tuple index access',
			'const tuple = useState({ count: 0 }); const pair = tuple; const index = 0 as const; pair[index].count++;',
		],
		[
			'object-pattern tuple access',
			'const tuple = useState({ count: 0 }); const { 0: state } = tuple; state.count++;',
		],
		[
			'reducer snapshots',
			'const [state] = useReducer((value) => value, { count: 0 }); state.count++;',
		],
		[
			'linked-state snapshots',
			'const [state] = useLinkedState(props.value, (value) => ({ count: value })); state.count++;',
		],
		[
			'synchronous helper parameters',
			'const [state] = useState({ count: 0 }); function mutate(value) { value.count++; } mutate({ count: 0 }); mutate(state);',
		],
		[
			'synchronous tuple parameters',
			'const tuple = useState({ count: 0 }); function mutate(pair) { pair[0].count++; } mutate(tuple);',
		],
		[
			'immediate callback parameters',
			'const [state] = useState({ count: 0 }); ((value) => { delete value.count; })(state);',
		],
	])('rejects render snapshot mutation through %s', (_label, setup) => {
		const source = component(setup);
		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
		expect(() => compile(`"use strong";\n${source}`, '/src/App.tsrx')).toThrow(
			RENDER_SNAPSHOT_MUTATION,
		);
	});

	it.each([
		'copyWithin(0, 1)',
		'fill(3)',
		'pop()',
		'push(3)',
		'reverse()',
		'shift()',
		'sort()',
		'splice(0, 1)',
		'unshift(3)',
	])('rejects %s on an array state snapshot during render', (call) => {
		const source = component(`const [items] = useState([2, 1]); items.${call};`);
		expect(() => compile(`"use strong";\n${source}`, '/src/App.tsrx')).toThrow(
			RENDER_SNAPSHOT_MUTATION,
		);
	});

	it('preserves array snapshot evidence through aliases and synchronous parameters', () => {
		const source = component(`const tuple = useState([2, 1]);
  const items = tuple[0];
  const alias = items;
  function reorder(values) { values['reverse'](); }
  reorder(alias);`);
		expect(() => compile(`"use strong";\n${source}`, '/src/App.tsrx')).toThrow(
			RENDER_SNAPSHOT_MUTATION,
		);
	});

	it('allows local copies, shadowed hooks, and snapshot methods without an array proof', () => {
		const source =
			component(`const [state] = useState({ count: 0, sort() { return 1; }, set() { return 2; } });
  const [items] = useState([2, 1]);
  const copy = { ...state };
  copy.count++;
  delete copy.count;
  const sorted = [...items];
  sorted.sort();
  state.sort();
  state.set();
  function mutate(value) { value.count++; }
  mutate({ count: 0 });
  function replace(value) { value = { count: 0 }; value.count++; }
  replace(state);
  {
    const useState = () => [{ count: 0 }];
    const [local] = useState();
    local.count++;
  }`);
		expect(() => compile(`"use strong";\n${source}`, '/src/App.tsrx')).not.toThrow();
	});

	it.each([
		['scalar updates', 'let index = 0;', 'index++;'],
		['member updates', 'const cursor = { position: 0 };', 'cursor.position++;'],
		['destructuring writes', 'let index = 0;', '[index] = [1];'],
		['known array mutations', 'const labels = [];', 'labels.push(item.label);'],
		['captured helper writes', 'let index = 0; function next() { index++; }', 'next();'],
	])(
		'rejects %s from a keyed row to a binding owned by its outer render scope',
		(_label, declaration, mutation) => {
			const source = `
export function App(props) @{
  ${declaration}
  <ul>
    @for (const item of props.items; key item.id) {
      ${mutation}
      <li>{item.label as string}</li>
    }
  </ul>
}`;
			expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
			const strong = `"use strong";${source}`;
			expect(() => compile(strong, '/src/App.tsrx')).toThrow(RETAINED_ROW_MUTATION);
			for (const options of [
				{ mode: 'client', dev: true },
				{ mode: 'client', dev: false },
				{ mode: 'server', dev: true },
				{ mode: 'server', dev: false },
			] as const) {
				expect(() => compile(source, '/src/App.tsrx', { ...options, strong: true })).toThrow(
					RETAINED_ROW_MUTATION,
				);
			}
			expect(compileToVolarMappings(strong, '/src/App.tsrx').diagnostics).toContainEqual(
				expect.objectContaining({ code: RETAINED_ROW_MUTATION, severity: 'error' }),
			);
		},
	);

	it('allows fresh mutable data in setup and inside one keyed row', () => {
		const source = `"use strong";
export function App(props) @{
  const labels = [];
  for (const item of props.items) labels.push(item.label);
  <ul data-labels={labels.join(',')}>
    @for (const item of props.items; key item.id) {
      var rowIndex = 0;
      rowIndex++;
      const local = { count: 0 };
      local.count++;
      <li>{(item.label + local.count + rowIndex) as string}</li>
    }
  </ul>
}`;
		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
	});

	it('keeps immutable event updates and local effect work legal', () => {
		const source = `"use strong";
import { useState, useEffect } from 'octane';
export function App() @{
  const [state, setState] = useState({ count: 0 });
  useEffect(() => { const local = { count: state.count }; local.count++; }, [state]);
  <button onClick={() => setState({ count: state.count + 1 })}>{state.count as string}</button>
}`;
		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
	});

	it.each([
		{ mode: 'client', dev: true },
		{ mode: 'client', dev: false },
		{ mode: 'server', dev: true },
		{ mode: 'server', dev: false },
	])('enforces snapshot mutation in $mode compilation with dev=$dev', (options) => {
		const source = component('const [state] = useState({ count: 0 }); state.count++;');
		expect(() => compile(source, '/src/App.tsrx', { ...options, strong: true } as any)).toThrow(
			RENDER_SNAPSHOT_MUTATION,
		);
	});

	it('locates snapshot writes in plain modules and editor diagnostics', () => {
		const setup = 'const [state] = useState({ count: 0 }); delete state.count;';
		const source = `"use strong";\n${component(setup)}`;
		const plain = `"use strong"; import { useState } from 'octane'; export function useCounter() { ${setup} return state; }`;
		const start = source.indexOf('state.count;');
		expect(() => slotHooks(plain, '/src/useCounter.ts')).toThrow(RENDER_SNAPSHOT_MUTATION);
		expect(compileToVolarMappings(source, '/src/App.tsrx').diagnostics).toContainEqual(
			expect.objectContaining({
				code: RENDER_SNAPSHOT_MUTATION,
				severity: 'error',
				start: expect.objectContaining({ offset: start }),
				end: expect.objectContaining({ offset: start + 'state.count'.length }),
			}),
		);
	});
});

describe('Strong mode nondeterministic render calls', () => {
	it.each([
		[
			'memo-wrapped arrows',
			'import { memo } from "octane"; export const App = memo(() => <div>{Date.now()}</div>);',
		],
		[
			'aliased memo imports',
			'import { memo as cached } from "octane"; export const App = cached(() => <div>{Date.now()}</div>);',
		],
		[
			'memo-wrapped null output',
			'import { memo } from "octane"; export const App = memo(() => { Date.now(); return null; });',
		],
		[
			'memo-wrapped named callbacks',
			'import { memo } from "octane"; const render = () => <div>{Date.now()}</div>; export const App = memo(render);',
		],
		[
			'namespace lazy wrappers',
			'import * as Octane from "octane"; export const App = Octane.lazy(() => <div>{Date.now()}</div>);',
		],
		[
			'wrapped default exports',
			'import { memo } from "octane"; export default memo(() => <div>{Date.now()}</div>);',
		],
		['anonymous default arrows', 'export default () => <div>{Date.now()}</div>;'],
		[
			'anonymous default functions',
			'export default function() { return <div>{Date.now()}</div>; }',
		],
	])('enforces nondeterministic render calls in %s', (_label, source) => {
		expect(() => compile(source, '/src/App.tsx')).not.toThrow();
		expect(() => compile(`"use strong";\n${source}`, '/src/App.tsx')).toThrow(RENDER_IMPURE_CALL);
	});

	it('does not treat shadowed memo utilities or lazy module loaders as component bodies', () => {
		const source = `"use strong";
import { lazy } from 'octane';
const memo = (callback) => callback;
const App = memo(() => <div>{Date.now()}</div>);
const Deferred = lazy(() => { Date.now(); return import('./Deferred'); });
export function Controls() { return <button onClick={App}>Create preview</button>; }`;
		expect(() => compile(source, '/src/App.tsx')).not.toThrow();
	});

	it('keeps uppercase initialization and event helpers outside render', () => {
		const source = `"use strong";
import { useState } from 'octane';
function InitialTime() { return Date.now(); }
function Clock() { this.started = Date.now(); }
export function App() {
  const [time] = useState(InitialTime);
  return <button onClick={() => new Clock()}>{time}</button>;
}`;
		expect(() => compile(source, '/src/App.tsx')).not.toThrow();
	});

	it.each(['Date.now()', 'Math.random()', 'performance.now()', 'new Date()', 'Date()'])(
		'rejects %s in render without changing compatibility mode',
		(expression) => {
			const source = `export function App() @{ const value = ${expression}; <div>{value as string}</div> }`;
			expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
			expect(() => compile(`"use strong";\n${source}`, '/src/App.tsrx')).toThrow(
				RENDER_IMPURE_CALL,
			);
		},
	);

	it('follows synchronous module helpers but leaves event-only helpers legal', () => {
		const helper = 'function readClock() { return Date["now"](); }';
		const render = `"use strong"; ${helper} export function App() @{ const value = readClock(); <div>{value as string}</div> }`;
		const event = `"use strong"; ${helper} export function App() @{ <button onClick={readClock}>Read clock</button> }`;
		expect(() => compile(render, '/src/App.tsrx')).toThrow(RENDER_IMPURE_CALL);
		expect(() => compile(event, '/src/App.tsrx')).not.toThrow();
	});

	it('allows diagnostic logging, deterministic dates, and lexically shadowed globals', () => {
		const source = `"use strong";
export function App({ Math, Date, performance }) @{
  const value = Math.random() + Date.now() + performance.now();
  console.log(value);
  <div />
}
export function Fixed() @{ const date = new Date(0); <div>{date.getTime() as string}</div> }`;
		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
	});

	it('allows standard calls in events, effects, and deferred callbacks', () => {
		const source = `"use strong";
import { useEffect } from 'octane';
export function App() @{
  useEffect(() => { Date.now(); Math.random(); performance.now(); }, []);
  setTimeout(() => new Date(), 0);
  <button onClick={() => Date.now()}>Read clock</button>
}`;
		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
	});

	it('allows time and randomness in lazy state initializers but not memo calculations', () => {
		// React permits non-idempotent state initialization; ordinary render
		// calculations still have to be repeatable for the same inputs.
		// https://react.dev/reference/rules/components-and-hooks-must-be-pure
		const source = `"use strong";
import { useState, useReducer, useMemo } from 'octane';
function initialTime() { return Date.now(); }
export function App() @{
  const [date] = useState(() => new Date());
  const [time] = useState(initialTime);
  const [seed] = useState(() => Math.random());
  const [stamp] = useReducer((value) => value, null, () => performance.now());
  <div />
}`;
		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
		const memo = source.replace(
			'const [time] = useState(initialTime);',
			'useMemo(initialTime, []);',
		);
		expect(() => compile(memo, '/src/App.tsrx')).toThrow(RENDER_IMPURE_CALL);
	});

	it('enforces named custom hooks in plain modules and JSX components', () => {
		const plain = '"use strong"; export function useClock() { return Date.now(); }';
		const jsx = '"use strong"; export const App = () => <div>{Math.random()}</div>;';
		expect(() => slotHooks(plain, '/src/useClock.ts')).toThrow(RENDER_IMPURE_CALL);
		expect(() => compile(jsx, '/src/App.tsx')).toThrow(RENDER_IMPURE_CALL);
		expect(compileToVolarMappings(jsx, '/src/App.tsx').diagnostics).toContainEqual(
			expect.objectContaining({ code: RENDER_IMPURE_CALL, severity: 'error' }),
		);
	});
});

function stateComponent(setup: string, imports = 'useState'): string {
	return `import { ${imports} } from 'octane';
export function Counter() @{
  const [count, setCount] = useState(0);
  ${setup}
  <button onClick={() => setCount(count + 1)}>{count as string}</button>
}`;
}

describe('Strong mode template locality', () => {
	const armState = `import { useState } from 'octane';
export function App(props) @{
  const [count, setCount] = useState(0);
  <div>
    @if (props.show) {
      <button onClick={() => setCount(count + 1)}>{count as string}</button>
    }
  </div>
}`;

	it('keeps a state hook at its parent across @if visibility changes', () => {
		const source = `"use strong";\n${armState}`;
		for (const mode of ['client', 'server'] as const) {
			expect(() => compile(armState, '/src/App.tsrx', { mode })).not.toThrow();
			expect(() => compile(source, '/src/App.tsrx', { mode })).not.toThrow();
		}
		expect(compileToVolarMappings(source, '/src/App.tsrx').diagnostics).toEqual([]);
	});

	it('keeps a parent effect with state used by one @if arm', () => {
		const source = `"use strong";
import { useEffect, useState } from 'octane';
export function App(props) @{
  const [count, setCount] = useState(0);
  useEffect(() => props.observe(count), [count]);
  <div>
    @if (props.show) {
      <button onClick={() => setCount(count + 1)}>{count as string}</button>
    }
  </div>
}`;
		for (const mode of ['client', 'server'] as const) {
			expect(() => compile(source, '/src/App.tsrx', { mode })).not.toThrow();
		}
		expect(compileToVolarMappings(source, '/src/App.tsrx').diagnostics).toEqual([]);
	});

	it('keeps parent state observed by an effect inside one @if arm', () => {
		const source = `"use strong";
import { useEffect, useState } from 'octane';
export function App(props) @{
  const [count] = useState(0);
  <div>@if (props.show) {
    useEffect(() => props.observe(count), [count]);
    <span>shown</span>
  }</div>
}`;
		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
		expect(compileToVolarMappings(source, '/src/App.tsrx').diagnostics).toEqual([]);
	});

	it('keeps state at the parent when an effect also observes parent-owned state', () => {
		const source = `"use strong";
import { useEffect, useState } from 'octane';
export function App(props) @{
  const [count, setCount] = useState(0);
  const [shared] = useState(0);
  useEffect(() => props.observe(count, shared), [count, shared]);
  <div>
    <output>{shared as string}</output>
    @if (props.show) { <button onClick={() => setCount(count + 1)}>{count as string}</button> }
  </div>
}`;
		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
	});

	it('keeps state at the parent when a second effect cannot move with it', () => {
		const source = `"use strong";
import { useEffect, useState } from 'octane';
export function App(props) @{
  const [count, setCount] = useState(0);
  const [shared] = useState(0);
  useEffect(() => props.observe(count), [count]);
  useEffect(() => props.observe(count, shared), [count, shared]);
  <div>
    <output>{shared as string}</output>
    @if (props.show) { <button onClick={() => setCount(count + 1)}>{count as string}</button> }
  </div>
}`;
		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
	});

	it('keeps chained effect dependencies together when one effect must stay at the parent', () => {
		const source = `"use strong";
import { useEffect, useState } from 'octane';
export function App(props) @{
  const [count, setCount] = useState(0);
  const [observed] = useState(0);
  const [shared] = useState(0);
  useEffect(() => props.observe(count, observed), [count, observed]);
  useEffect(() => props.observe(observed, shared), [observed, shared]);
  <div>
    <output>{shared as string}</output>
    @if (props.show) { <button onClick={() => setCount(count + 1)}>{count as string}</button> }
  </div>
}`;
		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
	});

	it('keeps an effect and all its state values at their original lifetime', () => {
		const source = `"use strong";
import { useEffect, useState } from 'octane';
export function App(props) @{
  const [count, setCount] = useState(0);
  const [observed] = useState(0);
  useEffect(() => props.observe(count, observed), [count, observed]);
  <div>@if (props.show) { <button onClick={() => setCount(count + 1)}>{count as string}</button> }</div>
}`;
		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
		expect(compileToVolarMappings(source, '/src/App.tsrx').diagnostics).toEqual([]);
	});

	it('keeps state observed by effects belonging to sibling arms in their common scope', () => {
		const source = `"use strong";
import { useEffect, useState } from 'octane';
export function App(props) @{
  const [left] = useState(0);
  const [right] = useState(0);
  const [shared] = useState(0);
  useEffect(() => props.observe(left, shared), [left, shared]);
  useEffect(() => props.observe(right, shared), [right, shared]);
  <div>
    @if (props.left) { <output>{left as string}</output> }
    @if (props.right) { <output>{right as string}</output> }
  </div>
}`;
		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
	});

	it('keeps effect-only values stable across nested arm lifetimes', () => {
		const source = `"use strong";
import { useEffect, useState } from 'octane';
export function App(props) @{
  const [outer] = useState(0);
  const [inner] = useState(0);
  const [shared] = useState(0);
  useEffect(() => props.observe(outer, shared), [outer, shared]);
  useEffect(() => props.observe(inner, shared), [inner, shared]);
  <div>@if (props.show) {
    <output>{outer as string}</output>
    @if (props.nested) { <output>{inner as string}</output> }
  }</div>
}`;
		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
		expect(compileToVolarMappings(source, '/src/App.tsrx').diagnostics).toEqual([]);
	});

	it('accepts hooks beside the template arm that owns them in client and server output', () => {
		const source = `import { useEffect, useState } from 'octane';
export function App(props) @{
  <div>
    @if (props.show) {
      const [count, setCount] = useState(0);
      useEffect(() => props.observe(count), [count]);
      <button onClick={() => setCount(count + 1)}>{count as string}</button>
    }
  </div>
}`;
		for (const mode of ['client', 'server'] as const) {
			const ordinary = compile(source, '/src/App.tsrx', { mode });
			const strong = compile(`"use strong";\n${source}`, '/src/App.tsrx', { mode });
			expect(strong.code).toContain('App');
			expect(strong.diagnostics).toEqual(ordinary.diagnostics);
		}
	});

	it.each([
		['@for', '@for (const item of props.items; key item.id) { <li>{count + item.id}</li> }'],
		['@case', '@switch (props.kind) { @case "one": { <li>{count as string}</li> } }'],
		['@try', '@try { <li>{count as string}</li> } @catch (error) { <li>error</li> }'],
		[
			'@if',
			'@if (props.kind === "one") { <li>one</li> } @else if (props.kind === "two") { <li>{count as string}</li> }',
		],
	])('keeps state stable across a single %s template arm', (_arm, template) => {
		const source = `"use strong";
import { useState } from 'octane';
export function App(props) @{
  const [count] = useState(0);
  <ul>${template}</ul>
}`;
		for (const mode of ['client', 'server'] as const) {
			expect(() => compile(source, '/src/App.tsrx', { mode })).not.toThrow();
		}
		expect(compileToVolarMappings(source, '/src/App.tsrx').diagnostics).toEqual([]);
	});

	it('keeps state at the common owner when root output or both branches use it', () => {
		const sources = [
			`"use strong";
import { useState } from 'octane';
export function App(props) @{
  const [count, setCount] = useState(0);
  <div>
    <output>{count as string}</output>
    @if (props.show) { <button onClick={() => setCount(count + 1)}>increment</button> }
  </div>
}`,
			`"use strong";
import { useState } from 'octane';
export function App(props) @{
  const [count, setCount] = useState(0);
  <div>
    @if (props.show) { <button onClick={() => setCount(count + 1)}>increment</button> }
    @else { <output>{count as string}</output> }
  </div>
}`,
		];
		for (const source of sources) {
			expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
		}
	});

	it('keeps list selection state above keyed rows and query state across @if remounts', () => {
		const sources = [
			`"use strong";
import { useState } from 'octane';
export function Choices(props) @{
  const [selected, setSelected] = useState(props.initial);
  <ul>@for (const choice of props.choices; key choice.id) {
    <li><button aria-pressed={selected === choice.id} onClick={() => setSelected(choice.id)}>{choice.label as string}</button></li>
  }</ul>
}`,
			`"use strong";
import { useState } from 'octane';
export function Search(props) @{
  const [query, setQuery] = useState('');
  <section>@if (props.visible) {
    <input value={query} onInput={(event) => setQuery(event.target.value)} />
  }</section>
}`,
		];
		for (const source of sources) {
			for (const mode of ['client', 'server'] as const) {
				expect(() => compile(source, '/src/App.tsrx', { mode })).not.toThrow();
			}
			expect(compileToVolarMappings(source, '/src/App.tsrx').diagnostics).toEqual([]);
		}
	});

	it('does not move root state through a nested template block inside an @if arm', () => {
		const source = `"use strong";
import { useState } from 'octane';
export function App(props) @{
  const [count] = useState(0);
  <div>@if (props.show) { @{ <span>{count as string}</span> } }</div>
}`;
		for (const mode of ['client', 'server'] as const) {
			expect(() => compile(source, '/src/App.tsrx', { mode })).not.toThrow();
		}
		expect(compileToVolarMappings(source, '/src/App.tsrx').diagnostics).toEqual([]);
	});

	it('diagnoses state and derived hooks together when only a nested block uses them', () => {
		const source = `"use strong";
import { useCallback, useMemo, useState } from 'octane';
export function App() @{
  const [count, setCount] = useState(0);
  const doubled = useMemo(() => count * 2, [count]);
  const increment = useCallback(() => setCount(count + 1), [count]);
  <div>@{ <button onClick={increment}>{doubled as string}</button> }</div>
}`;
		const diagnostics = compileToVolarMappings(source, '/src/App.tsrx').diagnostics;
		for (const hook of ['useState(0)', 'useMemo(', 'useCallback(']) {
			expect(diagnostics).toContainEqual(
				expect.objectContaining({
					code: HOOK_LOCALITY,
					start: expect.objectContaining({ offset: source.indexOf(hook) }),
				}),
			);
		}
		expect(() => compile(source, '/src/App.tsrx')).toThrow(HOOK_LOCALITY);
	});

	it('does not mistake a callback captured by a memo for a native event handler', () => {
		const source = `"use strong";
import { useMemo } from 'octane';
export function App(props) @{
  const handle = () => props.compute();
  const value = useMemo(() => handle, []);
  <div>@{ <span>{value.name as string}</span> }</div>
}`;
		const diagnostics = compileToVolarMappings(source, '/src/App.tsrx').diagnostics;
		expect(diagnostics.map(({ code }) => code)).toEqual([HOOK_LOCALITY]);
		expect(() => compile(source, '/src/App.tsrx')).toThrow(HOOK_LOCALITY);
	});

	it('moves each named event handler while shared state remains in its parent', () => {
		const source = `"use strong";
import { useState } from 'octane';
export function App() @{
  const [count, setCount] = useState(0);
  const left = () => setCount(count + 1);
  const right = () => setCount(count - 1);
  <div><output>{count as string}</output>
    @{ <button onClick={left}>+</button> }
    @{ <button onClick={right}>-</button> }
  </div>
}`;
		const diagnostics = compileToVolarMappings(source, '/src/App.tsrx').diagnostics;
		expect(diagnostics.map(({ code }) => code)).toEqual([
			EVENT_HANDLER_LOCALITY,
			EVENT_HANDLER_LOCALITY,
		]);
		expect(diagnostics.map(({ start }) => start.offset)).toEqual([
			source.indexOf('left ='),
			source.indexOf('right ='),
		]);
		const fixed = `"use strong";
import { useState } from 'octane';
export function App() @{
  const [count, setCount] = useState(0);
  <div><output>{count as string}</output>
    @{ const left = () => setCount(count + 1); <button {left}>+</button> }
    @{ const right = () => setCount(count - 1); <button {right}>-</button> }
  </div>
}`;
		for (const mode of ['client', 'server'] as const) {
			expect(() => compile(fixed, '/src/App.tsrx', { mode })).not.toThrow();
		}
		expect(compileToVolarMappings(fixed, '/src/App.tsrx').diagnostics).toEqual([]);
	});

	it('keeps a hook, its helper, and its effect together when a nested block uses its value', () => {
		const source = `"use strong";
import { useEffect, useState } from 'octane';
export function App(props) @{
  const [count] = useState(0);
  function observe() { props.record(count); }
  useEffect(observe, [count]);
  <div>@{ <output>{count as string}</output> }</div>
}`;
		const diagnostics = compileToVolarMappings(source, '/src/App.tsrx').diagnostics;
		for (const hook of ['useState(0)', 'useEffect(']) {
			expect(diagnostics).toContainEqual(
				expect.objectContaining({
					code: HOOK_LOCALITY,
					start: expect.objectContaining({ offset: source.indexOf(hook) }),
				}),
			);
		}
	});

	it('locates an event helper called indirectly from a nested block event', () => {
		const source = `"use strong";
export function App(props) @{
  const handle = () => props.onAction();
  <div>@{ <button onClick={() => handle()}>run</button> }</div>
}`;
		const start = source.indexOf('handle =');
		expect(compileToVolarMappings(source, '/src/App.tsrx').diagnostics).toContainEqual(
			expect.objectContaining({
				code: EVENT_HANDLER_LOCALITY,
				start: expect.objectContaining({ offset: start }),
			}),
		);
		expect(() => compile(source, '/src/App.tsrx')).toThrow(EVENT_HANDLER_LOCALITY);
	});

	it('treats JSX-returning callbacks as helpers and parenthesized components as boundaries', () => {
		const helper = `"use strong";
import { useState } from 'octane';
export function App() @{
  const [count] = useState(0);
  const renderLabel = () => (<span>{count as string}</span>);
  <div>@{ <section>{renderLabel()}</section> }</div>
}`;
		expect(compileToVolarMappings(helper, '/src/App.tsrx').diagnostics).toContainEqual(
			expect.objectContaining({
				code: HOOK_LOCALITY,
				start: expect.objectContaining({ offset: helper.indexOf('useState(0)') }),
			}),
		);
		const component = `"use strong";
import { useState } from 'octane';
export function App() @{
  const [count] = useState(0);
  const Child = () => (<span>{count as string}</span>);
  <div>@{ <Child /> }</div>
}`;
		for (const mode of ['client', 'server'] as const) {
			expect(() => compile(component, '/src/App.tsrx', { mode })).not.toThrow();
		}
		expect(compileToVolarMappings(component, '/src/App.tsrx').diagnostics).toEqual([]);
	});

	it('keeps a hook used by a parent custom effect hook above a nested block', () => {
		const source = `"use strong";
import { useEffect, useState } from 'octane';
function useObserve(value, observe) { useEffect(() => observe(value), [value]); }
export function App(props) @{
  const [count] = useState(0);
  useObserve(count, props.observe);
  <div>@{ <output>{count as string}</output> }</div>
}`;
		for (const mode of ['client', 'server'] as const) {
			expect(() => compile(source, '/src/App.tsrx', { mode })).not.toThrow();
		}
		expect(compileToVolarMappings(source, '/src/App.tsrx').diagnostics).toEqual([]);
	});

	it('recognizes the useFormState alias in nested block locality diagnostics', () => {
		const source = `"use strong";
import { useFormState } from 'octane';
export function App() @{
  const [count, increment] = useFormState((value) => value + 1, 0);
  <div>@{ <button onClick={() => increment()}>{count as string}</button> }</div>
}`;
		expect(compileToVolarMappings(source, '/src/App.tsrx').diagnostics).toContainEqual(
			expect.objectContaining({
				code: HOOK_LOCALITY,
				start: expect.objectContaining({ offset: source.indexOf('useFormState(') }),
			}),
		);
	});

	it.each([
		['import.meta', 'meta', 'const url = import.meta.url;'],
		['new.target', 'target', 'const constructor = new.target;'],
		['an accessor key', 'value', 'class Item { accessor value = 1; }'],
	])('does not treat %s syntax as a root read of similarly named state', (_label, name, setup) => {
		const source = `"use strong";
import { useState } from 'octane';
export function App() @{
  const [${name}] = useState(0);
  ${setup}
  <div>@{ <span>{${name} as string}</span> }</div>
}`;
		expect(compileToVolarMappings(source, '/src/App.tsrx').diagnostics).toContainEqual(
			expect.objectContaining({
				code: HOOK_LOCALITY,
				start: expect.objectContaining({ offset: source.indexOf('useState(0)') }),
			}),
		);
	});

	it('respects a var hoisted within a nested template block', () => {
		const source = `"use strong";
import { useState } from 'octane';
export function App(props) @{
  const [count] = useState(0);
  <div>@{
    if (props.ready) { var count = 1; }
    <span>{count as string}</span>
  }</div>
}`;
		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
		expect(compileToVolarMappings(source, '/src/App.tsrx').diagnostics).toEqual([]);
	});

	it.each([
		['an enum initializer', 'enum Choice { One = count }'],
		['a namespace initializer', 'namespace Choice { export const one = count; }'],
	])('counts a parent state read by %s', (_label, setup) => {
		const source = `"use strong";
import { useState } from 'octane';
export function App() @{
  const [count] = useState(0);
  ${setup}
  <div>@{ <span>{count as string}</span> }</div>
}`;
		for (const mode of ['client', 'server'] as const) {
			expect(() => compile(source, '/src/App.tsrx', { mode })).not.toThrow();
		}
		expect(compileToVolarMappings(source, '/src/App.tsrx').diagnostics).toEqual([]);
	});

	it.each([
		['a declaration default', 'const { selected = count } = props.value;'],
		['a computed declaration key', 'const { [count]: selected } = props.value;'],
		[
			'a nested parameter default',
			'function read({ selected = count } = props.value) { return selected; }',
		],
		[
			'a parameter default shadowed by a body local',
			'function read({ selected = count } = props.value) { const count = 1; return selected; }',
		],
		['a computed parameter key', 'function read({ [count]: selected }) { return selected; }'],
		[
			'a catch binding key',
			'try { props.run(); } catch ({ [count]: selected }) { props.observe(selected); }',
		],
	])('keeps state at its parent when read by %s', (_label, setup) => {
		const source = `"use strong";
import { useState } from 'octane';
export function App(props) @{
  const [count, setCount] = useState(0);
  ${setup}
  <div>@if (props.show) { <button onClick={() => setCount(count + 1)}>{count as string}</button> }</div>
}`;
		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
	});

	it('locates a handler declared outside the template block that owns its event', () => {
		const source = `"use strong";
export function App(props) @{
  const handle = () => props.onAction();
  <div>@{ <button onClick={handle}>run</button> }</div>
}`;
		const start = source.indexOf('handle =');
		let failure: unknown;
		try {
			compile(source, '/src/App.tsrx');
		} catch (error) {
			failure = error;
		}
		expect(failure).toMatchObject({
			code: EVENT_HANDLER_LOCALITY,
			filename: '/src/App.tsrx',
			pos: start,
		});
		expect((failure as Error).message).toMatch(
			/Move the handle handler into the @\{\} block at line 4, before the JSX event attribute that uses it\. Alternatively, define the callback inline at that event attribute/,
		);
		expect(compileToVolarMappings(source, '/src/App.tsrx').diagnostics).toContainEqual(
			expect.objectContaining({
				code: EVENT_HANDLER_LOCALITY,
				start: expect.objectContaining({ offset: start }),
				message: expect.stringMatching(/Move the handle handler.*Alternatively.*inline/),
			}),
		);
		expect(() => compile(source.replace('"use strong";\n', ''), '/src/App.tsrx')).not.toThrow();
	});

	it.each([
		['a shorthand event attribute', '{onClick}'],
		['an explicit event attribute', 'onClick={onClick}'],
	])('accepts a named handler beside %s in a template block', (_label, attribute) => {
		const source = `"use strong";
export function App(props) @{
  <div>@{
    const onClick = () => props.onAction();
    <button ${attribute}>run</button>
  }</div>
}`;
		for (const mode of ['client', 'server'] as const) {
			for (const dev of [true, false]) {
				expect(() => compile(source, '/src/App.tsrx', { mode, dev })).not.toThrow();
			}
		}
		expect(compileToVolarMappings(source, '/src/App.tsrx').diagnostics).toEqual([]);
	});

	it('accepts a named handler beside JSX in the root template and an @if arm', () => {
		const sources = [
			`"use strong";
export function App(props) @{
  const onClick = () => props.onAction();
  <div><button {onClick}>run</button>@{ <span>other block</span> }</div>
}`,
			`"use strong";
export function App(props) @{
  <div>@if (props.ready) {
    const onClick = () => props.onAction();
    <button {onClick}>run</button>
  }</div>
}`,
		];
		for (const source of sources) {
			expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
		}
	});

	it('locates a hook used only by derived markup in a nested template block', () => {
		const source = `"use strong";
import { useState } from 'octane';
export function App() @{
  const [label] = useState('ready');
  <div>@{
    const displayedLabel = label.toUpperCase();
    <span>{displayedLabel}</span>
  }</div>
}`;
		const start = source.indexOf("useState('ready')");
		expect(compileToVolarMappings(source, '/src/App.tsrx').diagnostics).toContainEqual(
			expect.objectContaining({
				code: HOOK_LOCALITY,
				start: expect.objectContaining({ offset: start }),
				message: expect.stringMatching(/useState.*@\{.*line/),
			}),
		);
		expect(() => compile(source, '/src/App.tsrx')).toThrow(HOOK_LOCALITY);
	});

	it('keeps a hook in root setup when ordinary JSX consumes it directly', () => {
		const source = `"use strong";
import { useState } from 'octane';
export function Label() @{
  const [label] = useState('ready');
  <div><span>{label as string}</span></div>
}`;
		for (const mode of ['client', 'server'] as const) {
			expect(() => compile(source, '/src/Label.tsrx', { mode })).not.toThrow();
		}
		expect(compileToVolarMappings(source, '/src/Label.tsrx').diagnostics).toEqual([]);
	});

	it('explains how to move state and its effect beside JSX in a nested template block', () => {
		const source = `"use strong";
import { useEffect, useState } from 'octane';
export function Counter({ title, observe }) @{
  const [count, setCount] = useState(0);
  useEffect(() => observe(count), [count]);
  <div>
    <h2>{title as string}</h2>
    @{
      const onClick = () => setCount(count + 1);
      <button {onClick}>{count as string}</button>
    }
  </div>
}`;
		const diagnostics = compileToVolarMappings(source, '/src/Counter.tsrx').diagnostics;
		expect(diagnostics.filter(({ code }) => code === HOOK_LOCALITY)).toHaveLength(2);
		expect(diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: HOOK_LOCALITY,
					start: expect.objectContaining({ offset: source.indexOf('useState(0)') }),
					message: expect.stringMatching(
						/Move useState into the @\{\} block at line 8, before the JSX or local effect that uses its value/,
					),
				}),
				expect.objectContaining({
					code: HOOK_LOCALITY,
					start: expect.objectContaining({ offset: source.indexOf('useEffect(') }),
					message: expect.stringMatching(
						/Move useEffect into the @\{\} block at line 8, beside the local hook values it reads and before that scope's JSX output/,
					),
				}),
			]),
		);
	});

	it('accepts hooks and effects beside their JSX in a nested template block', () => {
		const source = `"use strong";
import { useState, useEffect } from 'octane';
export function Counter({ title, observe }) @{
  <div>
    <h2>{title as string}</h2>
    @{
      const [count, setCount] = useState(0);
      useEffect(() => observe(count), [count]);
      const onClick = () => setCount(count + 1);
      <button {onClick}>{count as string}</button>
    }
  </div>
}`;
		for (const mode of ['client', 'server'] as const) {
			for (const dev of [true, false]) {
				expect(() => compile(source, '/src/App.tsrx', { mode, dev })).not.toThrow();
			}
		}
	});

	it('keeps a hook shared by separate template blocks at their parent', () => {
		const source = `"use strong";
import { useState } from 'octane';
export function App() @{
  const [count] = useState(0);
  <div>@{ <span>{count as string}</span> }@{ <output>{count as string}</output> }</div>
}`;
		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
	});

	it('keeps a handler shared by events in one arm at its parent', () => {
		const source = `"use strong";
export function App(props) @{
  const handle = () => props.onAction();
  <div>@if (props.show) { <button onClick={handle} onMouseDown={handle}>run</button> }</div>
}`;
		for (const mode of ['client', 'server'] as const) {
			expect(() => compile(source, '/src/App.tsrx', { mode })).not.toThrow();
		}
		expect(compileToVolarMappings(source, '/src/App.tsrx').diagnostics).toEqual([]);
	});

	it('keeps a one-site parent event handler through @if visibility changes', () => {
		const source = `"use strong";
export function App(props) @{
  const handle = () => props.onAction();
  <div>@if (props.show) { <button onClick={handle}>run</button> }</div>
}`;
		for (const mode of ['client', 'server'] as const) {
			expect(() => compile(source, '/src/App.tsrx', { mode })).not.toThrow();
		}
		expect(compileToVolarMappings(source, '/src/App.tsrx').diagnostics).toEqual([]);
	});

	it('keeps state through a local event handler or helper across an arm lifetime', () => {
		for (const [setup, use] of [
			['const handle = () => setCount(count + 1);', 'onClick={handle}'],
			['const handle = () => setCount(count + 1);', 'onClick={() => handle()}'],
			[
				'const label = () => count; const handle = () => setCount(label() + 1);',
				'onClick={handle}',
			],
		]) {
			const source = `"use strong";
import { useState } from 'octane';
export function App(props) @{
  const [count, setCount] = useState(0);
  ${setup}
  <div>@if (props.show) { <button ${use}>run</button> }</div>
}`;
			expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
		}
	});

	it('handles repeated helper fanout without expanding every call path', () => {
		const helpers = ['const h0 = () => count;'];
		for (let index = 1; index <= 18; index++) {
			helpers.push(`const h${index} = () => { h${index - 1}(); h${index - 1}(); };`);
		}
		const source = `"use strong";
import { useState } from 'octane';
export function App(props) @{
  const [count] = useState(0);
  ${helpers.join('\n  ')}
  <div>@if (props.show) { <button onClick={h18}>run</button> }</div>
}`;
		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
	});

	it('locates events through a long flat helper chain without exhausting the stack', () => {
		const length = 4_000;
		const helpers = ['const h0 = () => {};'];
		for (let index = 1; index <= length; index++) {
			helpers.push(`const h${index} = () => h${index - 1}();`);
		}
		const source = `"use strong";
export function App() @{
  ${helpers.join('\n  ')}
  <div>@{ <button onClick={h0}>first</button><button onClick={h${length}}>last</button> }</div>
}`;
		const diagnostics = compileToVolarMappings(source, '/src/App.tsrx').diagnostics;
		expect(diagnostics.filter(({ code }) => code === EVENT_HANDLER_LOCALITY)).toHaveLength(2);
		expect(diagnostics).toContainEqual(
			expect.objectContaining({
				code: EVENT_HANDLER_LOCALITY,
				start: expect.objectContaining({ offset: source.indexOf('h0 =') }),
			}),
		);
	});

	it('locates every event in a long chain of named handlers', () => {
		const length = 1_600;
		const helpers = ['const h0 = () => {};'];
		const buttons = ['<button onClick={h0}>0</button>'];
		for (let index = 1; index <= length; index++) {
			helpers.push(`const h${index} = () => h${index - 1}();`);
			buttons.push(`<button onClick={h${index}}>${index}</button>`);
		}
		const source = `"use strong";
export function App() @{
  ${helpers.join('\n  ')}
  <div>@{ <>${buttons.join('')}</> }</div>
}`;
		const diagnostics = compileToVolarMappings(source, '/src/App.tsrx').diagnostics;
		const eventDiagnostics = diagnostics.filter(({ code }) => code === EVENT_HANDLER_LOCALITY);
		expect(eventDiagnostics).toHaveLength(length + 1);
		for (const index of [0, Math.floor(length / 2), length]) {
			expect(eventDiagnostics).toContainEqual(
				expect.objectContaining({
					start: expect.objectContaining({ offset: source.indexOf(`h${index} =`) }),
				}),
			);
		}
	});

	it('keeps shared handler uses and recursive handler cycles in their common scope', () => {
		const shared = `"use strong";
export function App(props) @{
  const shared = () => props.action();
  const left = () => shared();
  const right = () => shared();
  <div>@{ <button onClick={left}>left</button> }@{ <button onClick={right}>right</button> }</div>
}`;
		const sharedDiagnostics = compileToVolarMappings(shared, '/src/App.tsrx').diagnostics;
		expect(sharedDiagnostics.map(({ code }) => code)).toEqual([
			EVENT_HANDLER_LOCALITY,
			EVENT_HANDLER_LOCALITY,
		]);
		expect(sharedDiagnostics.map(({ start }) => start.offset)).toEqual([
			shared.indexOf('left ='),
			shared.indexOf('right ='),
		]);

		const recursive = `"use strong";
export function App() @{
  const first = () => second();
  const second = () => first();
  <div>@{ <><button onClick={first}>first</button><button onClick={second}>second</button></> }</div>
}`;
		const recursiveDiagnostics = compileToVolarMappings(recursive, '/src/App.tsrx').diagnostics;
		expect(recursiveDiagnostics.map(({ code }) => code)).toEqual([
			EVENT_HANDLER_LOCALITY,
			EVENT_HANDLER_LOCALITY,
		]);
		expect(recursiveDiagnostics.map(({ start }) => start.offset)).toEqual([
			recursive.indexOf('first ='),
			recursive.indexOf('second ='),
		]);
	});

	it('keeps shared, forwarded, and imported callbacks available for events', () => {
		const sources = [
			`"use strong";
export function App(props) @{
  const handle = () => props.onAction();
  <div><button onClick={handle}>one</button>@{ <button onClick={handle}>two</button> }</div>
}`,
			`"use strong";
export function App(props) @{ <div><button onClick={props.onAction}>run</button>@{ <span>other block</span> }</div> }`,
			`"use strong";
import { onAction } from './actions';
export function App() @{ <div><button onClick={onAction}>run</button>@{ <span>other block</span> }</div> }`,
			`"use strong";
export function App(props) @{
  const handle = () => props.onAction();
  <div><button onClick={props.ready ? handle : props.onFallback}>run</button>@{ <span>other block</span> }</div>
}`,
			`"use strong";
function Dialog(props) @{ <button onClick={props.onClose}>close</button> }
export function App(props) @{
  const handle = () => props.onAction();
  <div><Dialog onClose={handle} />@{ <span>other block</span> }</div>
}`,
		];
		for (const source of sources) {
			expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
		}
	});

	it.each([
		[
			'an aliased import',
			"import { useState as useCounterState } from 'octane';",
			'useCounterState',
		],
		['a namespace import', "import * as Octane from 'octane';", 'Octane.useState'],
	])('keeps %s state at the parent of an arm', (_label, declaration, callee) => {
		const source = `"use strong";
${declaration}
export function App(props) @{
  const [count, setCount] = ${callee}(0);
  <div>
    @if (props.show) { <button onClick={() => setCount(count + 1)}>{count as string}</button> }
  </div>
}`;
		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
	});

	it('does not mistake a shadowed function for an Octane hook', () => {
		const source = `"use strong";
import { useState } from 'octane';
export function App(props) @{
  const useState = (initial) => [initial, () => {}];
  const [count, setCount] = useState(0);
  <div>@{ <button onClick={() => setCount(count + 1)}>{count as string}</button> }</div>
}`;
		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
	});

	it('does not mistake a hoisted local var for an imported hook', () => {
		const source = `"use strong";
import { useState } from 'octane';
export function App(props) @{
  if (true) { var useState = (value) => [value, () => {}]; }
  const [count, setCount] = useState(0);
  <div>@{ <button onClick={() => setCount(count + 1)}>{count as string}</button> }</div>
}`;
		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
	});

	it('does not hoist a nested template var into the parent hook scope', () => {
		const source = `"use strong";
import { useState } from 'octane';
export function App(props) @{
  const [count] = useState(0);
  <div>@{ var useState = () => 1; <span>{count as string}</span> }</div>
}`;
		expect(() => compile(source, '/src/App.tsrx')).toThrow(HOOK_LOCALITY);
	});

	it.each([
		'try { throw 1; } catch (count) { props.observe(count); }',
		'for (const count of props.items) { props.observe(count); }',
		'for (let count = 0; count < props.items.length; count++) { props.observe(count); }',
		'switch (props.kind) { case "one": const count = 1; props.observe(count); break; default: break; }',
		'const C = class { count = 1; countMethod() { return 1; } };',
		'const C = class count { value() { return count; } };',
		'const C = class { static { let count = 1; props.observe(count); } };',
		'count: { break count; }',
	])('respects shadowing in JavaScript control flow: %s', (setup) => {
		const source = `"use strong";
import { useState } from 'octane';
export function App(props) @{
  const [count] = useState(0);
  <div>@{ ${setup} <span /> }</div>
}`;
		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
	});

	it('keeps a state-derived component tag at its parent owner', () => {
		for (const tag of ['Component', 'pkg.Component']) {
			const source = `"use strong";
import { useState } from 'octane';
export function App(props) @{
  const [${tag.split('.')[0]}] = useState(() => props.Component);
  <div>@if (props.show) { <${tag} /> }</div>
}`;
			expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
		}
	});

	it('keeps a parent state hook independent of an @for index with the same name', () => {
		const source = `"use strong";
import { useState } from 'octane';
export function App(props) @{
  const [index] = useState(0);
  <ul>@for (const item of props.items; index index; key item.id) { <li>{index as string}</li> }</ul>
}`;
		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
	});

	it.each([
		'function Child() @{ <span>{count as string}</span> }',
		'function Child() { return <span>{count as string}</span>; }',
		'function Child() { if (props.ready) return <span>{count as string}</span>; return <i />; }',
		'const Child = () => props.ready ? <span>{count as string}</span> : <i />;',
		'const Child = () => { const view = <span>{count as string}</span>; return view; };',
	])('keeps parent state captured by a nested component at its original owner', (child) => {
		const source = `"use strong";
import { useState } from 'octane';
export function App(props) @{
  const [count] = useState(0);
  ${child}
  <div>@if (props.show) { <Child /> }</div>
}`;
		for (const mode of ['client', 'server'] as const) {
			expect(() => compile(source, '/src/App.tsrx', { mode })).not.toThrow();
		}
	});

	it('recognizes capture events but leaves lowercase native attributes alone', () => {
		const source = `"use strong";
export function App(props) @{
  const handle = () => props.onAction();
  <div>@{ <button onClickCapture={handle}>run</button> }</div>
}`;
		expect(() => compile(source, '/src/App.tsrx')).toThrow(EVENT_HANDLER_LOCALITY);
		expect(() =>
			compile(source.replace('onClickCapture', 'onclick'), '/src/App.tsrx'),
		).not.toThrow();
	});

	it.each([
		{ mode: 'client', dev: true },
		{ mode: 'client', dev: false },
		{ mode: 'server', dev: true },
		{ mode: 'server', dev: false },
	])('enforces nested template locality in $mode compilation with dev=$dev', (options) => {
		const state = `"use strong";
import { useState } from 'octane';
export function App() @{
  const [count] = useState(0);
  <div>@{ <span>{count as string}</span> }</div>
}`;
		expect(() => compile(state, '/src/App.tsrx', options)).toThrow(HOOK_LOCALITY);
		const event = `"use strong";
export function App(props) @{
  const handle = () => props.onAction();
  <div>@{ <button onClick={handle}>run</button> }</div>
}`;
		expect(() => compile(event, '/src/App.tsrx', options)).toThrow(EVENT_HANDLER_LOCALITY);
	});
});

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
		['sequence-selected setters', '(props.trace, setCount)(count + 1);'],
		['conditional setters', '(props.enabled ? setCount : (value) => value)(count + 1);'],
		['logically selected setters', '(props.update ?? setCount)(count + 1);'],
		[
			'named sequence-selected setters',
			'const selected = (props.trace, setCount); selected(count + 1);',
		],
		[
			'aliased sequence-selected callback bodies',
			'const selected = (props.trace, () => setCount(count + 1)); const alias = selected; alias();',
		],
		[
			'named logical callback choices',
			'const selected = props.update || setCount; selected(count + 1);',
		],
		[
			'sequence-selected state tuple updaters',
			'const tuple = useState(0); (props.trace, tuple[1])(1);',
		],
	])('rejects immediately invoked %s', (_label, setup) => {
		const source = `"use strong";
import { useState } from 'octane';
export function App(props) @{
  const [count, setCount] = useState(0);
  ${setup}
  <div />
}`;

		expect(() => compile(source, '/src/App.tsrx')).toThrow(RENDER_STATE_UPDATE);
	});

	it('rejects ref writes from immediately invoked selected callback bodies', () => {
		const source = `"use strong";
import { useRef } from 'octane';
export function App(props) @{
  const ref = useRef(0);
  const selected = (props.trace, () => { ref.current = 1; });
  selected();
  <div />
}`;

		expect(() => compile(source, '/src/App.tsrx')).toThrow(RENDER_REF_WRITE);
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
		['inline state initializers', 'useState(() => { setCount(count + 1); return count; });'],
		[
			'named state initializers',
			'function initialize() { setCount(count + 1); return count; } useState(initialize);',
		],
		[
			'aliased state initializers',
			'const initialize = () => setCount(count + 1); const initial = initialize; useState(initial);',
		],
		['state updaters passed as initializers', 'useState(setCount);'],
		[
			'state tuple updaters passed as initializers',
			'const tuple = useState(0); useState(tuple[1]);',
		],
		[
			'inline linked-state reconcilers',
			'useLinkedState(count, (value) => { setCount(value + 1); return value; });',
		],
		[
			'named linked-state reconcilers',
			'function reconcile(value) { setCount(value + 1); return value; } useLinkedState(count, reconcile);',
		],
		[
			'aliased linked-state reconcilers',
			'const reconcile = (value) => setCount(value); const calculate = reconcile; useLinkedState(count, calculate);',
		],
		['state updaters passed as linked-state reconcilers', 'useLinkedState(count, setCount);'],
		[
			'inline source comparators',
			'useLinkedState(count, (value) => value, { sourceEqual: (previous, next) => { setCount(next); return previous === next; } });',
		],
		[
			'inline value comparators',
			'useLinkedState(count, (value) => value, { valueEqual: (previous, next) => { setCount(next); return previous === next; } });',
		],
		[
			'named source comparators',
			'function compare(previous, next) { setCount(next); return previous === next; } useLinkedState(count, (value) => value, { sourceEqual: compare });',
		],
		[
			'aliased value comparators',
			'const compare = (previous, next) => setCount(next); const equal = compare; useLinkedState(count, (value) => value, { valueEqual: equal });',
		],
		[
			'state updaters passed as source comparators',
			'useLinkedState(count, (value) => value, { sourceEqual: setCount });',
		],
		[
			'source comparator methods',
			'useLinkedState(count, (value) => value, { sourceEqual(previous, next) { setCount(next); return previous === next; } });',
		],
		[
			'wrapped computed comparator names',
			"useLinkedState(count, (value) => value, { ['valueEqual' as const]: (previous, next) => { setCount(next); return previous === next; } });",
		],
		[
			'named comparator options',
			'const options = { sourceEqual: (previous, next) => { setCount(next); return previous === next; } }; useLinkedState(count, (value) => value, options);',
		],
		[
			'aliased comparator options',
			'const options = { valueEqual: (previous, next) => { setCount(next); return previous === next; } }; const comparisons = options; useLinkedState(count, (value) => value, comparisons);',
		],
	])('rejects render updates from %s', (_label, setup) => {
		const source = `"use strong";\n${stateComponent(setup, 'useState, useLinkedState')}`;

		expect(() => compile(source, '/src/Counter.tsrx')).toThrow(RENDER_STATE_UPDATE);
	});

	it.each([
		[
			'inline options spreads',
			'useLinkedState(count, (value) => value, { ...{ sourceEqual: (previous, next) => { setCount(next); return previous === next; } } });',
		],
		[
			'named options spreads',
			'const options = { valueEqual: (previous, next) => { setCount(next); return previous === next; } }; useLinkedState(count, (value) => value, { ...options });',
		],
		[
			'aliased and nested options spreads',
			'const compare = (previous, next) => { setCount(next); return previous === next; }; const options = { sourceEqual: compare }; const alias = options; const spread = { ...alias }; useLinkedState(count, (value) => value, { ...spread });',
		],
		[
			'options spreads overriding an earlier comparator',
			'const options = { sourceEqual: setCount }; useLinkedState(count, (value) => value, { sourceEqual: Object.is, ...options });',
		],
		[
			'inline conditional linked-state reconcilers',
			'useLinkedState(count, count > 0 ? (value) => value : (value) => { setCount(value); return value; });',
		],
		[
			'named conditional linked-state reconcilers',
			'const reconcile = count > 0 ? (value) => { setCount(value); return value; } : (value) => value; useLinkedState(count, reconcile);',
		],
		[
			'aliased conditional linked-state reconcilers',
			'const reconcile = (value) => { setCount(value); return value; }; const selected = count > 0 ? Object.is : reconcile; const alias = selected; useLinkedState(count, alias);',
		],
		[
			'conditional state initializers',
			'useState(count > 0 ? () => count : () => setCount(count + 1));',
		],
		[
			'inline conditional linked-state comparators',
			'useLinkedState(count, (value) => value, { sourceEqual: count > 0 ? Object.is : (previous, next) => { setCount(next); return previous === next; } });',
		],
		[
			'named conditional linked-state comparators',
			'const compare = count > 0 ? Object.is : (previous, next) => { setCount(next); return previous === next; }; useLinkedState(count, (value) => value, { valueEqual: compare });',
		],
		[
			'conditional linked-state options',
			'useLinkedState(count, (value) => value, count > 0 ? { sourceEqual: Object.is } : { sourceEqual: setCount });',
		],
		[
			'named conditional linked-state options',
			'const options = count > 0 ? { valueEqual: Object.is } : { valueEqual: setCount }; useLinkedState(count, (value) => value, options);',
		],
		[
			'conditional linked-state option spreads',
			'const options = count > 0 ? { sourceEqual: Object.is } : { sourceEqual: setCount }; useLinkedState(count, (value) => value, { ...options });',
		],
		[
			'named computed source comparators',
			"const key = 'sourceEqual'; useLinkedState(count, (value) => value, { [key]: setCount });",
		],
		[
			'aliased computed value comparators',
			"const key = 'valueEqual' as const; const alias = key; useLinkedState(count, (value) => value, { [alias]: setCount });",
		],
		[
			'computed template-literal comparators',
			'useLinkedState(count, (value) => value, { [`sourceEqual`]: setCount });',
		],
	])('rejects render updates hidden by %s', (_label, setup) => {
		const source = `"use strong";\n${stateComponent(setup, 'useState, useLinkedState')}`;

		expect(() => compile(source, '/src/Counter.tsrx')).toThrow(RENDER_STATE_UPDATE);
	});

	it.each([
		[
			'lazy state initializers',
			'const tuple = useState(0); const update = tuple[1]; useState(update);',
		],
		[
			'chained setter aliases',
			'const tuple = useState(0); const update = tuple[1]; const alias = update; useState(alias);',
		],
		[
			'TypeScript-wrapped tuple indexes',
			'const tuple = useState(0); const update = tuple[1 as const]; useState(update);',
		],
		[
			'immutable numeric tuple indexes',
			'const tuple = useState(0); const index = 1; const update = tuple[index]; useState(update);',
		],
		[
			'immutable string tuple indexes',
			'const tuple = useState(0); const index = "1"; const update = tuple[index]; useState(update);',
		],
		[
			'immutable template tuple indexes',
			'const tuple = useState(0); const index = `1`; const update = tuple[index]; useState(update);',
		],
		[
			'immutable concatenated tuple indexes',
			'const tuple = useState(0); const index = "" + "1"; const update = tuple[index]; useState(update);',
		],
		[
			'aliased concatenated tuple index fragments',
			'const tuple = useState(0); const fragment = "" + ""; const index = fragment + "1"; const update = tuple[index]; useState(update);',
		],
		[
			'immutable numeric addition tuple indexes',
			'const tuple = useState(0); const index = 0 + 1; const update = tuple[index]; useState(update);',
		],
		[
			'immutable unary numeric tuple indexes',
			'const tuple = useState(0); const index = +1; const update = tuple[index]; useState(update);',
		],
		[
			'immutable boolean-coerced tuple indexes',
			'const tuple = useState(0); const enabled = !false; const index = +enabled; const update = tuple[index]; useState(update);',
		],
		[
			'immutable mixed string and numeric tuple indexes',
			'const tuple = useState(0); const index = "" + 1; const update = tuple[index]; useState(update);',
		],
		[
			'sequence-selected concatenated tuple indexes',
			'const tuple = useState(0); const index = (props.trace, "" + "1"); const update = tuple[index]; useState(update);',
		],
		[
			'conditionally selected concatenated tuple indexes',
			'const tuple = useState(0); const index = true ? "" + "1" : "0"; const update = tuple[index]; useState(update);',
		],
		[
			'logically selected concatenated tuple indexes',
			'const tuple = useState(0); const index = "" || ("" + "1"); const update = tuple[index]; useState(update);',
		],
		[
			'inline template tuple indexes',
			'const tuple = useState(0); const update = tuple[`1`]; useState(update);',
		],
		[
			'object-pattern tuple setter aliases',
			'const tuple = useState(0); const { 1: update } = tuple; useState(update);',
		],
		[
			'computed object-pattern tuple setter aliases',
			'const tuple = useState(0); const index = 1; const { [index]: update } = tuple; useState(update);',
		],
		[
			'computed concatenated object-pattern tuple setter aliases',
			'const tuple = useState(0); const index = "" + "1"; const { [index]: update } = tuple; useState(update);',
		],
		[
			'TypeScript-wrapped setter aliases',
			'const tuple = useState(0); const update = tuple[1] as (value: number) => void; useState(update);',
		],
		[
			'direct setter invocation',
			'const tuple = useState(0); const update = tuple[1]; update(count + 1);',
		],
		[
			'lazy reducer initializers',
			'const tuple = useState(0); const update = tuple[1]; useReducer((value) => value, count, update);',
		],
		[
			'linked-state reconcilers',
			'const tuple = useState(0); const update = tuple[1]; useLinkedState(count, update);',
		],
		[
			'linked-state comparators',
			'const tuple = useState(0); const update = tuple[1]; useLinkedState(count, (value) => value, { sourceEqual: update });',
		],
		[
			'reducer dispatch aliases',
			'const tuple = useReducer((value) => value, 0); const update = tuple[1]; useState(update);',
		],
		[
			'linked-state setter aliases',
			'const tuple = useLinkedState(count, (value) => value); const update = tuple[1]; useState(update);',
		],
	])('rejects render updates through aliased tuple setters in %s', (_label, setup) => {
		const source = `"use strong";
import { useLinkedState, useReducer, useState } from 'octane';
export function App(props) @{
  const [count] = useState(0);
  ${setup}
  <div />
}`;

		expect(() => compile(source, '/src/App.tsrx')).toThrow(RENDER_STATE_UPDATE);
	});

	it.each([
		[
			'named template source comparator keys',
			'const key = `sourceEqual`; useLinkedState(count, (value) => value, { [key]: setCount });',
		],
		[
			'named template value comparator keys',
			'const key = `valueEqual`; useLinkedState(count, (value) => value, { [key]: setCount });',
		],
		[
			'aliased template comparator keys',
			'const key = `sourceEqual`; const alias = key; useLinkedState(count, (value) => value, { [alias]: setCount });',
		],
		[
			'TypeScript-wrapped template comparator keys',
			'const key = `valueEqual` as const; useLinkedState(count, (value) => value, { [key]: setCount });',
		],
		[
			'statically concatenated comparator keys',
			'const key = "source" + "Equal"; useLinkedState(count, (value) => value, { [key]: setCount });',
		],
		[
			'aliased concatenated source comparator fragments',
			'const prefix = "sou" + "rce"; const key = prefix + "Equal"; useLinkedState(count, (value) => value, { [key]: setCount });',
		],
		[
			'aliased concatenated value comparator fragments',
			'const suffix = "Equ" + "al"; const key = "value" + suffix; useLinkedState(count, (value) => value, { [key]: setCount });',
		],
		[
			'chained concatenated comparator fragments',
			'const first = "so" + "u"; const second = first + "rce"; const key = `${second}Equal`; useLinkedState(count, (value) => value, { [key]: setCount });',
		],
		[
			'sequence-selected concatenated comparator fragments',
			'const prefix = (props.trace, "sou" + "rce"); const key = `${prefix}Equal`; useLinkedState(count, (value) => value, { [key]: setCount });',
		],
		[
			'conditionally selected concatenated comparator fragments',
			'const prefix = true ? "sou" + "rce" : "other"; const key = prefix + "Equal"; useLinkedState(count, (value) => value, { [key]: setCount });',
		],
		[
			'logically selected concatenated comparator fragments',
			'const prefix = null ?? ("sou" + "rce"); const key = prefix + "Equal"; useLinkedState(count, (value) => value, { [key]: setCount });',
		],
		[
			'falsy concatenated comparator selection flags',
			'const disabled = "" + ""; const key = disabled ? "other" : "valueEqual"; useLinkedState(count, (value) => value, { [key]: setCount });',
		],
		[
			'inline statically concatenated comparator keys',
			'useLinkedState(count, (value) => value, { ["value" + "Equal"]: setCount });',
		],
		[
			'statically interpolated comparator keys',
			'const key = `source${"Equal"}`; useLinkedState(count, (value) => value, { [key]: setCount });',
		],
		[
			'sequence-selected comparator keys',
			'const key = (props.trace, "sourceEqual"); useLinkedState(count, (value) => value, { [key]: setCount });',
		],
		[
			'known conditional comparator keys',
			'const key = true ? "valueEqual" : "other"; useLinkedState(count, (value) => value, { [key]: setCount });',
		],
		[
			'known logical comparator keys',
			'const key = null ?? "sourceEqual"; useLinkedState(count, (value) => value, { [key]: setCount });',
		],
		[
			'template-keyed spread comparators',
			'const key = `sourceEqual`; const options = { [key]: setCount }; useLinkedState(count, (value) => value, { ...options });',
		],
		[
			'fragment-keyed spread comparators',
			'const prefix = "sou" + "rce"; const key = `${prefix}Equal`; const options = { [key]: setCount }; useLinkedState(count, (value) => value, { ...options });',
		],
		[
			'template-keyed aliased tuple comparators',
			'const tuple = useState(0); const update = tuple[1]; const key = `valueEqual`; useLinkedState(count, (value) => value, { [key]: update });',
		],
	])('rejects render updates hidden by %s', (_label, setup) => {
		const source = `"use strong";
import { useLinkedState, useState } from 'octane';
export function App(props) @{
  const [count, setCount] = useState(0);
  ${setup}
  <div />
}`;

		expect(() => compile(source, '/src/App.tsrx')).toThrow(RENDER_STATE_UPDATE);
	});

	it.each([
		['nullish state initializers', 'useState(props.initialize ?? (() => setCount(count + 1)));'],
		['logical OR state initializers', 'useState(props.initialize || (() => setCount(count + 1)));'],
		['logical AND state initializers', 'useState(props.enabled && (() => setCount(count + 1)));'],
		[
			'named and aliased nullish state initializers',
			'const fallback = () => setCount(count + 1); const initialize = props.initialize ?? fallback; const alias = initialize; useState(alias);',
		],
		[
			'logical reducer initializers',
			'useReducer((value) => value, count, props.initialize ?? setCount);',
		],
		['logical memo callbacks', 'useMemo(props.calculate || (() => setCount(count + 1)), [count]);'],
		['nullish linked-state reconcilers', 'useLinkedState(count, props.reconcile ?? setCount);'],
		[
			'named and aliased logical OR reconcilers',
			'const reconcile = props.reconcile || setCount; const alias = reconcile; useLinkedState(count, alias);',
		],
		['logical AND linked-state reconcilers', 'useLinkedState(count, props.enabled && setCount);'],
		[
			'nested logical and conditional reconcilers',
			'const reconcile = props.reconcile ?? (props.enabled ? Object.is : setCount); useLinkedState(count, reconcile);',
		],
		[
			'nullish source comparators',
			'useLinkedState(count, (value) => value, { sourceEqual: props.compare ?? setCount });',
		],
		[
			'named and aliased logical OR value comparators',
			'const compare = props.compare || setCount; const alias = compare; useLinkedState(count, (value) => value, { valueEqual: alias });',
		],
		[
			'logical AND source comparators',
			'useLinkedState(count, (value) => value, { sourceEqual: props.enabled && setCount });',
		],
		[
			'nullish linked-state options',
			'useLinkedState(count, (value) => value, props.options ?? { sourceEqual: setCount });',
		],
		[
			'named and aliased logical OR linked-state options',
			'const options = props.options || { valueEqual: setCount }; const alias = options; useLinkedState(count, (value) => value, alias);',
		],
		[
			'nullable logical linked-state option aliases',
			'const maybe = props.enabled && { sourceEqual: Object.is }; const options = maybe || { sourceEqual: setCount }; useLinkedState(count, (value) => value, options);',
		],
		[
			'nullable conditional linked-state option aliases',
			'const maybe = props.enabled ? { sourceEqual: Object.is } : null; const options = maybe ?? { sourceEqual: setCount }; useLinkedState(count, (value) => value, options);',
		],
		[
			'nullable linked-state option alias spreads',
			'const maybe = props.enabled ? { sourceEqual: Object.is } : null; useLinkedState(count, (value) => value, { ...(maybe || { sourceEqual: setCount }) });',
		],
		[
			'logical AND linked-state options',
			'useLinkedState(count, (value) => value, props.enabled && { sourceEqual: setCount });',
		],
		[
			'nullish linked-state option spreads',
			'useLinkedState(count, (value) => value, { ...(props.options ?? { sourceEqual: setCount }) });',
		],
		[
			'logical AND linked-state option spreads',
			'useLinkedState(count, (value) => value, { ...(props.enabled && { valueEqual: setCount }) });',
		],
		[
			'nested logical linked-state options',
			'const options = props.options ?? (props.enabled && { sourceEqual: setCount }); useLinkedState(count, (value) => value, { ...options });',
		],
		[
			'conditionally overridden earlier comparators',
			'useLinkedState(count, (value) => value, { sourceEqual: setCount, ...(props.enabled && { sourceEqual: Object.is }) });',
		],
		[
			'logical state-tuple updater fallbacks',
			'const tuple = useState(0); useState(props.initialize ?? tuple[1]);',
		],
	])('rejects render updates hidden by logical %s', (_label, setup) => {
		const source = `"use strong";
import { useLinkedState, useMemo, useReducer, useState } from 'octane';
export function App(props) @{
  const [count, setCount] = useState(0);
  ${setup}
  <div />
}`;

		expect(() => compile(source, '/src/App.tsrx')).toThrow(RENDER_STATE_UPDATE);
	});

	it.each([
		['state initializer values', 'useState((props.trace, setCount));'],
		['inline state initializer callbacks', 'useState((props.trace, () => setCount(count + 1)));'],
		[
			'named and aliased state initializers',
			'const initialize = (props.trace, setCount); const alias = initialize; useState(alias);',
		],
		['nested state initializer sequences', 'useState((props.first, (props.second, setCount)));'],
		['reducer initializers', 'useReducer((value) => value, count, (props.trace, setCount));'],
		['memo callbacks', 'useMemo((props.trace, setCount), [count]);'],
		['linked-state reconcilers', 'useLinkedState(count, (props.trace, setCount));'],
		[
			'source comparators',
			'useLinkedState(count, (value) => value, { sourceEqual: (props.trace, setCount) });',
		],
		[
			'named value comparators',
			'const compare = (props.trace, setCount); useLinkedState(count, (value) => value, { valueEqual: compare });',
		],
		[
			'linked-state options',
			'useLinkedState(count, (value) => value, (props.trace, { sourceEqual: setCount }));',
		],
		[
			'named and aliased linked-state options',
			'const options = (props.trace, { valueEqual: setCount }); const alias = options; useLinkedState(count, (value) => value, alias);',
		],
		[
			'linked-state option spreads',
			'useLinkedState(count, (value) => value, { ...(props.trace, { sourceEqual: setCount }) });',
		],
		[
			'nested logical linked-state options',
			'useLinkedState(count, (value) => value, props.options ?? (props.trace, { valueEqual: setCount }));',
		],
		[
			'state-tuple updater results',
			'const tuple = useState(0); useState((props.trace, tuple[1]));',
		],
		['immediately executed earlier operands', 'useState((setCount(count + 1), () => count));'],
	])('rejects render updates from sequence-selected %s', (_label, setup) => {
		const source = `"use strong";
import { useLinkedState, useMemo, useReducer, useState } from 'octane';
export function App(props) @{
  const [count, setCount] = useState(0);
  ${setup}
  <div />
}`;

		expect(() => compile(source, '/src/App.tsrx')).toThrow(RENDER_STATE_UPDATE);
	});

	it.each([
		[
			'inline reducer initializers',
			'useReducer((value) => value, count, () => { setCount(count + 1); return count; });',
		],
		[
			'named reducer initializers',
			'const initialize = () => setCount(count + 1); useReducer((value) => value, count, initialize);',
		],
		[
			'conditional reducer initializers',
			'useReducer((value) => value, count, count > 0 ? () => count : setCount);',
		],
	])('rejects render updates from lazy %s', (_label, setup) => {
		const source = `"use strong";\n${stateComponent(setup, 'useState, useReducer')}`;

		expect(() => compile(source, '/src/Counter.tsrx')).toThrow(RENDER_STATE_UPDATE);
	});

	it.each([
		['state initializers', 'useState(() => { ref.current = 1; return 0; });'],
		[
			'linked-state reconcilers',
			'useLinkedState(0, (value) => { ref.current = value; return value; });',
		],
		[
			'source comparators',
			'useLinkedState(0, (value) => value, { sourceEqual: (previous, next) => { ref.current = next; return previous === next; } });',
		],
		[
			'value comparator methods',
			'useLinkedState(0, (value) => value, { valueEqual(previous, next) { ref.current = next; return previous === next; } });',
		],
		[
			'aliased named comparators',
			'const compare = (previous, next) => { ref.current = next; return previous === next; }; const equal = compare; useLinkedState(0, (value) => value, { sourceEqual: equal });',
		],
		[
			'named comparator options',
			'const options = { valueEqual: (previous, next) => { ref.current = next; return previous === next; } }; useLinkedState(0, (value) => value, options);',
		],
		[
			'spread comparator options',
			'const options = { sourceEqual: (previous, next) => { ref.current = next; return previous === next; } }; useLinkedState(0, (value) => value, { ...options });',
		],
		[
			'conditional reconcilers',
			'useLinkedState(0, ref.current ? (value) => value : (value) => { ref.current = value; return value; });',
		],
		[
			'named computed comparators',
			"const key = 'valueEqual'; useLinkedState(0, (value) => value, { [key]: (previous, next) => { ref.current = next; return previous === next; } });",
		],
		[
			'lazy reducer initializers',
			'useReducer((value) => value, 0, () => { ref.current = 1; return 0; });',
		],
	])('rejects render-time ref writes from %s', (_label, setup) => {
		const source = `"use strong";
import { useLinkedState, useReducer, useRef, useState } from 'octane';
export function App() @{
  const ref = useRef(0);
  ${setup}
  <div />
}`;

		expect(() => compile(source, '/src/App.tsrx')).toThrow(RENDER_REF_WRITE);
	});

	it.each([
		[
			'nullish state initializers',
			'useState(props.initialize ?? (() => { ref.current = 1; return 0; }));',
		],
		[
			'logical OR linked-state reconcilers',
			'useLinkedState(0, props.reconcile || ((value) => { ref.current = value; return value; }));',
		],
		[
			'logical AND linked-state comparators',
			'useLinkedState(0, (value) => value, { valueEqual: props.enabled && ((previous, next) => { ref.current = next; return previous === next; }) });',
		],
		[
			'named logical linked-state option spreads',
			'const options = props.options ?? { sourceEqual: (previous, next) => { ref.current = next; return previous === next; } }; useLinkedState(0, (value) => value, { ...options });',
		],
		[
			'logical reducer initializers',
			'useReducer((value) => value, 0, props.initialize || (() => { ref.current = 1; return 0; }));',
		],
	])('rejects render-time ref writes hidden by logical %s', (_label, setup) => {
		const source = `"use strong";
import { useLinkedState, useReducer, useRef, useState } from 'octane';
export function App(props) @{
  const ref = useRef(0);
  ${setup}
  <div />
}`;

		expect(() => compile(source, '/src/App.tsrx')).toThrow(RENDER_REF_WRITE);
	});

	it.each([
		[
			'state initializer callbacks',
			'useState((props.trace, () => { ref.current = 1; return 0; }));',
		],
		[
			'linked-state reconciler callbacks',
			'useLinkedState(0, (props.trace, (value) => { ref.current = value; return value; }));',
		],
		[
			'named linked-state option spreads',
			'const options = (props.trace, { sourceEqual: (previous, next) => { ref.current = next; return previous === next; } }); useLinkedState(0, (value) => value, { ...options });',
		],
		['immediately executed earlier operands', 'useState((ref.current = 1, () => 0));'],
	])('rejects ref writes from sequence-selected %s', (_label, setup) => {
		const source = `"use strong";
import { useLinkedState, useRef, useState } from 'octane';
export function App(props) @{
  const ref = useRef(0);
  ${setup}
  <div />
}`;

		expect(() => compile(source, '/src/App.tsrx')).toThrow(RENDER_REF_WRITE);
	});

	it('rejects ref writes from aliased template comparator keys', () => {
		const source = `"use strong";
import { useLinkedState, useRef } from 'octane';
export function App(props) @{
  const ref = useRef(0);
  const key = \`sourceEqual\`;
  const alias = key;
  useLinkedState(props.value, (value) => value, {
    [alias]: (previous, next) => { ref.current = next; return previous === next; },
  });
  <div />
}`;

		expect(() => compile(source, '/src/App.tsrx')).toThrow(RENDER_REF_WRITE);
	});

	it('rejects ref writes from aliased concatenated comparator fragments', () => {
		const source = `"use strong";
import { useLinkedState, useRef } from 'octane';
export function App(props) @{
  const ref = useRef(0);
  const prefix = "sou" + "rce";
  const key = \`\${prefix}Equal\`;
  useLinkedState(props.value, (value) => value, {
    [key]: (previous, next) => { ref.current = next; return previous === next; },
  });
  <div />
}`;

		expect(() => compile(source, '/src/App.tsrx')).toThrow(RENDER_REF_WRITE);
	});

	it.each([
		[
			'aliased state imports',
			`import { useState as state } from 'octane';
export function App() @{ const [, update] = state(0); state(() => update(1)); <div /> }`,
		],
		[
			'aliased linked-state imports',
			`import { useLinkedState as linked, useState } from 'octane';
export function App() @{ const [, update] = useState(0); linked(0, () => update(1)); <div /> }`,
		],
		[
			'namespace state imports',
			`import * as Octane from 'octane';
export function App() @{ const [, update] = Octane.useState(0); Octane.useState(() => update(1)); <div /> }`,
		],
		[
			'namespace linked-state imports',
			`import * as Octane from 'octane';
export function App() @{ const [, update] = Octane.useState(0); Octane.useLinkedState(0, (value) => value, { valueEqual: update }); <div /> }`,
		],
		[
			'wrapped namespace linked-state properties',
			`import * as Octane from 'octane';
export function App() @{ const [, update] = Octane.useState(0); Octane['useLinkedState' as const](0, update); <div /> }`,
		],
	])('tracks synchronous state callbacks through %s', (_label, source) => {
		expect(() => compile(`"use strong";\n${source}`, '/src/App.tsrx')).toThrow(RENDER_STATE_UPDATE);
	});

	it.each([
		{ mode: 'client', dev: true },
		{ mode: 'client', dev: false },
		{ mode: 'server', dev: true },
		{ mode: 'server', dev: false },
	])('rejects linked comparator writes during $mode compilation with dev=$dev', (options) => {
		const source = `"use strong";\n${stateComponent(
			'useLinkedState(count, (value) => value, { sourceEqual: () => setCount(count + 1) });',
			'useState, useLinkedState',
		)}`;

		expect(() => compile(source, '/src/Counter.tsrx?octane-hydrate=Counter', options)).toThrow(
			RENDER_STATE_UPDATE,
		);
	});

	it('keeps synchronous state callbacks compatible when Strong mode is disabled', () => {
		const source = stateComponent(
			'useState(count > 0 ? () => count : setCount); useReducer((value) => value, count, setCount); useLinkedState(count, count > 0 ? (value) => value : setCount, { ...{ sourceEqual: setCount } });',
			'useState, useReducer, useLinkedState',
		);

		expect(() => compile(source, '/src/Counter.tsrx')).not.toThrow();
		expect(() => compile(source, '/src/Counter.tsrx', { strong: false } as any)).not.toThrow();
	});

	it('keeps deferred and unknown callbacks inside state initializers and linked options legal', () => {
		const source = `"use strong";
import { useLinkedState, useRef, useState } from 'octane';
export function App(props) @{
  const [count, setCount] = useState(0);
  const ref = useRef(0);
  useState(() => () => setCount(count + 1));
  const reconcile = (value) => {
    setTimeout(() => setCount(value + 1), 0);
    return value;
  };
  const compare = (previous, next) => {
    queueMicrotask(() => { ref.current = next; });
    return previous === next;
  };
  useLinkedState(count, reconcile, {
    sourceEqual: compare,
    valueEqual: props.compare,
    onSettled: () => setCount(count + 1),
  });
  <div />
}`;

		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
	});

	it('keeps overridden, deferred, dynamic, and unrelated linked-state comparators legal', () => {
		const source = `"use strong";
import { useLinkedState, useReducer, useState } from 'octane';
export function App(props) @{
  const [count, setCount] = useState(0);
  const later = (value) => { setTimeout(() => setCount(value), 0); return value; };
  const unsafe = (value) => setCount(value);
  const overridden = { sourceEqual: unsafe };
  const dynamicKey = props.comparatorName;
  useReducer((value) => value, count, count > 0 ? later : props.initialize);
  useLinkedState(count, count > 0 ? later : props.reconcile, {
    ...overridden,
    sourceEqual: Object.is,
    [dynamicKey]: unsafe,
    valueEqual: count > 0 ? Object.is : props.compare,
    onSettled: unsafe,
  });
  <div />
}`;

		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
	});

	it('keeps unreachable, overridden, deferred, and dynamic logical callbacks legal', () => {
		const source = `"use strong";
import { useLinkedState, useMemo, useState } from 'octane';
export function App(props) @{
  const [count, setCount] = useState(0);
  const unsafe = (value) => setCount(value);
  const safe = (value) => value;
  const knownOptions = { sourceEqual: Object.is };
  useState(false && unsafe);
  useState(safe || unsafe);
  useState((() => count) ?? unsafe);
  useMemo(safe || unsafe, [count]);
  useLinkedState(count, props.reconcile ?? safe, {
    ...(props.options ?? { sourceEqual: unsafe }),
    sourceEqual: Object.is,
    valueEqual: props.compare && safe,
    [props.comparatorName]: unsafe,
    onSettled: props.onSettled || unsafe,
  });
  useLinkedState(count, safe, knownOptions || { sourceEqual: unsafe });
  useLinkedState(count, safe, false && { sourceEqual: unsafe });
  <div />
}`;

		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
	});

	it.each([
		['immutable false aliases', 'const disabled = false; useState(disabled && setCount);'],
		[
			'chained immutable false aliases',
			'const disabled = false; const alias = disabled; useState(alias && setCount);',
		],
		['immutable true aliases', 'const enabled = true; useState(enabled || setCount);'],
		['immutable null aliases', 'const missing = null; useState(missing && setCount);'],
		['immutable undefined aliases', 'const missing = undefined; useState(missing && setCount);'],
		['immutable empty-string aliases', "const empty = ''; useState(empty && setCount);"],
		['immutable numeric aliases', 'const zero = 0; useState(zero && setCount);'],
		[
			'immutable object aliases',
			'const value = {}; useState(value ?? setCount); useState(value || setCount);',
		],
		['immutable array aliases', 'const value = []; useState(value || setCount);'],
		[
			'nested non-null callback choices',
			'const safe = (value) => value; useState((safe ?? setCount) || setCount);',
		],
		[
			'conditional callbacks on logical AND left operands',
			'const selected = props.enabled ? setCount : false; useState(selected && (() => count));',
		],
		[
			'inline callbacks on logical AND left operands',
			'useState((props.enabled ? setCount : false) && (() => count));',
		],
		[
			'nested callbacks on logical AND left operands',
			'useState((props.enabled && setCount) && (() => count));',
		],
		[
			'comparator choices on logical AND left operands',
			'useLinkedState(count, (value) => value, { sourceEqual: (props.enabled ? setCount : false) && Object.is });',
		],
		[
			'option choices on logical AND left operands',
			'const selected = props.enabled ? { sourceEqual: setCount } : false; useLinkedState(count, (value) => value, selected && { sourceEqual: Object.is });',
		],
		[
			'spread option choices on logical AND left operands',
			'const selected = props.enabled ? { sourceEqual: setCount } : false; useLinkedState(count, (value) => value, { ...(selected && { sourceEqual: Object.is }) });',
		],
		[
			'ref-writing callbacks behind immutable false aliases',
			'const disabled = false; useState(disabled && (() => { ref.current = 1; return 0; }));',
		],
	])('accepts logically unreachable synchronous callbacks from %s', (_label, setup) => {
		const source = `"use strong";
import { useLinkedState, useRef, useState } from 'octane';
export function App(props) @{
  const [count, setCount] = useState(0);
  const ref = useRef(0);
  ${setup}
  <div />
}`;

		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
	});

	it.each([
		['known true state initializers', 'useState(true ? () => count : setCount);'],
		['known false state initializers', 'useState(false ? setCount : () => count);'],
		[
			'aliased immutable conditional flags',
			'const enabled = true; const active = enabled; useState(active ? () => count : setCount);',
		],
		[
			'nested immutable conditional flags',
			'const disabled = false; useState(disabled ? setCount : (true ? () => count : setCount));',
		],
		[
			'known conditional linked-state reconcilers',
			'const enabled = true; useLinkedState(count, enabled ? (value) => value : setCount);',
		],
		[
			'known conditional linked-state comparators',
			'useLinkedState(count, (value) => value, { valueEqual: false ? setCount : Object.is });',
		],
		[
			'known conditional linked-state options',
			'const enabled = true; useLinkedState(count, (value) => value, enabled ? { sourceEqual: Object.is } : { sourceEqual: setCount });',
		],
		[
			'named known conditional linked-state options',
			'const disabled = false; const options = disabled ? { sourceEqual: setCount } : { sourceEqual: Object.is }; useLinkedState(count, (value) => value, options);',
		],
		[
			'known conditional spread overrides',
			'const enabled = true; useLinkedState(count, (value) => value, { sourceEqual: setCount, ...(enabled ? { sourceEqual: Object.is } : { sourceEqual: setCount }) });',
		],
		['discarded earlier callback identities', 'useState((setCount, () => count));'],
		[
			'discarded earlier comparator options',
			'useLinkedState(count, (value) => value, ({ sourceEqual: setCount }, { sourceEqual: Object.is }));',
		],
		[
			'false sequence-result aliases',
			'const disabled = (props.trace, false); useState(disabled && setCount);',
		],
	])('accepts unreachable sequence and conditional callbacks from %s', (_label, setup) => {
		const source = `"use strong";
import { useLinkedState, useState } from 'octane';
export function App(props) @{
  const [count, setCount] = useState(0);
  ${setup}
  <div />
}`;

		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
	});

	it('keeps mutable tuple aliases and dynamic or overridden template comparator keys legal', () => {
		const source = `"use strong";
import { useLinkedState, useState } from 'octane';
export function App(props) @{
  const tuple = useState(0);
  let mutable = tuple[1];
  mutable = (value) => value;
  useState(mutable);
  let mutableIndex = 1;
  mutableIndex = props.index;
  const dynamicUpdate = tuple[mutableIndex];
  useState(dynamicUpdate);
  const unrelated = \`onSettled\`;
  const dynamic = \`\${props.prefix}Equal\`;
  const known = \`sourceEqual\`;
  useLinkedState(tuple[0], (value) => value, {
    [unrelated]: tuple[1],
    [dynamic]: tuple[1],
    [known]: tuple[1],
    sourceEqual: Object.is,
  });
  <div />
}`;

		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
	});

	it('keeps computed primitive truthiness, overrides, and dynamic fragments precise', () => {
		const source = `"use strong";
import { useLinkedState, useState } from 'octane';
export function App(props) @{
  const tuple = useState(0);
  const empty = "" + "";
  const truthy = "x" + "";
  const negativeZero = -0;
  useState(empty && tuple[1]);
  useState(negativeZero && tuple[1]);
  useState(truthy || tuple[1]);
  useState(("x" + "") ? (() => 0) : tuple[1]);
  let mutable = "sou" + "rce";
  mutable = props.prefix;
  const dynamic = props.prefix + "Equal";
  const prefix = "sou" + "rce";
  const known = prefix + "Equal";
  useLinkedState(tuple[0], (value) => value, {
    [mutable + "Equal"]: tuple[1],
    [dynamic]: tuple[1],
    [known]: tuple[1],
    sourceEqual: Object.is,
  });
  <div />
}`;

		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
	});

	it.each([
		['falsy immutable OR aliases', 'const disabled = false; useState(disabled || setCount);'],
		['nullish immutable fallback aliases', 'const missing = null; useState(missing ?? setCount);'],
		['truthy immutable AND aliases', 'const enabled = true; useState(enabled && setCount);'],
		[
			'mutable aliases',
			'let disabled = false; disabled = props.enabled; useState(disabled && setCount);',
		],
	])('continues rejecting reachable callbacks behind %s', (_label, setup) => {
		const source = `"use strong";
import { useState } from 'octane';
export function App(props) @{
  const [count, setCount] = useState(0);
  ${setup}
  <div />
}`;

		expect(() => compile(source, '/src/App.tsrx')).toThrow(RENDER_STATE_UPDATE);
	});

	it('reports logical callback violations in TypeScript and editor diagnostics', () => {
		const source = `"use strong";
import { useMemo, useState } from 'octane';
export function useValue(value, calculate) {
  const [, update] = useState(0);
  return useMemo(calculate || update, [value]);
}`;
		const editorSource = `"use strong";
import { useLinkedState, useRef } from 'octane';
export function App(props) @{
  const ref = useRef(0);
  useLinkedState(props.value, (value) => value, props.options ?? {
    valueEqual: props.compare || ((previous, next) => {
      ref.current = next;
      return previous === next;
    }),
  });
  <div />
}`;
		const diagnostics = compileToVolarMappings(editorSource, '/src/App.tsrx');

		expect(() => slotHooks(source, '/src/useValue.ts')).toThrow(RENDER_STATE_UPDATE);
		expect(diagnostics.diagnostics).toContainEqual(
			expect.objectContaining({ code: RENDER_REF_WRITE, severity: 'error' }),
		);
		expect(diagnostics.errors).toContainEqual(
			expect.objectContaining({ code: RENDER_REF_WRITE, type: 'usage' }),
		);
	});

	it('reports spread and conditional callback violations in TypeScript and editor diagnostics', () => {
		const source = `"use strong";
import { useLinkedState, useState } from 'octane';
export function useValue(value) {
  const [, update] = useState(0);
  const options = { sourceEqual: update };
  return useLinkedState(value, (next) => next, { ...options });
}`;
		const editorSource = `"use strong";
import { useLinkedState, useRef } from 'octane';
export function App(props) @{
  const ref = useRef(0);
  const key = 'valueEqual';
  useLinkedState(props.value, (value) => value, {
    [key]: props.value ? Object.is : (previous, next) => { ref.current = next; return previous === next; },
  });
  <div />
}`;
		const diagnostics = compileToVolarMappings(editorSource, '/src/App.tsrx');

		expect(() => slotHooks(source, '/src/useValue.ts')).toThrow(RENDER_STATE_UPDATE);
		expect(diagnostics.diagnostics).toContainEqual(
			expect.objectContaining({ code: RENDER_REF_WRITE, severity: 'error' }),
		);
		expect(diagnostics.errors).toContainEqual(
			expect.objectContaining({ code: RENDER_REF_WRITE, type: 'usage' }),
		);
	});

	it('reports synchronous linked-state callback violations in plain TypeScript and editor diagnostics', () => {
		const source = `"use strong";
import { useLinkedState, useRef, useState } from 'octane';
export function useValue(value) {
  const [, update] = useState(0);
  return useLinkedState(value, () => update(value));
}`;
		const editorSource = `"use strong";
import { useLinkedState, useRef } from 'octane';
export function App(props) @{
  const ref = useRef(0);
  useLinkedState(props.value, (value) => value, {
    valueEqual: (previous, next) => { ref.current = next; return previous === next; },
  });
  <div />
}`;
		const diagnostics = compileToVolarMappings(editorSource, '/src/App.tsrx');

		expect(() => slotHooks(source, '/src/useValue.ts')).toThrow(RENDER_STATE_UPDATE);
		expect(diagnostics.diagnostics).toContainEqual(
			expect.objectContaining({ code: RENDER_REF_WRITE, severity: 'error' }),
		);
		expect(diagnostics.errors).toContainEqual(
			expect.objectContaining({ code: RENDER_REF_WRITE, type: 'usage' }),
		);
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

	it.each([
		['sequence-selected setters', '(props.trace, setCount)(1);'],
		[
			'aliased callback choices',
			'const selected = (props.trace, () => setCount(1)); const alias = selected; alias();',
		],
		['conditional setters', '(props.enabled ? setCount : (value) => value)(1);'],
	])('rejects immediately invoked %s during effect setup', (_label, invocation) => {
		const source = `"use strong";
import { useEffect, useState } from 'octane';
export function App(props) @{
  const [, setCount] = useState(0);
  useEffect(() => { ${invocation} }, []);
  <div />
}`;

		expect(() => compile(source, '/src/App.tsrx')).toThrow(EFFECT_STATE_UPDATE);
	});

	it.each([
		['effect callbacks', 'useEffect(update, []);'],
		['direct calls in effect setup', 'useEffect(() => { update(1); }, []);'],
		[
			'concatenated tuple indexes in effect setup',
			'useEffect(() => { const index = "" + "1"; const selected = tuple[index]; selected(1); }, []);',
		],
	])('rejects aliased tuple setters used as %s', (_label, effect) => {
		const source = `"use strong";
import { useEffect, useState } from 'octane';
export function App() @{
  const tuple = useState(0);
  const update = tuple[1];
  ${effect}
  <div />
}`;

		expect(() => compile(source, '/src/App.tsrx')).toThrow(EFFECT_STATE_UPDATE);
	});

	it('keeps selected callbacks legal after async render and effect work has yielded', () => {
		const source = `"use strong";
import { useEffect, useState } from 'octane';
export function App(props) @{
  const [, setCount] = useState(0);
  (async () => {
    await Promise.resolve();
    const selected = (props.trace, setCount);
    selected(1);
    (props.enabled ? setCount : () => {})(1);
  })();
  useEffect(() => {
    (async () => {
      await Promise.resolve();
      (props.trace, setCount)(1);
    })();
  }, []);
  <div />
}`;

		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
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

	it('keeps opaque crypto methods outside the bounded purity diagnostics', () => {
		const source = `"use strong";
export function App() @{
	  const value = crypto.randomUUID();
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

describe('Strong mode returned callbacks and Effect Events', () => {
	const imports =
		'useState, useRef, useCallback, useMemo, useEffectEvent, useEffect, useLayoutEffect, useInsertionEffect, useImperativeHandle';

	function component(setup: string, hookImports = imports): string {
		return `import { ${hookImports} } from 'octane';
export function App(props) @{
  const [count, setCount] = useState(0);
  const ref = useRef(0);
  ${setup}
  <button onClick={() => setCount(count + 1)}>{count as string}</button>
}`;
	}

	it.each([
		['useCallback result', 'const update = useCallback(() => setCount(1), []); update();'],
		['memoized setter', 'const update = useCallback(setCount, []); update(1);'],
		['immediately called useCallback result', 'useCallback(() => setCount(1), [])();'],
		[
			'immutable callback aliases',
			'const update = useCallback(() => setCount(1), []); const alias = update; alias();',
		],
		[
			'local callback helpers',
			'const update = useCallback(() => setCount(1), []); function apply() { update(); } apply();',
		],
		[
			'conditional callback choices',
			'const update = useCallback(() => setCount(1), []); const selected = props.enabled ? update : () => {}; selected();',
		],
		['useMemo result', 'const update = useMemo(() => () => setCount(1), []); update();'],
		['memo-returned setter', 'const update = useMemo(() => setCount, []); update(1);'],
		[
			'named memo factories',
			'function makeUpdate() { return () => setCount(1); } const update = useMemo(makeUpdate, []); update();',
		],
		[
			'block-bodied memo factories',
			'const update = useMemo(() => { const apply = () => setCount(1); return apply; }, []); update();',
		],
		[
			'conditionally returned callbacks',
			'const update = useMemo(() => props.enabled ? () => setCount(1) : () => {}, [props.enabled]); update();',
		],
		[
			'factory parameters receiving a setter',
			'function makeUpdate(apply) { return () => apply(1); } const update = useMemo(() => makeUpdate(setCount), []); update();',
		],
	])('rejects render state updates through %s', (_label, setup) => {
		expect(() => compile(`"use strong";\n${component(setup)}`, '/src/App.tsrx')).toThrow(
			RENDER_STATE_UPDATE,
		);
	});

	it.each([
		['useCallback', 'useCallback(() => setCount(1), [])'],
		['useEffectEvent', 'useEffectEvent(() => setCount(1))'],
		['useMemo returned callback', 'useMemo(() => () => setCount(1), [])'],
	])('rejects synchronous effect updates through %s', (_label, initializer) => {
		for (const effect of ['useEffect', 'useLayoutEffect', 'useInsertionEffect']) {
			for (const callback of ['() => update()', 'update']) {
				const setup = `const update = ${initializer}; ${effect}(${callback}, []);`;
				expect(() => compile(`"use strong";\n${component(setup)}`, '/src/App.tsrx')).toThrow(
					EFFECT_STATE_UPDATE,
				);
			}
		}
	});

	it.each([
		[
			'aliased callback imports',
			'useState, useRef, useCallback as callback, useEffect as effect',
			'const update = callback(() => setCount(1), []); const alias = update; effect(alias, []);',
		],
		[
			'aliased Effect Event imports',
			'useState, useRef, useEffectEvent as effectEvent, useEffect as effect',
			'const update = effectEvent(() => setCount(1)); function apply() { update(); } effect(apply, []);',
		],
		[
			'aliased memo imports',
			'useState, useRef, useMemo as memo, useEffect as effect',
			'const update = memo(() => () => setCount(1), []); const selected = props.enabled ? update : () => {}; effect(selected, []);',
		],
	])('recognizes synchronous effect updates through %s', (_label, hookImports, setup) => {
		expect(() =>
			compile(`"use strong";\n${component(setup, hookImports)}`, '/src/App.tsrx'),
		).toThrow(EFFECT_STATE_UPDATE);
	});

	it('recognizes returned callbacks from namespace hook imports', () => {
		const source = `"use strong";
import * as Octane from 'octane';
export function App(props) @{
  const [, setCount] = Octane.useState(0);
  const update = Octane['useCallback' as const](() => setCount(1), []);
  const selected = props.enabled ? update : () => {};
  Octane.useEffect(selected, []);
  <div />
}`;

		expect(() => compile(source, '/src/App.tsrx')).toThrow(EFFECT_STATE_UPDATE);
	});

	it.each([
		['useCallback', 'useCallback(() => { ref.current = 1; }, [])'],
		['useMemo returned callback', 'useMemo(() => () => { ref.current = 1; }, [])'],
	])('rejects render ref writes through %s', (_label, initializer) => {
		const setup = `const write = ${initializer}; const alias = write; alias();`;
		expect(() => compile(`"use strong";\n${component(setup)}`, '/src/App.tsrx')).toThrow(
			RENDER_REF_WRITE,
		);
	});

	it.each([
		['direct calls', 'const read = useEffectEvent(() => count); read();'],
		['immediate hook results', 'useEffectEvent(() => count)();'],
		['immutable aliases', 'const read = useEffectEvent(() => count); const alias = read; alias();'],
		[
			'local helpers',
			'const read = useEffectEvent(() => count); function readNow() { return read(); } readNow();',
		],
		[
			'conditional choices',
			'const read = useEffectEvent(() => count); const selected = props.enabled ? read : () => count; selected();',
		],
		['memo factories', 'const read = useEffectEvent(() => count); useMemo(read, []);'],
		['state initializers', 'const read = useEffectEvent(() => count); useState(read);'],
		[
			'memoized Effect Events',
			'const read = useEffectEvent(() => count); const alias = useCallback(read, []); alias();',
		],
	])('rejects render-time Effect Event invocation through %s', (_label, setup) => {
		expect(() => compile(`"use strong";\n${component(setup)}`, '/src/App.tsrx')).toThrow(
			RENDER_EFFECT_EVENT_CALL,
		);
	});

	it.each([
		['useEffect', 'useEffect(() => {}, [event]);'],
		['useLayoutEffect', 'useLayoutEffect(() => {}, [event]);'],
		['useInsertionEffect', 'useInsertionEffect(() => {}, [event]);'],
		['useMemo', 'useMemo(() => count, [event]);'],
		['useCallback', 'useCallback(() => count, [event]);'],
		['useImperativeHandle', 'useImperativeHandle(props.handle, () => ({}), [event]);'],
	])('rejects explicit Effect Event dependencies in %s', (_label, hook) => {
		const setup = `const event = useEffectEvent(() => count); ${hook}`;
		expect(() => compile(`"use strong";\n${component(setup)}`, '/src/App.tsrx')).toThrow(
			EFFECT_EVENT_DEPENDENCY,
		);
	});

	it('recognizes aliases and namespace imports in Effect Event dependencies', () => {
		const source = `"use strong";
import { useEffectEvent as effectEvent } from 'octane';
import * as Octane from 'octane';
export function App(props) @{
  const event = effectEvent(() => props.value);
  const alias = event;
  Octane['useLayoutEffect' as const](() => {}, [alias as typeof alias]);
  <div />
}`;

		expect(() => compile(source, '/src/App.tsrx')).toThrow(EFFECT_EVENT_DEPENDENCY);
	});

	it('keeps callback creation, event handlers, cleanup, and deferred invocation legal', () => {
		const source = `"use strong";
import { ${imports} } from 'octane';
export function App(props) @{
  const [count, setCount] = useState(0);
  const ref = useRef(0);
  const update = useCallback(() => setCount(count + 1), [count]);
  const event = useEffectEvent(() => setCount(count + 1));
  const memoized = useMemo(() => () => setCount(count + 1), [count]);
  useEffect(() => {
    setTimeout(update, 0);
    Promise.resolve().then(event);
    queueMicrotask(memoized);
    return () => { update(); event(); memoized(); };
  }, []);
  useLayoutEffect(() => { ref.current = count; }, [count]);
  <button ref={props.buttonRef} onClick={event}>{count as string}</button>
}`;

		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
	});

	it('keeps returned callbacks legal after asynchronous work has yielded', () => {
		const setup = `const update = useCallback(() => setCount(1), []);
  const event = useEffectEvent(() => setCount(1));
  const memoized = useMemo(() => () => setCount(1), []);
  (async () => { await Promise.resolve(); update(); event(); memoized(); })();
  useEffect(() => {
    (async () => { await Promise.resolve(); update(); event(); memoized(); })();
  }, []);`;

		expect(() => compile(`"use strong";\n${component(setup)}`, '/src/App.tsrx')).not.toThrow();
	});

	it('does not execute a memo-returned callback until the result is invoked', () => {
		const setup = `function makeUpdate(apply) { return () => apply(1); }
  const update = useMemo(() => makeUpdate(setCount), []);
  const event = useEffectEvent(update);
  useEffect(() => () => event(), []);`;

		expect(() => compile(`"use strong";\n${component(setup)}`, '/src/App.tsrx')).not.toThrow();
	});

	it.each([
		[
			'separate factory captures',
			`function makeUpdate(apply) { return () => apply(1); }
  const deferred = useMemo(() => makeUpdate(setCount), []);
  const safe = useMemo(() => makeUpdate(() => {}), []);
  safe();
  useEffect(() => deferred, []);`,
		],
		[
			'reassigned factory parameters',
			`function makeUpdate(apply) { apply = () => {}; return () => apply(1); }
  const safe = useMemo(() => makeUpdate(setCount), []);
  safe();`,
		],
		[
			'overridden factory returns',
			`const safe = useMemo(() => {
    try { return () => setCount(1); }
    finally { return () => {}; }
  }, []);
  safe();`,
		],
		[
			'asynchronous factory results',
			`const pending = useMemo(async () => () => setCount(1), []);
  useEffect(() => { pending.then((update) => update()); }, []);`,
		],
		[
			'generator factory results',
			`const iterator = useMemo(function* () { return () => setCount(1); }, []);
  useEffect(() => () => { iterator.next().value?.(); }, []);`,
		],
	])('does not invent synchronous writes from %s', (_label, setup) => {
		expect(() => compile(`"use strong";\n${component(setup)}`, '/src/App.tsrx')).not.toThrow();
	});

	it('keeps shadowed hooks and opaque callback results legal', () => {
		const source = `"use strong";
import { useState, useRef, useMemo, useEffect, useEffectEvent as octaneEvent } from 'octane';
import { makeCallback } from './external';
function useCallback(callback) { return () => {}; }
function useEffectEvent(callback) { return () => {}; }
export function App(props) @{
  const [, setCount] = useState(0);
  const ref = useRef(0);
  const ignored = useCallback(() => setCount(1));
  const unrelated = useEffectEvent(() => { ref.current = 1; });
  ignored();
  unrelated();
  const external = useMemo(props.makeCallback, []);
  const unknown = makeCallback(() => setCount(1));
  external();
  unknown();
  function makeUpdate(setCount) { return () => setCount(1); }
  const safe = useMemo(() => makeUpdate(props.onUpdate), [props.onUpdate]);
  safe();
  const event = octaneEvent(() => props.value);
  useEffect(() => { props.register(event); }, props.dependencies);
  <div />
}`;

		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
	});

	it('keeps inferred dependencies, ordinary callbacks, and deferred ref writes legal', () => {
		const setup = `const event = useEffectEvent(() => count);
  const callback = useCallback(() => props.value, [props.value]);
  const write = useMemo(() => () => { ref.current = count; }, [count]);
  useEffect(() => { props.register(event); });
  useEffect(() => { write(); }, [callback]);
  useMemo(() => callback, [callback]);`;

		expect(() => compile(`"use strong";\n${component(setup)}`, '/src/App.tsrx')).not.toThrow();
	});

	it.each([
		['a return', 'const update = useCallback(() => { return; setCount(1); }, []); update();'],
		[
			'a false branch',
			'const update = useCallback(() => { if (false) setCount(1); }, []); update();',
		],
		['short-circuiting', 'const update = useCallback(() => false && setCount(1), []); update();'],
	])('does not report callback writes made unreachable by %s', (_label, setup) => {
		expect(() => compile(`"use strong";\n${component(setup)}`, '/src/App.tsrx')).not.toThrow();
	});

	it.each([
		['a later return', 'const update = useCallback(() => { setCount(1); return; }, []); update();'],
		[
			'a possible branch',
			'const update = useCallback(() => { if (props.enabled) setCount(1); }, []); update();',
		],
		['a true operand', 'const update = useCallback(() => true && setCount(1), []); update();'],
	])('still reports callback writes reachable before %s', (_label, setup) => {
		expect(() => compile(`"use strong";\n${component(setup)}`, '/src/App.tsrx')).toThrow(
			RENDER_STATE_UPDATE,
		);
	});

	it.each([
		[
			'reassigned function declarations',
			'function update() { setCount(1); } update = () => {}; update();',
		],
		[
			'initialized function/var redeclarations',
			'function run() { function update() { setCount(1); } var update = () => {}; update(); } run();',
		],
		[
			'reassigned call parameters',
			'function invoke(apply) { apply = () => {}; apply(); } invoke(setCount);',
		],
		[
			'parameter/function redeclarations',
			'function invoke(apply) { function apply() {} apply(); } invoke(setCount);',
		],
		[
			'for-of writes to a function',
			'function update() { setCount(1); } for (update of [() => {}]) {} update();',
		],
		[
			'for-of var writes to a parameter',
			'function invoke(apply) { for (var apply of [() => {}]) {} apply(); } invoke(setCount);',
		],
	])('does not retain stale callable proofs across %s', (_label, setup) => {
		expect(() => compile(`"use strong";\n${component(setup)}`, '/src/App.tsrx')).not.toThrow();
	});

	it.each([
		[
			'uninitialized block vars sharing a parameter',
			'function invoke(apply) { { var apply; } apply(1); } invoke(setCount);',
		],
		[
			'uninitialized vars sharing a function declaration',
			'function run() { function update() { setCount(1); } var update; update(); } run();',
		],
		[
			'writes to a shadowing iteration binding',
			'function invoke(apply) { for (let apply of [() => {}]) { apply = () => {}; } apply(1); } invoke(setCount);',
		],
		[
			'writes to a shadowing block binding',
			'function update() { setCount(1); } { let update = () => {}; update = () => {}; } update();',
		],
	])('preserves callable proofs through %s', (_label, setup) => {
		expect(() => compile(`"use strong";\n${component(setup)}`, '/src/App.tsrx')).toThrow(
			RENDER_STATE_UPDATE,
		);
	});

	it("follows conditional factory returns using each call's arguments", () => {
		const make = `function make(enabled, apply) {
    if (enabled) return () => apply(1);
    return () => {};
  }`;
		const unsafe = `${make} const update = useMemo(() => make(true, setCount), []); update();`;
		const safe = `${make} const update = useMemo(() => make(false, setCount), []); update();`;

		expect(() => compile(`"use strong";\n${component(unsafe)}`, '/src/App.tsrx')).toThrow(
			RENDER_STATE_UPDATE,
		);
		expect(() => compile(`"use strong";\n${component(safe)}`, '/src/App.tsrx')).not.toThrow();
	});

	it('keeps the fallback of an optional factory call reachable', () => {
		const setup = `const factory = props.enabled ? () => () => {} : null;
  const selected = factory?.();
  const update = selected ?? setCount;
  update(1);`;

		expect(() => compile(`"use strong";\n${component(setup)}`, '/src/App.tsrx')).toThrow(
			RENDER_STATE_UPDATE,
		);
	});

	it('preserves a known non-callable memo result when selecting a callback', () => {
		const setup = `const disabled = useMemo(() => false, []);
  const update = useCallback(disabled ? setCount : () => {}, []);
  update(1);`;

		expect(() => compile(`"use strong";\n${component(setup)}`, '/src/App.tsrx')).not.toThrow();
	});

	it('respects function-hoisted vars that shadow an outer setter', () => {
		const setup = `const outer = setCount;
  function make() {
    if (false) { var outer; }
    return () => outer?.(1);
  }
  const update = make();
  update();`;

		expect(() => compile(`"use strong";\n${component(setup)}`, '/src/App.tsrx')).not.toThrow();
	});

	it.each([
		[
			'vars hoisted from a body branch',
			'const outer = setCount; function run(value = outer(1)) { if (false) { var outer; } } run();',
		],
		[
			'uninitialized body vars',
			'const outer = setCount; function run(value = outer(1)) { var outer; } run();',
		],
		[
			'explicitly undefined arguments',
			'const outer = setCount; function run(value = outer(1)) { var outer; } run(undefined);',
		],
	])('resolves executing parameter defaults outside %s', (_label, setup) => {
		expect(() => compile(`"use strong";\n${component(setup)}`, '/src/App.tsrx')).toThrow(
			RENDER_STATE_UPDATE,
		);
	});

	it.each([
		[
			'a supplied non-undefined argument',
			'const outer = setCount; function run(value = outer(1)) { var outer; } run(0);',
		],
		[
			'an earlier supplied parameter',
			'const outer = setCount; function run(outer, value = outer(1)) {} run(() => {});',
		],
		[
			'an earlier defaulted parameter',
			'const outer = setCount; function run(outer = () => {}, value = outer(1)) {} run();',
		],
		[
			'a body var redeclaring a supplied parameter',
			'const outer = setCount; function run(outer, value = outer(1)) { var outer; } run(() => {});',
		],
	])('does not invent parameter-default writes with %s', (_label, setup) => {
		expect(() => compile(`"use strong";\n${component(setup)}`, '/src/App.tsrx')).not.toThrow();
	});

	it('skips a parameter default for a null-or-callback argument', () => {
		const setup = `const value = props.enabled ? null : () => {};
  function run(value = setCount(1)) {}
  run(value);`;

		expect(() => compile(`"use strong";\n${component(setup)}`, '/src/App.tsrx')).not.toThrow();
	});

	it('keeps a parameter default reachable for an undefined-or-callback argument', () => {
		const setup = `const value = props.enabled ? undefined : () => {};
  function run(value = setCount(1)) {}
  run(value);`;

		expect(() => compile(`"use strong";\n${component(setup)}`, '/src/App.tsrx')).toThrow(
			RENDER_STATE_UPDATE,
		);
	});

	it.each(['{}', '[]'])(
		'preserves the truthiness of %s passed to a callback factory',
		(argument) => {
			const setup = `function make(value) { return value ? () => {} : setCount; }
  const update = make(${argument});
  update(1);`;

			expect(() => compile(`"use strong";\n${component(setup)}`, '/src/App.tsrx')).not.toThrow();
		},
	);

	it('does not invent a factory return after complementary branches both return', () => {
		const setup = `const noop = () => {};
  const bad = () => setCount(1);
  function make(enabled) {
    if (enabled) return noop;
    if (!enabled) return noop;
    return bad;
  }
  const update = make(props.enabled);
  update();`;

		expect(() => compile(`"use strong";\n${component(setup)}`, '/src/App.tsrx')).not.toThrow();
	});

	it.each([
		['optional calls', 'const event = useEffectEvent(() => count); event?.();'],
		['tagged calls', 'const event = useEffectEvent(() => count); event`value`;'],
	])('rejects render-time Effect Events used in %s', (_label, setup) => {
		expect(() => compile(`"use strong";\n${component(setup)}`, '/src/App.tsrx')).toThrow(
			RENDER_EFFECT_EVENT_CALL,
		);
	});

	it.each([
		[
			'render callbacks',
			'const tag = useCallback((strings, apply) => apply(1), []); tag`${setCount}`;',
			RENDER_STATE_UPDATE,
		],
		[
			'Effect Events during effect setup',
			'const tag = useEffectEvent((strings, apply) => apply(1)); useEffect(() => { tag`${setCount}`; }, []);',
			EFFECT_STATE_UPDATE,
		],
	])('tracks tagged-template arguments passed to %s', (_label, setup, code) => {
		expect(() => compile(`"use strong";\n${component(setup)}`, '/src/App.tsrx')).toThrow(code);
	});

	it('distinguishes Effect Event dependency values from ordinary callback wrappers', () => {
		const actual = `const event = useEffectEvent(() => count);
  function identity(value) { return value; }
  const selected = useMemo(() => identity(event), []);
  useEffect(() => {}, [selected]);`;
		const wrapped = `const event = useEffectEvent(() => count);
  const wrapper = useMemo(() => () => event(), []);
  useEffect(() => {}, [wrapper, () => event(), false ? event : wrapper]);`;

		expect(() => compile(`"use strong";\n${component(actual)}`, '/src/App.tsrx')).toThrow(
			EFFECT_EVENT_DEPENDENCY,
		);
		expect(() => compile(`"use strong";\n${component(wrapped)}`, '/src/App.tsrx')).not.toThrow();
	});

	it.each([
		[
			'generator callback creation',
			'const make = useCallback(function* () { setCount(1); }, []); const iterator = make(); useEffect(() => () => { iterator.next(); }, []);',
		],
		[
			'asynchronous callbacks after yielding',
			'const update = useCallback(async () => { await Promise.resolve(); setCount(1); }, []); useEffect(() => { update(); }, []);',
		],
		[
			'optional calls after yielding',
			'const event = useEffectEvent(() => count); (async () => { event?.(await Promise.resolve()); })();',
		],
		[
			'tagged calls after yielding',
			'const event = useEffectEvent(() => count); (async () => { event`${await Promise.resolve()}`; })();',
		],
		[
			'recursive factory returns',
			'function make(recur) { if (recur) return make(false); return () => {}; } const update = useMemo(() => make(true), []); update();',
		],
		[
			'mutually recursive factory returns',
			'function first(recur) { if (recur) return second(false); return () => {}; } function second(recur) { if (recur) return first(false); return () => {}; } const update = useMemo(() => first(true), []); update();',
		],
	])('keeps %s legal without inventing synchronous execution', (_label, setup) => {
		expect(() => compile(`"use strong";\n${component(setup)}`, '/src/App.tsrx')).not.toThrow();
	});

	it('finishes repeated optional self-return calls and still checks later writes', () => {
		const setup = `function next() { return next; }
  const result = next${'?.()'.repeat(8)};
  result?.();`;
		const valid = compile(`"use strong";\n${component(setup)}`, '/src/App.tsrx');

		expect(valid.diagnostics).toEqual([]);
		expect(() =>
			compile(`"use strong";\n${component(`${setup}\n  setCount(1);`)}`, '/src/App.tsrx'),
		).toThrow(RENDER_STATE_UPDATE);
	});

	it.each([
		[
			'returned state updater',
			'const update = useCallback(() => setCount(1), []); update();',
			RENDER_STATE_UPDATE,
		],
		[
			'Effect Event invocation',
			'const event = useEffectEvent(() => count); event();',
			RENDER_EFFECT_EVENT_CALL,
		],
		[
			'Effect Event dependency',
			'const event = useEffectEvent(() => count); useEffect(() => {}, [event]);',
			EFFECT_EVENT_DEPENDENCY,
		],
	])('preserves compatibility behavior for %s until opted in', (_label, setup, code) => {
		const source = component(setup);
		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
		expect(() => compile(source, '/src/App.tsrx', { strong: false } as any)).not.toThrow();
		expect(() => compile(source, '/src/App.tsrx', { strong: true } as any)).toThrow(code);
		expect(() =>
			compile(`"use strong";\n${source}`, '/src/App.tsrx', { strong: false } as any),
		).toThrow(code);
	});

	it.each([
		[
			'returned callback render writes',
			'const update = useCallback(() => setCount(1), []); update();',
			RENDER_STATE_UPDATE,
		],
		[
			'memo-returned effect callbacks',
			'const update = useMemo(() => () => setCount(1), []); useEffect(update, []);',
			EFFECT_STATE_UPDATE,
		],
		[
			'Effect Event render calls',
			'const event = useEffectEvent(() => count); event();',
			RENDER_EFFECT_EVENT_CALL,
		],
		[
			'Effect Event dependencies',
			'const event = useEffectEvent(() => count); useEffect(() => {}, [event]);',
			EFFECT_EVENT_DEPENDENCY,
		],
	])('publishes matching plain TypeScript and editor errors for %s', (_label, setup, code) => {
		const source = `"use strong";
import { ${imports} } from 'octane';
export function useCounter(props) {
  const [count, setCount] = useState(0);
  const ref = useRef(0);
  ${setup}
  return count;
}`;
		const editorSource = `"use strong";\n${component(setup)}`;
		const result = compileToVolarMappings(editorSource, '/src/App.tsrx');

		expect(() => slotHooks(source, '/src/useCounter.ts')).toThrow(code);
		expect(result.diagnostics).toContainEqual(
			expect.objectContaining({ code, severity: 'error', filename: '/src/App.tsrx' }),
		);
		expect(result.errors).toContainEqual(
			expect.objectContaining({ code, type: 'usage', fileName: '/src/App.tsrx' }),
		);
	});

	it.each([
		{ mode: 'client', dev: true },
		{ mode: 'client', dev: false },
		{ mode: 'server', dev: true },
		{ mode: 'server', dev: false },
	])('enforces Effect Event diagnostics in $mode compilation with dev=$dev', (options) => {
		const render = component('const event = useEffectEvent(() => count); event();');
		const dependency = component(
			'const event = useEffectEvent(() => count); useEffect(() => {}, [event]);',
		);

		expect(() => compile(`"use strong";\n${render}`, '/src/App.tsrx', options)).toThrow(
			RENDER_EFFECT_EVENT_CALL,
		);
		expect(() => compile(`"use strong";\n${dependency}`, '/src/App.tsrx', options)).toThrow(
			EFFECT_EVENT_DEPENDENCY,
		);
	});

	it.each([
		['alias();', RENDER_EFFECT_EVENT_CALL],
		['useEffect(() => {}, [alias]);', EFFECT_EVENT_DEPENDENCY],
	])('locates %s at the authored use, not its declaration', (statement, code) => {
		const source = `"use strong";
import { useEffect, useEffectEvent } from 'octane';
export function App(props) @{
  const event = useEffectEvent(() => props.value);
  const alias = event;
  ${statement}
  <div />
}`;
		const start = source.lastIndexOf('alias');
		let failure: unknown;
		try {
			compile(source, '/src/App.tsrx');
		} catch (error) {
			failure = error;
		}
		expect(failure).toMatchObject({
			code,
			filename: '/src/App.tsrx',
			pos: start,
			end: start + 'alias'.length,
		});
		expect(compileToVolarMappings(source, '/src/App.tsrx').diagnostics).toContainEqual(
			expect.objectContaining({
				code,
				start: expect.objectContaining({ offset: start, line: 6 }),
				end: expect.objectContaining({ offset: start + 'alias'.length, line: 6 }),
			}),
		);
	});
});
