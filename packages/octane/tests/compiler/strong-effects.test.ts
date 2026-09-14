import { describe, expect, it } from 'vitest';
import { compile } from '../../src/compiler/compile.js';
import { slotHooks } from '../../src/compiler/slot-hooks.js';
import { compileToVolarMappings } from '../../src/compiler/volar.js';

const FETCH = 'OCTANE_STRONG_EFFECT_DATA_FETCH';
const CHAIN = 'OCTANE_STRONG_EFFECT_CHAIN';
const PROPS = 'OCTANE_STRONG_UNLINKED_PROP_STATE';
const component = (setup: string, params = 'props') => `
import { useState, useReducer, useLinkedState, useEffect, useLayoutEffect, useInsertionEffect, useEffectEvent } from 'octane';
export function App(${params}) @{
  ${setup}
  <div />
}`;

function rejects(source: string, code: string) {
	expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
	expect(() => compile(source, '/src/App.tsrx', { strong: true })).toThrow(code);
}

describe('Strong effect data loading', () => {
	it('checks optional calls on an immutable Octane namespace', () => {
		const source = `import * as Octane from 'octane';
export function App() @{
  const [data, setData] = Octane.useState(null);
  Octane?.useEffect(() => { fetch('/api').then(setData); });
  <div />
}`;
		expect(() => compile(source, '/src/App.tsrx', { strong: true })).toThrow(FETCH);
	});
	it.each([
		`useEffect(() => { fetch('/api').then(value => setData(value)); });`,
		`useEffect(() => { fetch('/api').then(r => r.json()).then(setData); });`,
		`useEffect(() => { const request = fetch('/api'); request.then(setData); });`,
		`useEffect(() => { async function load() { const r = await fetch('/api'); setData(await r.json()); } load(); });`,
		`useEffect(() => { (async () => { setData(await fetch('/api')); })(); });`,
		`useLayoutEffect(() => { globalThis.fetch('/api').then(setData); });`,
		`useInsertionEffect(() => { const load = fetch; load('/api').then(setData); });`,
		`useEffect(() => { const update = setData; fetch('/api').then(update); });`,
		`const load = () => { fetch('/api').then(setData); }; useEffect(load);`,
		`const update = useEffectEvent(setData); useEffect(() => { fetch('/api').then(update); });`,
		`useEffect(() => { (async () => { if (props.fetch) { await fetch('/api'); } else { await ready; } setData(1); })(); });`,
		`useEffect(() => { (async () => { if (props.fetch) { try { await fetch('/api'); return; } finally { await ready; setData(1); } } })(); });`,
		`useEffect(() => { (async () => { while (props.active) { if (props.fetch) { await fetch('/api'); break; } } await ready; setData(1); })(); });`,
		`useEffect(() => { (async () => { for (const item of props.items) { if (item.fetch) { await fetch('/api'); continue; } } await ready; setData(1); })(); });`,
		`useEffect(() => { (async () => { switch (props.mode) { case 'fetch': await fetch('/api'); break; default: break; } await ready; setData(1); })(); });`,
	])('rejects fetch continuations without cleanup: %s', (setup) => {
		rejects(component(`const [data, setData] = useState(null); ${setup}`), FETCH);
	});

	it.each([
		`useEffect(() => { fetch('/api').then(setData); return () => {}; });`,
		`useEffect(() => { const controller = new AbortController(); fetch('/api', { signal: controller.signal }).then(setData); return () => controller.abort(); });`,
		`useEffect(() => { return subscribe(value => setData(value)); });`,
		`useEffect(() => { fetch('/telemetry'); });`,
		`useEffect(() => { Promise.resolve(1).then(setData); });`,
		`useEffect(() => { const fetch = () => Promise.resolve(1); fetch().then(setData); });`,
		`useEffect(() => { function unused() { fetch('/api').then(setData); } });`,
		`useEffect(() => { return () => { fetch('/api').then(setData); }; });`,
		`useEffect(() => { (async () => { if (props.fetch) { await fetch('/api'); } else { await ready; setData(1); } })(); });`,
		`useEffect(() => { (async () => { props.fetch ? await fetch('/api') : (await ready, setData(1)); })(); });`,
		`useEffect(() => { (async () => { if (props.fetch) { await fetch('/telemetry'); return; } await ready; setData(1); })(); });`,
		`useEffect(() => { (async () => { if (props.fetch) { await fetch('/telemetry'); throw error; } await ready; setData(1); })(); });`,
		`useEffect(() => { (async () => { if (props.fetch) { await fetch('/telemetry'); { return; } } await ready; setData(1); })(); });`,
		`useEffect(() => { (async () => { if (props.fetch) { await fetch('/telemetry'); if (props.stop) return; else throw error; } await ready; setData(1); })(); });`,
		`useEffect(() => { (async () => { if (props.fetch) { try { await fetch('/telemetry'); return; } finally { consume(1); } } await ready; setData(1); })(); });`,
		`useEffect(() => { (async () => { if (props.fetch) { try { await fetch('/telemetry'); return; } finally { throw error; } } await ready; setData(1); })(); });`,
		`useEffect(() => { (async () => { for (const item of props.items) { if (item.fetch) { await fetch('/telemetry'); continue; } await ready; setData(1); } })(); });`,
		`useEffect(() => { (async () => { while (props.active) { if (props.fetch) { await fetch('/telemetry'); break; } await ready; setData(1); } })(); });`,
		`useEffect(() => { (async () => { switch (props.mode) { case 'fetch': await fetch('/telemetry'); break; default: await ready; setData(1); } })(); });`,
		`useEffect(() => { (async () => { rows: for (const item of props.items) { if (item.fetch) { await fetch('/telemetry'); continue rows; } await ready; setData(1); } })(); });`,
		`useEffect(() => { (async () => { while (props.active) { if (props.fetch) { try { await fetch('/telemetry'); break; } finally { return; } } } await ready; setData(1); })(); });`,
		`useEffect(() => { (async () => { for (const item of props.items) { if (item.fetch) { try { await fetch('/telemetry'); continue; } finally { throw error; } } } await ready; setData(1); })(); });`,
		`const onClick = () => { fetch('/api').then(setData); };`,
		`const load = () => { fetch('/api').then(setData); return () => {}; }; useEffect(() => load());`,
		`useEffect(() => (fetch('/api').then(setData), () => {}));`,
	])('preserves cleanup, subscriptions and non-fetch work: %s', (setup) => {
		expect(() =>
			compile(component(`const [data, setData] = useState(null); ${setup}`), '/src/App.tsrx', {
				strong: true,
			}),
		).not.toThrow();
	});

	it('ignores a shadowed state updater', () => {
		expect(() =>
			compile(
				component(
					`const [data, setData] = useState(null); useEffect(() => { const setData = consume; fetch('/api').then(setData); });`,
				),
				'/src/App.tsrx',
				{ strong: true },
			),
		).not.toThrow();
	});
});

