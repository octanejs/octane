import { describe, expect, it } from 'vitest';
import { compile } from '../../src/compiler/compile.js';
import { slotHooks } from '../../src/compiler/slot-hooks.js';
import { compileToVolarMappings } from '../../src/compiler/volar.js';

const IMPURE_UPDATER = 'OCTANE_STRONG_IMPURE_UPDATER';
const SNAPSHOT_MUTATION = 'OCTANE_STRONG_SNAPSHOT_MUTATION';
const RENDER_SNAPSHOT_MUTATION = 'OCTANE_STRONG_RENDER_SNAPSHOT_MUTATION';
const STALE_STATE_UPDATE = 'OCTANE_STRONG_STALE_STATE_UPDATE';
const WRITE_ONLY_STATE = 'OCTANE_STRONG_WRITE_ONLY_STATE';

const IMPORTS =
	"import { useState, useReducer, useLinkedState, useEffect, useRef, useSyncExternalStore, useOptimistic, useEffectEvent } from 'octane';";

function tsx(body: string, imports = IMPORTS, strong = false): string {
	return `/** @jsxImportSource octane */\n${strong ? '"use strong";\n' : ''}${imports}\n${body}`;
}

function strongCode(source: string, filename = '/src/App.tsx'): string | null {
	try {
		if (filename.endsWith('.ts') || filename.endsWith('.js')) {
			slotHooks(source, filename, { strong: true });
		} else {
			compile(source, filename, { strong: true });
		}
	} catch (error: any) {
		return error.code ?? String(error);
	}
	return null;
}

/** The first Strong error for `body`, after proving compatibility mode accepts it. */
function rejected(body: string, imports = IMPORTS): string | null {
	expect(() => compile(tsx(body, imports), '/src/App.tsx')).not.toThrow();
	const code = strongCode(tsx(body, imports));
	expect(strongCode(tsx(body, imports, true))).toBe(code);
	return code;
}

function volarDiagnostic(source: string, filename: string, code: string) {
	const result = compileToVolarMappings(source, filename);
	const diagnostic = result.diagnostics.find((item: any) => item.code === code);
	expect(diagnostic).toMatchObject({ code, severity: 'error', filename });
	expect(result.errors).toContainEqual(
		expect.objectContaining({ code, type: 'usage', fileName: filename }),
	);
	if (diagnostic === undefined) throw new Error(`missing ${code}`);
	return diagnostic;
}

function expectUnchangedOutput(source: string, filename: string): void {
	for (const mode of ['client', 'server'] as const) {
		const standard = compile(source, filename, { mode });
		const strong = compile(source, filename, { mode, strong: true });
		expect(strong.diagnostics).toEqual(standard.diagnostics);
		expect(strong.code).toBe(standard.code);
	}
}

it('does not mistake receivers named after Object.prototype members for known globals', () => {
	expect(
		strongCode(
			tsx(`export function A({ value }) {
  const [items, setItems] = useState([]);
  return (
    <b onClick={() => { toString.call(items); hasOwnProperty.call(items, 'length'); setItems((current) => valueOf.call(current)); }}>
      {items.length}
      {String(value)}
    </b>
  );
}`),
		),
	).toBeNull();
});

