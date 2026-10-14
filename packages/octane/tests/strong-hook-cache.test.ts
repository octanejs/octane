import { describe, expect, it } from 'vitest';
import { createContext, flushSync, hydrateRoot } from 'octane';
import { createContext as createServerContext, renderToString } from 'octane/server';
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

describe('Strong ref arrays in template directives', () => {
	it.each([
		[false, 'inline'],
		[false, 'named'],
		[true, 'inline'],
		[true, 'named'],
	])(
		'keeps conditional refs attached until their inputs or branch change (dev=%s, %s)',
		(dev, form) => {
			const { App } = loadCompiledFixtureSource(
				`"use strong";
export function App(props) @{
  <section>
    @if (props.visible) {
      ${form === 'named' ? 'const refs = [props.elementRef, props.observe];' : ''}
      <input ref={${form === 'named' ? 'refs' : '[props.elementRef, props.observe]'}}
        data-revision={props.revision} defaultValue="initial" />
    }
  </section>
}`,
				{
					id: '/src/StrongConditionalRefs.tsrx',
					mode: 'client',
					compileOptions: { dev, hmr: false },
				},
			);
			const lifecycle: string[] = [];
			const first = { current: null as Element | null };
			const second = { current: null as Element | null };
			const observe = (element: Element | null) => {
				lifecycle.push(element ? 'attach' : 'null');
				return () => lifecycle.push('cleanup');
			};
			const mounted = mount(App, { visible: true, revision: 'one', elementRef: first, observe });
			try {
				const input = mounted.find('input') as HTMLInputElement;
				input.value = 'edited';
				expect(first.current).toBe(input);
				expect(lifecycle).toEqual(['attach']);

				mounted.update(App, { visible: true, revision: 'two', elementRef: first, observe });
				expect(mounted.find('input')).toBe(input);
				expect(input.dataset.revision).toBe('two');
				expect(input.value).toBe('edited');
				expect(first.current).toBe(input);
				expect(lifecycle).toEqual(['attach']);

				mounted.update(App, { visible: true, revision: 'three', elementRef: second, observe });
				expect(mounted.find('input')).toBe(input);
				expect(first.current).toBeNull();
				expect(second.current).toBe(input);
				expect(lifecycle).toEqual(['attach', 'cleanup', 'attach']);
				mounted.update(App, { visible: false, revision: 'three', elementRef: second, observe });
				expect(mounted.container.querySelector('input')).toBeNull();
				expect(second.current).toBeNull();
				expect(lifecycle).toEqual(['attach', 'cleanup', 'attach', 'cleanup']);

				mounted.update(App, { visible: true, revision: 'four', elementRef: second, observe });
				expect(second.current).toBe(mounted.find('input'));
				expect(second.current).not.toBe(input);
				expect(lifecycle).toEqual(['attach', 'cleanup', 'attach', 'cleanup', 'attach']);
			} finally {
				mounted.unmount();
			}
			expect(second.current).toBeNull();
			expect(lifecycle).toEqual(['attach', 'cleanup', 'attach', 'cleanup', 'attach', 'cleanup']);
		},
	);

	it.each([
		[false, 'inline'],
		[false, 'named'],
		[true, 'inline'],
		[true, 'named'],
	])(
		'keeps each keyed row ref attached through row updates and moves (dev=%s, %s)',
		(dev, form) => {
			const { App } = loadCompiledFixtureSource(
				`"use strong";
export function App(props) @{
  <ul>@for (const item of props.items; key item.id) {
    ${form === 'named' ? 'const refs = [item.elementRef, item.observe];' : ''}
    <li data-id={item.id} data-revision={props.revision}
      ref={${form === 'named' ? 'refs' : '[item.elementRef, item.observe]'}}>
      {item.label as string}
    </li>
  }</ul>
}`,
				{ id: '/src/StrongKeyedRefs.tsrx', mode: 'client', compileOptions: { dev, hmr: false } },
			);
			const lifecycle: string[] = [];
			const makeItem = (id: string) => ({
				id,
				label: id,
				elementRef: { current: null as Element | null },
				observe: (element: Element | null) => {
					lifecycle.push(id + (element ? ':attach' : ':null'));
					return () => lifecycle.push(id + ':cleanup');
				},
			});
			const alpha = makeItem('a');
			const beta = makeItem('b');
			const items = [alpha, beta];
			const mounted = mount(App, { items, revision: 'one' });
			try {
				const [firstRow, secondRow] = mounted.findAll('li');
				expect(alpha.elementRef.current).toBe(firstRow);
				expect(beta.elementRef.current).toBe(secondRow);
				expect(lifecycle).toEqual(['a:attach', 'b:attach']);

				mounted.update(App, { items, revision: 'two' });
				expect(firstRow.getAttribute('data-revision')).toBe('two');
				expect(secondRow.getAttribute('data-revision')).toBe('two');
				expect(alpha.elementRef.current).toBe(firstRow);
				expect(beta.elementRef.current).toBe(secondRow);
				expect(lifecycle).toEqual(['a:attach', 'b:attach']);

				mounted.update(App, { items: [beta, { ...alpha, label: 'updated' }], revision: 'two' });
				expect(mounted.findAll('li')).toEqual([secondRow, firstRow]);
				expect(firstRow.textContent).toBe('updated');
				expect(alpha.elementRef.current).toBe(firstRow);
				expect(lifecycle).toEqual(['a:attach', 'b:attach']);

				mounted.update(App, { items: [beta], revision: 'two' });
				expect(alpha.elementRef.current).toBeNull();
				expect(beta.elementRef.current).toBe(secondRow);
				expect(lifecycle).toEqual(['a:attach', 'b:attach', 'a:cleanup']);
			} finally {
				mounted.unmount();
			}
			expect(beta.elementRef.current).toBeNull();
			expect(lifecycle).toEqual(['a:attach', 'b:attach', 'a:cleanup', 'b:cleanup']);
		},
	);

	it('adopts keyed server refs in a conditional and retains them on a live client update', () => {
		const source = `"use strong";
export function App(props) @{
  <section>
    @if (props.visible) {
      <div>@for (const item of props.items; key item.id) {
        <input ref={[item.elementRef, item.observe]} data-revision={props.revision} defaultValue="initial" />
      }</div>
    }
  </section>
}`;
		const options = {
			id: '/src/StrongHydratedRefs.tsrx',
			compileOptions: { dev: false, hmr: false },
		};
		const server = loadCompiledFixtureSource(source, { ...options, mode: 'server' });
		const client = loadCompiledFixtureSource(source, { ...options, mode: 'client' });
		const lifecycle: string[] = [];
		const elementRef = { current: null as Element | null };
		const observe = (element: Element | null) => {
			lifecycle.push(element ? 'attach' : 'null');
			return () => lifecycle.push('cleanup');
		};
		const item = { id: 'a', elementRef, observe };
		const props = { visible: true, revision: 'one', items: [item] };
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = renderToString(server.App, props).html;
		expect(lifecycle).toEqual([]);
		expect(elementRef.current).toBeNull();
		const input = container.querySelector('input')!;
		input.value = 'edited before hydration';
		const root = hydrateRoot(container, client.App, props);
		try {
			flushSync(() => {});
			expect(container.querySelector('input')).toBe(input);
			expect(input.value).toBe('edited before hydration');
			expect(elementRef.current).toBe(input);
			expect(lifecycle).toEqual(['attach']);
			flushSync(() => root.render(client.App, { ...props, revision: 'two' }));
			expect(input.dataset.revision).toBe('two');
			expect(input.value).toBe('edited before hydration');
			expect(elementRef.current).toBe(input);
			expect(lifecycle).toEqual(['attach']);
		} finally {
			root.unmount();
			container.remove();
		}
		expect(elementRef.current).toBeNull();
		expect(lifecycle).toEqual(['attach', 'cleanup']);
	});

	it.each([false, true])(
		'adopts a nested provider and retains its consumer subscription across unrelated updates (dev=%s)',
		(dev) => {
			const source = `"use strong";
import { createContext, useContext, useEffect } from 'octane';
import { Outer, subscribe } from './source';
const Channel = createContext({ name: 'default' });
function Reader() {
  const channel = useContext(Channel);
  useEffect(() => subscribe(channel), [channel]);
  return <output>{channel.name as string}</output>;
}
export function App(props) @{
  const context = { name: props.name };
  <Outer value={true}>
    <Channel value={context}>
      <input data-revision={props.revision} defaultValue="initial" />
      <Reader />
    </Channel>
  </Outer>
}`;
			const lifecycle: string[] = [];
			const options = {
				id: '/src/StrongHydratedContext.tsrx',
				compileOptions: { dev, hmr: false },
				runtimeModules: {
					'./source': {
						Outer: createContext(false),
						subscribe: ({ name }: { name: string }) => {
							lifecycle.push('subscribe:' + name);
							return () => lifecycle.push('unsubscribe:' + name);
						},
					},
				},
			};
			const server = loadCompiledFixtureSource(source, {
				...options,
				mode: 'server',
				runtimeModules: {
					'./source': { ...options.runtimeModules['./source'], Outer: createServerContext(false) },
				},
			});
			const client = loadCompiledFixtureSource(source, { ...options, mode: 'client' });
			const props = { name: 'news', revision: 'one' };
			const container = document.createElement('div');
			document.body.appendChild(container);
			container.innerHTML = renderToString(server.App, props).html;
			expect(lifecycle).toEqual([]);
			const input = container.querySelector('input')!;
			input.value = 'edited before hydration';
			const root = hydrateRoot(container, client.App, props);
			try {
				flushSync(() => {});
				flushEffects();
				expect(container.querySelector('input')).toBe(input);
				expect(input.value).toBe('edited before hydration');
				expect(container.querySelector('output')?.textContent).toBe('news');
				expect(lifecycle).toEqual(['subscribe:news']);
				flushSync(() => root.render(client.App, { ...props, revision: 'two' }));
				flushEffects();
				expect(input.dataset.revision).toBe('two');
				expect(input.value).toBe('edited before hydration');
				expect(lifecycle).toEqual(['subscribe:news']);
				flushSync(() => root.render(client.App, { name: 'weather', revision: 'two' }));
				flushEffects();
				expect(container.querySelector('output')?.textContent).toBe('weather');
				expect(lifecycle).toEqual(['subscribe:news', 'unsubscribe:news', 'subscribe:weather']);
			} finally {
				root.unmount();
				container.remove();
			}
			expect(lifecycle).toEqual([
				'subscribe:news',
				'unsubscribe:news',
				'subscribe:weather',
				'unsubscribe:weather',
			]);
		},
	);

	it.each([false, true])(
		'does not retain a ref list mutated during conditional setup (dev=%s)',
		(dev) => {
			const { App } = loadCompiledFixtureSource(
				`"use strong";
export function App(props) @{
  <section>
    @if (props.visible) {
      const refs = [props.elementRef];
      const alias = refs;
      alias.push(props.observe);
      <input ref={refs} data-count={refs.length} data-revision={props.revision} />
    }
  </section>
}`,
				{ id: '/src/StrongMutableRefs.tsrx', mode: 'client', compileOptions: { dev, hmr: false } },
			);
			const elementRef = { current: null as Element | null };
			const observe = () => {};
			const mounted = mount(App, { visible: true, revision: 'one', elementRef, observe });
			try {
				const input = mounted.find('input') as HTMLInputElement;
				expect(input.dataset.count).toBe('2');
				expect(elementRef.current).toBe(input);
				mounted.update(App, { visible: true, revision: 'two', elementRef, observe });
				expect(input.dataset.revision).toBe('two');
				expect(input.dataset.count).toBe('2');
				expect(elementRef.current).toBe(input);
			} finally {
				mounted.unmount();
			}
			expect(elementRef.current).toBeNull();
		},
	);
});

