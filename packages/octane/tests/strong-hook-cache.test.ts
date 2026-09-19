import { describe, expect, it } from 'vitest';
import { flushSync } from 'octane';
import { createScope } from 'octane/signals';
import { loadCompiledFixtureSource, loadPlainHookFixtureSource } from './_server-fixture.js';
import { act, flushEffects, mount } from './_helpers';

describe('Strong declarations used as reactive hook inputs', () => {
	it.each([
		["import { useEffect } from 'octane';", 'useEffect?.'],
		["import * as Octane from 'octane';", 'Octane?.useEffect'],
		["import * as Octane from 'octane'; const { useEffect: effect } = Octane;", 'effect'],
	])('infers and slots proven optional/aliased effect imports %s', (imports, callee) => {
		for (const plain of [false, true]) {
			const seen: string[] = [];
			const setup = `"use strong"; ${imports} import { observe } from './probe'; export function useRead(props) { ${callee}(() => observe(props.label)); }`;
			const runtimeModules = { './probe': { observe: (label: string) => seen.push(label) } };
			const hook = plain
				? loadPlainHookFixtureSource(setup, {
						id: '/src/StrongAlias.ts',
						inlineHookMemo: false,
						runtimeModules,
					})
				: null;
			const { App } = loadCompiledFixtureSource(
				plain
					? `import { useRead } from './hook'; export function App(props) @{ useRead(props); <span>{props.noise as string}</span> }`
					: `${setup} export function App(props) @{ useRead(props); <span>{props.noise as string}</span> }`,
				{
					id: '/src/StrongAlias.tsrx',
					mode: 'client',
					compileOptions: { dev: true, hmr: false },
					runtimeModules: { ...runtimeModules, ...(hook ? { './hook': hook } : {}) },
				},
			);
			const mounted = mount(App, { label: 'first', noise: 'one' });
			try {
				flushEffects();
				expect(seen).toEqual(['first']);
				mounted.update(App, { label: 'first', noise: 'two' });
				flushEffects();
				expect(seen).toEqual(['first']);
				mounted.update(App, { label: 'second', noise: 'two' });
				flushEffects();
				expect(seen).toEqual(['first', 'second']);
			} finally {
				mounted.unmount();
			}
		}
	});

	it.each(['undefined', '(undefined as undefined)'])(
		'infers optional %s dependencies and preserves an explicit later slot',
		(dependencies) => {
			for (const strong of [false, true])
				for (const plain of [false, true])
					for (const dev of [false, true])
						for (const laterSlot of ['', ', slot']) {
							const seen: string[] = [];
							const setup = `${strong ? '"use strong";' : ''} import { useEffect } from 'octane'; import { observe } from './probe'; const slot = Symbol(); export function useRead(props) { useEffect(() => observe(props.label), ${dependencies}${laterSlot}); }`;
							const runtimeModules = {
								'./probe': { observe: (label: string) => seen.push(label) },
							};
							const hooks = plain
								? loadPlainHookFixtureSource(setup, {
										id: '/src/OptionalDeps.ts',
										inlineHookMemo: false,
										hmr: dev,
										runtimeModules,
									})
								: null;
							const { App } = loadCompiledFixtureSource(
								plain
									? `import { useRead } from './hook'; export function App(props) @{ useRead(props); <span>{props.noise as string}</span> }`
									: `${setup} export function App(props) @{ useRead(props); <span>{props.noise as string}</span> }`,
								{
									id: '/src/OptionalDeps.tsrx',
									mode: 'client',
									compileOptions: { dev, hmr: false },
									runtimeModules: { ...runtimeModules, ...(hooks ? { './hook': hooks } : {}) },
								},
							);
							const mounted = mount(App, { label: 'first', noise: 'one' });
							try {
								flushEffects();
								expect(seen).toEqual(['first']);
								mounted.update(App, { label: 'first', noise: 'two' });
								flushEffects();
								expect(seen).toEqual(strong ? ['first'] : ['first', 'first']);
								mounted.update(App, { label: 'second', noise: 'two' });
								flushEffects();
								expect(seen).toEqual(strong ? ['first', 'second'] : ['first', 'first', 'second']);
							} finally {
								mounted.unmount();
							}
						}
		},
	);

	it.each([
		'const value = factory.make(props.label);',
		'const value = new Box(props.label);',
		'const value = tag`label:${props.label}`;',
	])('preserves the evaluation lifetime of an opaque factory: %s', (declaration) => {
		for (const dev of [false, true]) {
			const seen: unknown[] = [];
			let calls = 0;
			class Box {
				constructor(public label: string) {
					calls++;
				}
			}
			const { App } = loadCompiledFixtureSource(
				`"use strong"; import { useEffect } from 'octane'; import { factory, Box, tag, observe } from './probe'; export function App(props) @{ ${declaration} useEffect(() => observe(value)); <span>{props.noise as string}</span> }`,
				{
					id: '/src/OpaqueFactory.tsrx',
					mode: 'client',
					compileOptions: { dev, hmr: false },
					runtimeModules: {
						'./probe': {
							factory: {
								make: (label: string) => {
									calls++;
									return { label };
								},
							},
							Box,
							tag: (_parts: unknown, label: string) => {
								calls++;
								return { label };
							},
							observe: (value: unknown) => seen.push(value),
						},
					},
				},
			);
			const root = mount(App, { label: 'one', noise: 'a' });
			try {
				flushEffects();
				root.update(App, { label: 'one', noise: 'b' });
				flushEffects();
				expect(calls).toBe(2);
				expect(seen).toHaveLength(2);
				expect(seen[0]).not.toBe(seen[1]);
			} finally {
				root.unmount();
			}
		}
	});

	it.each([false, true])(
		'retains live native reads after automatic cache hits in dev=%s',
		(dev) => {
			const lifecycle: string[] = [];
			const { App } = loadCompiledFixtureSource(
				`"use strong";
import { useEffect } from 'octane';
import 'octane/signals';
import { observe } from './probe';
export function App(props) @{
  const label = props.read$();
  const value = { label };
  useEffect(() => observe(value));
  <output>{label as string}</output>
}`,
				{
					id: '/src/StrongNativeCache.tsrx',
					mode: 'client',
					compileOptions: { dev, hmr: false },
					runtimeModules: {
						'./probe': { observe: (value: { label: string }) => lifecycle.push(value.label) },
					},
				},
			);
			const scope = createScope({ scopeKey: 'strong-native-cache-' + dev });
			const label$ = scope.signal$('label', 'first');
			const props = { read$: () => label$.get() };
			const mounted = mount(App, props);
			try {
				flushEffects();
				expect(lifecycle).toEqual(['first']);
				mounted.update(App, props);
				flushEffects();
				expect(lifecycle).toEqual(['first']);
				flushSync(() => label$.set('second'));
				flushEffects();
				expect(mounted.find('output').textContent).toBe('second');
				expect(lifecycle).toEqual(['first', 'second']);
			} finally {
				mounted.unmount();
				scope.dispose();
			}
		},
	);

	it.each([
		['object literal', 'const value = { label: props.label };', (value: any) => value.label],
		['array literal', 'const value = [props.label];', (value: any) => value[0]],
		['arrow callback', 'const value = () => props.label;', (value: any) => value()],
		[
			'function expression',
			'const value = function () { return props.label; };',
			(value: any) => value(),
		],
		[
			'conditional objects',
			'const value = props.label ? { label: props.label } : { label: "empty" };',
			(value: any) => value.label,
		],
	])('keeps %s stable for effects until its inputs change', (_name, declaration, read) => {
		for (const compileOptions of [
			{ dev: false, hmr: false },
			{ dev: true, hmr: false },
		]) {
			const lifecycle: string[] = [];
			class Box {
				constructor(public label: string) {}
			}
			const source = `"use strong";
import { useEffect } from 'octane';
import { observe, read, Box, factory, tag } from './probe';
export function App(props) @{
  ${declaration}
  useEffect(() => { const label = read(value); observe('start:' + label); return () => observe('stop:' + label); });
  <span>{props.noise as string}</span>
}`;
			const { App } = loadCompiledFixtureSource(source, {
				id: '/src/StrongCache.tsrx',
				mode: 'client',
				compileOptions,
				runtimeModules: {
					'./probe': {
						observe: (value: string) => lifecycle.push(value),
						read,
						Box,
						factory: {
							make: (label: string) => ({ label }),
							useValue: (label: string) => ({ label }),
						},
						tag: (_parts: unknown, label: string) => ({ label }),
					},
				},
			});
			const mounted = mount(App, { label: 'first', noise: 'one' });
			try {
				flushEffects();
				expect(lifecycle).toEqual(['start:first']);
				mounted.update(App, { label: 'first', noise: 'two' });
				flushEffects();
				expect(mounted.container.textContent).toBe('two');
				expect(lifecycle, JSON.stringify(compileOptions)).toEqual(['start:first']);
				mounted.update(App, { label: 'second', noise: 'three' });
				flushEffects();
				expect(lifecycle).toEqual(['start:first', 'stop:first', 'start:second']);
			} finally {
				mounted.unmount();
			}
			expect(lifecycle).toEqual(['start:first', 'stop:first', 'start:second', 'stop:second']);
		}
	});
	it.each([false, true])(
		'preserves custom-hook identity and parallel use with HMR=%s',
		async (hmr) => {
			const starts: string[] = [];
			const lifecycle: string[] = [];
			const pending: Array<() => void> = [];
			const hooks = loadPlainHookFixtureSource(
				`"use strong";
import { use, useEffect } from 'octane';
import { request, observe } from './probe';
export function useData(label: string) {
  const options = { label };
  const a = use(request('a', label));
  const b = use(request('b', label));
  useEffect(() => { observe('start', options); return () => observe('stop', options); }, (undefined as undefined));
  return { a, b };
}`,
				{
					id: '/src/useStrongData.ts',
					inlineHookMemo: false,
					hmr,
					runtimeModules: {
						'./probe': {
							request: (name: string, label: string) => {
								starts.push(name + ':' + label);
								return new Promise<string>((resolve) =>
									pending.push(() => resolve(name + ':' + label)),
								);
							},
							observe: (phase: string, value: { label: string }) =>
								lifecycle.push(phase + ':' + value.label),
						},
					},
				},
			);
			const { App } = loadCompiledFixtureSource(
				`import { Suspense } from 'octane';
import { useData } from './hook';
function Data(props) @{ const result = useData(props.label); <span>{result.a + result.b + props.noise as string}</span> }
export function App(props) @{ <Suspense fallback={<i>loading</i>}><Data label={props.label} noise={props.noise} /></Suspense> }
`,
				{ id: '/src/StrongData.tsrx', mode: 'client', runtimeModules: { './hook': hooks } },
			);
			const mounted = mount(App, { label: 'first', noise: 'one' });
			try {
				expect(mounted.container.textContent).toBe('loading');
				expect(starts).toEqual(['a:first', 'b:first']);
				await act(async () => {
					for (const resolve of pending.splice(0)) resolve();
				});
				flushEffects();
				expect(mounted.container.textContent).toBe('a:firstb:firstone');
				expect(lifecycle).toEqual(['start:first']);
				mounted.update(App, { label: 'first', noise: 'two' });
				flushEffects();
				expect(mounted.container.textContent).toBe('a:firstb:firsttwo');
				expect(lifecycle).toEqual(['start:first']);
				expect(starts).toEqual(['a:first', 'b:first']);
			} finally {
				mounted.unmount();
			}
			expect(lifecycle).toEqual(['start:first', 'stop:first']);
		},
	);

	it('keeps locally mutated aliased objects fresh', () => {
		const { App } = loadCompiledFixtureSource(
			`"use strong";
export function App(props) @{ const value = { count: 0 }; const alias = value; alias.count++; <span>{props.label + ':' + value.count as string}</span> }
`,
			{ id: '/src/LocalMutation.tsrx', mode: 'client' },
		);
		const mounted = mount(App, { label: 'first' });
		try {
			expect(mounted.container.textContent).toBe('first:1');
			mounted.update(App, { label: 'second' });
			expect(mounted.container.textContent).toBe('second:1');
		} finally {
			mounted.unmount();
		}
	});

	it.each([
		[
			'member alias',
			'const outer = { nested: { count: 0 } }; const nested = outer.nested; nested.count++;',
			'outer.nested.count',
		],
		[
			'destructured alias',
			'const outer = { nested: { count: 0 } }; const { nested } = outer; nested.count++;',
			'outer.nested.count',
		],
		[
			'shallow object copy',
			'const outer = { nested: { count: 0 } }; const copy = { ...outer }; copy.nested.count++;',
			'outer.nested.count',
		],
		[
			'shallow array copy',
			'const outer = [{ count: 0 }]; const copy = [...outer]; copy[0].count++;',
			'outer[0].count',
		],
		[
			'destructuring assignment',
			'const outer = { count: 0 }; [outer.count] = [outer.count + 1];',
			'outer.count',
		],
		[
			'Object.assign',
			'const outer = { count: 0 }; Object.assign(outer, { count: outer.count + 1 });',
			'outer.count',
		],
		[
			'typed Object.assign',
			'const outer = { count: 0 }; (Object as any).assign(outer, { count: outer.count + 1 });',
			'outer.count',
		],
		[
			'parenthesized Object.assign',
			'const outer = { count: 0 }; (Object).assign(outer, { count: outer.count + 1 });',
			'outer.count',
		],
		[
			'typed Reflect.set',
			"const outer = { count: 0 }; (Reflect as any).set(outer, 'count', outer.count + 1);",
			'outer.count',
		],
		['typed computed mutator', "const outer = []; outer[('push' as string)](1);", 'outer.length'],
		['parenthesized computed mutator', "const outer = []; outer[('push')](1);", 'outer.length'],
		[
			'shadowed typed Object mutator',
			'const Object = { assign(target, source) { target.count = source.count; } }; const outer = { count: 0 }; (Object as any).assign(outer, { count: outer.count + 1 });',
			'outer.count',
		],
	])('preserves fresh nested objects through %s', (_label, setup, read) => {
		for (const dev of [false, true]) {
			const { App } = loadCompiledFixtureSource(
				`"use strong"; export function App(props) @{ ${setup} <span>{props.label + ':' + ${read} as string}</span> }`,
				{ id: '/src/NestedMutation.tsrx', mode: 'client', compileOptions: { dev, hmr: false } },
			);
			const mounted = mount(App, { label: 'first' });
			try {
				expect(mounted.container.textContent).toBe('first:1');
				mounted.update(App, { label: 'second' });
				expect(mounted.container.textContent).toBe('second:1');
			} finally {
				mounted.unmount();
			}
		}
	});

	it.each([false, true])('keeps template row declarations live per row (dev=%s)', (dev) => {
		const { App } = loadCompiledFixtureSource(
			`"use strong";
export function App(props) @{
  <ul>@for (const item of props.items; key item.id) {
    const style = { color: item.color };
    <li style={style}>{item.name as string}</li>
  }</ul>
}`,
			{ id: '/src/RowDeclaration.tsrx', mode: 'client', compileOptions: { dev, hmr: false } },
		);
		const colors = (mounted: ReturnType<typeof mount>) =>
			mounted.findAll('li').map((li) => (li as HTMLElement).style.color);
		const mounted = mount(App, {
			items: [
				{ id: 1, name: 'a', color: 'red' },
				{ id: 2, name: 'b', color: 'blue' },
			],
		});
		try {
			expect(colors(mounted)).toEqual(['red', 'blue']);
			mounted.update(App, {
				items: [
					{ id: 1, name: 'a', color: 'green' },
					{ id: 2, name: 'b', color: 'blue' },
				],
			});
			expect(colors(mounted)).toEqual(['green', 'blue']);
		} finally {
			mounted.unmount();
		}
	});

	it.each([false, true])('re-runs a hook executed through a callback argument (dev=%s)', (dev) => {
		const { App } = loadCompiledFixtureSource(
			`"use strong";
import { createContext, useContext } from 'octane';
import { compute } from './probe';
const Ctx = createContext('none');
function Reader() @{
  const value = compute(() => useContext(Ctx));
  <span>{value as string}</span>
}
export function App(props) @{ <Ctx value={props.value}><Reader /></Ctx> }`,
			{
				id: '/src/CallbackHook.tsrx',
				mode: 'client',
				compileOptions: { dev, hmr: false },
				runtimeModules: { './probe': { compute: (read: () => string) => read() } },
			},
		);
		const mounted = mount(App, { value: 'one' });
		try {
			expect(mounted.container.textContent).toBe('one');
			mounted.update(App, { value: 'two' });
			expect(mounted.container.textContent).toBe('two');
		} finally {
			mounted.unmount();
		}
	});

	it.each([false, true])(
		'keeps a later class declaration out of eager cache inputs (dev=%s)',
		(dev) => {
			const { App } = loadCompiledFixtureSource(
				`"use strong";
export function App(props) @{
  const options = { make: () => new Model(props.n) };
  class Model { n: number; constructor(n: number) { this.n = n; } }
  <p>{String(options.make().n)}</p>
}`,
				{ id: '/src/LateClass.tsrx', mode: 'client', compileOptions: { dev, hmr: false } },
			);
			const mounted = mount(App, { n: 1 });
			try {
				expect(mounted.container.textContent).toBe('1');
				mounted.update(App, { n: 2 });
				expect(mounted.container.textContent).toBe('2');
			} finally {
				mounted.unmount();
			}
		},
	);

	it('keeps setup hooks live through recursive local helper references', () => {
		const { App } = loadCompiledFixtureSource(
			`"use strong"; import { useState } from 'octane';
function first(depth) { if (depth) return second(false); return useState(0); }
function second(depth) { return first(depth); }
export function App() @{ const initial = first(false); const value = second(false); <button onClick={() => value[1](value[0] + 1)}>{value[0] as string}</button> }
`,
			{ id: '/src/RecursiveSetup.tsrx', mode: 'client' },
		);
		const mounted = mount(App);
		try {
			expect(mounted.container.textContent).toBe('0');
			mounted.click('button');
			expect(mounted.container.textContent).toBe('1');
		} finally {
			mounted.unmount();
		}
	});

	it('preserves callback captures initialized after the declaration', () => {
		const seen: string[] = [];
		const { App } = loadCompiledFixtureSource(
			`"use strong";
export function App(props) @{ const read = () => label; const label = props.label; <button onClick={() => props.observe(read())}>read</button> }
`,
			{ id: '/src/LateCapture.tsrx', mode: 'client' },
		);
		const observe = (value: string) => seen.push(value);
		const mounted = mount(App, { label: 'first', observe });
		try {
			mounted.click('button');
			mounted.update(App, { label: 'second', observe });
			mounted.click('button');
			expect(seen).toEqual(['first', 'second']);
		} finally {
			mounted.unmount();
		}
	});
});