describe('Strong pure updaters and reducers', () => {
	it.each([
		[
			'fetch in an inline updater',
			`export function A() { const [n, setN] = useState(0); return <button onClick={() => setN(p => { fetch('/log'); return p + Date.now(); })}>{n}</button>; }`,
		],
		[
			'fetch in an inline reducer',
			`export function A() { const [s, d] = useReducer((s, a) => { fetch('/log'); return { ...s, t: Date.now() }; }, {}); return <button onClick={() => d(1)}>{String(s.t)}</button>; }`,
		],
		[
			'Date.now() in an inline updater',
			`export function A() { const [n, setN] = useState(0); return <b onClick={() => setN((p) => p + Date.now())}>{n}</b>; }`,
		],
		[
			'Math.random() in an inline updater',
			`export function A() { const [n, setN] = useState(0); return <b onClick={() => setN((p) => p + Math.random())}>{n}</b>; }`,
		],
		[
			'performance.now() in an inline updater',
			`export function A() { const [n, setN] = useState(0); return <b onClick={() => setN((p) => p + performance.now())}>{n}</b>; }`,
		],
		[
			'new Date() in a reducer',
			`export function A() { const [s, d] = useReducer((s, a) => ({ ...s, at: new Date() }), {}); return <b onClick={() => d(1)}>{String(s.at)}</b>; }`,
		],
		[
			'a browser global read',
			`export function A() { const [n, setN] = useState(0); return <b onClick={() => setN((p) => p + window.innerWidth)}>{n}</b>; }`,
		],
		[
			'a ref read',
			`export function A() { const [n, setN] = useState(0); const ref = useRef(0); return <b onClick={() => setN((p) => p + ref.current)}>{n}</b>; }`,
		],
		[
			'a ref write',
			`export function A() { const [n, setN] = useState(0); const ref = useRef(0); return <b onClick={() => setN((p) => { ref.current = p; return p + 1; })}>{n}</b>; }`,
		],
		[
			'a nested state update',
			`export function A() { const [n, setN] = useState(0); const [m, setM] = useState(0); return <b onClick={() => setN((p) => { setM(p); return p + 1; })}>{n}{m}</b>; }`,
		],
		[
			'another state setter passed as the updater',
			`export function A() { const [n, setN] = useState(0); const [m, setM] = useState(0); return <b onClick={() => setN(setM)}>{n}{m}</b>; }`,
		],
		[
			'a state getter call',
			`export function A() { const [n, setN] = useState(0); const [m, , getM] = useState(0); return <b onClick={() => setN((p) => p + getM())}>{n}{m}</b>; }`,
		],
		[
			'an Effect Event call',
			`export function A() { const [n, setN] = useState(0); const read = useEffectEvent(() => 1); return <b onClick={() => setN((p) => p + read())}>{n}</b>; }`,
		],
		[
			'a reassigned module variable read',
			`let counter = 0; export function bump() { counter++; } export function A() { const [n, setN] = useState(0); return <b onClick={() => setN((p) => p + counter)}>{n}</b>; }`,
		],
		[
			'a scheduled promise callback',
			`export function A() { const [n, setN] = useState(0); return <b onClick={() => setN((p) => { Promise.resolve().then(() => {}); return p + 1; })}>{n}</b>; }`,
		],
		[
			'a same-module updater declaration',
			`function bump(p) { return p + Math.random(); } export function A() { const [n, setN] = useState(0); return <b onClick={() => setN(bump)}>{n}</b>; }`,
		],
		[
			'a component-local updater constant',
			`export function A() { const [n, setN] = useState(0); const bump = (p) => p + Date.now(); return <b onClick={() => setN(bump)}>{n}</b>; }`,
		],
		[
			'a same-module reducer declaration',
			`function reducer(state, action) { return { ...state, at: Date.now() }; } export function A() { const [s, d] = useReducer(reducer, {}); return <b onClick={() => d(1)}>{String(s.at)}</b>; }`,
		],
		[
			'a same-module reducer constant',
			`const reducer = (state, action) => { fetch('/log'); return state; }; export function A() { const [s, d] = useReducer(reducer, {}); return <b onClick={() => d(1)}>{String(s)}</b>; }`,
		],
		[
			'a useLinkedState updater',
			`export function A(props) { const [n, setN] = useLinkedState(props.value, (v) => v); return <b onClick={() => setN((p) => p + Date.now())}>{n}</b>; }`,
		],
		[
			'a useOptimistic reducer',
			`export function A() { const [list] = useState([]); const [shown, add] = useOptimistic(list, (current, item) => { fetch('/log'); return [...current, item]; }); return <b onClick={() => add(1)}>{shown.length}</b>; }`,
		],
		[
			'an updater passed from an effect',
			`export function A() { const [n, setN] = useState(0); useEffect(() => { const id = setInterval(() => setN((p) => p + Math.random()), 100); return () => clearInterval(id); }); return <b>{n}</b>; }`,
		],
	])('rejects %s', (_label, body) => {
		expect(rejected(body)).toBe(IMPURE_UPDATER);
	});

	it.each([
		[
			'a setter alias',
			`const update = setN; return <b onClick={() => update((p) => p + Date.now())}>{n}</b>;`,
		],
		[
			'a tuple index',
			`const tuple = [n, setN]; return <b onClick={() => setN((p) => p + Date.now())}>{tuple[0]}</b>;`,
		],
		['an optional call', `return <b onClick={() => setN?.((p) => p + Date.now())}>{n}</b>;`],
		[
			'a conditional setter choice',
			`const [m, setM] = useState(0); return <b onClick={() => (m > 0 ? setN : setM)((p) => p + Date.now())}>{n}</b>;`,
		],
	])('follows %s', (_label, rest) => {
		expect(rejected(`export function A() { const [n, setN] = useState(0); ${rest} }`)).toBe(
			IMPURE_UPDATER,
		);
	});

	it.each([
		["import { useState as useCell } from 'octane';", 'useCell(0)'],
		["import * as Octane from 'octane';", 'Octane.useState(0)'],
		["import * as Octane from 'octane';", 'Octane?.useState(0)'],
	])('recognizes %s', (imports, hook) => {
		const body = `export function A() { const [n, setN] = ${hook}; return <b onClick={() => setN((p) => p + Date.now())}>{n}</b>; }`;
		expect(rejected(body, imports)).toBe(IMPURE_UPDATER);
		const tuple = `export function A() { const tuple = ${hook}; return <b onClick={() => tuple[1]((p) => p + Date.now())}>{tuple[0]}</b>; }`;
		expect(rejected(tuple, imports)).toBe(IMPURE_UPDATER);
	});

	// The likely agent rewrites after the diagnostic names fetch or Date.now().
	it.each([
		[
			'moving fetch into a helper',
			`function log() { fetch('/log'); } export function A() { const [n, setN] = useState(0); return <b onClick={() => setN((p) => { log(); return p + 1; })}>{n}</b>; }`,
		],
		[
			'moving the clock into a helper',
			`function stamp() { return Date.now(); } export function A() { const [n, setN] = useState(0); return <b onClick={() => setN((p) => p + stamp())}>{n}</b>; }`,
		],
		[
			'calling fetch through globalThis',
			`export function A() { const [n, setN] = useState(0); return <b onClick={() => setN((p) => { globalThis.fetch('/log'); return p + 1; })}>{n}</b>; }`,
		],
		[
			'calling fetch through window',
			`export function A() { const [n, setN] = useState(0); return <b onClick={() => setN((p) => { window.fetch('/log'); return p + 1; })}>{n}</b>; }`,
		],
		[
			'aliasing fetch',
			`export function A() { const [n, setN] = useState(0); return <b onClick={() => setN((p) => { const send = fetch; send('/log'); return p + 1; })}>{n}</b>; }`,
		],
		[
			'deferring fetch with a timer',
			`export function A() { const [n, setN] = useState(0); return <b onClick={() => setN((p) => { setTimeout(() => fetch('/log'), 0); return p + 1; })}>{n}</b>; }`,
		],
		[
			'deferring fetch with a microtask',
			`export function A() { const [n, setN] = useState(0); return <b onClick={() => setN((p) => { queueMicrotask(() => fetch('/log')); return p + 1; })}>{n}</b>; }`,
		],
	])('rejects the rewrite %s', (_label, body) => {
		expect(rejected(body)).toBe(IMPURE_UPDATER);
	});

	it('keeps pure updaters, side effects in the handler, and shadowed names legal', () => {
		expect(
			strongCode(
				tsx(`export function A({ step }) {
  const [n, setN] = useState(0);
  const [s, dispatch] = useReducer((state, action) => (typeof action === 'function' ? action(state) : action), 0);
  return (
    <b
      onClick={() => {
        fetch('/log');
        const now = Date.now();
        setN((p) => p + step + now);
        setN((p) => { console.log(p); const fetch = () => 1; return p + fetch(); });
        dispatch(() => Date.now());
        const setLocal = (fn) => fn(0);
        setLocal(() => Date.now());
      }}
    >
      {n}
      {s}
    </b>
  );
}`),
			),
		).toBeNull();
	});

	it('checks .tsrx components and plain .ts custom hooks', () => {
		const tsrx = `"use strong";
import { useState } from 'octane';
export function A() @{
  const [n, setN] = useState(0);
  <button onClick={() => setN((p) => p + Math.random())}>{n as string}</button>
}`;
		const hook = `"use strong";
import { useReducer } from 'octane';
export function useLog() {
  const [entries, append] = useReducer((list, entry) => [...list, { entry, at: Date.now() }], []);
  return [entries, append];
}`;
		expect(strongCode(tsrx, '/src/A.tsrx')).toBe(IMPURE_UPDATER);
		expect(() => slotHooks(hook, '/src/useLog.ts')).toThrow(IMPURE_UPDATER);
		expect(() => slotHooks(hook.replace('"use strong";\n', ''), '/src/useLog.ts')).not.toThrow();
	});

	it('explains the replay and names the replacement', () => {
		const source = tsx(
			`export function A() { const [n, setN] = useState(0); return <b onClick={() => setN((p) => p + Date.now())}>{n}</b>; }`,
			IMPORTS,
			true,
		);
		const diagnostic = volarDiagnostic(source, '/src/App.tsx', IMPURE_UPDATER);
		expect(diagnostic.start.offset).toBe(source.indexOf('Date.now'));
		expect(diagnostic.message).toContain('replay');
		expect(diagnostic.message).toContain(
			'const now = Date.now(); setValue((current) => current + now)',
		);
	});

	it('preserves emitted client and server code for valid updaters and reducers', () => {
		expectUnchangedOutput(
			tsx(`function reducer(state, action) { return action.type === 'add' ? [...state, action.item] : state; }
export function A({ step }) {
  const [n, setN] = useState(0);
  const [items, dispatch] = useReducer(reducer, []);
  return <b onClick={() => { setN((p) => p + step); dispatch({ type: 'add', item: n }); }}>{items.length}</b>;
}`),
			'/src/App.tsx',
		);
	});
});