describe('Strong effect chains', () => {
	it.each([
		`useEffect(() => { Promise.resolve().then(() => setFirst(1)); }); useEffect(() => { consume(first); });`,
		`useEffect(() => { consume(first); }); useEffect(() => { Promise.resolve().then(() => setFirst(1)); });`,
		`useEffect(() => { (async () => { await pending; setFirst(1); })(); }); useLayoutEffect(() => { consume(first); });`,
		`const value = first; const update = setFirst; useEffect(() => { Promise.resolve().then(update); }); useEffect(() => { consume(value); });`,
		`const value = first + 1; useEffect(() => { Promise.resolve().then(setFirst); }); useEffect(() => { consume(value); });`,
		`const update = useEffectEvent(setFirst); useEffect(() => { Promise.resolve().then(update); }); useEffect(() => { consume(first); });`,
		`const read = useEffectEvent(() => consume(second)); useEffect(() => { Promise.resolve().then(setFirst); }); useEffect(() => { read(); consume(first); });`,
		`const mixed = props.x + first; useEffect(() => { Promise.resolve().then(() => setFirst(1)); }); useEffect(() => { consume(mixed); });`,
		`const mixed = props.x + first; useEffect(() => { Promise.resolve().then(() => setFirst(1)); }); useEffect(() => { consume(1); }, [mixed]);`,
	])('rejects dependent effects after an asynchronous state write: %s', (setup) => {
		rejects(component(`const [first, setFirst] = useState(0); ${setup}`), CHAIN);
	});

	it.each([
		`useEffect(() => { Promise.resolve().then(() => setFirst(1)); }); useEffect(() => { consume(second); });`,
		`useEffect(() => { consume(first); Promise.resolve().then(() => setFirst(1)); });`,
		`useEffect(() => { function unused() { setFirst(1); } }); useEffect(() => { consume(first); });`,
		`useEffect(() => { const first = 123; consume(first); }); useEffect(() => { Promise.resolve().then(() => setFirst(1)); });`,
		`const onClick = () => setFirst(1); useEffect(() => { consume(first); });`,
		`useEffect(() => { setTimeout(() => setFirst(1), 0); }); useEffect(() => { consume(first); });`,
		`const read = useEffectEvent(() => consume(first)); useEffect(() => { Promise.resolve().then(setFirst); }); useEffect(() => { read(); });`,
		`const value = first + 1; const read = useEffectEvent(() => consume(value)); useEffect(() => { Promise.resolve().then(setFirst); }); useEffect(() => { Promise.resolve().then(read); });`,
	])('preserves independent effects: %s', (setup) => {
		expect(() =>
			compile(
				component(`const [first, setFirst] = useState(0); const [second] = useState(0); ${setup}`),
				'/src/App.tsrx',
				{ strong: true },
			),
		).not.toThrow();
	});

	it('keeps Effect Event state tuple reads non-reactive', () => {
		expect(() =>
			compile(
				component(`const state = useState(0);
const read = useEffectEvent(() => consume(state[0]));
useEffect(() => { Promise.resolve().then(state[1]); });
useEffect(() => { read(); });`),
				'/src/App.tsrx',
				{ strong: true },
			),
		).not.toThrow();
	});
});

