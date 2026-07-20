import { describe, expect, it } from 'vitest';
import { parseModule } from '@tsrx/core';
import { compile } from '../src/compiler/compile.js';
import { slotHooks } from '../src/compiler/slot-hooks.js';
import * as UniversalRuntime from '../src/universal.js';
import {
	CAUSAL_STATE_CLEANUP_WRITE,
	CAUSAL_STATE_EFFECT_WRITE,
	CAUSAL_STATE_PURITY_WRITE,
	CAUSAL_STATE_RENDER_WRITE,
	CausalStateCompileError,
} from '../src/compiler/causal-state-diagnostics.js';
import { evaluateCompiledModule } from './_compiled-module.js';

function causal(source: string, filename = '/src/App.tsrx') {
	return compile(source, filename, { hmr: false, stateModel: 'causal' });
}

function compileError(source: string): CausalStateCompileError {
	try {
		causal(source);
	} catch (error) {
		expect(error).toBeInstanceOf(CausalStateCompileError);
		return error as CausalStateCompileError;
	}
	throw new Error('Expected causal compilation to fail.');
}

describe('causal state compiler policy', () => {
	it('keeps omitted and explicit permissive compilation byte-identical', () => {
		const source = `
import { useState, useEffect } from 'octane';
export function App() @{
	const [value, setValue] = useState(0);
	useEffect(() => setValue(1), []);
	<div>{value as string}</div>
}`;
		expect(compile(source, '/src/App.tsrx', { hmr: false })).toEqual(
			compile(source, '/src/App.tsrx', { hmr: false, stateModel: 'permissive' }),
		);
	});

	it('stamps client/server components and appends the causal model after hook slots', () => {
		const source = `
import {
	useActionState,
	useEffect,
	useImperativeHandle,
	useInsertionEffect,
	useLayoutEffect,
	useMemo,
	useOptimistic,
	useReducer,
	useState,
} from 'octane';
const reducer = (state, action) => state + action;
export function App() @{
	const [state, setState, getState] = useState(0);
	const [reduced] = useReducer(reducer, 0);
	const [actionState] = useActionState(async (previous) => previous + 1, 0);
	const [optimistic] = useOptimistic(0, (previous, value) => previous + value);
	const memoized = useMemo(() => state, [state]);
	useEffect(() => {}, []);
	useImperativeHandle({ current: null }, () => ({}), []);
	useLayoutEffect(() => {}, []);
	useInsertionEffect(() => {}, []);
	<div>{getState() + reduced + actionState + optimistic + memoized as string}</div>
}`;
		const client = causal(source).code;
		const server = compile(source, '/src/App.tsrx', {
			mode: 'server',
			stateModel: 'causal',
		}).code;

		for (const output of [client, server]) {
			expect(output).toContain('markStateModel as _$markStateModel');
			expect(output).toMatch(/_\$markStateModel\(function App[\s\S]*, 1\)/);
			expect(output).toMatch(/_\$__useStateWithGetter\(0, (?:\d+|_h\$\d+), 1\)/);
			expect(output).toMatch(/useReducer\(reducer, 0, undefined, (?:\d+|_h\$\d+), 1\)/);
			expect(output).toMatch(/useActionState\([\s\S]*?, undefined, (?:\d+|_h\$\d+), 1\)/);
			expect(output).toMatch(/useOptimistic\([\s\S]*?, (?:\d+|_h\$\d+), 1\)/);
			expect(output).toMatch(/useMemo\([\s\S]*?, (?:\d+|_h\$\d+), 1\)/);
			expect(output).toMatch(/useEffect\([\s\S]*?, (?:\d+|_h\$\d+), 1\)/);
			expect(output).toMatch(/useImperativeHandle\([\s\S]*?, (?:\d+|_h\$\d+), 1\)/);
			expect(output).toMatch(/useLayoutEffect\([\s\S]*?, (?:\d+|_h\$\d+), 1\)/);
			expect(output).toMatch(/useInsertionEffect\([\s\S]*?, (?:\d+|_h\$\d+), 1\)/);
		}
	});

	it('marks hoisted and nested return-JSX declarations before they can execute', () => {
		const output = causal(`
root.render(App);
function App() { return <div />; }
export function make() {
	return Inner;
	function Inner() { return <span />; }
}
`).code;
		expect(output.indexOf('App = _$markStateModel(App, 1);')).toBeLessThan(
			output.indexOf('root.render(App)'),
		);
		expect(output.indexOf('Inner = _$markStateModel(Inner, 1);')).toBeLessThan(
			output.indexOf('return Inner'),
		);
		expect(output.match(/App = _\$markStateModel\(App, 1\);/g)).toHaveLength(1);
		expect(output.match(/Inner = _\$markStateModel\(Inner, 1\);/g)).toHaveLength(1);
	});

	it('lets the server component initializer own top-level return-JSX provenance', () => {
		const output = compile(
			`function Recursive(props) {
	if (props.depth === 0) return <span />;
	return <Recursive depth={props.depth - 1} />;
}
export function App() @{ <Recursive depth={1} /> }`,
			'/src/server-recursive.tsrx',
			{ mode: 'server', stateModel: 'causal' },
		).code;
		const declaration = output.indexOf('const Recursive =');
		expect(declaration).toBeGreaterThan(-1);
		expect(output.slice(0, declaration)).not.toContain('Recursive = _$markStateModel');
		expect(output.slice(declaration)).toMatch(
			/const Recursive = \/\* @__PURE__ \*\/ _\$markStateModel\(function Recursive/,
		);
	});

	it('stamps return-JSX and universal components', () => {
		const returned = causal(
			`import { useState } from 'octane';
export function App() { const [value] = useState(0); return <div>{value as string}</div>; }`,
			'/src/App.tsx',
		).code;
		expect(returned).toContain('App = _$markStateModel(App, 1);');
		expect(returned.match(/App = _\$markStateModel\(App, 1\);/g)).toHaveLength(1);

		const universal = compile('export function Scene() @{ <view /> }', '/src/Scene.tsrx', {
			stateModel: 'causal',
			renderer: {
				id: 'object',
				module: 'octane/universal',
				target: 'universal',
				text: 'host',
			},
		}).code;
		expect(universal).toContain(
			'import { markStateModel as _$markStateModel } from "octane/universal";',
		);
		expect(universal).toMatch(
			/export const Scene = _\$markStateModel\(\s*__octaneDefineUniversalComponent\(/,
		);
	});

	it('stamps every generic JSX-producing component form in client, HMR, and server output', () => {
		const source = `
export const Arrow = () => <span />;
export function Conditional(props) {
	if (props.visible) return <div />;
	return null;
}
export default function () {
	return <main />;
}
export function Host() @{
	const handleClick = () => {};
	<button onClick={handleClick}>Click</button>
}
`;
		const client = compile(source, '/src/Generic.tsx', { stateModel: 'causal' }).code;
		const hmr = compile(source, '/src/Generic.tsx', {
			hmr: 'vite',
			stateModel: 'causal',
		}).code;
		const server = compile(source, '/src/Generic.tsx', {
			mode: 'server',
			stateModel: 'causal',
		}).code;

		for (const output of [client, hmr, server]) {
			expect(output).toMatch(/Arrow\s*=\s*_\$markStateModel\(/);
			expect(output).toContain('_$markStateModel(Conditional, 1);');
			expect(output).toMatch(/export default _\$markStateModel\(\s*function/);
			expect(output).not.toMatch(/handleClick\s*=\s*_\$markStateModel\(/);
			expect(output).not.toContain('_$markStateModel(handleClick, 1)');
		}
	});

	it('marks arbitrary JSX-producing values without marking their enclosing factory', () => {
		const output = causal(`
const make = () => () => <div />;
const choices = [() => <span />];
const views = { Empty: () => <main /> };
root.render(() => <aside />);
export { make, choices, views };
`).code;
		expect(output).toMatch(/const make = \(\) => _\$markStateModel\(\(\) =>/);
		expect(output).not.toMatch(/const make = _\$markStateModel/);
		expect(output).toMatch(/choices = \[_\$markStateModel\(/);
		expect(output).toMatch(/Empty: _\$markStateModel\(/);
		expect(output).toMatch(/root\.render\(_\$markStateModel\(/);
	});

	it('stamps static custom-hook definitions and preserves the actual method receiver/callee ABI', () => {
		const output = causal(`
function useLocal() { return 1; }
const api = { useThing(value) { return this.prefix + value; }, prefix: 'x' };
function getApi() { return api; }
export function App() {
	useLocal();
	api.useThing(1);
	getApi().useThing(2);
	return <div />;
}
`).code;
		expect(output).toContain('useLocal = _$markStateModel(useLocal, 1);');
		expect(output).toContain('markStateModelMethods as _$markStateModelMethods');
		expect(output).toMatch(/_\$markStateModelMethods\([\s\S]*useThing\(value\)/);
		expect(output).toMatch(
			/_\$withMethodSlot\([^,]+, api, ["']useThing["'], \(\) => \[1, [^\]]+\]\)/,
		);
		expect(output).toMatch(
			/\(_\$hookReceiver\$?\d*\) => _\$withMethodSlot\([^,]+, _\$hookReceiver\$?\d*, ["']useThing["'], \(\) => \[2, [^\]]+\]\)/,
		);
		expect(output).toMatch(/\)\(getApi\(\)\)/);

		const universal = compile(
			`const api = { useThing() { return 1; } };
export function Scene() @{ const value = api.useThing(); <scene value={value} /> }`,
			'/src/Scene.tsrx',
			{
				stateModel: 'causal',
				hmr: false,
				renderer: {
					id: 'object',
					module: 'octane/universal',
					target: 'universal',
				},
			},
		).code;
		expect(universal).toMatch(
			/import \{[^}]*withMethodSlot as _\$withMethodSlot[^}]*\} from "octane\/universal";/,
		);
		expect(universal).not.toContain("from 'octane';");
	});

	it('preserves accessor syntax while marking callable values created inside accessors', () => {
		const output = causal(`
const views = {
	get Empty() { return <div />; },
	get Component() { return () => <span />; },
};
export function App() @{ <div>{views.Empty}</div> }
`).code;
		expect(() => parseModule(output, '/compiled-accessors.js')).not.toThrow();
		expect(output).toContain('get Empty()');
		expect(output).toMatch(/get Component\(\)[\s\S]*return _\$markStateModel\(/);

		const slotted = slotHooks(
			`const values = { get Empty() { return 1; } };
export function useValue() { return values.Empty; }`,
			'/src/accessors.ts',
			{ stateModel: 'causal' },
		);
		expect(() => parseModule(slotted?.code ?? '', '/compiled-accessors.js')).not.toThrow();
		expect(slotted?.code).toContain('get Empty()');
	});

	it('rejects class custom-hook methods until prototype provenance has a sound ABI', () => {
		for (const method of [
			'useValue() { return 1; }',
			'static useValue() { return 1; }',
			'#useValue() { return 1; }',
		]) {
			const source = `class Api { ${method} }
export const api = new Api();`;
			for (const compileSource of [
				() => compile(source, '/src/api.tsx', { stateModel: 'causal' }),
				() => slotHooks(source, '/src/api.ts', { stateModel: 'causal' }),
			]) {
				let error: any = null;
				try {
					compileSource();
				} catch (value) {
					error = value;
				}
				expect(error).toMatchObject({
					code: 'OCTANE_CAUSAL_CLASS_HOOK_UNSUPPORTED',
				});
				expect(String(error)).toMatch(
					/Move the hook to a module function or object-function property/,
				);
			}
		}
	});

	it('preserves marked object-method super syntax through descriptor stamping', () => {
		const source = `const base = { useValue() { return 1; } };
export const api = {
	__proto__: base,
	useValue() { return super.useValue(); },
};`;
		for (const compileSource of [
			() => compile(source, '/src/api.tsx', { stateModel: 'causal' }),
			() => slotHooks(source, '/src/api.ts', { stateModel: 'causal' }),
		]) {
			const output = compileSource()?.code ?? '';
			expect(() => parseModule(output, '/compiled-api.js')).not.toThrow();
			expect(output).toContain('markStateModelMethods');
			expect(output).toContain('super.useValue');
		}
	});

	it('rejects statically proven writes in object-member components', () => {
		const error = compileError(`
import { useState } from 'octane';
const views = {
	Empty() {
		const [, setValue] = useState(0);
		setValue(1);
		return <div />;
	},
};
export function App() { return <views.Empty />; }
`);
		expect(error.code).toBe(CAUSAL_STATE_RENDER_WRITE);
		expect(error.message).toContain('<views.Empty>');
	});

	it.each([
		['a named import alias', "import { createElement as h, useState } from 'octane';", 'h'],
		['a namespace import', "import * as Octane from 'octane';", 'Octane.createElement'],
	])('rejects a write in a lowercase createElement target through %s', (_label, imports, h) => {
		const error = compileError(`${imports}
${h === 'Octane.createElement' ? "import { useState } from 'octane';" : ''}
const child = () => {
	const [, setValue] = useState(0);
	setValue(1);
	return null;
};
export const descriptor = ${h}(child, null);
`);
		expect(error.code).toBe(CAUSAL_STATE_RENDER_WRITE);
	});

	it('does not classify foreign or shadowed createElement bindings as render entries', () => {
		for (const source of [
			`import { useState } from 'octane';
import { createElement as h } from 'another-runtime';
const child = () => { const [, setValue] = useState(0); setValue(1); return null; };
export const descriptor = h(child, null);`,
			`import { createElement as h, useState } from 'octane';
const child = () => { const [, setValue] = useState(0); setValue(1); return null; };
export const descriptor = ((h) => h(child, null))(foreignFactory);`,
		]) {
			expect(causal(source).diagnostics).toEqual([]);
		}
	});

	it('hard-errors writes in anonymous, conditional-return, and expression-arrow renders', () => {
		const forms = [
			`import { useState } from 'octane';
export const App = () => { const [, setValue] = useState(0); setValue(1); return <div />; };`,
			`import { useState } from 'octane';
export function App(props) { const [, setValue] = useState(0); if (props.visible) { setValue(1); return <div />; } return null; }`,
			`import { useState } from 'octane';
export default function () { const [, setValue] = useState(0); setValue(1); return <div />; }`,
		];
		for (const source of forms) {
			expect(compileError(source).code).toBe(CAUSAL_STATE_RENDER_WRITE);
		}
	});

	it('hard-errors a direct render write with both call and declaration locations', () => {
		const source = `import { useState } from 'octane';
export function App() @{
	const [, setValue] = useState(0);
	setValue(1);
	<div />
}`;
		const error = compileError(source);
		expect(error.code).toBe(CAUSAL_STATE_RENDER_WRITE);
		expect(error.message).toContain("Octane's causal state model");
		expect(error.message).not.toContain('React');
		expect(error.diagnostics[0]).toMatchObject({
			code: CAUSAL_STATE_RENDER_WRITE,
			severity: 'error',
			filename: '/src/App.tsrx',
			start: { offset: source.indexOf('setValue(1)'), line: 4, column: 1 },
			declaration: {
				hook: 'useState',
				name: 'setValue',
				start: { offset: source.indexOf('setValue]'), line: 3, column: 10 },
			},
		});
	});

	it.each([
		['an immutable alias', 'const update = setValue; update(1);'],
		['a local helper', 'function update() { setValue(1); } update();'],
		['an IIFE', '(() => setValue(1))();'],
		['a synchronous iterator', '[1].forEach(() => setValue(1));'],
		[
			'a callback parameter invoked by a local helper',
			'function invoke(callback) { callback(1); } invoke(setValue);',
		],
	])('traces render writes through %s', (_label, statement) => {
		const error = compileError(`
import { useState } from 'octane';
export function App() @{
	const [, setValue] = useState(0);
	${statement}
	<div />
}`);
		expect(error.diagnostics).toHaveLength(1);
		expect(error.code).toBe(CAUSAL_STATE_RENDER_WRITE);
	});

	it('stays silent for events and callbacks passed to opaque/deferred APIs', () => {
		const source = `
import { useCallback, useEffect, useState } from 'octane';
export function App() @{
	const [, setValue] = useState(0);
	const callback = useCallback(() => setValue(1), []);
	useEffect(() => {
		const observer = new ResizeObserver(() => setValue(2));
		observer.observe(document.body);
		collection.forEach(() => setValue(7));
		queueMicrotask(() => setValue(3));
		setTimeout(() => setValue(4), 0);
		subscribe(() => setValue(5));
		return () => observer.disconnect();
	}, []);
	void (async () => { await Promise.resolve(); setValue(6); })();
	<button onClick={callback}>Update</button>
}`;
		expect(causal(source).diagnostics).toEqual([]);
	});

	it('does not infer render execution from a JSX-returning event factory', () => {
		const source = `
import { useState } from 'octane';
const [, setValue] = useState(0);
function makeView() { setValue(1); return <div />; }
export function App() @{ <button onClick={makeView}>Update</button> }
`;
		expect(causal(source).diagnostics).toEqual([]);
	});

	it('reports effect setup/cleanup writes without failing causal compilation', () => {
		const source = `
import { useCallback, useEffect, useState } from 'octane';
export function App() @{
	const [, setValue] = useState(0);
	const callback = useCallback(() => setValue(1), []);
	useEffect(() => {
		callback();
		return () => setValue(2);
	}, [callback]);
	<div />
}`;
		const result = causal(source);
		expect(result.diagnostics.map((diagnostic: any) => diagnostic.code)).toEqual([
			CAUSAL_STATE_EFFECT_WRITE,
			CAUSAL_STATE_CLEANUP_WRITE,
		]);
		expect(result.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ severity: 'warning', reportOnly: true, phase: 'effect' }),
				expect.objectContaining({ severity: 'warning', reportOnly: true, phase: 'cleanup' }),
			]),
		);
	});

	it('reports setters passed directly as setup, iterator, and cleanup callbacks', () => {
		const source = `
import { useEffect, useState } from 'octane';
export function App() @{
	const [, setValue] = useState(0);
	useEffect(setValue, []);
	useEffect(() => [1].forEach(setValue), []);
	useEffect(() => setValue, []);
	<div />
}`;
		const result = causal(source);
		expect(result.diagnostics).toEqual([
			expect.objectContaining({
				code: CAUSAL_STATE_EFFECT_WRITE,
				start: expect.objectContaining({ offset: source.indexOf('setValue, []') }),
			}),
			expect.objectContaining({
				code: CAUSAL_STATE_EFFECT_WRITE,
				start: expect.objectContaining({ offset: source.indexOf('setValue), []') }),
			}),
			expect.objectContaining({
				code: CAUSAL_STATE_CLEANUP_WRITE,
				start: expect.objectContaining({ offset: source.lastIndexOf('setValue, []') }),
			}),
		]);
	});

	it('hard-errors a setter passed directly as a pure hook callback', () => {
		const source = `
import { useMemo, useState } from 'octane';
export function App() @{
	const [, setValue] = useState(0);
	useMemo(setValue, []);
	<div />
}`;
		const error = compileError(source);
		expect(error.diagnostics).toEqual([
			expect.objectContaining({
				code: CAUSAL_STATE_PURITY_WRITE,
				start: expect.objectContaining({ offset: source.indexOf('setValue, []') }),
			}),
		]);
	});

	it('classifies only the synchronous prefix of async effect callbacks and local helpers', () => {
		const source = `
import { useCallback, useEffect, useState } from 'octane';
export function App() @{
	const [, setValue] = useState(0);
	const callback = useCallback(async () => {
		setValue(1);
		await Promise.resolve();
		setValue(2);
	}, []);
	async function update() {
		setValue(3);
		await Promise.resolve();
		setValue(4);
	}
	useEffect(async () => {
		callback();
		await Promise.resolve();
		setValue(5);
	}, [callback]);
	useEffect(() => update(), []);
	<div />
}`;
		const result = causal(source);
		expect(result.diagnostics).toEqual([
			expect.objectContaining({
				code: CAUSAL_STATE_EFFECT_WRITE,
				start: expect.objectContaining({ offset: source.indexOf('setValue(1)') }),
			}),
			expect.objectContaining({
				code: CAUSAL_STATE_EFFECT_WRITE,
				start: expect.objectContaining({ offset: source.indexOf('setValue(3)') }),
			}),
		]);
	});

	it('hard-errors writes in an async render IIFE before its first await', () => {
		const source = `
import { useState } from 'octane';
export function App() @{
	const [, setValue] = useState(0);
	void (async () => {
		setValue(1);
		await Promise.resolve();
		setValue(2);
	})();
	<div />
}`;
		const error = compileError(source);
		expect(error.diagnostics).toEqual([
			expect.objectContaining({
				code: CAUSAL_STATE_RENDER_WRITE,
				start: expect.objectContaining({ offset: source.indexOf('setValue(1)') }),
			}),
		]);
	});

	it('does not classify unreachable writes after a synchronous return', () => {
		const result = causal(`
import { useState } from 'octane';
export function App() {
	const [, setValue] = useState(0);
	return <div />;
	setValue(1);
}`);
		expect(result.diagnostics).toEqual([]);
	});

	it('traces callbacks returned by local helpers when they are immediately invoked', () => {
		const result = causal(`
import { useEffect, useState } from 'octane';
export function App() @{
	const [, setValue] = useState(0);
	const makeCallback = () => () => setValue(1);
	useEffect(() => makeCallback()(), []);
	<div />
}`);
		expect(result.diagnostics).toEqual([
			expect.objectContaining({ code: CAUSAL_STATE_EFFECT_WRITE, reportOnly: true }),
		]);
	});

	it('revisits local custom-hook policies with their resolved callback arguments', () => {
		const result = causal(`
import { useEffect, useState } from 'octane';
function useInvoke(update) {
	useEffect(() => update(1), [update]);
}
export function App() @{
	const [, setValue] = useState(0);
	useInvoke(setValue);
	<div />
}`);
		expect(result.diagnostics).toEqual([
			expect.objectContaining({ code: CAUSAL_STATE_EFFECT_WRITE, reportOnly: true }),
		]);
	});

	it('classifies conditional and local-helper cleanup returns', () => {
		const result = causal(`
import { useEffect, useState } from 'octane';
export function App(props) @{
	const [, setValue] = useState(0);
	const makeCleanup = () => () => setValue(1);
	useEffect(
		() => (props.enabled ? makeCleanup() : () => setValue(2)),
		[props.enabled],
	);
	<div />
}`);
		expect(result.diagnostics).toEqual([
			expect.objectContaining({ code: CAUSAL_STATE_CLEANUP_WRITE, reportOnly: true }),
			expect.objectContaining({ code: CAUSAL_STATE_CLEANUP_WRITE, reportOnly: true }),
		]);
	});

	it('does not treat syntactic returns from async effects as cleanup functions', () => {
		const result = causal(`
import { useEffect, useState } from 'octane';
export function App() @{
	const [, setValue] = useState(0);
	useEffect(async () => {
		await Promise.resolve();
		return () => setValue(1);
	}, []);
	<div />
}`);
		expect(result.diagnostics).toEqual([]);
	});

	it('reports imperative-handle factory writes without treating a callable handle as cleanup', () => {
		const result = causal(`
import { useImperativeHandle, useState } from 'octane';
export function App() @{
	const [, setValue] = useState(0);
	useImperativeHandle({ current: null }, () => {
		setValue(1);
		return () => setValue(2);
	}, []);
	<div />
}`);
		expect(result.diagnostics.map((diagnostic: any) => diagnostic.code)).toEqual([
			CAUSAL_STATE_EFFECT_WRITE,
		]);
	});

	it('allows a callable imperative handle to update state when a consumer invokes it later', () => {
		const result = causal(`
import { useImperativeHandle, useState } from 'octane';
export function App() @{
	const [, setValue] = useState(0);
	useImperativeHandle({ current: null }, () => () => setValue(1), []);
	<div />
}`);
		expect(result.diagnostics).toEqual([]);
	});

	it.each([
		['a useMemo calculation', 'const value = useMemo(() => { setOther(1); return 0; }, []);'],
		['a useState initializer', 'const [value] = useState(() => { setOther(1); return 0; });'],
		['a reducer', 'const [value] = useReducer((state) => { setOther(1); return state; }, 0);'],
		[
			'a functional updater',
			'const handle = () => setOther((value) => { setOther(1); return value; });',
		],
	])('hard-errors state writes from %s', (_label, statement) => {
		const error = compileError(`
import { useMemo, useReducer, useState } from 'octane';
export function App() @{
	const [, setOther] = useState(0);
	${statement}
	<div />
}`);
		expect(error.code).toBe(CAUSAL_STATE_PURITY_WRITE);
		expect(error.diagnostics[0]).toMatchObject({
			code: CAUSAL_STATE_PURITY_WRITE,
			severity: 'error',
			phase: 'purity',
		});
	});

	it('applies the same ABI and reports to plain-source hook slotting', () => {
		const source = `import { useEffect, useImperativeHandle, useState } from 'octane';
export function useValue() {
	const [value, setValue] = useState(0);
	useEffect(() => setValue(1), []);
	useImperativeHandle({ current: null }, () => ({}), []);
	return value;
}`;
		const permissive = slotHooks(source, '/src/value.ts', { stateModel: 'permissive' });
		const omitted = slotHooks(source, '/src/value.ts');
		expect(permissive).toEqual(omitted);

		const result = slotHooks(source, '/src/value.ts', { stateModel: 'causal' });
		expect(result?.code).toMatch(/useState\(0, _h\$0, 1\)/);
		expect(result?.code).toMatch(/useEffect\([\s\S]*, _h\$1, 1\)/);
		expect(result?.code).toMatch(/useImperativeHandle\([\s\S]*, _h\$2, 1\)/);
		expect(result?.diagnostics).toEqual([
			expect.objectContaining({ code: CAUSAL_STATE_EFFECT_WRITE, reportOnly: true }),
		]);
	});

	it('stamps plain-source definitions even when the module has no base-hook calls', () => {
		const source = `
export function usePackageValue() { return 1; }
export const make = () => () => <div />;
const api = { useValue() { return 2; } };
`;
		const result = slotHooks(source, '/src/package.tsx', { stateModel: 'causal' });
		expect(result?.code).toContain('markStateModel as _$markStateModel');
		expect(result?.code).toContain(
			'usePackageValue = /* @__PURE__ */ _$markStateModel(usePackageValue, 1)',
		);
		expect(result?.code).toMatch(/make = \(\) => \/\* @__PURE__ \*\/ _\$markStateModel\(/);
		expect(result?.code).not.toMatch(/make = \/\* @__PURE__ \*\/ _\$markStateModel/);
		expect(result?.code).toMatch(
			/_\$markStateModelMethods\(\{ useValue\(\) \{ return 2; \} \}, 1, ["']useValue["']\)/,
		);
	});

	it('places plain-source declaration provenance before hoisted uses', () => {
		const result = slotHooks(
			`root.render(App);\nfunction App() { return <div />; }`,
			'/src/hoisted.tsx',
			{ stateModel: 'causal' },
		);
		expect(result?.code.indexOf('App = /* @__PURE__ */ _$markStateModel(App, 1)')).toBeLessThan(
			result?.code.indexOf('root.render(App)') ?? -1,
		);
	});

	it('carries compiled model provenance into universal HMR compatibility checks', () => {
		const source = `export function Scene() @{ <scene /> }`;
		const evaluate = (stateModel: 'causal' | 'permissive') => {
			const result = compile(source, `/src/Scene-${stateModel}.tsrx`, {
				stateModel,
				hmr: false,
				renderer: {
					id: 'object',
					module: 'octane/universal',
					target: 'universal',
				},
			});
			return evaluateCompiledModule(result.code, {
				'octane/universal': UniversalRuntime,
			});
		};
		const causalModule = evaluate('causal');
		const permissiveModule = evaluate('permissive');
		const causalHot = UniversalRuntime.hmrUniversalComponent('object', causalModule.Scene) as any;
		const permissiveHot = UniversalRuntime.hmrUniversalComponent(
			'object',
			permissiveModule.Scene,
		) as any;
		expect(causalHot[UniversalRuntime.UNIVERSAL_HMR].update(permissiveModule.Scene)).toBe(false);
		expect(permissiveHot[UniversalRuntime.UNIVERSAL_HMR].update(causalModule.Scene)).toBe(false);
	});

	it('rejects unknown direct compiler state models', () => {
		expect(() =>
			compile('export function App() @{ <div /> }', '/src/App.tsrx', {
				stateModel: 'strict' as any,
			}),
		).toThrow("expected 'causal' or 'permissive'");
		expect(() =>
			slotHooks("import { useId } from 'octane'; useId();", '/src/id.ts', {
				stateModel: 'strict' as any,
			}),
		).toThrow("expected 'causal' or 'permissive'");
	});
});