describe('Strong state mutation outside render', () => {
	it.each([
		[
			'a pushed array passed back to its setter',
			`export function A() { const [items, setItems] = useState([]); return <button onClick={() => { items.push(1); setItems(items); }}>{items.length}</button>; }`,
		],
		[
			'a nested array before a spread copy',
			`export function A() { const [s, setS] = useState({ list: [] }); return <button onClick={() => { s.list.push(1); setS({ ...s }); }}>{s.list.length}</button>; }`,
		],
		[
			'a nested array in an effect',
			`export function A() { const [s] = useState({ list: [] }); useEffect(() => { s.list.push(1); }); return <p>{s.list.length}</p>; }`,
		],
		[
			'a property assignment',
			`export function A() { const [s, setS] = useState({ count: 0 }); return <b onClick={() => { s.count = 1; setS({ ...s }); }}>{s.count}</b>; }`,
		],
		[
			'an update expression',
			`export function A() { const [s, setS] = useState({ count: 0 }); return <b onClick={() => { s.count++; setS({ ...s }); }}>{s.count}</b>; }`,
		],
		[
			'a deletion',
			`export function A() { const [s, setS] = useState({ count: 0 }); return <b onClick={() => { delete s.count; setS({ ...s }); }}>{s.count}</b>; }`,
		],
		[
			'a destructuring assignment target',
			`export function A() { const [s, setS] = useState({ count: 0 }); return <b onClick={() => { [s.count] = [1]; setS({ ...s }); }}>{s.count}</b>; }`,
		],
		[
			'Object.assign',
			`export function A() { const [s, setS] = useState({ count: 0 }); return <b onClick={() => { Object.assign(s, { count: 1 }); setS({ ...s }); }}>{s.count}</b>; }`,
		],
		[
			'a Map set',
			`export function A() { const [m, setM] = useState(new Map()); return <b onClick={() => { m.set(1, 2); setM(new Map(m)); }}>{m.size}</b>; }`,
		],
		[
			'a lazily created Set',
			`export function A() { const [m, setM] = useState(() => new Set()); return <b onClick={() => { m.add(1); setM(new Set(m)); }}>{m.size}</b>; }`,
		],
		[
			'an array length reset in effect cleanup',
			`export function A() { const [items, setItems] = useState([]); useEffect(() => () => { items.length = 0; }); return <b onClick={() => setItems([1])}>{items.length}</b>; }`,
		],
		[
			'a timer callback',
			`export function A() { const [items] = useState([]); useEffect(() => { const id = setTimeout(() => items.push(1)); return () => clearTimeout(id); }); return <b>{items.length}</b>; }`,
		],
		[
			'reducer state initialized as an array',
			`export function A() { const [s, d] = useReducer((s, a) => [...s, a], []); return <b onClick={() => { s.push(1); d(2); }}>{s.length}</b>; }`,
		],
		[
			'a tuple index',
			`export function A() { const tuple = useState([]); return <b onClick={() => { tuple[0].push(1); tuple[1]([...tuple[0]]); }}>{tuple[0].length}</b>; }`,
		],
		[
			'a tuple passed to a helper',
			`function add(pair) { pair[0].push(1); } export function A() { const tuple = useState([]); return <b onClick={() => { add(tuple); tuple[1]([...tuple[0]]); }}>{tuple[0].length}</b>; }`,
		],
		[
			'a destructured tuple parameter',
			`function add([items, setItems]) { items.push(1); setItems([...items]); } export function A() { const tuple = useState([]); return <b onClick={() => add(tuple)}>{tuple[0].length}</b>; }`,
		],
		[
			'an object-destructured tuple parameter with a default',
			`function add({ 0: items = [] }) { items.push(1); } export function A() { const tuple = useState([]); return <b onClick={() => add(tuple)}>{tuple[0].length}</b>; }`,
		],
		[
			'an Effect Event called with the state',
			`export function A() { const [items, setItems] = useState([]); const add = useEffectEvent((list) => { list.push(1); }); return <b onClick={() => { add(items); setItems([...items]); }}>{items.length}</b>; }`,
		],
		[
			'a helper parameter with a default',
			`function add(list = []) { list.push(1); return list; } export function A() { const [items, setItems] = useState([]); return <b onClick={() => setItems([...add(items)])}>{items.length}</b>; }`,
		],
		[
			'a destructured helper parameter with a default',
			`function add({ list } = { list: [] }) { list.push(1); } export function A() { const [s, setS] = useState({ list: [] }); return <b onClick={() => { add(s); setS({ ...s }); }}>{s.list.length}</b>; }`,
		],
		[
			'a linked-state array',
			`export function A(props) { const [items, setItems] = useLinkedState(props.id, () => []); return <b onClick={() => { items.push(1); setItems([...items]); }}>{items.length}</b>; }`,
		],
		[
			'an updater that mutates the state it receives',
			`export function A() { const [items, setItems] = useState([]); return <b onClick={() => setItems((prev) => { prev.push(1); return prev; })}>{items.length}</b>; }`,
		],
		[
			'a destructured updater parameter',
			`export function A() { const [s, setS] = useState({ list: [] }); return <b onClick={() => setS(({ list }) => { list.push(1); return { list }; })}>{s.list.length}</b>; }`,
		],
		[
			'a reducer that mutates its state',
			`function reducer(state, action) { state.list.push(action); return { ...state }; } export function A() { const [s, d] = useReducer(reducer, { list: [] }); return <b onClick={() => d(1)}>{s.list.length}</b>; }`,
		],
		[
			'a useOptimistic reducer that mutates its base state',
			`export function A() { const [s] = useState({ list: [] }); const [shown, add] = useOptimistic(s, (current, item) => { current.list.push(item); return current; }); return <b onClick={() => add(1)}>{shown.list.length}</b>; }`,
		],
		[
			'a destructured updater parameter with a default',
			`export function A() { const [s, setS] = useState({ list: [] }); return <b onClick={() => setS(({ list } = { list: [] }) => { list.push(1); return { list }; })}>{s.list.length}</b>; }`,
		],
		[
			'a reducer state parameter with a default',
			`function reducer(state = [], action) { state.push(action); return [...state]; } export function A() { const [items, dispatch] = useReducer(reducer, []); return <b onClick={() => dispatch(1)}>{items.length}</b>; }`,
		],
	])('rejects %s', (_label, body) => {
		expect(rejected(body)).toBe(SNAPSHOT_MUTATION);
	});

	// The likely rewrites after `items.push` is rejected keep the same object.
	it.each([
		[
			'a local alias',
			`export function A() { const [items, setItems] = useState([]); return <b onClick={() => { const list = items; list.push(1); setItems([...list]); }}>{items.length}</b>; }`,
		],
		[
			'a destructured property',
			`export function A() { const [s, setS] = useState({ list: [] }); return <b onClick={() => { const { list } = s; list.push(1); setS({ ...s, list }); }}>{s.list.length}</b>; }`,
		],
		[
			'a member alias',
			`export function A() { const [s, setS] = useState({ list: [] }); return <b onClick={() => { const list = s.list; list.push(1); setS({ ...s, list }); }}>{s.list.length}</b>; }`,
		],
		[
			'a helper that returns the mutated argument',
			`function add(list, item) { list.push(item); return list; } export function A() { const [items, setItems] = useState([]); return <b onClick={() => setItems([...add(items, 1)])}>{items.length}</b>; }`,
		],
		[
			'an updater that returns the same object',
			`export function A() { const [items, setItems] = useState([]); return <b onClick={() => setItems((current) => { current.push(1); return current; })}>{items.length}</b>; }`,
		],
		[
			'an optional call',
			`export function A() { const [items, setItems] = useState([]); return <b onClick={() => { items?.push(1); setItems([...items]); }}>{items.length}</b>; }`,
		],
		[
			'an optional member chain',
			`export function A() { const [s, setS] = useState({ list: [] }); return <b onClick={() => { s?.list.push(1); setS({ ...s }); }}>{s.list.length}</b>; }`,
		],
		[
			'Object.assign before a spread',
			`export function A() { const [s, setS] = useState({ list: [] }); return <b onClick={() => { Object.assign(s, { list: [...s.list, 1] }); setS({ ...s }); }}>{s.list.length}</b>; }`,
		],
	])('rejects the rewrite through %s', (_label, body) => {
		expect(rejected(body)).toBe(SNAPSHOT_MUTATION);
	});

	it.each([
		["import { useState as useCell, useEffect } from 'octane';", 'useCell'],
		["import * as Octane from 'octane'; const { useEffect } = Octane;", 'Octane.useState'],
	])('recognizes %s', (imports, hook) => {
		const body = `export function A() { const [items, setItems] = ${hook}([]); return <b onClick={() => { items.push(1); setItems(items); }}>{items.length}</b>; }`;
		expect(rejected(body, imports)).toBe(SNAPSHOT_MUTATION);
	});

	it('keeps render-time mutations on the render diagnostic, including nested arrays and collections', () => {
		expect(
			rejected(
				`export function A() { const [s] = useState({ list: [] }); s.list.push(1); return <b>{s.list.length}</b>; }`,
			),
		).toBe(RENDER_SNAPSHOT_MUTATION);
		expect(
			rejected(
				`export function A() { const [m] = useState(new Map()); m.clear(); return <b>{m.size}</b>; }`,
			),
		).toBe(RENDER_SNAPSHOT_MUTATION);
		expect(
			rejected(
				`export function A() { const [s] = useState({ n: 0 }); Object.assign(s, { n: 1 }); return <b>{s.n}</b>; }`,
			),
		).toBe(RENDER_SNAPSHOT_MUTATION);
	});

	it('follows an Effect Event for the state it receives without treating its captures as stale', () => {
		expect(
			strongCode(
				tsx(`export function A({ save }) {
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const record = useEffectEvent((list) => { setCount(count + list.length); });
  return <b onClick={async () => { await save(); record(items); setItems((current) => [...current, 1]); }}>{count}</b>;
}`),
			),
		).toBeNull();
	});

	it('keeps copies, refs, props, object methods, and shadowed globals legal', () => {
		expect(
			strongCode(
				tsx(`export function A(props) {
  const [items, setItems] = useState([]);
  const [m, setM] = useState(new Map());
  const [s, setS] = useState({ list: [], sort() { return 1; }, set() { return 2; } });
  const ref = useRef([]);
  return (
    <b
      onClick={() => {
        const copy = [...items];
        copy.push(1);
        setItems(copy);
        setItems(items.slice().sort());
        setM(new Map(m).set(1, 2));
        setS(Object.assign({}, s, { list: [...s.list, 1] }));
        s.sort();
        s.set();
        ref.current.push(1);
        props.list.push(1);
        { const Object = { assign() {} }; Object.assign(items, {}); }
        { const useState = (value) => [value, () => {}]; const [local] = useState([]); local.push(1); }
      }}
    >
      {items.length}
      {m.size}
      {s.list.length}
    </b>
  );
}`),
			),
		).toBeNull();
	});

	it('checks .tsrx components and plain .ts custom hooks', () => {
		const tsrx = `"use strong";
import { useState } from 'octane';
export function A() @{
  const [items, setItems] = useState([]);
  <button onClick={() => { items.push(1); setItems(items); }}>{items.length as string}</button>
}`;
		const hook = `"use strong";
import { useState } from 'octane';
export function useList() {
  const [items, setItems] = useState([]);
  return [items, (item) => { items.push(item); setItems([...items]); }];
}`;
		expect(strongCode(tsrx, '/src/A.tsrx')).toBe(SNAPSHOT_MUTATION);
		expect(() => slotHooks(hook, '/src/useList.ts')).toThrow(SNAPSHOT_MUTATION);
		expect(() => slotHooks(hook.replace('"use strong";\n', ''), '/src/useList.ts')).not.toThrow();
	});

	it('locates the mutation and names the replacement', () => {
		const source = tsx(
			`export function A() { const [items, setItems] = useState([]); return <button onClick={() => { items.push(1); setItems(items); }}>{items.length}</button>; }`,
			IMPORTS,
			true,
		);
		const diagnostic = volarDiagnostic(source, '/src/App.tsx', SNAPSHOT_MUTATION);
		expect(diagnostic.start.offset).toBe(source.indexOf('items.push'));
		expect(diagnostic.end.offset).toBe(source.indexOf('items.push') + 'items.push'.length);
		expect(diagnostic.message).toContain('setItems((current) => [...current, item])');
		expect(diagnostic.message).toContain('useRef');
	});

	it('preserves emitted client and server code for immutable updates', () => {
		expectUnchangedOutput(
			tsx(`export function A() {
  const [items, setItems] = useState([]);
  return <b onClick={() => { setItems([...items, 1]); setItems((current) => current.concat(2)); }}>{items.length}</b>;
}`),
			'/src/App.tsx',
		);
	});
});