describe('Strong prop state intent', () => {
	it.each([
		['props', `const [value] = useState(props.value);`],
		['{ value }', `const [state] = useState(value);`],
		['{ value: initial }', `const [state] = useState(initial);`],
		[
			'props',
			`const value = props.value; const initial = value; const [state] = useState(initial);`,
		],
		['props', `const { value } = props; const [state] = useState(value);`],
		['props', `const [state] = useState(props.value + 1);`],
		['props', `const [state] = useState(props.items.slice());`],
		['{ value } = {}', `const [state] = useState(value);`],
	])('requires explicit initial-only or linked intent: %s %s', (params, setup) => {
		rejects(component(setup, params), PROPS);
	});

	it.each([
		`const [state] = useState(() => props.value);`,
		`const [state] = useLinkedState(props.value, () => props.value);`,
		`const [state] = useState(0);`,
		`const value = 123; const [state] = useState(value);`,
		`const create = () => props.value; const [state] = useState(create);`,
	])('preserves deliberate capture and linked state: %s', (setup) => {
		expect(() => compile(component(setup), '/src/App.tsrx', { strong: true })).not.toThrow();
	});

	it('keeps prop-mixed derived state eligible for the eager initializer check', () => {
		rejects(
			component(
				`const [first] = useState(0); const mixed = props.x + first; const [state] = useState(mixed);`,
			),
			PROPS,
		);
	});

	it('keeps hook-named JSX builders free of prop-state intent checks', () => {
		expect(() =>
			compile(
				`"use strong";
import { useState } from 'octane';
function useDialog(title) { const [label] = useState(title); const dialog = <div>{label as string}</div>; return dialog; }
export function App() @{ const dialog = useDialog('x'); <div>{dialog}</div> }`,
				'/src/App.tsrx',
			),
		).not.toThrow();
	});

	it('does not confuse a shadowed hook with useState', () => {
		expect(() =>
			compile(
				`export function App(props) @{ const useState = identity; const value = useState(props.value); <div /> }`,
				'/src/App.tsrx',
				{ strong: true },
			),
		).not.toThrow();
	});
});

describe('Strong effect diagnostic integration', () => {
	const source = component(
		`const [data, setData] = useState(null); useEffect(() => { fetch('/api').then(setData); });`,
	);
	it.each(['client', 'server'] as const)('enforces %s compilation', (mode) => {
		expect(() => compile(source, '/src/App.tsrx', { strong: true, mode })).toThrow(FETCH);
	});
	it('reports a source-located Volar diagnostic', () => {
		const result = compileToVolarMappings(`"use strong";\n${source}`, '/src/App.tsrx');
		const error = result.diagnostics.find((error) => error.code === FETCH);
		expect(error).toBeDefined();
		expect(error!.start.line).toBeGreaterThan(1);
	});
	it('enforces plain TS custom hooks', () => {
		expect(() =>
			slotHooks(
				`"use strong"; import { useState, useEffect } from 'octane'; export function useData() { const [value, setValue] = useState(null); useEffect(() => { fetch('/api').then(setValue); }); return value; }`,
				'/src/use-data.ts',
			),
		).toThrow(FETCH);
	});
	it('enforces TSX components and namespace imports', () => {
		expect(() =>
			compile(
				`"use strong"; import * as O from 'octane'; export function App(props) { const [value] = O.useState(props.value); return <div />; }`,
				'/src/App.tsx',
			),
		).toThrow(PROPS);
	});
});

