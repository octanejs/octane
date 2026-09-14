import { describe, expect, it } from 'vitest';
import { compile } from '../../src/compiler/compile.js';
import { slotHooks } from '../../src/compiler/slot-hooks.js';
import { compileToVolarMappings } from '../../src/compiler/volar.js';

const EXPLICIT = 'OCTANE_STRONG_EXPLICIT_DEPENDENCIES';
const REDUNDANT = EXPLICIT;
const EVERY_RENDER = 'OCTANE_STRONG_UNTRACKED_EFFECT';
const MANUAL_MEMO = 'OCTANE_STRONG_MANUAL_MEMO';
const app = (
	setup: string,
) => `import { useEffect, useLayoutEffect, useInsertionEffect, useImperativeHandle, useMemo, useCallback, useEffectEvent, useRef, useState } from 'octane';
export function App(props) @{ ${setup} <div /> }`;
const strong = (source: string) => `"use strong";\n${source}`;

describe('Strong compiler-owned hook policies', () => {
	it.each([
		['missing captures', 'useEffect(() => console.log(props.value), []);'],
		['extra captures', 'useEffect(() => console.log(props.value), [props.value, props.other]);'],
		['coarser member paths', 'useEffect(() => console.log(props.value), [props]);'],
		['opaque arrays', 'useEffect(() => console.log(props.value), props.dependencies);'],
		['spread dependencies', 'useEffect(() => console.log(props.value), [...props.dependencies]);'],
		['layout effects', 'useLayoutEffect(() => console.log(props.value), []);'],
		['insertion effects', 'useInsertionEffect(() => console.log(props.value), []);'],
		['imperative handles', 'useImperativeHandle(props.ref, () => ({ value: props.value }), []);'],
	])('rejects %s while preserving compatibility', (_label, setup) => {
		const source = app(setup);
		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
		expect(() => compile(strong(source), '/src/App.tsrx')).toThrow(EXPLICIT);
	});

	it.each(['useEffect', 'useLayoutEffect', 'useInsertionEffect'])(
		'rejects null dependencies on %s',
		(hook) => {
			const source = app(`${hook}(() => console.log(props.value), null as any);`);
			expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
			expect(() => compile(strong(source), '/src/App.tsrx')).toThrow(EVERY_RENDER);
		},
	);

	it.each([
		'useMemo(() => props.value * 2)',
		'useMemo(() => props.value * 2, [props.value])',
		'useCallback(() => props.value)',
		'useCallback(() => props.value, [])',
	])('rejects manual caching with %s', (call) => {
		const source = app(`const value = ${call};`);
		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
		expect(() => compile(strong(source), '/src/App.tsrx')).toThrow(MANUAL_MEMO);
	});

	it.each([
		'useEffect(() => console.log(props.value), [props.value]);',
		'useEffect(() => console.log(props.first, props.second), [props.second, props.first]);',
		'useEffect(() => console.log(props.value), [props.value, props.value]);',
		'useEffect(() => console.log("mounted"), []);',
		'const ref = useRef(null); const [value, setValue] = useState(0); useEffect(() => { console.log(value, ref.current); }, [value]);',
		'const event = useEffectEvent(() => console.log(props.value)); useEffect(() => { event(); }, []);',
		'const ref = useRef(null); useEffect(() => { console.log(ref.current, props.value); }, [ref, props.value]);',
	])('reports equivalent explicit dependencies as a non-fatal redundancy hint', (setup) => {
		const result = compile(strong(app(setup)), '/src/App.tsrx');
		expect(result.diagnostics).toEqual(
			expect.arrayContaining([expect.objectContaining({ code: REDUNDANT, severity: 'hint' })]),
		);
	});

	it('treats stable imported and module-invariant entries as redundant rather than conflicting', () => {
		const source = strong(`import { useEffect, useRef } from 'octane';
import { observe } from './observe';
const LIMIT = 10;
export function App(props) @{
  const ref = useRef(null);
  useEffect(() => observe(LIMIT, ref.current, props.value), [observe, LIMIT, ref, props.value]);
  <div />
}`);
		expect(compile(source, '/src/App.tsrx').diagnostics).toEqual(
			expect.arrayContaining([expect.objectContaining({ code: REDUNDANT, severity: 'hint' })]),
		);
	});

	it('does not treat callback argument reordering as equivalent', () => {
		const source = app(
			'useEffect((first, second) => console.log(props.first, props.second, first, second), [props.second, props.first]);',
		);
		expect(() => compile(strong(source), '/src/App.tsrx')).toThrow(EXPLICIT);
	});

	it('preserves the argument positions observable through a function callback', () => {
		const source = app(
			'useEffect(function () { console.log(props.first, props.second, arguments[0]); }, [props.second, props.first]);',
		);
		expect(() => compile(strong(source), '/src/App.tsrx')).toThrow(EXPLICIT);
	});

	it('respects aliased imports, namespaces, and immutable hook aliases', () => {
		for (const [imports, setup] of [
			[
				"import { useEffect as effect } from 'octane';",
				'effect(() => console.log(props.value), []);',
			],
			[
				"import * as Octane from 'octane';",
				'Octane.useEffect(() => console.log(props.value), []);',
			],
			[
				"import { useEffect } from 'octane'; const effect = useEffect;",
				'effect(() => console.log(props.value), []);',
			],
			[
				"import * as Octane from 'octane'; const effect = Octane.useEffect;",
				'effect(() => console.log(props.value), []);',
			],
		]) {
			expect(() =>
				compile(
					strong(`${imports}\nexport function App(props) @{ ${setup} <div /> }`),
					'/src/App.tsrx',
				),
			).toThrow(EXPLICIT);
		}
	});

	it('preserves shadowed and unrelated same-named functions', () => {
		for (const source of [
			`import { useEffect, useMemo, useCallback } from './other'; export function App(props) @{ useEffect(props.callback, null); const value = useMemo(props.callback, []); const cb = useCallback(props.callback); <div /> }`,
			`export function App({ useEffect, useMemo, useCallback }) @{ useEffect(() => 1, null); useMemo(() => 1, []); useCallback(() => 1); <div /> }`,
			`import * as Other from './other'; const { useMemo } = Other; export function App(props) @{ useMemo?.(() => props.value); Other?.useEffect(() => props.value, []); <div /> }`,
			`import * as Octane from 'octane'; export function App({ Octane, useMemo }) @{ const { useEffect: effect } = Octane; effect?.(() => 1, []); Octane?.useMemo(() => 1); useMemo?.(() => 1); <div /> }`,
		])
			expect(() => compile(strong(source), '/src/App.tsrx')).not.toThrow();
	});

	it.each([
		'undefined',
		'(undefined)',
		'(undefined as undefined)',
		'(undefined satisfies undefined)',
		'undefined!',
	])('treats unshadowed %s as the optional dependency form', (dependencies) => {
		for (const [imports, callee] of [
			["import { useEffect } from 'octane';", 'useEffect'],
			["import { useEffect as effect } from 'octane';", 'effect'],
			["import * as Octane from 'octane';", 'Octane.useEffect'],
		]) {
			const source = strong(
				`${imports} export function useLog(props) { ${callee}(() => console.log(props.value), ${dependencies}); }`,
			);
			for (const options of [{}, { dev: true }, { mode: 'server' }])
				expect(() => compile(source, '/src/useLog.tsx', options as any)).not.toThrow();
			expect(() => slotHooks(source, '/src/useLog.ts')).not.toThrow();
			expect(compileToVolarMappings(source, '/src/useLog.tsx').diagnostics).toEqual([]);
		}
	});

	it.each([
		'export function useLog(props, undefined) { useEffect(() => console.log(props.value), undefined); }',
		'const undefined = []; export function useLog(props) { useEffect(() => console.log(props.value), (undefined as any)); }',
	])('retains explicit policy for a shadowed undefined binding', (declaration) => {
		const source = strong(`import { useEffect } from 'octane'; ${declaration}`);
		expect(() => compile(source, '/src/useLog.tsx')).toThrow(EXPLICIT);
		expect(() => slotHooks(source, '/src/useLog.ts')).toThrow(EXPLICIT);
		expect(compileToVolarMappings(source, '/src/useLog.tsx').diagnostics).toEqual(
			expect.arrayContaining([expect.objectContaining({ code: EXPLICIT })]),
		);
	});

	it('retains Effect Event dependency errors', () => {
		const source = app(
			'const event = useEffectEvent(() => console.log(props.value)); useEffect(() => event(), [event]);',
		);
		expect(() => compile(strong(source), '/src/App.tsrx')).toThrow(
			'OCTANE_STRONG_EFFECT_EVENT_DEPENDENCY',
		);
	});

	it('uses authored argument locations in Volar diagnostics', () => {
		const source = strong(app('useEffect(() => console.log(props.value), []);'));
		const result = compileToVolarMappings(source, '/src/App.tsrx');
		const diagnostic = result.diagnostics.find((item: any) => item.code === EXPLICIT);
		expect(diagnostic).toBeDefined();
		expect(diagnostic?.start.offset).toBe(source.indexOf('[]'));
	});

	it('retains redundant dependency hints from the plain surgical pass', () => {
		const source = `"use strong"; import { useEffect } from 'octane'; export function useLog(value: string) { useEffect(() => console.log(value), [value]); }`;
		expect(slotHooks(source, '/src/useLog.ts')?.diagnostics).toEqual(
			expect.arrayContaining([expect.objectContaining({ code: REDUNDANT, severity: 'hint' })]),
		);
	});

	it('enforces policies in plain TypeScript and TSX', () => {
		const source = `"use strong"; import { useEffect } from 'octane'; export function useLog(value: string) { useEffect(() => console.log(value), []); }`;
		expect(() => slotHooks(source, '/src/useLog.ts')).toThrow(EXPLICIT);
		expect(() => compile(source, '/src/useLog.tsx')).toThrow(EXPLICIT);
	});

	it.each([{ mode: 'client' }, { mode: 'server' }, { dev: true }, { hmr: true }])(
		'enforces the same authoring contract in %j',
		(options) => {
			expect(() =>
				compile(
					strong(app('useEffect(() => console.log(props.value), []);')),
					'/src/App.tsrx',
					options as any,
				),
			).toThrow(EXPLICIT);
		},
	);
	it('reports lexical eval when declaration caching would observe the wrong captures', () => {
		const source = app(
			"const read = () => eval('props.value'); useEffect(() => console.log(read()));",
		);
		expect(() => compile(source, '/src/Reflective.tsrx')).not.toThrow();
		expect(() => compile(strong(source), '/src/Reflective.tsrx')).toThrow(
			'OCTANE_STRONG_AUTOMATIC_MEMO_UNSUPPORTED',
		);
		expect(compileToVolarMappings(strong(source), '/src/Reflective.tsrx').diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ code: 'OCTANE_STRONG_AUTOMATIC_MEMO_UNSUPPORTED' }),
			]),
		);
	});

	it.each([
		['a hashbang', '#!/usr/bin/env node\n', {}],
		['manual slots', '', { manualSlots: true }],
	])(
		'reports unsupported automatic caching for %s rather than silently losing identity',
		(_shape, prefix, options) => {
			const source = `${prefix}"use strong"; import { useEffect } from 'octane'; export function useOptions(value: string) { const options = { value }; useEffect(() => console.log(options)); return options; }`;
			expect(() => slotHooks(source, '/src/useOptions.ts', options)).toThrow(
				'OCTANE_STRONG_AUTOMATIC_MEMO_UNSUPPORTED',
			);
		},
	);
	it.each([
		["import { useMemo } from 'octane';", 'useMemo?.(() => props.value)', MANUAL_MEMO],
		[
			"import { useEffect } from 'octane';",
			'useEffect?.(() => console.log(props.value), [])',
			EXPLICIT,
		],
		["import * as Octane from 'octane';", 'Octane?.useMemo(() => props.value)', MANUAL_MEMO],
		[
			"import * as Octane from 'octane';",
			'Octane.useEffect?.(() => console.log(props.value), [])',
			EXPLICIT,
		],
		[
			"import * as Octane from 'octane'; const { useMemo } = Octane;",
			'useMemo(() => props.value)',
			MANUAL_MEMO,
		],
		[
			"import * as Octane from 'octane'; const { useEffect: effect } = Octane;",
			'effect(() => console.log(props.value), [])',
			EXPLICIT,
		],
	])(
		'enforces hook identity through optional/destructured spelling %s %s',
		(imports, call, code) => {
			const setup = `${imports} export function useExample(props) { const result = ${call}; return result; }`;
			const source = strong(setup);
			expect(() => compile(setup, '/src/useExample.tsx')).not.toThrow();
			expect(() => compile(source, '/src/useExample.tsx')).toThrow(code);
			expect(() => slotHooks(source, '/src/useExample.ts')).toThrow(code);
			expect(compileToVolarMappings(source, '/src/useExample.tsx').diagnostics).toEqual(
				expect.arrayContaining([expect.objectContaining({ code })]),
			);
		},
	);
});