describe('Strong stale deferred state updates', () => {
	it.each([
		[
			'an update after await',
			`export function A({ save }) { const [n, setN] = useState(0); return <button onClick={async () => { await save(); setN(n + 1); }}>{n}</button>; }`,
		],
		[
			'a timer callback',
			`export function A() { const [n, setN] = useState(0); return <button onClick={() => setTimeout(() => setN(n + 1), 500)}>{n}</button>; }`,
		],
		[
			'an object spread after await',
			`export function A({ save }) { const [s, setS] = useState({ done: false }); return <b onClick={async () => { await save(); setS({ ...s, done: true }); }}>{String(s.done)}</b>; }`,
		],
		[
			'a promise continuation',
			`export function A({ load }) { const [items, setItems] = useState([]); return <b onClick={() => load().then((item) => setItems([...items, item]))}>{items.length}</b>; }`,
		],
		[
			'a promise rejection handler',
			`export function A({ load }) { const [errors, setErrors] = useState([]); return <b onClick={() => load().catch((error) => setErrors(errors.concat(error)))}>{errors.length}</b>; }`,
		],
		[
			'an interval started by an effect',
			`export function A() { const [n, setN] = useState(0); useEffect(() => { const id = setInterval(() => setN(n + 1), 1000); return () => clearInterval(id); }); return <b>{n}</b>; }`,
		],
		[
			'an animation frame',
			`export function A() { const [n, setN] = useState(0); return <b onClick={() => requestAnimationFrame(() => setN(n + 1))}>{n}</b>; }`,
		],
		[
			'a microtask',
			`export function A() { const [n, setN] = useState(0); return <b onClick={() => queueMicrotask(() => setN(n + 1))}>{n}</b>; }`,
		],
		[
			'window.setTimeout',
			`export function A() { const [n, setN] = useState(0); return <b onClick={() => window.setTimeout(() => setN(n + 1), 500)}>{n}</b>; }`,
		],
		[
			'a named timer callback',
			`export function A() { const [n, setN] = useState(0); const tick = () => setN(n + 1); return <b onClick={() => setTimeout(tick, 500)}>{n}</b>; }`,
		],
		[
			'a helper called after await',
			`export function A({ save }) { const [n, setN] = useState(0); const bump = () => setN(n + 1); return <b onClick={async () => { await save(); bump(); }}>{n}</b>; }`,
		],
		[
			'a helper receiving the snapshot after await',
			`export function A({ save }) { const [n, setN] = useState(0); function apply(value) { setN(value + 1); } return <b onClick={async () => { await save(); apply(n); }}>{n}</b>; }`,
		],
		[
			'an async effect continuation',
			`export function A({ load }) { const [items, setItems] = useState([]); useEffect(() => { (async () => { const item = await load(); setItems([...items, item]); })(); }); return <b>{items.length}</b>; }`,
		],
		[
			'a snapshot passed to an Effect Event after await',
			`export function A({ save }) { const [n, setN] = useState(0); const apply = useEffectEvent((value) => setN(value + 1)); return <b onClick={async () => { await save(); apply(n); }}>{n}</b>; }`,
		],
		[
			'a value computed from a stale Effect Event argument',
			`export function A({ save }) { const [n, setN] = useState(0); const apply = useEffectEvent((value) => { const next = value + 1; setN(next); }); return <b onClick={async () => { await save(); apply(n); }}>{n}</b>; }`,
		],
		[
			'a stale Effect Event argument forwarded to a helper',
			`export function A({ save }) { const [n, setN] = useState(0); const set = (value) => setN(value + 1); const apply = useEffectEvent((value) => set(value)); return <b onClick={async () => { await save(); apply(n); }}>{n}</b>; }`,
		],
		[
			'a stale tuple passed to an Effect Event',
			`export function A({ save }) { const tuple = useState(0); const apply = useEffectEvent((pair) => pair[1](pair[0] + 1)); return <b onClick={async () => { await save(); apply(tuple); }}>{tuple[0]}</b>; }`,
		],
		[
			'a stale tuple destructured by an Effect Event',
			`export function A({ save }) { const tuple = useState(0); const apply = useEffectEvent(([value, set]) => set(value + 1)); return <b onClick={async () => { await save(); apply(tuple); }}>{tuple[0]}</b>; }`,
		],
		[
			'a derived value passed to an Effect Event after await',
			`export function A({ save }) { const [n, setN] = useState(0); const apply = useEffectEvent((value) => setN(value)); return <b onClick={async () => { const next = n + 1; await save(); apply(next); }}>{n}</b>; }`,
		],
		[
			'an expression passed to an Effect Event after await',
			`export function A({ save }) { const [n, setN] = useState(0); const apply = useEffectEvent((value) => setN(value)); return <b onClick={async () => { await save(); apply(n + 1); }}>{n}</b>; }`,
		],
		[
			'an expression passed to an Effect Event from an effect timer',
			`export function A() { const [n, setN] = useState(0); const apply = useEffectEvent((value) => setN(value)); useEffect(() => { const id = setTimeout(() => apply(n + 1), 100); return () => clearTimeout(id); }); return <b>{n}</b>; }`,
		],
		[
			'an expression passed to a helper after await',
			`export function A({ save }) { const [n, setN] = useState(0); function apply(value) { setN(value); } return <b onClick={async () => { await save(); apply(n + 1); }}>{n}</b>; }`,
		],
		[
			'an expression passed to a defaulted Effect Event parameter after await',
			`export function A({ save }) { const [n, setN] = useState(0); const apply = useEffectEvent((value = 0) => setN(value)); return <b onClick={async () => { await save(); apply(n + 1); }}>{n}</b>; }`,
		],
		[
			'a derived value passed to a defaulted helper parameter after await',
			`export function A({ save }) { const [n, setN] = useState(0); function apply(value = 0) { setN(value); } return <b onClick={async () => { const next = n + 1; await save(); apply(next); }}>{n}</b>; }`,
		],
		[
			'an awaited snapshot passed to an inline callback',
			`export function A() { const [n, setN] = useState(0); return <b onClick={async () => { ((apply, value) => apply(value))(setN, await Promise.resolve(n)); }}>{n}</b>; }`,
		],
		[
			'state read after an await inside an Effect Event',
			`export function A({ save }) { const [n, setN] = useState(0); const apply = useEffectEvent(async () => { await save(); setN(n + 1); }); return <b onClick={() => apply()}>{n}</b>; }`,
		],
		[
			'state read after an await inside an Effect Event called from a timer',
			`export function A({ save }) { const [n, setN] = useState(0); const apply = useEffectEvent(async () => { await save(); setN(n + 1); }); useEffect(() => { setTimeout(() => apply(), 100); }); return <b>{n}</b>; }`,
		],
		[
			'a timer created inside an Effect Event',
			`export function A() { const [n, setN] = useState(0); const later = useEffectEvent(() => { setTimeout(() => setN(n + 1), 100); }); useEffect(() => later()); return <b>{n}</b>; }`,
		],
		[
			'a reducer dispatch after await',
			`export function A({ save }) { const [s, d] = useReducer((s, a) => a, 0); return <b onClick={async () => { await save(); d(s + 1); }}>{s}</b>; }`,
		],
		[
			'a setter alias with an optional call',
			`export function A({ save }) { const [n, setN] = useState(0); const update = setN; return <b onClick={async () => { await save(); update?.(n + 1); }}>{n}</b>; }`,
		],
		[
			'a tuple index',
			`export function A({ save }) { const tuple = useState(0); return <b onClick={async () => { await save(); tuple[1](tuple[0] + 1); }}>{tuple[0]}</b>; }`,
		],
	])('rejects %s', (_label, body) => {
		expect(rejected(body)).toBe(STALE_STATE_UPDATE);
	});

	// The likely rewrites after the diagnostic points at `n` after an await.
	it.each([
		['computing the next value before the await', `const next = n + 1; await save(); setN(next);`],
		[
			'copying the snapshot before the await',
			`const current = n; await save(); setN(current + 1);`,
		],
		['an updater that ignores its argument', `await save(); setN(() => n + 1);`],
		['an updater that adds the snapshot', `await save(); setN((p) => p + n);`],
	])('rejects the rewrite %s', (_label, handler) => {
		expect(
			rejected(
				`export function A({ save }) { const [n, setN] = useState(0); return <b onClick={async () => { ${handler} }}>{n}</b>; }`,
			),
		).toBe(STALE_STATE_UPDATE);
	});

	it.each([
		["import { useState as useCell } from 'octane';", 'useCell(0)'],
		["import * as Octane from 'octane';", 'Octane.useState(0)'],
	])('recognizes %s', (imports, hook) => {
		const body = `export function A() { const [n, setN] = ${hook}; return <b onClick={() => setTimeout(() => setN(n + 1))}>{n}</b>; }`;
		expect(rejected(body, imports)).toBe(STALE_STATE_UPDATE);
	});

	it('keeps synchronous updates, updaters, getters, and fresh values legal', () => {
		expect(
			strongCode(
				tsx(`export function A({ save, maybe, subscribe }) {
  const [n, setN, getN] = useState(0);
  const [m, setM] = useState(0);
  useEffect(() => subscribe(() => setN(n + 1)));
  return (
    <b
      onClick={async () => {
        setN(n + 1);
        [1, 2].forEach((step) => setN(n + step));
        { const setTimeout = (fn) => fn(); setTimeout(() => setN(n + 1)); }
        if (maybe) await save();
        setN(n + 1);
        const data = await save();
        setN((p) => p + 1);
        setN(getN() + 1);
        setN(data);
        setM(n + 1);
        setTimeout(() => setN((p) => p + 1));
      }}
    >
      {n}
      {m}
    </b>
  );
}`),
			),
		).toBeNull();
	});

	it('keeps Effect Events called from timers and promises legal', () => {
		expect(
			strongCode(
				tsx(`export function A({ load }) {
  const [n, setN] = useState(0);
  const tick = useEffectEvent(() => setN(n + 1));
  const step = useEffectEvent(() => { const next = n + 1; setN(next); });
  const bump = () => setN(n + 1);
  const set = (value) => setN(value + 1);
  const viaHelper = useEffectEvent(() => bump());
  const viaCapturedArgument = useEffectEvent(() => set(n));
  const viaImmediateCall = useEffectEvent(() => { (() => setN(n + 1))(); });
  const apply = useEffectEvent((value) => setN(value));
  useEffect(() => {
    const id = setInterval(tick, 1000);
    setTimeout(step, 500);
    setTimeout(viaHelper, 500);
    setTimeout(viaCapturedArgument, 500);
    setTimeout(viaImmediateCall, 500);
    load().then(() => tick());
    return () => clearInterval(id);
  });
  return <b onClick={() => { apply(n + 1); set(n + 1); setTimeout(() => tick(), 100); }}>{n}</b>;
}`),
			),
		).toBeNull();
	});

	it('checks .tsrx components and plain .ts custom hooks', () => {
		const tsrx = `"use strong";
import { useState } from 'octane';
export function A(props) @{
  const [n, setN] = useState(0);
  <button onClick={async () => { await props.save(); setN(n + 1); }}>{n as string}</button>
}`;
		const hook = `"use strong";
import { useState } from 'octane';
export function useSave(save) {
  const [n, setN] = useState(0);
  return [n, async () => { await save(); setN(n + 1); }];
}`;
		expect(strongCode(tsrx, '/src/A.tsrx')).toBe(STALE_STATE_UPDATE);
		expect(() => slotHooks(hook, '/src/useSave.ts')).toThrow(STALE_STATE_UPDATE);
		expect(() => slotHooks(hook.replace('"use strong";\n', ''), '/src/useSave.ts')).not.toThrow();
	});

	it('locates the snapshot read and names both replacements', () => {
		const source = tsx(
			`export function A({ save }) { const [n, setN] = useState(0); return <button onClick={async () => { await save(); setN(n + 1); }}>{n}</button>; }`,
			IMPORTS,
			true,
		);
		const diagnostic = volarDiagnostic(source, '/src/App.tsx', STALE_STATE_UPDATE);
		expect(diagnostic.start.offset).toBe(source.indexOf('n + 1'));
		expect(diagnostic.message).toContain('setValue((current) => current + 1)');
		expect(diagnostic.message).toContain('state getter');
		const reducer = tsx(
			`export function A({ save }) { const [s, d] = useReducer((s, a) => a, 0); return <b onClick={async () => { await save(); d(s + 1); }}>{s}</b>; }`,
			IMPORTS,
			true,
		);
		expect(volarDiagnostic(reducer, '/src/App.tsx', STALE_STATE_UPDATE).message).toContain(
			'in the reducer',
		);
	});

	it('preserves emitted client and server code for deferred updaters', () => {
		expectUnchangedOutput(
			tsx(`export function A({ save }) {
  const [n, setN] = useState(0);
  return <b onClick={async () => { await save(); setN((p) => p + 1); setTimeout(() => setN((p) => p - 1)); }}>{n}</b>;
}`),
			'/src/App.tsx',
		);
	});
});