describe('Strong effect review regressions', () => {
	it.each([
		`useEffect(async () => { await ready; const value = await fetch('/api'); setData(value); });`,
		`useEffect(() => { Promise.resolve().then(() => fetch('/api').then(setData)); });`,
		`useEffect(() => { async function load() { await ready; fetch('/api').then(setData); } load(); });`,
	])('follows effect-owned fetches started after yielding: %s', (setup) => {
		rejects(component(`const [data, setData] = useState(null); ${setup}`), FETCH);
	});

	it('keeps fetches triggered by external events outside the effect-owned flow', () => {
		const source = component(
			`const [data, setData] = useState(null); useEffect(() => subscribe(async () => { const value = await fetch('/api'); setData(value); })); useEffect(() => consume(data));`,
		);
		expect(() => compile(source, '/src/Review.tsrx', { strong: true })).not.toThrow();
	});

	it.each([false, true])(
		'preserves event-owned updates and nested component graphs in dev=%s',
		(dev) => {
			for (const setup of [
				`useEffect(() => { const onKey = e => { if (e.key === 'Escape') setFirst(1); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }); useEffect(() => { document.title = String(first); });`,
				`useEffect(() => { const id = setInterval(() => setFirst(n => n + 1), 1000); return () => clearInterval(id); }); useEffect(() => { document.title = String(first); });`,
				`useEffect(() => subscribe(() => setFirst(1))); useEffect(() => consume(first));`,
				`useEffect(() => { const onChange = () => Promise.resolve().then(setFirst); return subscribe(onChange); }); useEffect(() => consume(first));`,
				`useEffect(() => { Promise.resolve().then(setFirst); }); function Inner() @{ useEffect(() => consume(first)); <i /> }`,
				`useEffect(() => { Promise.resolve().then(setFirst); }); const Inner = () => { useEffect(() => consume(first)); return <i />; };`,
			]) {
				expect(() =>
					compile(
						component(`const [first, setFirst] = useState(0); ${setup}`),
						'/src/Review.tsrx',
						{ strong: true, dev },
					),
				).not.toThrow();
			}
		},
	);

	it.each([
		`useEffect(async () => { const r = await fetch('/api'); setData(r); return r; });`,
		`useEffect(async () => { const r = await fetch('/api'); setData(r); return () => {}; });`,
		`const load = async () => { const r = await fetch('/api'); setData(r); }; useEffect(() => load());`,
		`useEffect(() => { (async () => { for (const b of props.bs) { if (b) { const r = await fetch('/api'); setData(r); } } })(); });`,
	])('still rejects an effect-owned fetch: %s', (setup) => {
		rejects(component(`const [data, setData] = useState(null); ${setup}`), FETCH);
	});

	it.each([
		`switch (props.mode) { default: return; }`,
		`switch (props.mode) { case 0: consume(0); default: return; }`,
		`while (true) { return; }`,
		`for (;;) { return; }`,
		`do { return; } while (props.active);`,
		`done: { return; }`,
	])('does not join a completed fetch branch through %s', (exit) => {
		const setup = `useEffect(() => { (async () => { if (props.fetch) { await fetch('/telemetry'); ${exit} } await ready; setData(1); })(); });`;
		expect(() =>
			compile(component(`const [data, setData] = useState(null); ${setup}`), '/src/Review.tsrx', {
				strong: true,
			}),
		).not.toThrow();
	});

	it.each([
		`switch (props.mode) { default: break; }`,
		`while (true) { break; }`,
		`done: { break done; }`,
	])('keeps normal continuation through %s', (control) => {
		const setup = `useEffect(() => { (async () => { if (props.fetch) { await fetch('/api'); ${control} } await ready; setData(1); })(); });`;
		rejects(component(`const [data, setData] = useState(null); ${setup}`), FETCH);
	});

	it.each([
		`switch (props.mode) { default: return; }`,
		`outer: { return; }`,
		`while (true) { if (props.active) return; }`,
		`outer: while (true) { continue outer; }`,
		`try { throw failure; } finally { return; }`,
	])('does not visit unreachable writes after %s', (exit) => {
		const setup = `useEffect(() => { (async () => { await fetch('/telemetry'); ${exit} setData(1); })(); });`;
		expect(() =>
			compile(component(`const [data, setData] = useState(null); ${setup}`), '/src/Review.tsrx', {
				strong: true,
			}),
		).not.toThrow();
	});

	it.each([
		["import { useState, useEffect } from 'octane/server';", 'useState', 'useEffect'],
		[
			"import * as Octane from 'octane'; const api = Octane; const { useState: state, useEffect: effect } = api;",
			'state',
			'effect',
		],
		[
			"import { useState, useEffect } from 'octane'; const state = useState; const effect = useEffect;",
			'state',
			'effect',
		],
		['', 'useState', 'useEffect'],
	])('shares canonical hook identity for effects and state: %s', (imports, state, effect) => {
		for (const mode of ['client', 'server'] as const) {
			const source = `${imports} export function App() @{ const [data, update] = ${state}(null); ${effect}(() => { fetch('/api').then(update); }); <div /> }`;
			expect(() => compile(source, '/src/Review.tsrx', { strong: true, mode })).toThrow(FETCH);
		}
		const plain = `"use strong"; ${imports} export function useData() { const [data, update] = ${state}(null); ${effect}(() => { fetch('/api').then(update); }); return data; }`;
		if (imports !== '') expect(() => slotHooks(plain, '/src/useData.ts')).toThrow(FETCH);
	});

	it('preserves plain unowned hooks alongside actual imported hooks', () => {
		const unowned = `export function useData() { const [data, update] = useState(null); useEffect(() => { fetch('/api').then(update); }); return data; }`;
		expect(slotHooks(unowned, '/src/useData.ts')).toBeNull();
		expect(slotHooks(`"use strong"; ${unowned}`, '/src/useData.ts')).toBeNull();
		const mixed = `import { useState as ownedState } from 'octane'; ${unowned.replace('const [data', 'ownedState(0); const [data')}`;
		const standard = slotHooks(mixed, '/src/useData.ts');
		const strong = slotHooks(`"use strong"; ${mixed}`, '/src/useData.ts');
		expect(standard).not.toBeNull();
		expect(strong?.code).toBe(`"use strong"; ${standard!.code}`);
	});

	it.each([
		"import { useState, useEffect } from 'other-library';",
		'function useState(value) { return [value, () => {}]; } function useEffect(callback) {}',
	])('preserves foreign and shadowed state/effect names: %s', (imports) => {
		const source = `${imports} export function App(props) @{ const [data, update] = useState(props.value); useEffect(() => { fetch('/api').then(update); }); <div /> }`;
		expect(() => compile(source, '/src/Review.tsrx', { strong: true })).not.toThrow();
	});

	it.each(['const', 'let', 'var'])('checks %s for-of bindings as unknown values', (kind) => {
		rejects(
			component(
				`const [value, setValue] = useState(0); for (${kind} b of props.bs) { if (b) setValue(1); }`,
			),
			'OCTANE_STRONG_RENDER_STATE_UPDATE',
		);
	});

	it.each(['initial', 'useToggle'])(
		'does not propagate component prop intent into local helper %s',
		(name) => {
			for (const [params, argument] of [
				['{ open }', 'open'],
				['props', 'props.open'],
			]) {
				const source = `import { useState } from 'octane'; function ${name}(initial) { const [on] = useState(initial); return on; } export function App(${params}) @{ const on = ${name}(${argument}); <div>{on}</div> }`;
				expect(() => compile(source, '/src/Review.tsrx', { strong: true })).not.toThrow();
			}
		},
	);

	it('checks eager reducer sources but preserves an explicit initializer', () => {
		rejects(component(`const [value] = useReducer((state) => state, props.value);`), PROPS);
		expect(() =>
			compile(
				component(`const [value] = useReducer((state) => state, props.value, initial => initial);`),
				'/src/Review.tsrx',
				{ strong: true },
			),
		).not.toThrow();
	});
});
