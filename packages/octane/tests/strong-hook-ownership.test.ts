import { describe, expect, it } from 'vitest';
import { loadCompiledFixtureSource, loadPlainHookFixtureSource } from './_server-fixture';
import { act, flushEffects, mount } from './_helpers';
import { slotHooks } from '../src/compiler/slot-hooks.js';

describe('Strong cache scope and declaration lifetimes', () => {
	it.each([false, true])('keeps event payload allocation outside hook scopes in dev=%s', (dev) => {
		const seen: unknown[] = [];
		const { App } = loadCompiledFixtureSource(
			`"use strong"; export function App(props) @{ const onClick = () => { const payload = { id: props.id }; props.open(<b>{payload.id as string}</b>); }; <button onClick={onClick}>open</button> }`,
			{ id: '/src/HandlerScope.tsrx', mode: 'client', compileOptions: { dev, hmr: false } },
		);
		const root = mount(App, { id: 'one', open: (value: unknown) => seen.push(value) });
		try {
			root.click('button');
			expect(seen).toHaveLength(1);
		} finally {
			root.unmount();
		}
	});

	it.each([false, true])(
		'keeps render-prop allocations outside component hooks in dev=%s',
		(dev) => {
			const { App } = loadCompiledFixtureSource(
				`"use strong"; function List(props) @{ <ul>{props.renderItem({color:'red'})}</ul> } export function App() @{ <List renderItem={(item) => { const style = { color: item.color }; return <li style={style}>row</li>; }} /> }`,
				{ id: '/src/RenderPropScope.tsrx', mode: 'client', compileOptions: { dev, hmr: false } },
			);
			const root = mount(App);
			try {
				expect((root.find('li') as HTMLElement).style.color).toBe('red');
			} finally {
				root.unmount();
			}
		},
	);

	it.each([false, true])(
		'preserves unknown helper mutations and local lifetimes in dev=%s',
		(dev) => {
			const { App } = loadCompiledFixtureSource(
				`"use strong"; import { fill } from './probe'; export function App(props) @{ const value = { items: [] }; fill(value, props.count); <span>{value.items.length as string}</span> }`,
				{
					id: '/src/EscapedValue.tsrx',
					mode: 'client',
					compileOptions: { dev, hmr: false },
					runtimeModules: {
						'./probe': {
							fill: (value: { items: number[] }, count: number) => {
								for (let i = 0; i < count; i++) value.items.push(i);
							},
						},
					},
				},
			);
			const root = mount(App, { count: 2 });
			try {
				expect(root.container.textContent).toBe('2');
				root.update(App, { count: 2 });
				expect(root.container.textContent).toBe('2');
			} finally {
				root.unmount();
			}
		},
	);

	it.each([false, true])('preserves locals visible to direct eval in dev=%s', (dev) => {
		const seen: number[] = [];
		const { App } = loadCompiledFixtureSource(
			`"use strong"; import { useEffect } from 'octane'; export function App(props) @{ const options = { items: [] }; eval('options.items.push(props.value)'); useEffect(() => props.observe(options.items.length, props.tick)); <span>{props.tick as string}</span> }`,
			{ id: '/src/ReflectiveOwner.tsrx', mode: 'client', compileOptions: { dev, hmr: false } },
		);
		const props = { value: 'one', tick: 0, observe: (length: number) => seen.push(length) };
		const root = mount(App, props);
		try {
			flushEffects();
			root.update(App, { ...props, tick: 1 });
			flushEffects();
			expect(seen).toEqual([1, 1]);
		} finally {
			root.unmount();
		}
	});

	it.each([false, true])(
		'caches inputs consumed only by a proven local effect hook in dev=%s',
		(dev) => {
			const seen: unknown[] = [];
			const { App } = loadCompiledFixtureSource(
				`"use strong"; import { useEffect } from 'octane'; function useObserve(value, observe) { useEffect(() => observe(value)); } export function App(props) @{ const value = { label: props.label }; useObserve(value, props.observe); <span>{props.tick as string}</span> }`,
				{ id: '/src/LocalConsumer.tsrx', mode: 'client', compileOptions: { dev, hmr: false } },
			);
			const props = { label: 'one', tick: 0, observe: (value: unknown) => seen.push(value) };
			const root = mount(App, props);
			try {
				flushEffects();
				root.update(App, { ...props, tick: 1 });
				flushEffects();
				expect(seen).toHaveLength(1);
				root.update(App, { ...props, label: 'two', tick: 2 });
				flushEffects();
				expect(seen).toEqual([{ label: 'one' }, { label: 'two' }]);
			} finally {
				root.unmount();
			}
		},
	);

	it.each([false, true])(
		'keeps async event callback values outside hook scopes in dev=%s',
		async (dev) => {
			const seen: unknown[] = [];
			const { App } = loadCompiledFixtureSource(
				`"use strong"; export function App(props) @{ const onClick = async () => { await Promise.resolve(); const payload = { id: props.id }; props.open(<b>{payload.id as string}</b>); }; <button onClick={onClick}>open</button> }`,
				{ id: '/src/AsyncHandlerScope.tsrx', mode: 'client', compileOptions: { dev, hmr: false } },
			);
			const root = mount(App, { id: 'one', open: (value: unknown) => seen.push(value) });
			try {
				await act(async () => root.click('button'));
				expect(seen).toHaveLength(1);
			} finally {
				root.unmount();
			}
		},
	);

	it('keeps asynchronous use-prefixed utilities callable without a render scope', async () => {
		const { useFormat } = loadPlainHookFixtureSource(
			`"use strong"; export async function useFormat(label: string) { await Promise.resolve(); const value = { label }; return value; }`,
			{ id: '/src/useAsyncFormat.ts', inlineHookMemo: false },
		);
		expect(await useFormat('one')).toEqual({ label: 'one' });
		expect(await useFormat('two')).toEqual({ label: 'two' });
	});

	it.each([false, true])('preserves nested plain edits and authored trivia with HMR=%s', (hmr) => {
		const seen: string[] = [];
		const source = `"use strong";
import { useState, useEffect } from 'octane';
class Untouched { method(value: string): string; method(value: unknown) { return String(value); } }
export function useEdited(props) {
  const [count, setCount, getCount] = useState /* state call */ (...[0]);
  const record = (/* record */ { label: props.label });
  const read = (/* callback */ () => props.label);
  const values = (/* array */ [props.label]);
  useEffect((() => { props.observe(record.label + ':' + read() + ':' + values[0]); }), (undefined as undefined), /* trailing */);
  return [count, () => setCount(getCount() + 1)];
}`;
		const transformed = slotHooks(source, '/src/PlainEdited.ts', { hmr });
		expect(transformed?.code.split('\n')[2]).toBe(source.split('\n')[2]);
		for (const comment of [
			'/* state call */',
			'/* record */',
			'/* callback */',
			'/* array */',
			'/* trailing */',
		])
			expect(transformed?.code).toContain(comment);
		const hooks = loadPlainHookFixtureSource(source, {
			id: '/src/PlainEdited.ts',
			hmr,
			inlineHookMemo: false,
		});
		const { App } = loadCompiledFixtureSource(
			`import { useEdited } from './hook'; export function App(props) @{ const [count, increment] = useEdited(props); <button onClick={increment}>{count as string}</button> }`,
			{ id: '/src/PlainEditedApp.tsrx', mode: 'client', runtimeModules: { './hook': hooks } },
		);
		const props = { label: 'first', observe: (value: string) => seen.push(value) };
		const root = mount(App, props);
		try {
			flushEffects();
			expect(seen).toEqual(['first:first:first']);
			root.click('button');
			root.click('button');
			expect(root.container.textContent).toBe('2');
			root.update(App, { ...props, label: 'next' });
			flushEffects();
			expect(seen).toEqual(['first:first:first', 'next:next:next']);
			expect(root.container.textContent).toBe('2');
		} finally {
			root.unmount();
		}
	});

	it('preserves state when a plain hook re-import adds Strong dependency normalization', () => {
		const source = `import { useState, useEffect } from 'octane'; export function useCounter(label: string) { const [count, setCount] = useState(0); useEffect(() => console.log(label), undefined); return [count, setCount]; }`;
		const options = { id: '/src/PlainHmrNormalization.ts', inlineHookMemo: false, hmr: true };
		let current = loadPlainHookFixtureSource(source, options);
		const { App } = loadCompiledFixtureSource(
			`import { useCounter } from './hook'; export function App(props) @{ const [count, setCount] = useCounter(props.label); <button onClick={() => setCount(count + 1)}>{count as string}</button> }`,
			{
				id: '/src/PlainHmrApp.tsrx',
				mode: 'client',
				runtimeModules: {
					'./hook': { useCounter: (...args: unknown[]) => current.useCounter(...args) },
				},
			},
		);
		const root = mount(App, { label: 'first' });
		try {
			root.click('button');
			expect(root.container.textContent).toBe('1');
			current = loadPlainHookFixtureSource('"use strong";' + source, options);
			root.update(App, { label: 'second' });
			expect(root.container.textContent).toBe('1');
			root.click('button');
			expect(root.container.textContent).toBe('2');
		} finally {
			root.unmount();
		}
	});

	it('keeps a plain use-prefixed utility callable without a render scope', () => {
		const { useFormat } = loadPlainHookFixtureSource(
			`"use strong"; export function useFormat(label: string) { const value = { label }; return value; }`,
			{ id: '/src/useFormat.ts', inlineHookMemo: false },
		);
		expect(useFormat('one')).toEqual({ label: 'one' });
		expect(useFormat('two')).toEqual({ label: 'two' });
	});

	it.each([
		`props.items.forEach(item => { const style = { color: item.color }; observe(style); nodes.push(<li style={style}/>); });`,
		`for (const item of props.items) { (() => { const style = { color: item.color }; observe(style); nodes.push(<li style={style}/>); })(); }`,
	])('retains independent repeated callback values: %s', (setup) => {
		const seen: unknown[] = [];
		const { App } = loadCompiledFixtureSource(
			`"use strong"; import { observe } from './probe'; export function App(props) @{ const nodes = []; ${setup} <ul>{nodes}</ul> }`,
			{
				id: '/src/RepeatedValue.tsrx',
				mode: 'client',
				runtimeModules: { './probe': { observe: (value: unknown) => seen.push(value) } },
			},
		);
		const root = mount(App, { items: [{ color: 'red' }, { color: 'blue' }] });
		try {
			expect(seen).toEqual([{ color: 'red' }, { color: 'blue' }]);
			expect([...root.container.querySelectorAll('li')].map((item) => item.style.color)).toEqual([
				'red',
				'blue',
			]);
		} finally {
			root.unmount();
		}
	});

	it.each([
		'class Example { method(value: string): string; method(value: unknown) { return String(value); } }',
		'abstract class Example { abstract method(): string; }',
		'function unrelated(code: string) { return eval(code); }',
		'#!/usr/bin/env node',
	])('preserves unrelated plain TypeScript syntax around a needed cache: %s', (extra) => {
		const seen: unknown[] = [];
		const source = `${extra.startsWith('#!') ? extra + '\n' : ''}"use strong"; import { useEffect } from 'octane'; import { observe } from './probe'; ${extra.startsWith('#!') ? '' : extra} export function useValue(label: string) { const value = { label }; useEffect(() => observe(value)); }`;
		const transformed = slotHooks(source, '/src/PlainSyntax.ts', { hmr: true });
		expect(transformed?.code).toContain(extra);
		if (extra.startsWith('#!')) {
			expect(transformed?.code.startsWith(extra)).toBe(true);
			return;
		}
		const hooks = loadPlainHookFixtureSource(source, {
			id: '/src/PlainSyntax.ts',
			inlineHookMemo: false,
			hmr: true,
			runtimeModules: { './probe': { observe: (value: unknown) => seen.push(value) } },
		});
		const { App } = loadCompiledFixtureSource(
			`import { useValue } from './hook'; export function App(props) @{ useValue(props.label); <span>{props.noise as string}</span> }`,
			{ id: '/src/PlainSyntaxApp.tsrx', mode: 'client', runtimeModules: { './hook': hooks } },
		);
		const root = mount(App, { label: 'one', noise: 'a' });
		try {
			flushEffects();
			root.update(App, { label: 'one', noise: 'b' });
			flushEffects();
			expect(seen).toHaveLength(1);
		} finally {
			root.unmount();
		}
	});
});