describe('Strong write-only state', () => {
	it.each([
		[
			'an elided value with an updater',
			`export function A({ store }) { const [, force] = useState(0); useEffect(() => store.subscribe(() => force(x => x + 1))); return <p>{store.value}</p>; }`,
		],
		[
			'an unused value binding',
			`export function A({ store }) { const [tick, force] = useState(0); useEffect(() => store.subscribe(() => force((x) => x + 1))); return <p>{store.value}</p>; }`,
		],
		[
			'an unused getter',
			`export function A({ store }) { const [, force, read] = useState(0); useEffect(() => store.subscribe(() => force((x) => x + 1))); return <p>{store.value}</p>; }`,
		],
		[
			'a linked state tuple',
			`export function A(props) { const [, force] = useLinkedState(props.id, () => 0); return <p onClick={() => force(1)}>{props.id}</p>; }`,
		],
	])('rejects %s', (_label, body) => {
		expect(rejected(body)).toBe(WRITE_ONLY_STATE);
	});

	// The likely rewrites keep a value that nothing renders.
	it.each([
		[
			'the useReducer force-update idiom',
			`const [, forceUpdate] = useReducer((x) => x + 1, 0); useEffect(() => store.subscribe(forceUpdate));`,
		],
		[
			'selecting the setter by index',
			`const force = useState(0)[1]; useEffect(() => store.subscribe(() => force({})));`,
		],
		[
			'object destructuring',
			`const { 1: force } = useState(0); useEffect(() => store.subscribe(() => force({})));`,
		],
		[
			'reading the value only to write it',
			`const [tick, force] = useState(0); useEffect(() => store.subscribe(() => force(tick + 1)));`,
		],
	])('rejects the rewrite %s', (_label, setup) => {
		expect(rejected(`export function A({ store }) { ${setup} return <p>{store.value}</p>; }`)).toBe(
			WRITE_ONLY_STATE,
		);
	});

	it.each([
		["import { useState as useCell, useEffect } from 'octane';", 'useCell(0)'],
		["import * as Octane from 'octane'; const { useEffect } = Octane;", 'Octane.useState(0)'],
		["import * as Octane from 'octane'; const { useEffect } = Octane;", 'Octane?.useState(0)'],
	])('recognizes %s', (imports, hook) => {
		const body = `export function A({ store }) { const [, force] = ${hook}; useEffect(() => store.subscribe(() => force({}))); return <p>{store.value}</p>; }`;
		expect(rejected(body, imports)).toBe(WRITE_ONLY_STATE);
	});

	it('keeps read values, getters, whole tuples, unused tuples, and shadowed hooks legal', () => {
		expect(
			strongCode(
				tsx(`function useLocal() { return [0, () => {}]; }
export function A({ store }) {
  const [, setCount, getCount] = useState(0);
  const [Icon, setIcon] = useState(() => 'i');
  const [value, setValue] = useState('');
  const [{ label }, setLabel] = useState({ label: 'a' });
  const tuple = useState(0);
  const [unused, setUnused] = useState(0);
  const [, setLocal] = useLocal();
  const [, setShadowed] = (() => { const useState = (value) => [value, () => {}]; return useState(0); })();
  return (
    <p
      onClick={() => {
        setCount(1);
        console.log(getCount());
        setIcon('b');
        setValue('x');
        setLabel({ label: 'b' });
        tuple[1](2);
        setLocal();
        setShadowed();
      }}
    >
      <Icon />
      <input value={value} />
      {label}
    </p>
  );
}`),
			),
		).toBeNull();
	});

	it('checks .tsrx components and plain .ts custom hooks', () => {
		const tsrx = `"use strong";
import { useState, useEffect } from 'octane';
export function A(props) @{
  const [, force] = useState(0);
  useEffect(() => props.store.subscribe(() => force((x) => x + 1)));
  <p>{props.store.value as string}</p>
}`;
		const hook = `"use strong";
import { useState } from 'octane';
export function useForceUpdate() {
  const [, force] = useState(0);
  return () => force((x) => x + 1);
}`;
		const shorthand = `"use strong";
import { useState } from 'octane';
export function A() @{
  const [value, setValue] = useState('');
  <input {value} onInput={(event) => setValue(event.currentTarget.value)} />
}`;
		expect(strongCode(tsrx, '/src/A.tsrx')).toBe(WRITE_ONLY_STATE);
		expect(strongCode(shorthand, '/src/A.tsrx')).toBeNull();
		expect(() => slotHooks(hook, '/src/useForceUpdate.ts')).toThrow(WRITE_ONLY_STATE);
		expect(() =>
			slotHooks(hook.replace('"use strong";\n', ''), '/src/useForceUpdate.ts'),
		).not.toThrow();
	});

	it('locates the tuple and names the replacement', () => {
		const source = tsx(
			`export function A({ store }) { const [, force] = useState(0); useEffect(() => store.subscribe(() => force(x => x + 1))); return <p>{store.value}</p>; }`,
			IMPORTS,
			true,
		);
		const diagnostic = volarDiagnostic(source, '/src/App.tsx', WRITE_ONLY_STATE);
		expect(diagnostic.start.offset).toBe(source.indexOf('[, force]'));
		expect(diagnostic.message).toContain(
			'useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)',
		);
	});

	it('preserves emitted client and server code for read state', () => {
		expectUnchangedOutput(
			tsx(`export function A() {
  const [count, setCount] = useState(0);
  return <b onClick={() => setCount(count + 1)}>{count}</b>;
}`),
			'/src/App.tsx',
		);
	});
});