// Strong compiles only `.tsrx`, so both component forms are `.tsrx` modules.
describe.each([
	{ form: 'template body', extension: 'tsrx', open: '@{', render: '', close: '}' },
	{ form: 'returned JSX', extension: 'tsrx', open: '{', render: 'return (', close: '); }' },
])('Strong inline template values ($form)', ({ extension, open, render, close }) => {
	it.each([false, true])(
		'keeps ref attachments until an inline array member changes (dev=%s)',
		(dev) => {
			const { App } = loadCompiledFixtureSource(
				`/** @jsxImportSource octane */
"use strong";
import { useState } from 'octane';
export function App(props) ${open}
  const [noise, setNoise] = useState(0);
  ${render}
  <span data-revision={props.revision} ref={[props.elementRef, props.observe]} onClick={() => setNoise(noise + 1)}>{noise as string}</span>
${close}`,
				{
					id: `/src/StrongInlineRef.${extension}`,
					mode: 'client',
					compileOptions: { dev, hmr: false },
				},
			);
			const lifecycle: string[] = [];
			const firstRef: { current: Element | null } = { current: null };
			const secondRef: { current: Element | null } = { current: null };
			const observeFirst = (element: Element | null) => {
				lifecycle.push(element ? 'first:attach' : 'first:null');
				return () => lifecycle.push('first:cleanup');
			};
			const observeSecond = (element: Element | null) => {
				lifecycle.push(element ? 'second:attach' : 'second:null');
				return () => lifecycle.push('second:cleanup');
			};
			const mounted = mount(App, { elementRef: firstRef, observe: observeFirst, revision: 'one' });
			try {
				const element = mounted.find('span');
				expect(firstRef.current).toBe(element);
				expect(lifecycle).toEqual(['first:attach']);
				mounted.click('span');
				expect(element.textContent).toBe('1');
				expect(firstRef.current).toBe(element);
				expect(lifecycle).toEqual(['first:attach']);
				mounted.update(App, { elementRef: firstRef, observe: observeFirst, revision: 'two' });
				expect(element.getAttribute('data-revision')).toBe('two');
				expect(firstRef.current).toBe(element);
				expect(lifecycle).toEqual(['first:attach']);

				mounted.update(App, { elementRef: secondRef, observe: observeFirst, revision: 'two' });
				expect(element.textContent).toBe('1');
				expect(firstRef.current).toBeNull();
				expect(secondRef.current).toBe(element);
				expect(lifecycle).toEqual(['first:attach', 'first:cleanup', 'first:attach']);
				mounted.update(App, { elementRef: secondRef, observe: observeSecond, revision: 'two' });
				expect(element.textContent).toBe('1');
				expect(secondRef.current).toBe(element);
				expect(lifecycle).toEqual([
					'first:attach',
					'first:cleanup',
					'first:attach',
					'first:cleanup',
					'second:attach',
				]);
			} finally {
				mounted.unmount();
			}
			expect(secondRef.current).toBeNull();
			expect(lifecycle).toEqual([
				'first:attach',
				'first:cleanup',
				'first:attach',
				'first:cleanup',
				'second:attach',
				'second:cleanup',
			]);
		},
	);

	it('keeps a regular function in a ref array attached until its captures change', () => {
		const lifecycle: string[] = [];
		const { App } = loadCompiledFixtureSource(
			`/** @jsxImportSource octane */
"use strong";
import { useState } from 'octane';
export function App(props) ${open}
  const [noise, setNoise] = useState(0);
  ${render}
  <div>
    <button onClick={() => setNoise(noise + 1)}>{noise as string}</button>
    <span data-revision={props.revision}
      ref={[function(node) { return props.observe(props.name, node); }]} />
  </div>
${close}`,
			{
				id: `/src/StrongFunctionRef.${extension}`,
				mode: 'client',
				compileOptions: { dev: false, hmr: false },
			},
		);
		const observe = (name: string, node: Element | null) => {
			lifecycle.push(name + (node ? ':attach' : ':null'));
			return () => lifecycle.push(name + ':cleanup');
		};
		const mounted = mount(App, { name: 'first', revision: 'one', observe });
		try {
			expect(lifecycle).toEqual(['first:attach']);
			mounted.click('button');
			expect(mounted.find('button').textContent).toBe('1');
			expect(lifecycle).toEqual(['first:attach']);
			mounted.update(App, { name: 'first', revision: 'two', observe });
			expect(mounted.find('span').getAttribute('data-revision')).toBe('two');
			expect(lifecycle).toEqual(['first:attach']);
			mounted.update(App, { name: 'second', revision: 'two', observe });
			expect(lifecycle).toEqual(['first:attach', 'first:cleanup', 'second:attach']);
		} finally {
			mounted.unmount();
		}
		expect(lifecycle).toEqual(['first:attach', 'first:cleanup', 'second:attach', 'second:cleanup']);
	});

	it.each([
		[false, 'inline'],
		[false, 'named'],
		[false, 'nested named'],
		[true, 'inline'],
		[true, 'named'],
		[true, 'nested named'],
	])('retains a context subscription until a provider value changes (dev=%s, %s)', (dev, form) => {
		const lifecycle: string[] = [];
		const { App } = loadCompiledFixtureSource(
			`/** @jsxImportSource octane */
"use strong";
import { createContext, useContext, useEffect, useState } from 'octane';
import { subscribe } from './subscription';
import { Outer } from './outer';
const Channel = createContext({ name: 'default' });
function Reader() {
  const channel = useContext(Channel);
  useEffect(() => subscribe(channel), [channel]);
  return <output>{channel.name as string}</output>;
}
export function App(props) ${open}
  const [noise, setNoise] = useState(0);
  ${form !== 'inline' ? 'const context = { name: props.name };' : ''}
  ${render}
  <div>
    <button data-revision={props.revision} onClick={() => setNoise(noise + 1)}>{noise as string}</button>
    ${form === 'nested named' ? '<Outer value={true}>' : ''}
      <Channel value={${form !== 'inline' ? 'context' : '{ name: props.name }'}}><Reader /></Channel>
    ${form === 'nested named' ? '</Outer>' : ''}
  </div>
${close}`,
			{
				id: `/src/StrongInlineContext.${extension}`,
				mode: 'client',
				compileOptions: { dev, hmr: false },
				runtimeModules: {
					'./outer': { Outer: createContext(false) },
					'./subscription': {
						subscribe: (channel: { name: string }) => {
							lifecycle.push('subscribe:' + channel.name);
							return () => lifecycle.push('unsubscribe:' + channel.name);
						},
					},
				},
			},
		);
		const mounted = mount(App, { name: 'news', revision: 'one' });
		try {
			flushEffects();
			expect(mounted.find('output').textContent).toBe('news');
			expect(lifecycle).toEqual(['subscribe:news']);
			mounted.click('button');
			flushEffects();
			expect(mounted.find('button').textContent).toBe('1');
			expect(mounted.find('output').textContent).toBe('news');
			expect(lifecycle).toEqual(['subscribe:news']);
			mounted.update(App, { name: 'news', revision: 'two' });
			flushEffects();
			expect(mounted.find('button').getAttribute('data-revision')).toBe('two');
			expect(mounted.find('output').textContent).toBe('news');
			expect(lifecycle).toEqual(['subscribe:news']);

			mounted.update(App, { name: 'weather', revision: 'two' });
			flushEffects();
			expect(mounted.find('output').textContent).toBe('weather');
			expect(lifecycle).toEqual(['subscribe:news', 'unsubscribe:news', 'subscribe:weather']);
		} finally {
			mounted.unmount();
		}
		expect(lifecycle).toEqual([
			'subscribe:news',
			'unsubscribe:news',
			'subscribe:weather',
			'unsubscribe:weather',
		]);
	});

	it.each([false, true])(
		'leaves inline child prop evaluation with a component that can withhold children (dev=%s)',
		(dev) => {
			const reads: string[] = [];
			const { App } = loadCompiledFixtureSource(
				`/** @jsxImportSource octane */
"use strong";
import { useState } from 'octane';
import { read } from './source';
function Deferred(props) {
  return props.show ? <>{props.children}</> : <span>hidden</span>;
}
function Reader(props) {
  return <output>{props.value.name as string}</output>;
}
export function App(props) ${open}
  const [revision, setRevision] = useState(0);
  ${render}
  <div>
    <button onClick={() => setRevision(revision + 1)}>{revision as string}</button>
    <Deferred show={props.show}>
      <Reader value={{ name: read(props.name) }} />
    </Deferred>
  </div>
${close}`,
				{
					id: `/src/StrongDeferredProps.${extension}`,
					mode: 'client',
					compileOptions: { dev, hmr: false },
					runtimeModules: {
						'./source': {
							read(name: string) {
								reads.push(name);
								return name;
							},
						},
					},
				},
			);
			const mounted = mount(App, { show: false, name: 'news' });
			try {
				expect(mounted.find('span').textContent).toBe('hidden');
				expect(reads).toEqual([]);
				mounted.click('button');
				expect(mounted.find('button').textContent).toBe('1');
				expect(reads).toEqual([]);
				mounted.update(App, { show: false, name: 'weather' });
				expect(mounted.find('span').textContent).toBe('hidden');
				expect(reads).toEqual([]);
				mounted.update(App, { show: true, name: 'weather' });
				expect(mounted.find('output').textContent).toBe('weather');
				expect(reads).toEqual(['weather']);
			} finally {
				mounted.unmount();
			}
		},
	);

	it.each(['named', 'inline'])(
		'keeps a provider subscription for a regular function until its captures change (%s)',
		(form) => {
			const lifecycle: string[] = [];
			const literal = '{ name: function() { return props.name; } }';
			const { App } = loadCompiledFixtureSource(
				`/** @jsxImportSource octane */
"use strong";
import { createContext, useContext, useEffect, useState } from 'octane';
import { subscribe } from './subscription';
const Channel = createContext(null);
function Reader() {
  const channel = useContext(Channel);
  useEffect(() => subscribe(channel), [channel]);
  return <output>{channel.name() as string}</output>;
}
export function App(props) ${open}
  const [noise, setNoise] = useState(0);
  ${form === 'named' ? `const context = ${literal};` : ''}
  ${render}
  <div>
    <button data-revision={props.revision} onClick={() => setNoise(noise + 1)}>{noise as string}</button>
    <Channel value={${form === 'named' ? 'context' : literal}}><Reader /></Channel>
  </div>
${close}`,
				{
					id: `/src/StrongFunctionContext.${extension}`,
					mode: 'client',
					compileOptions: { dev: false, hmr: false },
					runtimeModules: {
						'./subscription': {
							subscribe: (channel: { name: () => string }) => {
								const name = channel.name();
								lifecycle.push('subscribe:' + name);
								return () => lifecycle.push('unsubscribe:' + name);
							},
						},
					},
				},
			);
			const mounted = mount(App, { name: 'news', revision: 'one' });
			try {
				flushEffects();
				expect(mounted.find('output').textContent).toBe('news');
				expect(lifecycle).toEqual(['subscribe:news']);
				mounted.click('button');
				flushEffects();
				expect(mounted.find('button').textContent).toBe('1');
				expect(lifecycle).toEqual(['subscribe:news']);
				mounted.update(App, { name: 'news', revision: 'two' });
				flushEffects();
				expect(mounted.find('button').getAttribute('data-revision')).toBe('two');
				expect(lifecycle).toEqual(['subscribe:news']);
				mounted.update(App, { name: 'weather', revision: 'two' });
				flushEffects();
				expect(mounted.find('output').textContent).toBe('weather');
				expect(lifecycle).toEqual(['subscribe:news', 'unsubscribe:news', 'subscribe:weather']);
			} finally {
				mounted.unmount();
			}
			expect(lifecycle).toEqual([
				'subscribe:news',
				'unsubscribe:news',
				'subscribe:weather',
				'unsubscribe:weather',
			]);
		},
	);

	it.each([
		['direct assignment', 'value.count++;', '() => {}'],
		['alias assignment', 'const alias = value; alias.count++;', '() => {}'],
		['eager event-producer callback', '', '(() => { value.count++; return () => {}; })()'],
	])('creates a fresh mutable child prop after %s', (_name, mutation, event) => {
		const { App } = loadCompiledFixtureSource(
			`/** @jsxImportSource octane */
"use strong";
import { useState } from 'octane';
function Display(props) {
  return <div>
    <output>{props.revision + ':' + props.value.count + ':' + props.noise as string}</output>
    <button id="noise" onClick={props.advance}>advance</button>
    <button id="value" onClick={props.onPress}>value</button>
  </div>;
}
export function App(props) ${open}
  const [noise, setNoise] = useState(0);
  const value = { count: 0 };
  ${mutation}
  ${render}
  <Display value={value} revision={props.revision} noise={noise}
    advance={() => setNoise(noise + 1)} onPress={${event}} />
${close}`,
			{
				id: `/src/StrongMutableChild.${extension}`,
				mode: 'client',
				compileOptions: { dev: false, hmr: false },
			},
		);
		const mounted = mount(App, { revision: 'one' });
		try {
			expect(mounted.find('output').textContent).toBe('one:1:0');
			mounted.click('#noise');
			expect(mounted.find('output').textContent).toBe('one:1:1');
			mounted.update(App, { revision: 'two' });
			expect(mounted.find('output').textContent).toBe('two:1:1');
		} finally {
			mounted.unmount();
		}
	});

	it.each([
		['named', 'method', '{ count: 0, next() { return ++this.count; } }'],
		['inline', 'method', '{ count: 0, next() { return ++this.count; } }'],
		[
			'named',
			'default arrow',
			'{ count: 0, next: function(read = () => ++this.count) { return read(); } }',
		],
		[
			'inline',
			'default arrow',
			'{ count: 0, next: function(read = () => ++this.count) { return read(); } }',
		],
	])(
		'starts a fresh child value after an event mutates its method receiver (%s, %s)',
		(form, _kind, literal) => {
			const { App } = loadCompiledFixtureSource(
				`/** @jsxImportSource octane */
"use strong";
import { useState } from 'octane';
function Display(props) {
  return <div>
    <output>{props.noise + ':' + props.model.count as string}</output>
    <button id="value" onClick={() => props.model.next()}>change</button>
  </div>;
}
export function App() ${open}
  const [noise, setNoise] = useState(0);
  ${form === 'named' ? `const model = ${literal};` : ''}
  ${render}
  <div>
    <button id="noise" onClick={() => setNoise(noise + 1)}>advance</button>
    <Display model={${form === 'named' ? 'model' : literal}} noise={noise} />
  </div>
${close}`,
				{
					id: `/src/StrongMethodMutableChild.${extension}`,
					mode: 'client',
					compileOptions: { dev: false, hmr: false },
				},
			);
			const mounted = mount(App);
			try {
				expect(mounted.find('output').textContent).toBe('0:0');
				mounted.click('#value');
				mounted.click('#noise');
				expect(mounted.find('output').textContent).toBe('1:0');
			} finally {
				mounted.unmount();
			}
		},
	);

	it('does not carry an event mutation of a child prop into a later render', () => {
		const { App } = loadCompiledFixtureSource(
			`/** @jsxImportSource octane */
"use strong";
import { useState } from 'octane';
function Display(props) {
  return <div>
    <output>{props.value.count + ':' + props.noise as string}</output>
    <button id="noise" onClick={props.advance}>advance</button>
    <button id="value" onClick={props.change}>change</button>
  </div>;
}
export function App() ${open}
  const [noise, setNoise] = useState(0);
  const value = { count: 0 };
  ${render}
  <Display value={value} noise={noise} advance={() => setNoise(noise + 1)}
    change={() => { value.count++; }} />
${close}`,
			{
				id: `/src/StrongEventMutableChild.${extension}`,
				mode: 'client',
				compileOptions: { dev: false, hmr: false },
			},
		);
		const mounted = mount(App);
		try {
			expect(mounted.find('output').textContent).toBe('0:0');
			mounted.click('#value');
			mounted.click('#noise');
			expect(mounted.find('output').textContent).toBe('0:1');
		} finally {
			mounted.unmount();
		}
	});

	it('creates a fresh named function when an event mutates the function itself', () => {
		const seen: number[] = [];
		const { App } = loadCompiledFixtureSource(
			`/** @jsxImportSource octane */
"use strong";
import { useState } from 'octane';
function Display(props) {
  return <div>
    <output>{props.noise as string}</output>
    <button id="value" onClick={() => props.observe(props.model.next())}>next</button>
  </div>;
}
export function App(props) ${open}
  const [noise, setNoise] = useState(0);
  const model = {
    next: function next() {
      next.count = (next.count || 0) + 1;
      return next.count;
    }
  };
  ${render}
  <div>
    <button id="noise" onClick={() => setNoise(noise + 1)}>advance</button>
    <Display model={model} noise={noise} observe={props.observe} />
  </div>
${close}`,
			{
				id: `/src/StrongNamedFunctionMutation.${extension}`,
				mode: 'client',
				compileOptions: { dev: false, hmr: false },
			},
		);
		const mounted = mount(App, { observe: (value: number) => seen.push(value) });
		try {
			mounted.click('#value');
			expect(seen).toEqual([1]);
			mounted.click('#noise');
			expect(mounted.find('output').textContent).toBe('1');
			mounted.click('#value');
			expect(seen).toEqual([1, 1]);
		} finally {
			mounted.unmount();
		}
	});
});
