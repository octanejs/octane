import { describe, expect, it } from 'vitest';
import { compile } from '../../src/compiler/compile.js';
import { slotHooks } from '../../src/compiler/slot-hooks.js';
import { compileToVolarMappings } from '../../src/compiler/volar.js';

const FETCH = 'OCTANE_STRONG_EFFECT_DATA_FETCH';
const CHAIN = 'OCTANE_STRONG_EFFECT_CHAIN';
const PROPS = 'OCTANE_STRONG_UNLINKED_PROP_STATE';
const UPDATE = 'OCTANE_STRONG_EFFECT_STATE_UPDATE';
const HIDDEN = 'OCTANE_STRONG_EFFECT_HIDDEN_DEPENDENCY';
const LEAK = 'OCTANE_STRONG_EFFECT_RESOURCE_LEAK';
const component = (setup: string, params = 'props', output = '<div />') => `
import { useState, useReducer, useLinkedState, useEffect, useLayoutEffect, useInsertionEffect, useEffectEvent, useRef } from 'octane';
export function App(${params}) @{
  ${setup}
  ${output}
}`;

function rejects(source: string, code: string, filename = '/src/App.tsrx') {
	expect(() => compile(source, filename)).not.toThrow();
	expect(() => compile(source, filename, { strong: true })).toThrow(code);
}

function accepts(source: string, filename = '/src/App.tsrx') {
	expect(() => compile(source, filename, { strong: true })).not.toThrow();
}

// Every Strong error the editor publishes for a module.
function errors(source: string, filename = '/src/App.tsrx') {
	return compileToVolarMappings(source, filename, { strong: true })
		.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
		.map((diagnostic) => diagnostic.code);
}

// An asynchronous effect write that its cleanup provably ignores.
const guardedWrite = (write: string) =>
	`useEffect(() => { let active = true; pending.then((value) => { if (active) ${write}; }); return () => { active = false; }; });`;

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
		`useEffect(() => { const controller = new AbortController(); fetch('/api', { signal: controller.signal }).then(setData); return () => controller.abort(); });`,
		`useEffect(() => { let ignore = false; fetch('/api').then(r => r.json()).then(value => { if (!ignore) setData(value); }); return () => { ignore = true; }; });`,
		`useEffect(() => { return subscribe(value => setData(value)); });`,
		`useEffect(() => { fetch('/telemetry'); });`,
		`useEffect(() => { function unused() { fetch('/api').then(setData); } });`,
		`useEffect(() => { return () => { fetch('/api').then(setData); }; });`,
		`const onClick = () => { fetch('/api').then(setData); };`,
	])('preserves cancelled requests, subscriptions and non-state work: %s', (setup) => {
		accepts(
			component(`const [data, setData] = useState(null); ${setup}`, 'props', '<div>{data}</div>'),
		);
	});

	it('ignores a shadowed state updater', () => {
		accepts(
			component(
				`const [data, setData] = useState(null); useEffect(() => { const setData = consume; fetch('/api').then(setData); });`,
			),
		);
	});
});

describe('Strong asynchronous effect updates', () => {
	const app = (setup: string) =>
		component(
			`const [data, setData] = useState(null); ${setup}`,
			'props',
			'<div>{data}</div>',
		).replace(
			"from 'octane';",
			"from 'octane';\nimport { api } from './api';\nimport axios from 'axios';",
		);

	it.each([
		['an imported client', `useEffect(() => { api.get(props.id).then(setData); });`],
		[
			'a default-imported client',
			`useEffect(() => { axios.get('/x/' + props.id).then(r => setData(r.data)); });`,
		],
		['a rejection handler', `useEffect(() => { api.get(props.id).catch(setData); });`],
		['a combined promise', `useEffect(() => { Promise.all([api.a(), api.b()]).then(setData); });`],
		[
			'an awaited request',
			`useEffect(() => { (async () => { const value = await api.get(props.id); setData(value); })(); });`,
		],
		['an async effect callback', `useEffect(async () => { setData(await api.get(props.id)); });`],
		[
			'a promise-like value from a shadowed Promise',
			`useEffect(() => { const Promise = props.Promise; Promise.resolve().then(() => setData(1)); });`,
		],
		[
			'a settled promise whose value may be pending',
			`useEffect(() => { Promise.resolve(props.value).then(setData); });`,
		],
	])('rejects a state update in %s without cleanup', (_label, setup) => {
		rejects(app(setup), FETCH);
	});

	it.each([
		['an empty cleanup', `api.get(props.id).then(setData); return () => {};`],
		[
			'a flag the update never checks',
			`let ignore = false; api.get(props.id).then(value => setData(value)); return () => { ignore = true; };`,
		],
		[
			'a flag checked with the wrong polarity',
			`let ignore = false; api.get(props.id).then(value => { if (ignore) setData(value); }); return () => { ignore = true; };`,
		],
		[
			'a flag checked before the last await',
			`let ignore = false; (async () => { if (ignore) return; const value = await api.get(props.id); setData(value); })(); return () => { ignore = true; };`,
		],
		[
			'a flag checked before another await',
			`let ignore = false; (async () => { const value = await api.get(props.id); if (!ignore) { await api.more(); setData(value); } })(); return () => { ignore = true; };`,
		],
		[
			'a flag that cleanup sets to an unknown value',
			`let ignore = false; api.get(props.id).then(value => { if (!ignore) setData(value); }); return () => { ignore = props.flag; };`,
		],
		[
			'a disjunctive guard',
			`let ignore = false; api.get(props.id).then(value => { if (!ignore || props.force) setData(value); }); return () => { ignore = true; };`,
		],
		[
			'an update passed directly to then',
			`let ignore = false; api.get(props.id).then(setData); return () => { ignore = true; };`,
		],
		[
			'a controller whose signal never reaches the request',
			`const controller = new AbortController(); api.get(props.id).then(setData); return () => controller.abort();`,
		],
		[
			'a signal whose controller is never aborted',
			`const controller = new AbortController(); api.get(props.id, { signal: controller.signal }).then(setData); return () => {};`,
		],
		[
			'a different controller',
			`const first = new AbortController(); const second = new AbortController(); api.get(props.id, { signal: first.signal }).then(setData); return () => second.abort();`,
		],
		['an opaque cleanup', `api.get(props.id).then(setData); return props.unsubscribe;`],
		[
			'a sequence ending in an empty cleanup',
			`return (api.get(props.id).then(setData), () => {});`,
		],
	])('rejects a cleanup that does not cancel or ignore the result: %s', (_label, body) => {
		rejects(app(`useEffect(() => { ${body} });`), FETCH);
	});

	it.each([
		['a component-scoped flag', `let active = true;`, 'active'],
		['a ref flag', `const active = useRef(true);`, 'active.current'],
	])('rejects %s shared by every effect run', (_label, declaration, flag) => {
		const source = app(
			`${declaration} useEffect(() => { api.get(props.id).then(value => { if (${flag}) setData(value); }); return () => { ${flag} = false; }; });`,
		);
		rejects(source, FETCH);
	});

	it.each([
		`let active = true; api.get(props.id).then(value => { if (active) setData(value); }); return () => { active = false; };`,
		`let ignore = false; (async () => { const value = await api.get(props.id); if (ignore) return; setData(value); })(); return () => { ignore = true; };`,
		`let ignore = false; api.get(props.id).then(value => ignore || setData(value)); return () => { ignore = true; };`,
		`let ignore = false; api.get(props.id).then(value => !ignore && setData(value)); return () => { ignore = true; };`,
		`let ignore = false; api.get(props.id).then(value => { if (!ignore && props.enabled) setData(value); }); return () => { ignore = true; };`,
		`let ignore = false; api.get(props.id).then(value => { if (ignore === false) setData(value); }); return () => { ignore = true; };`,
		`let ignore = false; api.get(props.id).then(value => { if (ignore) return; setData(value); }).catch(error => { if (!ignore) setData(error); }); return () => { ignore = true; };`,
		`let ignore = false; const stop = () => { ignore = true; }; api.get(props.id).then(value => { if (!ignore) setData(value); }); return stop;`,
		`let ignore = false; api.get(props.id).then(value => { if (!ignore) setData(value); }); return () => stop(); function stop() { ignore = true; }`,
		`const controller = new AbortController(); const { signal } = controller; api.get(props.id, { signal }).then(setData); return () => controller.abort();`,
		`const controller = new AbortController(); api.get(props.id, { ...props.options, signal: controller.signal }).then(setData); return () => controller.abort();`,
		`const controller = new AbortController(); const signal = controller.signal; (async () => { const r = await fetch('/api', { signal }); setData(await r.json()); })(); return () => controller.abort();`,
		`const controller = new AbortController(); api.get(props.id).then(value => { if (!controller.signal.aborted) setData(value); }); return () => controller.abort();`,
		`const controller = new AbortController(); const alias = controller; api.get(props.id, { signal: alias.signal }).then(setData); return () => controller.abort();`,
		`const controller = new AbortController(); const alias = controller; api.get(props.id, { signal: controller.signal }).then(setData); return () => alias.abort();`,
	])('accepts cleanup that cancels or ignores the result: %s', (body) => {
		accepts(app(`useEffect(() => { ${body} });`));
	});

	const aborted = (body: string) =>
		`useEffect(() => { const controller = new AbortController(); const { signal } = controller; (async () => { ${body} })(); return () => controller.abort(); });`;

	it.each([
		[
			'a later request without the signal',
			`const r = await fetch('/a', { signal }); const other = await api.get(props.id); setData(other);`,
		],
		[
			'a zero-delay yield after the request',
			`const r = await fetch('/a', { signal }); await null; setData(r);`,
		],
		[
			'an exclusive branch with the signal',
			`if (props.fast) { await fetch('/a', { signal }); } else { await api.get(props.id); } setData(1);`,
		],
		[
			'an exclusive branch without the signal',
			`if (props.fast) { await api.get(props.id); } else { await fetch('/a', { signal }); } setData(1);`,
		],
		[
			'a later loop iteration',
			`const r = await fetch('/a', { signal }); for (const id of props.ids) { setData(r); await api.get(id); }`,
		],
		[
			'an unsigned request inside a signed loop',
			`while (await fetch('/a', { signal })) { await api.get(props.id); setData(1); }`,
		],
		[
			'a finally block after an exiting handler',
			`await api.warm(); try { await fetch('/a', { signal }); } catch { return; } finally { setData(1); }`,
		],
		[
			'a conditional request without the signal on one side',
			`const r = await (props.fast ? fetch('/a', { signal }) : api.get(props.id)); setData(r);`,
		],
		[
			'a catch handler after an unsigned request',
			`try { await fetch('/a', { signal }); } catch { await api.get(props.id); } setData(1);`,
		],
		[
			'a switch case that breaks inside a branch after an unsigned request',
			`switch (props.mode) { case 'a': await api.get(props.id); if (props.fast) break; await fetch('/b', { signal }); break; default: await fetch('/c', { signal }); } setData(1);`,
		],
		[
			'a loop that breaks inside a branch after an unsigned request',
			`await fetch('/a', { signal }); while (props.more) { await api.get(props.id); if (props.fast) break; await fetch('/b', { signal }); } setData(1);`,
		],
		[
			'a labeled continue that leaves an inner loop after an unsigned request',
			`await fetch('/a', { signal }); outer: for (const id of props.ids) { while (props.more) { await api.get(id); if (props.skip) continue outer; await fetch('/b', { signal }); } } setData(1);`,
		],
		[
			'a break before a signed loop test after an unsigned request',
			`while (await fetch('/a', { signal })) { await api.get(props.id); if (props.fast) break; } setData(1);`,
		],
		[
			'a labeled block that breaks after an unsigned request',
			`done: { await api.get(props.id); if (props.fast) break done; await fetch('/b', { signal }); } setData(1);`,
		],
		[
			'a loop that continues after an unsigned request',
			`await fetch('/a', { signal }); for (const id of props.ids) { await api.get(id); if (props.skip) continue; await fetch('/b', { signal }); } setData(1);`,
		],
	])('rejects an abort proof that does not cover %s', (_label, body) => {
		rejects(app(aborted(body)), FETCH);
	});

	it.each([
		[
			'both branches',
			`if (props.fast) { await fetch('/a', { signal }); } else { await fetch('/b', { signal }); } setData(1);`,
		],
		['a response body read', `const r = await fetch('/a', { signal }); setData(await r.json());`],
		[
			'the request after an exiting branch',
			`if (props.skip) { await api.get(props.id); return; } const r = await fetch('/a', { signal }); setData(r);`,
		],
		[
			'the latest request',
			`await api.warm(); const r = await fetch('/a', { signal }); setData(r);`,
		],
		[
			'a try block whose handler exits',
			`await api.warm(); try { await fetch('/a', { signal }); } catch { return; } setData(1);`,
		],
		[
			'the cases that leave a switch',
			`for (const id of props.ids) { switch (id) { case 0: await api.get(id); continue; default: await fetch('/a', { signal }); break; } setData(id); }`,
		],
		['a while test', `while (await fetch('/a', { signal })) { setData(1); }`],
		[
			'both sides of a conditional request',
			`const r = await (props.fast ? fetch('/a', { signal }) : fetch('/b', { signal })); setData(r);`,
		],
		[
			'a conditional request chain',
			`(props.fast ? fetch('/a', { signal }) : fetch('/b', { signal })).then(setData);`,
		],
		[
			'code after a finally block',
			`await api.warm(); try { await fetch('/a', { signal }); } catch { return; } finally { api.log(); } setData(1);`,
		],
		['a for test', `for (; await fetch('/a', { signal }); ) { setData(1); }`],
		[
			'a switch case that breaks inside a branch after a signed request',
			`switch (props.mode) { case 'a': await fetch('/a', { signal }); if (props.fast) break; await fetch('/b', { signal }); break; default: await fetch('/c', { signal }); } setData(1);`,
		],
		[
			'a request selected by a literal operand',
			`await (null ?? fetch('/a', { signal })); setData(1);`,
		],
		[
			'the cases that leave a switch with a labeled continue',
			`outer: for (const id of props.ids) { switch (id) { case 0: await api.get(id); continue outer; default: await fetch('/a', { signal }); } setData(id); }`,
		],
		[
			'a while test reached by a continue',
			`while (await fetch('/a', { signal })) { await api.get(props.id); if (props.skip) continue; } setData(1);`,
		],
		[
			'a for test reached by a continue',
			`for (; await fetch('/a', { signal }); ) { await api.get(props.id); if (props.skip) continue; } setData(1);`,
		],
	])('accepts an abort proof that covers %s', (_label, body) => {
		accepts(app(aborted(body)));
	});

	it('follows signals and flags through same-module helpers', () => {
		accepts(
			app(`async function load(signal, set) { const r = await fetch('/api', { signal }); set(await r.json()); }
function subscribeData(id, set) { let active = true; api.get(id).then(value => { if (active) set(value); }); return () => { active = false; }; }
useEffect(() => { const controller = new AbortController(); load(controller.signal, setData); return () => controller.abort(); });
useEffect(() => subscribeData(props.id, setData));`),
		);
		rejects(
			app(`function subscribeData(id, set) { let active = true; api.get(id).then(set); return () => { active = false; }; }
useEffect(() => subscribeData(props.id, setData));`),
			FETCH,
		);
	});

	it('follows controllers passed to same-module helpers', () => {
		const load = `async function load(controller, set) { const r = await fetch('/api', { signal: controller.signal }); set(await r.json()); }`;
		const stop = `function stop(controller) { controller.abort(); }`;
		accepts(
			app(`${load} ${stop}
useEffect(() => { const controller = new AbortController(); load(controller, setData); return () => stop(controller); });`),
		);
		accepts(
			app(`function read(controller, set, id) { api.get(id).then((value) => { if (!controller.signal.aborted) set(value); }); }
useEffect(() => { const controller = new AbortController(); const alias = controller; read(alias, setData, props.id); return () => { controller.abort(); }; });`),
		);
		const request = `async function request(controller) { const r = await fetch('/api', { signal: controller.signal }); return r.json(); }`;
		accepts(
			app(`${request}
useEffect(() => { const controller = new AbortController(); (async () => { const value = await request(controller); setData(value); })(); return () => controller.abort(); });`),
		);
		accepts(
			app(`${request}
useEffect(() => { const controller = new AbortController(); request(controller).then(setData); return () => controller.abort(); });`),
		);
		rejects(
			app(`${request}
useEffect(() => { const controller = new AbortController(); const other = new AbortController(); request(controller).then(setData); return () => other.abort(); });`),
			FETCH,
		);
		// Aborting a different controller, or none, still leaves the update unguarded.
		rejects(
			app(`${load} ${stop}
useEffect(() => { const controller = new AbortController(); const other = new AbortController(); load(controller, setData); return () => stop(other); });`),
			FETCH,
		);
		rejects(
			app(`${load} function stop(controller) { controller.signal; }
useEffect(() => { const controller = new AbortController(); load(controller, setData); return () => stop(controller); });`),
			FETCH,
		);
	});

	it.each([
		['the row callback', '', 'stop'],
		['an alias of the row callback', 'const alias = stop;', 'alias'],
		['two aliases of the row callback', 'const first = stop; const alias = first;', 'alias'],
	])('does not treat %s as an outer abort helper', (_label, setup, callback) => {
		const source = component(
			`const [value, setValue] = useState(''); const stop = controller => controller.abort();`,
			'props',
			`<section>@for (const stop of props.callbacks; key stop) { ${setup} useEffect(() => { const controller = new AbortController(); fetch('/api', { signal: controller.signal }).then(r => r.text()).then(setValue); return () => ${callback}(controller); }); <div>{value as string}</div> }</section>`,
		);
		rejects(source, FETCH);
	});

	it('preserves actual abort helpers used through rows and closer JavaScript bindings', () => {
		const setup = `const [value, setValue] = useState(''); const stop = controller => controller.abort(); const outer = stop;`;
		const request = `const controller = new AbortController(); fetch('/api', { signal: controller.signal }).then(r => r.text()).then(setValue);`;
		accepts(
			component(
				setup,
				'props',
				`<section>@for (const stop of props.callbacks; key stop) { useEffect(() => { ${request} return () => outer(controller); }); <div>{value as string}</div> }</section>`,
			),
		);
		accepts(
			component(
				setup,
				'props',
				`<section>@for (const stop of props.callbacks; key stop) { useEffect(() => { const stop = controller => controller.abort(); ${request} return () => stop(controller); }); <div>{value as string}</div> }</section>`,
			),
		);
	});

	it('does not confuse a row timer callback with an outer recursive timer', () => {
		const source = component(
			`function repeat() { setTimeout(repeat, 10); }`,
			'props',
			`<section>@for (const repeat of props.callbacks; key repeat) { useEffect(() => { const handle = setTimeout(repeat, 10); return () => clearTimeout(handle); }); <div /> }</section>`,
		);
		accepts(source);
	});

	it.each([
		'api.get(props.controller)',
		'api.get({ controller: props.id })',
		'api.get({ signal: props.signal })',
	])('ignores a name that only spells a controller or signal: %s', (request) => {
		rejects(
			app(
				`useEffect(() => { const controller = new AbortController(); const { signal } = controller; ${request}.then(setData); return () => controller.abort(); });`,
			),
			FETCH,
		);
	});

	it('names the replacement for async effect callbacks', () => {
		const result = compileToVolarMappings(
			app(`useEffect(async () => { setData(await api.get(props.id)); });`),
			'/src/App.tsrx',
			{ strong: true },
		);
		const error = result.diagnostics.find((diagnostic) => diagnostic.code === FETCH);
		expect(error?.message).toContain('async effect callback returns a promise');
		expect(error?.message).toContain('use()');
	});
});

describe('Strong effect chains', () => {
	it.each([
		`${guardedWrite('setFirst(1)')} useEffect(() => { consume(first); });`,
		`useEffect(() => { consume(first); }); ${guardedWrite('setFirst(1)')}`,
		`useEffect(() => { let active = true; (async () => { await pending; if (active) setFirst(1); })(); return () => { active = false; }; }); useLayoutEffect(() => { consume(first); });`,
		`const value = first; const update = setFirst; ${guardedWrite('update(value)')} useEffect(() => { consume(value); });`,
		`const value = first + 1; ${guardedWrite('setFirst(value)')} useEffect(() => { consume(value); });`,
		`const update = useEffectEvent(setFirst); ${guardedWrite('update(value)')} useEffect(() => { consume(first); });`,
		`const read = useEffectEvent(() => consume(second)); ${guardedWrite('setFirst(value)')} useEffect(() => { read(); consume(first); });`,
		`const mixed = props.x + first; ${guardedWrite('setFirst(1)')} useEffect(() => { consume(mixed); });`,
		`const mixed = props.x + first; ${guardedWrite('setFirst(1)')} useEffect(() => { consume(1); }, [mixed]);`,
	])('rejects dependent effects after an asynchronous state write: %s', (setup) => {
		const source = component(
			`const [first, setFirst] = useState(0); const [second] = useState(0); ${setup}`,
		);
		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
		expect(errors(source)).toContain(CHAIN);
	});

	it.each([
		`${guardedWrite('setFirst(1)')} useEffect(() => { consume(second); });`,
		`useEffect(() => { consume(first); let active = true; pending.then(() => { if (active) setFirst(1); }); return () => { active = false; }; });`,
		`useEffect(() => { function unused() { setFirst(1); } }); useEffect(() => { consume(first); });`,
		`useEffect(() => { const first = 123; consume(first); }); ${guardedWrite('setFirst(1)')}`,
		`const onClick = () => setFirst(1); useEffect(() => { consume(first); });`,
		`useEffect(() => { const id = setTimeout(() => setFirst(1), 100); return () => clearTimeout(id); }); useEffect(() => { consume(first); });`,
		`const read = useEffectEvent(() => consume(first)); ${guardedWrite('setFirst(value)')} useEffect(() => { read(); });`,
		`const value = first + 1; const read = useEffectEvent(() => consume(value)); ${guardedWrite('setFirst(value)')} useEffect(() => { let active = true; pending.then(() => { if (active) read(); }); return () => { active = false; }; });`,
	])('preserves independent effects: %s', (setup) => {
		accepts(
			component(
				`const [first, setFirst] = useState(0); const [second] = useState(0); ${setup}`,
				'props',
				'<div>{first as string}</div>',
			),
		);
	});

	it('keeps Effect Event state tuple reads non-reactive', () => {
		accepts(
			component(`const state = useState(0);
const read = useEffectEvent(() => consume(state[0]));
${guardedWrite('state[1](value)')}
useEffect(() => { read(); });`),
		);
	});

	it('does not merge separate calls of one custom hook into one state', () => {
		accepts(`
import { useState, useEffect } from 'octane';
function useCounter() { return useState(0); }
export function App(props) @{
  const [first, setFirst] = useCounter();
  const [second] = useCounter();
  ${guardedWrite('setFirst(value)')}
  useEffect(() => { consume(second); });
  <div />
}`);
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
				`${guardedWrite('setFirst(value)')} function Inner() @{ useEffect(() => consume(first)); <i /> }`,
				`${guardedWrite('setFirst(value)')} const Inner = () => { useEffect(() => consume(first)); return <i />; };`,
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
	])('checks the other continuation after a branch exits through %s', (exit) => {
		// Every awaited result needs cancellation, not only a fetch.
		const setup = `useEffect(() => { (async () => { if (props.fetch) { await fetch('/telemetry'); ${exit} } await ready; setData(1); })(); });`;
		rejects(component(`const [data, setData] = useState(null); ${setup}`), FETCH);
		const guarded = `useEffect(() => { let active = true; (async () => { if (props.fetch) { await fetch('/telemetry'); ${exit} } await ready; if (active) setData(1); })(); return () => { active = false; }; });`;
		accepts(
			component(`const [data, setData] = useState(null); ${guarded}`, 'props', '<div>{data}</div>'),
		);
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
			compile(
				component(`const [data, setData] = useState(null); ${setup}`, 'props', '<div>{data}</div>'),
				'/src/Review.tsrx',
				{
					strong: true,
				},
			),
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

describe('Strong effect try clauses', () => {
	const EFFECT_STATE_UPDATE = 'OCTANE_STRONG_EFFECT_STATE_UPDATE';
	const setup = (body: string) =>
		`const [data, setData] = useState(null); const [error, setError] = useState(null); const [loading, setLoading] = useState(true); useEffect(() => { let ignore = false; (async () => { ${body} })(); return () => { ignore = true; }; });`;
	const load = (body: string) => `import { useState, useEffect } from 'octane';
import { api } from './api';
export function App(props) @{
  ${setup(body)}
  <div data-loading={loading}>{data}{error}</div>
}`;
	const hook = (body: string) =>
		`import { useState, useEffect } from 'octane'; import { api } from './api'; export function useData(props) { ${setup(body)} return [data, error, loading]; }`;

	it('accepts a catch-clause update for an awaited call that rejects', () => {
		const source = load(
			'try { const v = await api.get(props.id); if (!ignore) setData(v); } catch (e) { if (!ignore) setError(e); }',
		);
		for (const mode of ['client', 'server'] as const) {
			for (const dev of [false, true]) {
				const standard = compile(source, '/src/App.tsrx', { mode, dev });
				const strong = compile(source, '/src/App.tsrx', { mode, dev, strong: true });
				expect(strong.code).toBe(standard.code);
			}
		}
		expect(compileToVolarMappings(`"use strong";\n${source}`, '/src/App.tsrx').diagnostics).toEqual(
			[],
		);
	});

	it.each([
		[
			'awaited promise calls chained through then',
			'try { const value = await api.get(props.id).then((response) => response.data); if (!ignore) setData(value); } catch (e) { if (!ignore) setError(e); }',
		],
		[
			'awaited fetches',
			'try { const response = await fetch(`/api/${props.id}`); const value = await response.json(); if (!ignore) setData(value); } catch (e) { if (!ignore) setError(e); }',
		],
		[
			'awaited dynamic imports',
			"try { const value = await import('./data'); if (!ignore) setData(value); } catch (e) { if (!ignore) setError(e); }",
		],
		[
			'awaited promises created before the try',
			'const request = api.get(props.id); try { const value = await request; if (!ignore) setData(value); } catch (e) { if (!ignore) setError(e); }',
		],
		[
			'property reads, object destructuring and assignments before the await',
			'let key; try { const { id, ...query } = props; key = props.scope ?? id; const value = await api.get(`item:${key}`, { query }); if (!ignore) setData(value); } catch (e) { if (!ignore) setError(e); }',
		],
		[
			"object literals in the awaited call's arguments",
			'try { const value = await api.get({ id: props.id, ...props.query }); if (!ignore) setData(value); } catch (e) { if (!ignore) setError(e); }',
		],
		[
			'awaited promise constructors',
			'try { await new Promise((resolve) => setTimeout(resolve, props.delay)); const value = await api.get(props.id); if (!ignore) setData(value); } catch (e) { if (!ignore) setError(e); }',
		],
		[
			'this receivers of the awaited call',
			'try { const value = await this.api.get(props.id); if (!ignore) setData(value); } catch (e) { if (!ignore) setError(e); }',
		],
		[
			"import.meta reads in the awaited call's arguments",
			'try { const value = await api.get(import.meta.env.VITE_API, props.id); if (!ignore) setData(value); } catch (e) { if (!ignore) setError(e); }',
		],
		...['all', 'allSettled', 'any', 'race'].map((combinator) => [
			`calls inside an awaited Promise.${combinator}`,
			`try { const [user, posts] = await Promise.${combinator}([api.user(props.id), api.posts(props.id).then((response) => response.items)]); if (!ignore) setData({ user, posts }); } catch (e) { if (!ignore) setError(e); }`,
		]),
		[
			'early exits before the await',
			'try { if (!props.id) return; const value = await api.get(props.id); if (!ignore) setData(value); } catch (e) { if (!ignore) setError(e); }',
		],
		[
			'function declarations before the await',
			'try { function pick(value) { return value.data; } const value = await api.get(props.id); if (!ignore) setData(pick(value)); } catch (e) { if (!ignore) setError(e); }',
		],
		[
			'catch clauses that rethrow after yielding',
			'try { try { const value = await api.get(props.id); if (!ignore) setData(value); } catch (inner) { api.log(inner); throw inner; } } catch (e) { if (!ignore) setError(e); }',
		],
		[
			'finally blocks entered only after yielding',
			'try { const value = await api.get(props.id); if (!ignore) setData(value); } catch (e) { if (!ignore) setError(e); } finally { if (!ignore) setLoading(false); }',
		],
		[
			'statements after a try whose catch runs only after yielding',
			'try { const value = await api.get(props.id); if (!ignore) setData(value); } catch (e) { if (!ignore) setError(e); } if (!ignore) setLoading(false);',
		],
		[
			'nested try/finally blocks entered only after yielding',
			'try { try { const value = await api.get(props.id); if (!ignore) setData(value); } finally { if (!ignore) setLoading(false); } } catch (e) { if (!ignore) setError(e); }',
		],
		[
			'nested finally blocks that yield before rethrowing',
			'try { try { api.reset(); } finally { const value = await api.get(props.id); if (!ignore) setData(value); } } catch (e) { if (!ignore) setError(e); }',
		],
		[
			'do-while exits from catch clauses entered only after yielding',
			'do { try { const value = await api.get(props.id); if (!ignore) setData(value); } catch (e) { break; } } while (props.retry); if (!ignore) setLoading(false);',
		],
	])('allows updates in try clauses reached only after yielding: %s', (_label, body) => {
		const source = load(body);
		expect(compile(source, '/src/App.tsrx', { strong: true }).code).toBe(
			compile(source, '/src/App.tsrx').code,
		);
		expect(compileToVolarMappings(`"use strong";\n${source}`, '/src/App.tsrx').diagnostics).toEqual(
			[],
		);
		expect(slotHooks(`"use strong"; ${hook(body)}`, '/src/useData.ts')?.code).toBe(
			`"use strong"; ${slotHooks(hook(body), '/src/useData.ts')!.code}`,
		);
	});

	it.each([
		[
			'throws before the await',
			"try { if (!props.id) throw new Error('missing'); setData(await api.get(props.id)); } catch (e) { setError(e); }",
			'setError(e)',
		],
		[
			'settled awaits that reject',
			'try { await Promise.reject(props.error); } catch (e) { if (!ignore) setError(e); }',
			'setError(e)',
		],
		[
			'calls before the await',
			'try { const key = api.key(props.id); setData(await api.get(key)); } catch (e) { setError(e); }',
			'setError(e)',
		],
		[
			"calls in the awaited call's arguments",
			'try { setData(await api.get(api.key(props.id))); } catch (e) { setError(e); }',
			'setError(e)',
		],
		[
			"calls in the awaited call's receiver",
			'try { setData(await api.client().get(props.id)); } catch (e) { setError(e); }',
			'setError(e)',
		],
		[
			"call arguments inside an awaited Promise combinator's elements",
			'try { setData(await Promise.all([api.get(api.key(props.id))])); } catch (e) { setError(e); }',
			'setError(e)',
		],
		[
			'non-literal arrays passed to an awaited Promise combinator',
			'try { setData(await Promise.all(props.ids.map((id) => api.get(id)))); } catch (e) { setError(e); }',
			'setError(e)',
		],
		[
			'spread elements in an awaited Promise combinator',
			'try { setData(await Promise.all([...props.requests])); } catch (e) { setError(e); }',
			'setError(e)',
		],
		[
			"calls in an awaited Promise combinator's ignored arguments",
			'try { setData(await Promise.race([props.request], [api.reset()])); } catch (e) { setError(e); }',
			'setError(e)',
		],
		[
			"calls inside a non-Promise object's all()",
			'try { setData(await api.all([api.get(props.id)])); } catch (e) { setError(e); }',
			'setError(e)',
		],
		[
			'calls inside a combinator on a shadowed Promise',
			'const Promise = api.Promise; try { setData(await Promise.all([api.get(props.id)])); } catch (e) { setError(e); }',
			'setError(e)',
		],
		[
			"spreads in the awaited call's arguments",
			'try { setData(await api.get(...props.ids)); } catch (e) { setError(e); }',
			'setError(e)',
		],
		[
			'array destructuring before the await',
			'try { const [first] = props.ids; setData(await api.get(first)); } catch (e) { setError(e); }',
			'setError(e)',
		],
		[
			'destructuring defaults before the await',
			'try { const { id = api.defaultId() } = props; setData(await api.get(id)); } catch (e) { setError(e); }',
			'setError(e)',
		],
		[
			'calls after a block that breaks to its label',
			'try { done: { break done; } api.reset(); setData(await api.get(props.id)); } catch (e) { setError(e); }',
			'setError(e)',
		],
		[
			'catch bindings that destructure synchronously',
			'try { try { api.reset(); } catch ([reason]) { setData(await api.get(reason)); } } catch (e) { setError(e); }',
			'setError(e)',
		],
		[
			'conditional calls before the await',
			'try { props.cached ? api.reset() : setData(await api.get(props.id)); } catch (e) { setError(e); }',
			'setError(e)',
		],
		[
			'finally blocks reached by an early exit',
			'try { if (!props.id) return; setData(await api.get(props.id)); } finally { setLoading(false); }',
			'setLoading(false)',
		],
		[
			'statements after a catch clause entered synchronously',
			'try { api.reset(); setData(await api.get(props.id)); } catch (e) {} setLoading(false);',
			'setLoading(false)',
		],
		[
			'nested finally blocks that throw synchronously',
			'try { try { api.reset(); } finally { api.log(); } setData(await api.get(props.id)); } catch (e) { setError(e); }',
			'setError(e)',
		],
		[
			'nested finally blocks reached by an early exit',
			'try { try { if (!props.id) return; setData(await api.get(props.id)); } finally { api.log(); } } catch (e) { setError(e); }',
			'setError(e)',
		],
	])('still rejects try clauses that can run synchronously: %s', (_label, body, update) => {
		const source = load(body);
		rejects(source, EFFECT_STATE_UPDATE);
		const strong = `"use strong";\n${source}`;
		const start = strong.indexOf(update);
		expect(compileToVolarMappings(strong, '/src/App.tsrx').diagnostics).toContainEqual(
			expect.objectContaining({
				code: EFFECT_STATE_UPDATE,
				start: expect.objectContaining({ offset: start }),
			}),
		);
		expect(slotHooks(hook(body), '/src/useData.ts')).not.toBeNull();
		expect(() => slotHooks(`"use strong"; ${hook(body)}`, '/src/useData.ts')).toThrow(
			EFFECT_STATE_UPDATE,
		);
	});

	it.each([
		["import Promise from 'bluebird';", ''],
		['enum Promise { Pending }', ''],
		['namespace Promise { export const all = (values) => values; }', ''],
		['', 'function wrap(Promise) { return Promise; }'],
		['', 'class Promise {}'],
		['', 'try {} catch (Promise) {}'],
	])(
		'does not trust Promise combinator elements when the module binds Promise: %s%s',
		(imports, local) => {
			const body = `${local} try { setData(await Promise.all([api.get(props.id)])); } catch (e) { setError(e); }`;
			rejects(`${imports}\n${load(body)}`, EFFECT_STATE_UPDATE);
		},
	);

	it('does not trust Promise combinator elements after a TypeScript import-equals Promise', () => {
		const source = `import Promise = require('bluebird'); ${hook(
			'try { setData(await Promise.all([api.get(props.id)])); } catch (e) { setError(e); }',
		)}`;
		expect(slotHooks(source, '/src/useData.ts')).not.toBeNull();
		expect(() => slotHooks(`"use strong"; ${source}`, '/src/useData.ts')).toThrow(
			EFFECT_STATE_UPDATE,
		);
	});

	it('checks a catch clause reached after yielding for stale state updates', () => {
		rejects(
			component(
				'const [count, setCount] = useState(0); useEffect(() => { (async () => { try { await api.save(count); } catch (e) { setCount(count + 1); } })(); return () => {}; });',
				'props',
				'<div>{count as string}</div>',
			),
			'OCTANE_STRONG_STALE_STATE_UPDATE',
		);
	});

	it('still reports an uncancelled fetch whose catch clause updates state', () => {
		rejects(
			component(
				`const [error, setError] = useState(null); useEffect(() => { (async () => { try { await fetch('/api'); } catch (e) { setError(e); } })(); });`,
				'props',
				'<div>{error}</div>',
			),
			FETCH,
		);
	});
});

describe('Strong zero-delay effect updates', () => {
	const app = (setup: string) => `
import * as Octane from 'octane';
import { useState, useEffect, useLayoutEffect, useInsertionEffect, useTransition, startTransition, startTransition as beginTransition } from 'octane';
export function App(props) @{
  const [full, setFull] = useState('');
  ${setup}
  <p>{full as string}</p>
}`;
	const write = `setFull(props.first + ' ' + props.last)`;

	it.each([
		['startTransition', `useEffect(() => { startTransition(() => ${write}); });`],
		[
			'a namespace startTransition',
			`useEffect(() => { Octane.startTransition(() => ${write}); });`,
		],
		[
			'an optional namespace startTransition',
			`useEffect(() => { Octane?.startTransition(() => ${write}); });`,
		],
		['an aliased startTransition import', `useEffect(() => { beginTransition(() => ${write}); });`],
		[
			'a local startTransition alias',
			`useEffect(() => { const begin = startTransition; begin(() => ${write}); });`,
		],
		[
			'an optional startTransition call',
			`useEffect(() => { startTransition?.(() => ${write}); });`,
		],
		[
			'an async transition action before it yields',
			`useEffect(() => { startTransition(async () => { ${write}; }); });`,
		],
		[
			'a useTransition start function',
			`const [pending, start] = useTransition(); useEffect(() => { start(() => ${write}); });`,
		],
		[
			'a useTransition tuple index',
			`const transition = useTransition(); useEffect(() => { transition[1](() => ${write}); });`,
		],
		[
			'an aliased useTransition start function',
			`const [, start] = useTransition(); const begin = start; useEffect(() => { begin(() => ${write}); });`,
		],
		['queueMicrotask', `useEffect(() => { queueMicrotask(() => ${write}); });`],
		['window.queueMicrotask', `useEffect(() => { window.queueMicrotask(() => ${write}); });`],
		[
			'globalThis.queueMicrotask',
			`useEffect(() => { globalThis.queueMicrotask(() => ${write}); });`,
		],
		[
			'a queueMicrotask alias',
			`useEffect(() => { const defer = queueMicrotask; defer(() => ${write}); });`,
		],
		['Promise.resolve().then', `useEffect(() => { Promise.resolve().then(() => ${write}); });`],
		[
			'Promise.resolve of a string',
			`useEffect(() => { Promise.resolve(props.first + ' ' + props.last).then(setFull); });`,
		],
		[
			'Promise.reject().catch',
			`useEffect(() => { Promise.reject(new Error('x')).catch(() => ${write}); });`,
		],
		[
			'Promise.resolve().finally',
			`useEffect(() => { Promise.resolve().finally(() => ${write}); });`,
		],
		['an optional then', `useEffect(() => { Promise.resolve()?.then(() => ${write}); });`],
		[
			'a settled promise alias',
			`useEffect(() => { const ready = Promise.resolve(); ready.then(() => ${write}); });`,
		],
		[
			'window.Promise.resolve',
			`useEffect(() => { window.Promise.resolve().then(() => ${write}); });`,
		],
		['setTimeout without a delay', `useEffect(() => { setTimeout(() => ${write}); });`],
		['setTimeout with no delay', `useEffect(() => { setTimeout(() => ${write}, 0); });`],
		[
			'setTimeout with an undefined delay',
			`useEffect(() => { setTimeout(() => ${write}, undefined); });`,
		],
		['setTimeout with a negative delay', `useEffect(() => { setTimeout(() => ${write}, -1); });`],
		[
			'setTimeout with a zero constant',
			`const DELAY = 0; useEffect(() => { setTimeout(() => ${write}, DELAY); });`,
		],
		['window.setTimeout', `useEffect(() => { window.setTimeout(() => ${write}, 0); });`],
		[
			'a queueMicrotask destructured from window',
			`useEffect(() => { const { queueMicrotask: defer } = window; defer(() => ${write}); });`,
		],
		[
			'a setTimeout destructured from globalThis',
			`useEffect(() => { const { setTimeout } = globalThis; setTimeout(() => ${write}, 0); });`,
		],
		[
			'a cleared zero-delay timer',
			`useEffect(() => { const timer = setTimeout(() => ${write}, 0); return () => clearTimeout(timer); });`,
		],
		['setTimeout with the setter', `useEffect(() => { setTimeout(setFull, 0, props.first); });`],
		['await null', `useEffect(() => { (async () => { await null; ${write}; })(); });`],
		['await undefined', `useEffect(() => { (async () => { await undefined; ${write}; })(); });`],
		['await void 0', `useEffect(() => { (async () => { await void 0; ${write}; })(); });`],
		[
			'await of a primitive',
			`useEffect(() => { (async () => { await (props.count + 1); ${write}; })(); });`,
		],
		[
			'await Promise.resolve()',
			`useEffect(() => { (async () => { await Promise.resolve(); ${write}; })(); });`,
		],
		['a nested await', `useEffect(() => { (async () => { await (await null); ${write}; })(); });`],
		[
			'a conditional await whose other branch is settled',
			`useEffect(() => { let active = true; (async () => { await (props.flag ? await props.load() : null); if (active) ${write}; })(); return () => { active = false; }; });`,
		],
		[
			'a short-circuited await',
			`useEffect(() => { (async () => { await (null && (await props.load())); ${write}; })(); });`,
		],
		[
			'a sequence ending in a settled promise',
			`useEffect(() => { (async () => { await (0, Promise.resolve()); ${write}; })(); });`,
		],
		[
			'a conditional settled value',
			`useEffect(() => { (async () => { await (props.flag ? Promise.resolve() : null); ${write}; })(); });`,
		],
		[
			'a conditional settled promise',
			`useEffect(() => { (props.flag ? Promise.resolve() : Promise.reject()).catch(() => ${write}); });`,
		],
		// Like \`if (flag) await work;\`, one path that resumes before paint is enough.
		[
			'an await whose other branch is settled',
			`useEffect(() => { (async () => { await (props.flag ? Promise.resolve() : props.pending); ${write}; })(); });`,
		],
		[
			'an await of pending work or null',
			`useEffect(() => { (async () => { await (props.flag ? props.pending : null); ${write}; })(); });`,
		],
		[
			'an await whose other branch awaits',
			`useEffect(() => { (async () => { await (props.flag ? await props.load() : null); ${write}; })(); });`,
		],
		[
			'an await with a settled fallback',
			`useEffect(() => { (async () => { await (props.pending || null); ${write}; })(); });`,
		],
		[
			'a stored conditional value',
			`useEffect(() => { (async () => { const ready = props.flag ? props.pending : null; await ready; ${write}; })(); });`,
		],
		[
			'an await of a condition and work',
			`useEffect(() => { let active = true; (async () => { await (props.flag && props.load()); if (active) ${write}; })(); return () => { active = false; }; });`,
		],
		[
			'a settled promise of a condition and pending work',
			`useEffect(() => { Promise.resolve(props.flag && props.pending).then(() => ${write}); });`,
		],
		[
			'a stored await whose other branch awaits',
			`useEffect(() => { (async () => { const ready = props.flag ? await props.load() : null; await ready; ${write}; })(); });`,
		],
		[
			'an await of a hoisted var before its initializer',
			`useEffect(() => { let active = true; (async () => { await ready; if (active) ${write}; var ready = props.flag ? await props.load() : props.pending; })(); return () => { active = false; }; });`,
		],
		[
			'an await of a var declared in a branch above it',
			`useEffect(() => { let active = true; (async () => { if (props.ready) { var ready = props.flag ? await props.load() : props.pending; } await ready; if (active) ${write}; })(); return () => { active = false; }; });`,
		],
		[
			'an await of a var declared in an unbraced branch',
			`useEffect(() => { let active = true; (async () => { if (props.ready) var ready = props.flag ? await props.load() : props.pending; await ready; if (active) ${write}; })(); return () => { active = false; }; });`,
		],
		[
			'an await of pending work in an unbraced branch var',
			`useEffect(() => { let active = true; (async () => { if (props.ready) var ready = props.pending; await ready; if (active) ${write}; })(); return () => { active = false; }; });`,
		],
		[
			'an await of a hoisted var holding pending work',
			`useEffect(() => { let active = true; (async () => { await ready; if (active) ${write}; var ready = props.pending; })(); return () => { active = false; }; });`,
		],
		[
			'a promise that may already be settled',
			`useEffect(() => { (props.flag ? Promise.resolve() : props.pending).then(() => ${write}); });`,
		],
		[
			'an await that a literal operand settles',
			`useEffect(() => { (async () => { await (null && props.pending); ${write}; })(); });`,
		],
		[
			'an await that a literal test settles',
			`useEffect(() => { (async () => { await (false ? props.pending : 0); ${write}; })(); });`,
		],
		[
			'a guarded update after a literal-settled await',
			`useEffect(() => { let active = true; (async () => { await (null && props.pending); if (active) ${write}; })(); return () => { active = false; }; });`,
		],
		[
			'a settled promise of a literal operand',
			`useEffect(() => { Promise.resolve(null && props.pending).then(() => ${write}); });`,
		],
		['an async effect callback', `useEffect(async () => { await null; ${write}; });`],
		[
			'a local deferral helper',
			`useEffect(() => { const later = (task) => queueMicrotask(task); later(() => ${write}); });`,
		],
		['a layout effect', `useLayoutEffect(() => { queueMicrotask(() => ${write}); });`],
		['an insertion effect', `useInsertionEffect(() => { queueMicrotask(() => ${write}); });`],
	])('treats %s as synchronous effect setup', (_label, setup) => {
		rejects(app(setup), UPDATE);
	});

	it.each([
		[
			'requestAnimationFrame',
			`useEffect(() => { const frame = requestAnimationFrame(() => ${write}); return () => cancelAnimationFrame(frame); });`,
		],
		[
			'a nonzero timer',
			`useEffect(() => { const timer = setTimeout(() => ${write}, 16); return () => clearTimeout(timer); });`,
		],
		[
			'a timer with an unknown delay',
			`useEffect(() => { setTimeout(() => ${write}, props.delay); });`,
		],
		[
			'an await that a literal operand always runs',
			`useEffect(() => { let active = true; (async () => { await (null ?? (await props.load())); if (active) ${write}; })(); return () => { active = false; }; });`,
		],
		[
			'an await that a literal test always runs',
			`useEffect(() => { let active = true; (async () => { await (true ? await props.load() : null); if (active) ${write}; })(); return () => { active = false; }; });`,
		],
		[
			'an await that an undefined operand always runs',
			`useEffect(() => { let active = true; (async () => { await (undefined ?? (await props.load())); if (active) ${write}; })(); return () => { active = false; }; });`,
		],
		[
			'an await of a var declared above it',
			`useEffect(() => { let active = true; (async () => { var ready = props.pending; await ready; if (active) ${write}; })(); return () => { active = false; }; });`,
		],
		[
			'a stored var await whose every branch waits',
			`useEffect(() => { let active = true; (async () => { var ready = props.flag ? await props.load() : props.pending; await ready; if (active) ${write}; })(); return () => { active = false; }; });`,
		],
		[
			'a var awaited inside the block that declares it',
			`useEffect(() => { let active = true; (async () => { if (props.ready) { var ready = props.flag ? await props.load() : props.pending; await ready; if (active) ${write}; } })(); return () => { active = false; }; });`,
		],
		[
			'an await of each var in a loop',
			`useEffect(() => { let active = true; (async () => { for (var ready of props.pending) { await ready; if (active) ${write}; } })(); return () => { active = false; }; });`,
		],
		[
			'an await of pending work or a fallback request',
			`useEffect(() => { let active = true; (async () => { await (props.pending || props.load()); if (active) ${write}; })(); return () => { active = false; }; });`,
		],
		[
			'a stored await whose every branch waits',
			`useEffect(() => { let active = true; (async () => { const ready = props.flag ? await props.load() : props.pending; await ready; if (active) ${write}; })(); return () => { active = false; }; });`,
		],
		[
			'a conditional await whose every branch waits',
			`useEffect(() => { let active = true; (async () => { await (props.flag ? await props.load() : props.pending); if (active) ${write}; })(); return () => { active = false; }; });`,
		],
		['a string timer', `useEffect(() => { setTimeout('tick()', 0); });`],
		[
			'a requestAnimationFrame destructured from window',
			`useEffect(() => { const { requestAnimationFrame: frame } = window; const id = frame(() => ${write}); return () => cancelAnimationFrame(id); });`,
		],
		['an external subscription', `useEffect(() => props.subscribe(() => ${write}));`],
		[
			'a shadowed queueMicrotask',
			`useEffect(() => { const queueMicrotask = (task) => props.schedule(task); queueMicrotask(() => ${write}); });`,
		],
		[
			'a shadowed startTransition',
			`useEffect(() => { const startTransition = (task) => props.schedule(task); startTransition(() => ${write}); });`,
		],
		['a transition started by an event', `const onClick = () => startTransition(() => ${write});`],
	])('keeps %s legal', (_label, setup) => {
		accepts(app(setup));
	});

	it('treats module vars as initialized before an effect runs', () => {
		const effect = `useEffect(() => { let active = true; (async () => { await ready; if (active) ${write}; })(); return () => { active = false; }; });`;
		const module = (declaration: string) =>
			app(effect).replace('export function App', `${declaration}\nexport function App`);
		accepts(module('export var ready = globalThis.pending;'));
		accepts(module('var ready = globalThis.pending;'));
		// A module var declared in a branch may never run.
		rejects(module('if (globalThis.enabled) var ready = globalThis.pending;'), UPDATE);
	});

	it.each([
		'const ready = await ready;',
		'const first = await second; const second = await first;',
	])('analyzes a self-referencing stored await without overflowing: %s', (body) => {
		expect(() =>
			errors(app(`useEffect(() => { (async () => { ${body} ${write}; })(); });`)),
		).not.toThrow();
	});

	it('names the zero-delay APIs and the replacement', () => {
		const result = compileToVolarMappings(
			app(`useEffect(() => { startTransition(() => ${write}); });`),
			'/src/App.tsrx',
			{ strong: true },
		);
		const error = result.diagnostics.find((diagnostic) => diagnostic.code === UPDATE);
		expect(error?.message).toContain('startTransition');
		expect(error?.message).toContain('useLinkedState');
		expect(error?.start.line).toBe(6);
	});

	it.each([
		[
			'TSX components',
			'/src/App.tsx',
			`"use strong";
import { useState, useEffect, startTransition } from 'octane';
export function A({ first, last }) { const [full, setFull] = useState(''); useEffect(() => { startTransition(() => setFull(first + ' ' + last)); }); return <p>{full}</p>; }`,
		],
		[
			'TSX transitions',
			'/src/App.tsx',
			`"use strong";
import { useState, useEffect, useTransition } from 'octane';
export function A({ v }) { const [x, setX] = useState(0); const [p, start] = useTransition(); useEffect(() => { start(() => setX(v)); }); return <p>{x}</p>; }`,
		],
		[
			'TSX awaits',
			'/src/App.tsx',
			`"use strong";
import { useState, useEffect } from 'octane';
export function A({ v }) { const [x, setX] = useState(0); useEffect(() => { (async () => { await null; setX(v * 2); })(); }); return <p>{x}</p>; }`,
		],
	])('enforces %s', (_label, filename, source) => {
		expect(() => compile(source, filename)).toThrow(UPDATE);
		expect(() => compile(source.replace('"use strong";', ''), filename)).not.toThrow();
	});

	it('enforces plain TypeScript custom hooks', () => {
		const source = `"use strong";
import { useState, useEffect } from 'octane';
export function useFullName(first, last) {
  const [full, setFull] = useState('');
  useEffect(() => { queueMicrotask(() => setFull(first + ' ' + last)); });
  return full;
}`;
		expect(() => slotHooks(source, '/src/use-full-name.ts')).toThrow(UPDATE);
	});
});

describe('Strong custom-hook state tuples', () => {
	const app = (hooks: string, setup: string) => `
import * as Octane from 'octane';
import { useState, useEffect, useReducer, useLinkedState, useTransition } from 'octane';
${hooks}
export function App(props) @{
  ${setup}
  <div />
}`;
	const update = `useEffect(() => { setValue(props.value); });`;

	it.each([
		[
			'a returned tuple',
			`function useThing() { return useState(0); }`,
			`const [value, setValue] = useThing(); ${update}`,
		],
		[
			'an arrow hook',
			`const useThing = () => useState(0);`,
			`const [value, setValue] = useThing(); ${update}`,
		],
		[
			'a namespace hook',
			`function useThing() { return Octane.useState(0); }`,
			`const [value, setValue] = useThing(); ${update}`,
		],
		[
			'a returned tuple binding',
			`function useThing() { const state = useState(0); return state; }`,
			`const [value, setValue] = useThing(); ${update}`,
		],
		[
			'a repacked array',
			`function useThing() { const [value, setValue] = useState(0); return [value, setValue]; }`,
			`const [value, setValue] = useThing(); ${update}`,
		],
		[
			'an array returned on several paths',
			`function useThing(flag) { const [value, setValue] = useState(0); if (flag) return [value, setValue]; return [value, setValue]; }`,
			`const [value, setValue] = useThing(props.flag); ${update}`,
		],
		[
			'an object returned on several paths',
			`function useThing(flag) { const [value, setValue] = useState(0); if (flag) return { value, setValue }; return { value: 0, setValue }; }`,
			`const { setValue } = useThing(props.flag); ${update}`,
		],
		[
			'a returned object',
			`function useThing() { const [value, setValue] = useState(0); return { value, setValue }; }`,
			`const { value, setValue } = useThing(); ${update}`,
		],
		[
			'a renamed object property',
			`function useThing() { const [value, set] = useState(0); return { value, update: set }; }`,
			`const { update: setValue } = useThing(); ${update}`,
		],
		[
			'a returned updater',
			`function useThing() { const [value, setValue] = useState(0); useEffect(() => {}); return setValue; }`,
			`const setValue = useThing(); ${update}`,
		],
		[
			'a wrapped updater',
			`function useThing() { const [value, set] = useState(0); return [value, (next) => set(next)]; }`,
			`const [value, setValue] = useThing(); ${update}`,
		],
		[
			'a nested custom hook',
			`function useInner() { return useState(0); } function useOuter() { return useInner(); }`,
			`const [value, setValue] = useOuter(); ${update}`,
		],
		[
			'an aliased custom hook',
			`function useThing() { return useState(0); } const useAlias = useThing;`,
			`const [value, setValue] = useAlias(); ${update}`,
		],
		[
			'a reducer',
			`function useThing() { return useReducer((state, action) => action, 0); }`,
			`const [value, setValue] = useThing(); ${update}`,
		],
		[
			'linked state',
			`function useThing(source) { return useLinkedState(source, () => source); }`,
			`const [value, setValue] = useThing(props.value); ${update}`,
		],
		[
			'a tuple index',
			`function useThing() { return useState(0); }`,
			`const thing = useThing(); useEffect(() => { thing[1](props.value); });`,
		],
		[
			'a direct tuple index',
			`function useThing() { return useState(0); }`,
			`useEffect(() => { queueMicrotask(() => useThing()[1](props.value)); });`,
		],
		[
			'a toggle callback',
			`function useToggle() { const [on, setOn] = useState(false); const toggle = () => setOn((value) => !value); return [on, toggle]; }`,
			`const [on, toggle] = useToggle(); useEffect(() => { toggle(); });`,
		],
		[
			'a returned transition start',
			`function useStart() { const [, start] = useTransition(); return start; }`,
			`const [value, setValue] = useState(0); const start = useStart(); useEffect(() => { start(() => setValue(props.value)); });`,
		],
		[
			'a returned transition tuple',
			`function useStart() { return useTransition(); }`,
			`const [value, setValue] = useState(0); const [, start] = useStart(); useEffect(() => { start(() => setValue(props.value)); });`,
		],
		[
			'a returned transition tuple binding',
			`function useStart() { const transition = useTransition(); return transition; }`,
			`const [value, setValue] = useState(0); const transition = useStart(); useEffect(() => { transition[1](() => setValue(props.value)); });`,
		],
		[
			'a stored array member',
			`function useThing() { const [value, setValue] = useState(0); return [value, setValue]; }`,
			`const thing = useThing(); useEffect(() => { thing[1](props.value); });`,
		],
		[
			'a stored object member',
			`function useThing() { const [value, setValue] = useState(0); return { value, setValue }; }`,
			`const thing = useThing(); useEffect(() => { thing.setValue(props.value); });`,
		],
		[
			'an alias of a stored object member',
			`function useThing() { const [value, setValue] = useState(0); return { value, setValue }; }`,
			`const thing = useThing(); const setValue = thing.setValue; ${update}`,
		],
		[
			'an alias of a stored hook result',
			`function useThing() { const [value, setValue] = useState(0); return { value, setValue }; }`,
			`const thing = useThing(); const alias = thing; useEffect(() => { alias.setValue(props.value); });`,
		],
		[
			'a stored hook result passed to a helper',
			`function useThing() { const [value, setValue] = useState(0); return [value, setValue]; } function apply(pair, next) { pair[1](next); }`,
			`const thing = useThing(); useEffect(() => { apply(thing, props.value); });`,
		],
		[
			'a stored transition start member',
			`function useStart() { const [pending, start] = useTransition(); return { pending, start }; }`,
			`const [value, setValue] = useState(0); const transition = useStart(); useEffect(() => { transition.start(() => setValue(props.value)); });`,
		],
		[
			'a direct returned transition index',
			`function useStart() { return useTransition(); }`,
			`const [value, setValue] = useState(0); useEffect(() => { useStart()[1](() => setValue(props.value)); });`,
		],
	])('follows %s', (_label, hooks, setup) => {
		rejects(app(hooks, setup), UPDATE);
	});

	it('also follows returned getters and setters for render checks', () => {
		const hooks = `function useThing() { return useState(0); }`;
		rejects(
			app(hooks, `const [value, setValue, getValue] = useThing(); const now = getValue();`),
			'OCTANE_STRONG_RENDER_STATE_GETTER_CALL',
		);
		rejects(
			app(hooks, `const [value, setValue] = useThing(); setValue(1);`),
			'OCTANE_STRONG_RENDER_STATE_UPDATE',
		);
		rejects(
			app(
				hooks,
				`const [value, setValue, getValue] = useThing(); useEffect(() => { props.log(getValue()); });`,
			),
			HIDDEN,
		);
	});

	it.each([
		[
			'an external subscription',
			`function useThing() { return useState(0); }`,
			`const [value, setValue] = useThing(); useEffect(() => props.subscribe(setValue));`,
		],
		[
			'a non-state callback',
			`function useThing() { return [0, () => props.log()]; }`,
			`const [value, setValue] = useThing(); ${update}`,
		],
		[
			'a shadowed updater',
			`function useThing() { return useState(0); }`,
			`const [value, setValue] = useThing(); { const setValue = props.noop; ${update} }`,
		],
		[
			'an imported custom hook',
			`import { useThing } from './thing';`,
			`const [value, setValue] = useThing(); ${update}`,
		],
		[
			'a stored non-state member',
			`function useThing(log) { return { value: 0, run: () => log() }; }`,
			`const thing = useThing(props.log); useEffect(() => { thing.run(); });`,
		],
		[
			'a hook with different returns',
			`function useThing(flag) { if (flag) return [0, () => {}]; return useState(0); }`,
			`const [value, setValue] = useThing(props.flag); ${update}`,
		],
		[
			'paths that return different updaters',
			`function useThing(flag) { const [value, setValue] = useState(0); if (flag) return [value, () => {}]; return [value, setValue]; }`,
			`const [value, setValue] = useThing(props.flag); ${update}`,
		],
	])('does not invent state for %s', (_label, hooks, setup) => {
		accepts(app(hooks, setup));
	});

	it('gives each call of a custom hook its own state', () => {
		const counter = `function useCounter() { const [count, setCount] = useState(0); return [() => count, setCount]; }`;
		const calls = (hook: string, write: string, read: string) =>
			`const [readFirst, setFirst] = ${hook}(); const [readSecond, setSecond] = ${hook}(); ${guardedWrite(write)} useEffect(() => { consume(${read}()); });`;
		expect(
			errors(app(counter, calls('useCounter', 'setFirst(value)', 'readSecond'))),
		).not.toContain(CHAIN);
		expect(errors(app(counter, calls('useCounter', 'setFirst(value)', 'readFirst')))).toContain(
			CHAIN,
		);
		const outer = `${counter} function useOuter() { return useCounter(); }`;
		expect(errors(app(outer, calls('useOuter', 'setFirst(value)', 'readSecond')))).not.toContain(
			CHAIN,
		);
		expect(errors(app(outer, calls('useOuter', 'setFirst(value)', 'readFirst')))).toContain(CHAIN);
		// A value the hook received keeps the caller's state.
		expect(
			errors(
				app(
					`function usePass(update) { return update; }`,
					`const [first, setFirst] = useState(0); const update = usePass(setFirst); ${guardedWrite('update(value)')} useEffect(() => { consume(first); });`,
				),
			),
		).toContain(CHAIN);
	});

	it('keeps updater checks on custom-hook state', () => {
		expect(
			errors(
				app(
					`function useCount() { return useState(0); }`,
					`const [count, setCount] = useCount(); const onClick = () => setCount((current) => { fetch('/log'); return current + 1; });`,
				),
			),
		).toContain('OCTANE_STRONG_IMPURE_UPDATER');
	});

	it('follows same-module hooks in plain TypeScript and TSX', () => {
		const ts = `"use strong";
import { useState, useEffect } from 'octane';
function useThing() { return useState(0); }
export function useMirror(value) { const [mirror, setMirror] = useThing(); useEffect(() => { setMirror(value); }); return mirror; }`;
		expect(() => slotHooks(ts, '/src/use-mirror.ts')).toThrow(UPDATE);
		const tsx = `"use strong";
import { useState, useEffect } from 'octane';
function useThing() { return useState(0); }
export function A({ v }) { const [x, setX] = useThing(); useEffect(() => { setX(v); }); return <p>{x}</p>; }`;
		expect(() => compile(tsx, '/src/A.tsx')).toThrow(UPDATE);
		expect(() => compile(tsx.replace('"use strong";', ''), '/src/A.tsx')).not.toThrow();
	});
});

describe('Strong hidden effect dependencies', () => {
	const app = (setup: string, output = '<div />', moduleSetup = '') => `
import * as Octane from 'octane';
import { useState, useEffect, useLayoutEffect, useInsertionEffect, useRef, useEffectEvent } from 'octane';
import { measure } from './measure';
${moduleSetup}
export function App(props) @{
  const [count, setCount, getCount] = useState(0);
  ${setup}
  ${output}
}`;

	it.each([
		['a state getter', `useEffect(() => { props.log(getCount()); });`],
		[
			'a tuple getter index',
			`const state = useState(0); useEffect(() => { props.log(state[2]()); });`,
		],
		['a getter alias', `const read = getCount; useEffect(() => { props.log(read()); });`],
		[
			'a getter in a helper',
			`const read = () => getCount(); useEffect(() => { props.log(read()); });`,
		],
		[
			'a getter in a zero-delay callback',
			`useEffect(() => { queueMicrotask(() => props.log(getCount())); });`,
		],
		['a getter in a layout effect', `useLayoutEffect(() => { props.log(getCount()); });`],
		['a getter in an insertion effect', `useInsertionEffect(() => { props.log(getCount()); });`],
		[
			'a previous-value ref',
			`const last = useRef(0); useEffect(() => { props.log(last.current); last.current = count; });`,
		],
		[
			'a first-run guard',
			`const first = useRef(true); useEffect(() => { if (first.current) { first.current = false; return; } props.track(props.value); });`,
		],
		[
			'a destructured ref',
			`const last = useRef(0); useEffect(() => { const { current } = last; props.log(current); });`,
		],
		[
			'a ref destructured by assignment',
			`const last = useRef(0); useEffect(() => { let current; ({ current } = last); props.log(current); });`,
		],
		[
			'a ref alias',
			`const last = useRef(0); const alias = last; useEffect(() => { props.log(alias.current); });`,
		],
		[
			'a ref read in a helper',
			`const last = useRef(0); const read = () => last.current; useEffect(() => { props.log(read()); });`,
		],
		['a compound ref update', `const runs = useRef(0); useEffect(() => { runs.current += 1; });`],
		['a ref increment', `const runs = useRef(0); useEffect(() => { runs.current++; });`],
		[
			'an optional ref read',
			`const last = useRef(0); useEffect(() => { props.log(last?.current); });`,
		],
		[
			'a computed ref read',
			`const last = useRef(0); useEffect(() => { props.log(last['current']); });`,
		],
		[
			'a namespace ref',
			`const last = Octane.useRef(0); useEffect(() => { props.log(last.current); });`,
		],
	])('rejects %s in effect setup', (_label, setup) => {
		rejects(app(setup), HIDDEN);
	});

	it.each([
		[
			'a didInit guard',
			`useEffect(() => { if (didInit) return; didInit = true; props.init(); });`,
			'let didInit = false;',
		],
		[
			'a previous-value module variable',
			`useEffect(() => { props.log(last); last = count; });`,
			'let last = 0;',
		],
		['a module counter', `useEffect(() => { runs++; });`, 'let runs = 0;'],
		[
			'a module read in a helper',
			`useEffect(() => { props.log(readLast()); });`,
			'let last = 0; function readLast() { return last; } export function bump() { last++; }',
		],
	])('rejects %s in effect setup', (_label, setup, moduleSetup) => {
		rejects(app(setup, '<div />', moduleSetup), HIDDEN);
	});

	it.each([
		['a dependency list', '[last]'],
		['a parenthesized dependency list', '([last])'],
		['a cast dependency list', '[last] as const'],
		['a satisfies dependency list', '[last] satisfies unknown[]'],
	])('does not treat %s as attaching a ref', (_label, dependencies) => {
		expect(
			errors(
				app(
					`const last = useRef(0); useEffect(() => { props.log(last.current); }, ${dependencies});`,
				),
			),
		).toContain(HIDDEN);
	});

	it.each([
		['ref writes', `const last = useRef(0); useEffect(() => { last.current = count; });`],
		[
			'an element ref',
			`const element = useRef(null); useEffect(() => { element.current.focus(); });`,
			'<div ref={element} />',
		],
		[
			'an element ref in an array',
			`const element = useRef(null); useEffect(() => { props.log(element.current); });`,
			'<div ref={[element, props.forwarded]} />',
		],
		[
			'a ref passed to a component',
			`const element = useRef(null); useEffect(() => { props.log(element.current); });`,
			'<props.Input inputRef={element} />',
		],
		[
			'a ref passed to a call',
			`const element = useRef(null); useEffect(() => { measure(element); props.log(element.current); });`,
		],
		[
			'a ref attached through a reassignable alias',
			`const element = useRef(null); let target = element; if (props.other) target = props.other; useEffect(() => { props.log(element.current); });`,
			'<div ref={target} />',
		],
		[
			'a ref held in a container',
			`const refs = [useRef(0)]; useEffect(() => { props.log(refs[0].current); });`,
		],
		[
			'a ref read in cleanup',
			`const last = useRef(0); useEffect(() => { return () => props.log(last.current); });`,
		],
		[
			'a ref read in a subscription',
			`const last = useRef(0); useEffect(() => props.subscribe(() => props.log(last.current)));`,
		],
		[
			'a ref read in an Effect Event',
			`const last = useRef(0); const report = useEffectEvent((next) => { props.log(last.current); last.current = next; }); useEffect(() => { report(count); });`,
		],
		[
			'a getter in an Effect Event',
			`const read = useEffectEvent(() => props.log(getCount())); useEffect(() => { read(); });`,
		],
		['a getter in cleanup', `useEffect(() => { return () => { props.log(getCount()); }; });`],
		['a snapshot', `useEffect(() => { props.log(count); });`],
		['a shadowed getter', `useEffect(() => { const getCount = () => 1; props.log(getCount()); });`],
		[
			'a local first-run flag',
			`useEffect(() => { let didInit = false; if (didInit) return; didInit = true; });`,
		],
		[
			'a ref whose destructuring assignment value escapes',
			`const last = useRef(0); useEffect(() => { let current; props.log(({ current } = last)); });`,
		],
	])('keeps %s legal', (_label, setup, output = '<div />') => {
		accepts(app(setup, output));
	});

	it.each([
		['an unreassigned module let', 'let LIMIT = 10;'],
		['a module constant', 'const LIMIT = 10;'],
	])('keeps %s legal', (_label, moduleSetup) => {
		accepts(app(`useEffect(() => { props.log(LIMIT); });`, '<div />', moduleSetup));
	});

	it('enforces TSX components and plain TypeScript custom hooks', () => {
		const tsx = `"use strong";
import { useState, useEffect, useRef } from 'octane';
export function A({ log }) { const [c, setC] = useState(0); const last = useRef(0); useEffect(() => { log(last.current); last.current = c; }); return <button onClick={() => setC(c + 1)}>{c}</button>; }`;
		expect(() => compile(tsx, '/src/A.tsx')).toThrow(HIDDEN);
		const ts = `"use strong";
import { useRef, useEffect } from 'octane';
export function usePreviousLog(value, log) { const last = useRef(value); useEffect(() => { log(last.current); last.current = value; }); }`;
		expect(() => slotHooks(ts, '/src/use-previous-log.ts')).toThrow(HIDDEN);
	});

	it.each([
		['an inline callback', '', '<div ref={(node) => { element.current = node; }} />'],
		[
			'a named callback',
			'function attach(node) { element.current = node; }',
			'<div ref={attach} />',
		],
		[
			'an aliased callback and ref',
			'const target = element; const attach = (node) => { target.current = node; }; const callback = attach;',
			'<div ref={callback} />',
		],
		[
			'a callback in an array',
			'const attach = (node) => { element.current = node; };',
			'<div ref={[attach, props.forwarded]} />',
		],
		[
			'a conditional callback',
			'const attach = (node) => { element.current = node; };',
			'<div ref={props.enabled ? attach : null} />',
		],
		[
			'a logical callback',
			'const attach = (node) => { element.current = node; };',
			'<div ref={props.enabled && attach} />',
		],
		[
			'a callback with a node guard',
			'const attach = (node) => { if (node) element.current = node; };',
			'<div ref={attach} />',
		],
		[
			'a callback that clears the ref when the node is absent',
			'const attach = (node) => { if (node) element.current = node; else element.current = null; };',
			'<div ref={attach} />',
		],
		[
			'a callback with a stable node alias',
			'const attach = (node) => { const target = node; element.current = target; };',
			'<div ref={attach} />',
		],
		[
			'a callback that returns a ref cleanup',
			'',
			'<div ref={(node) => { element.current = node; return () => { element.current = null; }; }} />',
		],
		[
			'a callback in a template row',
			'',
			'<section>@for (const item of props.items; key item.id) { <div ref={(node) => { element.current = node; }} /> }</section>',
		],
		[
			'a callback attached in a row that shadows its captured ref',
			'const attach = (node) => { element.current = node; };',
			'<section>@for (const element of props.items; key element.id) { <div ref={attach} /> }</section>',
		],
		[
			'an outer callback alias used in a row that shadows the callback',
			'const attach = (node) => { element.current = node; }; const alias = attach;',
			'<section>@for (const attach of props.callbacks; key attach) { <div ref={alias} /> }</section>',
		],
		[
			'an outer callback alias in an array used in a row that shadows the callback',
			'const attach = (node) => { element.current = node; }; const first = attach; const alias = first;',
			'<section>@for (const attach of props.callbacks; key attach) { <div ref={[alias, props.forwarded]} /> }</section>',
		],
		[
			'an attached callback with an unrelated shadowed row alias used as an event',
			'const attach = (node) => { element.current = node; };',
			'<section><div ref={attach} /> @for (const attach of props.callbacks; key attach) { const alias = attach; <button onClick={alias} /> }</section>',
		],
		[
			'an attached callback with two unrelated shadowed row aliases used as an event',
			'const attach = (node) => { element.current = node; };',
			'<section><div ref={attach} /> @for (const attach of props.callbacks; key attach) { const first = attach; const alias = first; <button onClick={alias} /> }</section>',
		],
		[
			'an attached callback with a bare row alias used as an event',
			'const attach = (node) => { element.current = node; };',
			'<section><div ref={attach} /> @for (attach of props.callbacks; key attach) { const alias = attach; <button onClick={alias} /> }</section>',
		],
		[
			'an attached callback with an unrelated var row alias used as an event',
			'const attach = (node) => { element.current = node; };',
			'<section><div ref={attach} /> @for (var attach of props.callbacks; key attach) { const alias = attach; <button onClick={alias} /> }</section>',
		],
		[
			'an attached callback with an unrelated row index alias used as an event',
			'const attach = (node) => { element.current = node; };',
			'<section><div ref={attach} /> @for (const item of props.items; index attach; key item) { const alias = attach; <button onClick={alias} /> }</section>',
		],
		[
			'an attached callback with a catch reset alias used as an event',
			'const attach = (node) => { element.current = node; };',
			'<section><div ref={attach} /> @try { <div /> } @catch (error, attach) { const alias = attach; <button onClick={alias} /> }</section>',
		],
		[
			'an attached callback with an unrelated JavaScript-scoped alias used as an event',
			'const attach = (node) => { element.current = node; }; const event = (attach) => { const alias = attach; return alias; };',
			'<section><div ref={attach} /><button onClick={event} /></section>',
		],
		[
			'a callback using an outer ref alias in a row that shadows the ref',
			'const alias = element;',
			'<section>@for (const element of props.items; key element.id) { <div ref={(node) => { alias.current = node; }} /> }</section>',
		],
		[
			'a callback in a try body when the catch binding shadows the ref',
			'',
			'<section>@try { <div ref={(node) => { element.current = node; }} /> } @catch (element) { <div /> }</section>',
		],
		[
			'a callback passed as a component ref',
			'const attach = (node) => { element.current = node; };',
			'<props.Input ref={attach} />',
		],
	])('accepts reading a ref attached by %s', (_label, callback, output) => {
		const source = app(
			`const element = useRef(null); ${callback} useLayoutEffect(() => { props.log(element.current); });`,
			output,
		);
		for (const mode of ['client', 'server'] as const) {
			const standard = compile(source, '/src/App.tsrx', { mode });
			const strong = compile(source, '/src/App.tsrx', { mode, strong: true });
			expect(strong.code).toBe(standard.code);
		}
		expect(errors(source)).toEqual([]);
	});

	it('accepts a nearer JavaScript callback binding inside a shadowing template row', () => {
		const source = app(
			`const element = useRef(null); const attach = (node) => { element.current = node; }; useLayoutEffect(() => { props.log(element.current); });`,
			'<section>@for (const attach of props.callbacks; key attach) { const render = () => { const attach = (node) => { element.current = node; }; const alias = attach; return <div ref={alias} />; }; {render()} }</section>',
		);
		for (const mode of ['client', 'server'] as const) {
			expect(() => compile(source, '/src/App.tsrx', { mode, strong: true })).not.toThrow();
		}
		expect(errors(source)).toEqual([]);
	});

	it('accepts a nearer JavaScript ref alias inside a shadowing template row', () => {
		const source = app(
			`const element = useRef(null); useLayoutEffect(() => { props.log(element.current); });`,
			'<section>@for (const local of props.items; key local) { const render = () => { const local = element; return <div ref={(node) => { local.current = node; }} />; }; {render()} }</section>',
		);
		for (const mode of ['client', 'server'] as const) {
			expect(() => compile(source, '/src/App.tsrx', { mode, strong: true })).not.toThrow();
		}
		expect(errors(source)).toEqual([]);
	});

	it('accepts a callback-attached ref in a TSX component', () => {
		const source = `import { useLayoutEffect, useRef } from 'octane';
export function App(props) {
  const element = useRef(null);
  useLayoutEffect(() => { props.log(element.current); });
  return <div ref={(node) => { element.current = node; }} />;
}`;
		for (const mode of ['client', 'server'] as const) {
			const standard = compile(source, '/src/App.tsx', { mode });
			const strong = compile(source, '/src/App.tsx', { mode, strong: true });
			expect(strong.code).toBe(standard.code);
		}
		expect(errors(source, '/src/App.tsx')).toEqual([]);
	});

	it.each([
		[
			'an unrelated event callback',
			'const attach = (node) => { element.current = node; };',
			'<div onClick={attach} />',
		],
		[
			'a ref callback also used as an event handler',
			'const attach = (node) => { element.current = node; };',
			'<div ref={attach} onClick={attach} />',
		],
		[
			'an alias of a ref callback used as an event handler',
			'const attach = (node) => { element.current = node; }; const click = attach;',
			'<div ref={attach} onClick={click} />',
		],
		[
			'a ref callback invoked from an event handler',
			'const attach = (node) => { element.current = node; }; const click = () => attach(props.value);',
			'<div ref={attach} onClick={click} />',
		],
		[
			'a callback passed to a different component prop',
			'const attach = (node) => { element.current = node; };',
			'<props.Input onReady={attach} />',
		],
		[
			'a callback used only as a logical condition',
			'const attach = (node) => { element.current = node; };',
			'<div ref={attach && props.forwarded} />',
		],
		[
			'a callback used only as a logical condition with a null result',
			'const attach = (node) => { element.current = node; };',
			'<div ref={attach && null} />',
		],
		[
			'a callback in a statically unreachable ref branch',
			'const attach = (node) => { element.current = node; };',
			'<div ref={false ? attach : null} />',
		],
		[
			'a callback that writes an unrelated value',
			'',
			'<div ref={(node) => { element.current = props.value; }} />',
		],
		[
			'a callback that stores a node property instead of the node',
			'',
			'<div ref={(node) => { element.current = node?.value; }} />',
		],
		[
			'a callback that overwrites the node with another value',
			'',
			'<div ref={(node) => { element.current = node; element.current = props.value; }} />',
		],
		[
			'a callback that writes an unknown property of the ref',
			'',
			'<div ref={(node) => { element.current = node; element[props.key] = props.value; }} />',
		],
		[
			'a callback that deletes the ref value',
			'',
			'<div ref={(node) => { element.current = node; delete element.current; }} />',
		],
		[
			'a callback that destructures another value into the ref',
			'',
			'<div ref={(node) => { element.current = node; ({ value: element.current } = props); }} />',
		],
		[
			'a callback that writes to the ref in a nested microtask',
			'',
			'<div ref={(node) => { element.current = node; queueMicrotask(() => { element.current = props.value; }); }} />',
		],
		[
			'a callback that writes to the ref in a nested immediate function',
			'',
			'<div ref={(node) => { element.current = node; (() => { element.current = props.value; })(); }} />',
		],
		[
			'a callback that uses the ref as a loop assignment target',
			'',
			'<div ref={(node) => { element.current = node; for (element.current of props.values) {} }} />',
		],
		[
			'a returned ref cleanup that writes an unrelated value',
			'',
			'<div ref={(node) => { element.current = node; return () => { element.current = props.value; }; }} />',
		],
		[
			'a callback whose ref assignment follows a return',
			'const attach = (node) => { return; element.current = node; };',
			'<div ref={attach} onClick={() => { element.current = props.value; }} />',
		],
		[
			'a callback whose ref assignment is in an unreachable branch',
			'const attach = (node) => { if (false) element.current = node; };',
			'<div ref={attach} onClick={() => { element.current = props.value; }} />',
		],
		[
			'a callback that stores a later parameter',
			'',
			'<div ref={(node, value) => { element.current = value; }} />',
		],
		[
			'a callback that reassigns its parameter',
			'const attach = (node) => { node = props.value; element.current = node; };',
			'<div ref={attach} />',
		],
		[
			'a callback that reassigns a node alias',
			'const attach = (node) => { let target = node; target = props.value; element.current = target; };',
			'<div ref={attach} />',
		],
		[
			'a callback that is reassigned',
			'let attach = (node) => { element.current = node; }; if (props.other) attach = props.other;',
			'<div ref={attach} />',
		],
		[
			'a deferred nested callback',
			'const attach = (node) => { queueMicrotask(() => { element.current = node; }); };',
			'<div ref={attach} />',
		],
		[
			'an async callback after a yield',
			'const attach = async (node) => { await Promise.resolve(); element.current = node; };',
			'<div ref={attach} />',
		],
		[
			'an uncalled nested callback',
			'const attach = (node) => { function save() { element.current = node; } };',
			'<div ref={attach} />',
		],
		[
			'a shadowed ref',
			'const attach = (node) => { const element = props.other; element.current = node; };',
			'<div ref={attach} />',
		],
		[
			'a ref shadowed by a template row alias',
			'',
			'<section>@for (const element of props.items; key element.id) { <div ref={(node) => { element.current = node; }} /> }</section>',
		],
		[
			'a ref alias shadowed by a template row alias',
			'const alias = element;',
			'<section>@for (const alias of props.items; key alias.id) { <div ref={(node) => { alias.current = node; }} /> }</section>',
		],
		[
			'an alias of a shadowing template row value',
			'',
			'<section>@for (const element of props.items; key element.id) { <div ref={(node) => { const actual = element; actual.current = node; }} /> }</section>',
		],
		[
			'a ref shadowed by a template catch binding',
			'',
			'<section>@try { <div /> } @catch (element) { <div ref={(node) => { element.current = node; }} /> }</section>',
		],
		[
			'an alias of a shadowed row callback',
			'const attach = (node) => { element.current = node; };',
			'<section>@for (const attach of props.callbacks; key attach) { const alias = attach; <div ref={alias} /> }</section>',
		],
		[
			'two aliases of a shadowed row callback',
			'const attach = (node) => { element.current = node; };',
			'<section>@for (const attach of props.callbacks; key attach) { const first = attach; const second = first; <div ref={second} /> }</section>',
		],
		[
			'an alias of a shadowed row callback in a conditional ref array',
			'const attach = (node) => { element.current = node; };',
			'<section>@for (const attach of props.callbacks; key attach) { const alias = attach; <div ref={props.enabled ? [alias, props.forwarded] : null} /> }</section>',
		],
		[
			'a nearer JavaScript-scoped callback reused as an event in a shadowing row',
			'const attach = (node) => { element.current = node; };',
			'<section>@for (const attach of props.callbacks; key attach) { const render = () => { const attach = (node) => { element.current = node; }; const alias = attach; return <div ref={alias} onClick={attach} />; }; {render()} }</section>',
		],
		[
			'a nearer JavaScript-scoped alias reused as an event in a shadowing row',
			'const attach = (node) => { element.current = node; };',
			'<section><div ref={attach} /> @for (const alias of props.callbacks; key alias) { const render = () => { const alias = attach; return <button onClick={alias} />; }; {render()} }</section>',
		],
		[
			'an alias of a shadowed catch callback',
			'const attach = (node) => { element.current = node; };',
			'<section>@try { <div /> } @catch (attach) { const alias = attach; <div ref={alias} /> }</section>',
		],
		[
			'an alias of a shadowed catch reset callback',
			'const attach = (node) => { element.current = node; };',
			'<section>@try { <div /> } @catch (error, attach) { const alias = attach; <div ref={alias} /> }</section>',
		],
		[
			'an alias of a bare row callback',
			'const attach = (node) => { element.current = node; };',
			'<section>@for (attach of props.callbacks; key attach) { const alias = attach; <div ref={alias} /> }</section>',
		],
		[
			'an alias of a var row callback',
			'const attach = (node) => { element.current = node; };',
			'<section>@for (var attach of props.callbacks; key attach) { const alias = attach; <div ref={alias} /> }</section>',
		],
		[
			'an alias of a row index',
			'const attach = (node) => { element.current = node; };',
			'<section>@for (const item of props.items; index attach; key item) { const alias = attach; <div ref={alias} /> }</section>',
		],
	])('keeps the hidden dependency diagnostic for %s', (_label, callback, output) => {
		const source = app(
			`const element = useRef(0); ${callback} useLayoutEffect(() => { props.log(element.current); });`,
			output,
		);
		for (const mode of ['client', 'server'] as const) {
			expect(() => compile(source, '/src/App.tsrx', { mode, strong: true })).toThrow(HIDDEN);
		}
		expect(errors(source)).toContain(HIDDEN);
	});

	it('detects a leaked listener on a callback-attached host ref', () => {
		const source = app(
			`const element = useRef(null); useEffect(() => { const node = element.current; if (!node) return; node.addEventListener('scroll', () => props.log('scroll')); });`,
			'<div ref={(node) => { element.current = node; }} />',
		);
		for (const mode of ['client', 'server'] as const) {
			expect(() => compile(source, '/src/App.tsrx', { mode, strong: true })).toThrow(LEAK);
		}
		expect(errors(source)).toContain(LEAK);
	});

	it('accepts cleanup of a listener on a callback-attached host ref', () => {
		const source = app(
			`const element = useRef(null); useEffect(() => { const node = element.current; if (!node) return; const onScroll = () => props.log('scroll'); node.addEventListener('scroll', onScroll); return () => node.removeEventListener('scroll', onScroll); });`,
			'<div ref={(node) => { element.current = node; }} />',
		);
		for (const mode of ['client', 'server'] as const) {
			const standard = compile(source, '/src/App.tsrx', { mode });
			const strong = compile(source, '/src/App.tsrx', { mode, strong: true });
			expect(strong.code).toBe(standard.code);
		}
		expect(errors(source)).toEqual([]);
	});

	it('names the snapshot and Effect Event replacements', () => {
		const result = compileToVolarMappings(
			app(
				`const first = useRef(true); useEffect(() => { if (first.current) { first.current = false; return; } props.track(props.value); });`,
			),
			'/src/App.tsrx',
			{ strong: true },
		);
		const error = result.diagnostics.find((diagnostic) => diagnostic.code === HIDDEN);
		expect(error?.message).toContain('useEffectEvent');
		expect(error?.message).toContain('never double-invokes');
		expect(error?.start.line).toBe(8);
	});
});

describe('Strong effect resource cleanup', () => {
	const app = (setup: string) => `
import { useState, useEffect, useLayoutEffect, useEffectEvent, useRef } from 'octane';
export function App(props) @{
  const [width, setWidth] = useState(0);
  const element = useRef(null);
  ${setup}
  <div ref={element}>{width as string}</div>
}`;

	it.each([
		'props.on ? element : null',
		'props.on && element',
		'[element] as const',
		'(element as any)',
	])('treats a ref passed as %s to an element as a platform target', (ref) => {
		const setup = `useEffect(() => { element.current.addEventListener('click', () => setWidth(1)); });`;
		rejects(app(setup).replace('<div ref={element}>', `<div ref={${ref}}>`), LEAK);
	});

	it.each([
		[
			'a window listener',
			`useEffect(() => { window.addEventListener('resize', () => setWidth(window.innerWidth)); });`,
		],
		[
			'a globalThis listener',
			`useEffect(() => { globalThis.addEventListener('resize', () => setWidth(1)); });`,
		],
		[
			'a document listener',
			`useEffect(() => { document.addEventListener('keydown', () => setWidth(1)); });`,
		],
		[
			'a body listener',
			`useEffect(() => { document.body.addEventListener('click', () => setWidth(1)); });`,
		],
		[
			'an element listener',
			`useEffect(() => { element.current.addEventListener('scroll', () => setWidth(1)); });`,
		],
		[
			'an element alias listener',
			`useEffect(() => { const node = element.current; node.addEventListener('scroll', () => setWidth(1)); });`,
		],
		[
			'a media query listener',
			`useEffect(() => { const query = window.matchMedia('(min-width: 600px)'); query.addEventListener('change', () => setWidth(1)); });`,
		],
		[
			'a one-shot listener',
			`useEffect(() => { const onResize = () => setWidth(1); window.addEventListener('resize', onResize, { once: true }); });`,
		],
		[
			'a listener removed with a new function',
			`useEffect(() => { window.addEventListener('resize', () => setWidth(1)); return () => window.removeEventListener('resize', () => setWidth(1)); });`,
		],
		[
			'a listener removed with another handler',
			`useEffect(() => { const first = () => setWidth(1); const second = () => setWidth(2); window.addEventListener('resize', first); return () => window.removeEventListener('resize', second); });`,
		],
		[
			'a listener removed for another event',
			`useEffect(() => { const onResize = () => setWidth(1); window.addEventListener('resize', onResize); return () => window.removeEventListener('scroll', onResize); });`,
		],
		[
			'a capture listener removed without capture',
			`useEffect(() => { const onResize = () => setWidth(1); window.addEventListener('resize', onResize, true); return () => window.removeEventListener('resize', onResize); });`,
		],
		[
			'a capture listener removed from another target',
			`useEffect(() => { const onKey = () => setWidth(1); document.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); });`,
		],
		[
			'a signal that is never aborted',
			`useEffect(() => { const controller = new AbortController(); window.addEventListener('resize', () => setWidth(1), { signal: controller.signal }); });`,
		],
		[
			'a handler property',
			`useEffect(() => { window.onresize = () => setWidth(window.innerWidth); });`,
		],
		[
			'an interval',
			`useEffect(() => { setInterval(() => setWidth((value) => value + 1), 1000); });`,
		],
		[
			'an uncleared interval ID',
			`useEffect(() => { const id = setInterval(() => setWidth(1), 1000); });`,
		],
		[
			'an interval cleared by another ID',
			`useEffect(() => { const id = setInterval(() => setWidth(1), 1000); const other = 1; return () => clearInterval(other); });`,
		],
		[
			'a window interval with an empty cleanup',
			`useEffect(() => { window.setInterval(() => setWidth(1), 1000); return () => {}; });`,
		],
		[
			'a self-rescheduling timeout',
			`useEffect(() => { const tick = () => { setWidth((value) => value + 1); setTimeout(tick, 1000); }; setTimeout(tick, 1000); });`,
		],
		[
			'a timeout loop that loses its ID',
			`useEffect(() => { let id = 0; const tick = () => { setWidth((value) => value + 1); setTimeout(tick, 1000); }; id = setTimeout(tick, 1000); return () => clearTimeout(id); });`,
		],
		[
			'an animation frame loop',
			`useEffect(() => { function loop() { setWidth((value) => value + 1); requestAnimationFrame(loop); } requestAnimationFrame(loop); });`,
		],
		[
			'a chained ResizeObserver',
			`useEffect(() => { new ResizeObserver(([entry]) => setWidth(entry.contentRect.height)).observe(element.current); });`,
		],
		[
			'a ResizeObserver',
			`useEffect(() => { const observer = new ResizeObserver(() => setWidth(1)); observer.observe(element.current); });`,
		],
		[
			'an IntersectionObserver',
			`useEffect(() => { const observer = new IntersectionObserver(() => setWidth(1)); observer.observe(element.current); return () => {}; });`,
		],
		[
			'a MutationObserver',
			`useEffect(() => { const observer = new MutationObserver(() => setWidth(1)); observer.observe(element.current, { childList: true }); });`,
		],
		[
			'a PerformanceObserver',
			`useEffect(() => { const observer = new PerformanceObserver(() => setWidth(1)); observer.observe({ type: 'paint' }); });`,
		],
		[
			'a WebSocket',
			`useEffect(() => { const socket = new WebSocket(props.url); socket.onmessage = (event) => setWidth(event.data); });`,
		],
		[
			'an EventSource',
			`useEffect(() => { const source = new EventSource(props.url); source.addEventListener('message', () => setWidth(1)); });`,
		],
		[
			'a BroadcastChannel',
			`useEffect(() => { const channel = new BroadcastChannel('x'); channel.onmessage = () => setWidth(1); });`,
		],
		[
			'a geolocation watch',
			`useEffect(() => { navigator.geolocation.watchPosition((position) => setWidth(position.coords.latitude)); });`,
		],
		[
			'a geolocation watch cleared by another ID',
			`useEffect(() => { const id = navigator.geolocation.watchPosition(() => setWidth(1)); return () => navigator.geolocation.clearWatch(0); });`,
		],
		[
			'an async effect callback',
			`useEffect(async () => { window.addEventListener('resize', () => setWidth(1)); });`,
		],
		[
			'a layout effect',
			`useLayoutEffect(() => { window.addEventListener('resize', () => setWidth(1)); });`,
		],
		[
			'a zero-delay callback',
			`useEffect(() => { queueMicrotask(() => window.addEventListener('resize', () => setWidth(1))); });`,
		],
		[
			'a local helper',
			`useEffect(() => { const listen = () => window.addEventListener('resize', () => setWidth(1)); listen(); });`,
		],
		[
			'a target passed to a helper',
			`function listen(target, type, handler) { target.addEventListener(type, handler); } useEffect(() => { listen(window, 'resize', () => setWidth(1)); });`,
		],
		[
			'a destructured document property',
			`useEffect(() => { const { body } = document; body.addEventListener('click', () => setWidth(1)); });`,
		],
		[
			'the global addEventListener',
			`useEffect(() => { addEventListener('resize', () => setWidth(1)); });`,
		],
		['a global handler property', `useEffect(() => { onresize = () => setWidth(1); });`],
		[
			'a helper removal for another event',
			`function listen(target, type, handler) { target.addEventListener(type, handler); } function unlisten(target, type, handler) { target.removeEventListener(type, handler); } useEffect(() => { const onResize = () => setWidth(1); listen(window, 'resize', onResize); return () => unlisten(window, 'scroll', onResize); });`,
		],
		[
			'a helper removal without capture',
			`function listen(target, type, handler, capture) { target.addEventListener(type, handler, capture); } function unlisten(target, type, handler) { target.removeEventListener(type, handler); } useEffect(() => { const onResize = () => setWidth(1); listen(window, 'resize', onResize, true); return () => unlisten(window, 'resize', onResize); });`,
		],
		[
			'an aliased capture option removed without capture',
			`useEffect(() => { const options = { capture: true }; const onResize = () => setWidth(1); window.addEventListener('resize', onResize, options); return () => window.removeEventListener('resize', onResize); });`,
		],
		[
			'a helper capture option removed without capture',
			`function listen(target, handler, options) { target.addEventListener('resize', handler, options); } useEffect(() => { const onResize = () => setWidth(1); listen(window, onResize, { capture: true }); return () => window.removeEventListener('resize', onResize); });`,
		],
		[
			'a listener on a conditional platform target',
			`useEffect(() => { const target = props.wide ? window : document; target.addEventListener('resize', () => setWidth(1)); });`,
		],
		[
			'a named function timer that reschedules itself',
			`useEffect(() => { setTimeout(function tick() { setWidth(1); setTimeout(tick, 1000); }, 1000); });`,
		],
		[
			'a conditionally created interval',
			`useEffect(() => { const id = props.enabled ? setInterval(() => setWidth(1), 1000) : null; });`,
		],
		[
			'a stored helper remover for another handler',
			`function subscribe(handler, other) { window.addEventListener('resize', handler); return () => window.removeEventListener('resize', other); } useEffect(() => { const first = () => setWidth(1); const second = () => setWidth(2); const stop = subscribe(first, second); return stop; });`,
		],
		[
			'a returned helper remover for another handler',
			`function subscribe(handler, other) { window.addEventListener('resize', handler); return () => window.removeEventListener('resize', other); } useEffect(() => { const first = () => setWidth(1); const second = () => setWidth(2); return subscribe(first, second); });`,
		],
		[
			'a helper removal for another handler',
			`function listen(target, type, handler) { target.addEventListener(type, handler); } function unlisten(target, type, handler) { target.removeEventListener(type, handler); } useEffect(() => { const first = () => setWidth(1); const second = () => setWidth(2); listen(window, 'resize', first); return () => unlisten(window, 'resize', second); });`,
		],
		[
			'an Effect Event remover the effect discards',
			`const start = useEffectEvent(() => { const onResize = () => setWidth(1); window.addEventListener('resize', onResize); return () => window.removeEventListener('resize', onResize); }); useEffect(() => { start(); });`,
		],
		[
			'an Effect Event remover without capture',
			`const start = useEffectEvent(() => { const onResize = () => setWidth(1); window.addEventListener('resize', onResize, true); return () => window.removeEventListener('resize', onResize, false); }); useLayoutEffect(() => start());`,
		],
		[
			'an Effect Event remover for another handler',
			`const start = useEffectEvent((handler, other) => { window.addEventListener('resize', handler); return () => window.removeEventListener('resize', other); }); useEffect(() => start(() => setWidth(1), () => setWidth(2)));`,
		],
		[
			'a target passed to an Effect Event',
			`const listen = useEffectEvent((target) => { target.addEventListener('resize', () => setWidth(1)); }); useEffect(() => { listen(window); });`,
		],
	])('rejects %s without release', (_label, setup) => {
		rejects(app(setup), LEAK);
	});

	it.each([
		[
			'a removed listener',
			`useEffect(() => { const onResize = () => setWidth(window.innerWidth); window.addEventListener('resize', onResize); return () => window.removeEventListener('resize', onResize); });`,
		],
		[
			'a removed capture listener',
			`useEffect(() => { const onResize = () => setWidth(1); window.addEventListener('resize', onResize, true); return () => window.removeEventListener('resize', onResize, true); });`,
		],
		[
			'a capture option object',
			`useEffect(() => { const onResize = () => setWidth(1); window.addEventListener('resize', onResize, { capture: true, passive: true }); return () => window.removeEventListener('resize', onResize, { capture: true }); });`,
		],
		[
			'an aborted listener signal',
			`useEffect(() => { const controller = new AbortController(); window.addEventListener('resize', () => setWidth(1), { signal: controller.signal }); return () => controller.abort(); });`,
		],
		[
			'a removed listener on a conditional platform target',
			`useEffect(() => { const target = props.wide ? window : document; const onResize = () => setWidth(1); target.addEventListener('resize', onResize); return () => target.removeEventListener('resize', onResize); });`,
		],
		[
			'a named function timer that stores each reschedule',
			`useEffect(() => { let id = setTimeout(function tick() { setWidth(1); id = setTimeout(tick, 1000); }, 1000); return () => clearTimeout(id); });`,
		],
		[
			'a cleared conditional interval',
			`useEffect(() => { const id = props.enabled ? setInterval(() => setWidth(1), 1000) : null; return () => clearInterval(id); });`,
		],
		[
			'a cleared logical interval',
			`useEffect(() => { const id = props.enabled && setInterval(() => setWidth(1), 1000); return () => clearInterval(id); });`,
		],
		[
			'a remover returned by a helper',
			`function subscribe(handler) { window.addEventListener('resize', handler); return () => window.removeEventListener('resize', handler); } useEffect(() => { const onResize = () => setWidth(1); return subscribe(onResize); });`,
		],
		[
			'a helper remover stored before it is returned',
			`function subscribe(handler) { window.addEventListener('resize', handler); return () => window.removeEventListener('resize', handler); } useEffect(() => { const onResize = () => setWidth(1); const stop = subscribe(onResize); return stop; });`,
		],
		[
			'a remover returned through nested helpers',
			`function subscribe(handler) { window.addEventListener('resize', handler); return () => window.removeEventListener('resize', handler); } function watch(handler) { return subscribe(handler); } useEffect(() => { const onResize = () => setWidth(1); const stop = watch(onResize); return stop; });`,
		],
		[
			'a stored helper abort',
			`function listen(handler, controller) { window.addEventListener('resize', handler, { signal: controller.signal }); return () => controller.abort(); } useEffect(() => { const controller = new AbortController(); const stop = listen(() => setWidth(1), controller); return stop; });`,
		],
		[
			'removers from two calls of one helper',
			`function subscribe(handler) { window.addEventListener('resize', handler); return () => window.removeEventListener('resize', handler); } useEffect(() => { const first = () => setWidth(1); const second = () => setWidth(2); const stopFirst = subscribe(first); const stopSecond = subscribe(second); return props.flag ? stopFirst : stopSecond; });`,
		],
		[
			'a remover returned by a helper from an expression body',
			`function subscribe(handler) { window.addEventListener('resize', handler); return () => window.removeEventListener('resize', handler); } const onResize = () => setWidth(1); useEffect(() => subscribe(onResize));`,
		],
		[
			'an aliased capture option',
			`useEffect(() => { const options = { capture: true }; const onResize = () => setWidth(1); window.addEventListener('resize', onResize, options); return () => window.removeEventListener('resize', onResize, options); });`,
		],
		[
			'an aliased listener signal',
			`useEffect(() => { const controller = new AbortController(); const options = { signal: controller.signal }; window.addEventListener('resize', () => setWidth(1), options); return () => controller.abort(); });`,
		],
		[
			'a listener signal passed to a helper',
			`function listen(handler, options) { window.addEventListener('resize', handler, options); } useEffect(() => { const controller = new AbortController(); listen(() => setWidth(1), { signal: controller.signal }); return () => controller.abort(); });`,
		],
		[
			'a controller passed to listener and cleanup helpers',
			`function listen(handler, controller) { window.addEventListener('resize', handler, { signal: controller.signal }); } function stop(controller) { controller.abort(); } useEffect(() => { const controller = new AbortController(); listen(() => setWidth(1), controller); return () => stop(controller); });`,
		],
		[
			'a removed element listener',
			`useEffect(() => { const onScroll = () => setWidth(1); element.current.addEventListener('scroll', onScroll); return () => element.current.removeEventListener('scroll', onScroll); });`,
		],
		[
			'a removed element alias listener',
			`useEffect(() => { const node = element.current; const onScroll = () => setWidth(1); node.addEventListener('scroll', onScroll); return () => node.removeEventListener('scroll', onScroll); });`,
		],
		[
			'a removed media query listener',
			`useEffect(() => { const query = window.matchMedia('(x)'); const onChange = () => setWidth(1); query.addEventListener('change', onChange); return () => query.removeEventListener('change', onChange); });`,
		],
		[
			'optional listener calls',
			`useEffect(() => { const onResize = () => setWidth(1); window?.addEventListener('resize', onResize); return () => window?.removeEventListener('resize', onResize); });`,
		],
		[
			'a conditional removal',
			`useEffect(() => { const onResize = () => setWidth(1); window.addEventListener('resize', onResize); return () => { if (onResize) window.removeEventListener('resize', onResize); }; });`,
		],
		[
			'a removal in a cleanup helper',
			`useEffect(() => { const onResize = () => setWidth(1); window.addEventListener('resize', onResize); return () => stop(); function stop() { window.removeEventListener('resize', onResize); } });`,
		],
		[
			'a reset handler property',
			`useEffect(() => { window.onresize = () => setWidth(1); return () => { window.onresize = null; }; });`,
		],
		[
			'a cleared interval',
			`useEffect(() => { const id = setInterval(() => setWidth((value) => value + 1), 1000); return () => clearInterval(id); });`,
		],
		[
			'a window interval',
			`useEffect(() => { const id = window.setInterval(() => setWidth(1), 1000); return () => window.clearInterval(id); });`,
		],
		[
			'an interval cleared with clearTimeout',
			`useEffect(() => { const id = setInterval(() => setWidth(1), 1000); return () => clearTimeout(id); });`,
		],
		[
			'an interval kept in a ref',
			`const timer = useRef(0); useEffect(() => { timer.current = setInterval(() => setWidth(1), 1000); return () => clearInterval(timer.current); });`,
		],
		[
			'a cancelled timeout loop',
			`useEffect(() => { let id = 0; const tick = () => { setWidth((value) => value + 1); id = setTimeout(tick, 1000); }; id = setTimeout(tick, 1000); return () => clearTimeout(id); });`,
		],
		[
			'a cancelled animation loop',
			`useEffect(() => { let frame = 0; function loop() { setWidth((value) => value + 1); frame = requestAnimationFrame(loop); } frame = requestAnimationFrame(loop); return () => cancelAnimationFrame(frame); });`,
		],
		[
			'a disconnected observer',
			`useEffect(() => { const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.height)); observer.observe(element.current); return () => observer.disconnect(); });`,
		],
		[
			'an unobserved observer',
			`useEffect(() => { const observer = new ResizeObserver(() => setWidth(1)); observer.observe(element.current); return () => observer.unobserve(element.current); });`,
		],
		[
			'an optional disconnect',
			`useEffect(() => { const observer = new ResizeObserver(() => setWidth(1)); observer.observe(element.current); return () => { observer?.disconnect(); }; });`,
		],
		[
			'a closed WebSocket',
			`useEffect(() => { const socket = new WebSocket(props.url); socket.onmessage = (event) => setWidth(event.data); return () => socket.close(); });`,
		],
		[
			'a closed EventSource',
			`useEffect(() => { const source = new EventSource(props.url); source.addEventListener('message', () => setWidth(1)); return () => source.close(); });`,
		],
		[
			'a cleared geolocation watch',
			`useEffect(() => { const id = navigator.geolocation.watchPosition(() => setWidth(1)); return () => navigator.geolocation.clearWatch(id); });`,
		],
		[
			'a same-module subscription helper',
			`function subscribeResize(notify) { window.addEventListener('resize', notify); return () => window.removeEventListener('resize', notify); } useEffect(() => subscribeResize(() => setWidth(1)));`,
		],
		['a store subscription', `useEffect(() => { props.store.subscribe(() => setWidth(1)); });`],
		[
			'a user EventTarget',
			`useEffect(() => { props.emitter.addEventListener('change', () => setWidth(1)); });`,
		],
		['a one-shot timeout', `useEffect(() => { setTimeout(() => setWidth(1), 1000); });`],
		[
			'a one-shot animation frame',
			`useEffect(() => { requestAnimationFrame(() => setWidth(1)); });`,
		],
		[
			'a listener added by an event handler',
			`const onClick = () => window.addEventListener('resize', () => setWidth(1));`,
		],
		[
			'listeners added and removed by helpers',
			`function listen(target, type, handler) { target.addEventListener(type, handler); } function unlisten(target, type, handler) { target.removeEventListener(type, handler); } useEffect(() => { const onResize = () => setWidth(1); listen(window, 'resize', onResize); return () => unlisten(window, 'resize', onResize); });`,
		],
		[
			'a removed destructured document property listener',
			`useEffect(() => { const { body } = document; const onClick = () => setWidth(1); body.addEventListener('click', onClick); return () => body.removeEventListener('click', onClick); });`,
		],
		[
			'a window listener removed globally',
			`useEffect(() => { const onResize = () => setWidth(1); window.addEventListener('resize', onResize); return () => removeEventListener('resize', onResize); });`,
		],
		[
			'a global listener removed from the window',
			`useEffect(() => { const onResize = () => setWidth(1); addEventListener('resize', onResize); return () => window.removeEventListener('resize', onResize); });`,
		],
		[
			'a reset global handler property',
			`useEffect(() => { onresize = () => setWidth(1); return () => { window.onresize = null; }; });`,
		],
		[
			'a remover returned by an Effect Event',
			`const start = useEffectEvent(() => { const onResize = () => setWidth(1); window.addEventListener('resize', onResize); return () => window.removeEventListener('resize', onResize); }); useLayoutEffect(() => start());`,
		],
		[
			'an Effect Event remover stored before it is returned',
			`const start = useEffectEvent(() => { const onResize = () => setWidth(1); window.addEventListener('resize', onResize, { capture: true }); return () => window.removeEventListener('resize', onResize, true); }); useEffect(() => { const stop = start(); return stop; });`,
		],
		[
			'a remover returned by an Effect Event for the handler passed to it',
			`const start = useEffectEvent((handler) => { window.addEventListener('resize', handler); return () => window.removeEventListener('resize', handler); }); useEffect(() => { const onResize = () => setWidth(1); return start(onResize); });`,
		],
		[
			'a listener added by an Effect Event and removed by the effect',
			`const listen = useEffectEvent((handler) => { window.addEventListener('resize', handler); }); useEffect(() => { const onResize = () => setWidth(1); listen(onResize); return () => window.removeEventListener('resize', onResize); });`,
		],
		[
			'a controller passed to an Effect Event',
			`const listen = useEffectEvent((controller) => { window.addEventListener('resize', () => setWidth(1), { signal: controller.signal }); }); useEffect(() => { const controller = new AbortController(); listen(controller); return () => controller.abort(); });`,
		],
	])('accepts %s', (_label, setup) => {
		accepts(app(setup));
	});

	it('names the release for each resource', () => {
		const messages = compileToVolarMappings(
			app(`useEffect(() => {
    window.addEventListener('resize', () => setWidth(1));
    setInterval(() => setWidth(2), 1000);
    new ResizeObserver(() => setWidth(3)).observe(element.current);
    new WebSocket(props.url);
    navigator.geolocation.watchPosition(() => setWidth(4));
  });`),
			'/src/App.tsrx',
			{ strong: true },
		)
			.diagnostics.filter((diagnostic) => diagnostic.code === LEAK)
			.map((diagnostic) => diagnostic.message);
		expect(messages).toEqual([
			expect.stringContaining('removeEventListener'),
			expect.stringContaining('clearInterval'),
			expect.stringContaining('disconnect()'),
			expect.stringContaining('close()'),
			expect.stringContaining('clearWatch'),
		]);
	});

	it('enforces TSX components and plain TypeScript custom hooks', () => {
		const tsx = `"use strong";
import { useState, useEffect, useRef } from 'octane';
export function A() { const r = useRef(null); const [h, setH] = useState(0); useEffect(() => { new ResizeObserver(([e]) => setH(e.contentRect.height)).observe(r.current); }); return <div ref={r}>{h}</div>; }`;
		expect(() => compile(tsx, '/src/A.tsx')).toThrow(LEAK);
		const ts = `"use strong";
import { useState, useEffect } from 'octane';
export function useWidth() { const [w, setW] = useState(0); useEffect(() => { window.addEventListener('resize', () => setW(window.innerWidth)); }); return w; }`;
		expect(() => slotHooks(ts, '/src/use-width.ts')).toThrow(LEAK);
	});

	it('follows a disposer returned through an Effect Event in every compiler path', () => {
		const hook = (remove: string) => `import { useEffectEvent, useLayoutEffect } from 'octane';
export function usePageEvents() {
  const start = useEffectEvent(() => {
    const handler = () => {};
    window.addEventListener('pagehide', handler);
    return () => ${remove};
  });
  useLayoutEffect(() => start());
}`;
		const released = hook(`window.removeEventListener('pagehide', handler)`);
		const leaked = hook(`window.removeEventListener('pagehide', handler, true)`);
		for (const mode of ['client', 'server'] as const) {
			const options = { mode, strong: true, dev: false, hmr: false };
			expect(() => compile(released, '/src/page-events.tsrx', options)).not.toThrow();
			expect(() => compile(leaked, '/src/page-events.tsrx', options)).toThrow(LEAK);
		}
		expect(errors(released, '/src/page-events.tsrx')).toEqual([]);
		expect(errors(leaked, '/src/page-events.tsrx')).toEqual([LEAK]);
	});

	it('follows a disposer returned through an Effect Event from a custom hook', () => {
		accepts(`import { useEffectEvent, useLayoutEffect } from 'octane';
function usePageHide(onHide) {
  return useEffectEvent(() => {
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  });
}
export function usePage(props) {
  const start = usePageHide(props.onHide);
  useLayoutEffect(() => start());
}`);
	});
});

describe('Strong effect checks keep valid output unchanged', () => {
	const source = `
import { useState, useEffect, useRef, useEffectEvent } from 'octane';
import { api } from './api';
export function App(props) @{
  const [data, setData] = useState(null);
  const [width, setWidth] = useState(0);
  const element = useRef(null);
  const report = useEffectEvent((value) => props.log(value, element.current));
  useEffect(() => {
    let ignore = false;
    api.get(props.id).then((value) => { if (!ignore) setData(value); });
    return () => { ignore = true; };
  });
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element.current);
    return () => observer.disconnect();
  });
  useEffect(() => { report(props.id); });
  <div ref={element}>{width as string}{data}</div>
}`;

	it.each(['client', 'server'] as const)('emits identical %s code', (mode) => {
		const standard = compile(source, '/src/App.tsrx', { mode });
		const strong = compile(source, '/src/App.tsrx', { mode, strong: true } as any);
		expect(strong.code).toBe(standard.code);
		expect(errors(source)).toEqual([]);
	});

	it('emits identical plain TypeScript custom hooks', () => {
		const hook = `import { useState, useEffect } from 'octane';
export function useWidth() {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    window.addEventListener('resize', () => setWidth(window.innerWidth), { signal: controller.signal });
    return () => controller.abort();
  });
  return width;
}`;
		const standard = slotHooks(hook, '/src/use-width.ts');
		const strong = slotHooks(`"use strong"; ${hook}`, '/src/use-width.ts');
		expect(standard).not.toBeNull();
		expect(strong?.code).toBe(`"use strong"; ${standard!.code}`);
	});

	it('publishes each new effect code as a source-located editor error', () => {
		const result = compileToVolarMappings(
			`"use strong";
import { useState, useEffect, useRef } from 'octane';
import { api } from './api';
export function App(props) @{
  const [value, setValue, getValue] = useState(0);
  const last = useRef(0);
  useEffect(() => { queueMicrotask(() => setValue(1)); });
  useEffect(() => { api.get(props.id).then(setValue); });
  useEffect(() => { props.log(getValue(), last.current); });
  useEffect(() => { setInterval(() => setValue(2), 1000); });
  <div />
}`,
			'/src/App.tsrx',
		);
		const lines = Object.fromEntries(
			result.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.start.line]),
		);
		expect(lines).toEqual({ [UPDATE]: 7, [FETCH]: 8, [HIDDEN]: 9, [LEAK]: 10 });
		expect(result.errors.map((error) => error.code)).toEqual(
			expect.arrayContaining([UPDATE, FETCH, HIDDEN, LEAK]),
		);
	});
});
