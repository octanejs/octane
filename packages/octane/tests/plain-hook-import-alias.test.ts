import { describe, expect, it, vi } from 'vitest';
import { useLayoutEffect, useRef, useState } from '../src/index.js';
import { __useStateWithGetter } from '../src/runtime.js';
import * as Server from '../src/server/index.js';
import * as ServerHooks from '../src/runtime.server.js';
import { slotHooks } from '../src/compiler/slot-hooks.js';
import { mount } from './_helpers.js';
import { loadCompiledFixtureSource, loadPlainHookFixtureSource } from './_server-fixture.js';

interface SymbolHookReport {
	state: symbol | undefined;
	ref: { current: symbol | undefined };
	readable: symbol | undefined;
	getReadable: () => symbol | undefined;
	empty: unknown[];
	nested: unknown[];
	direct: unknown[];
	manual: unknown[];
	bound: unknown[];
	forwarded: unknown[];
}

function symbolHookSource(dialect: 'ts' | 'tsrx'): string {
	const setup = `
		const [state, setState] = useCell(props.initial);
		const ref = useReference(props.initial);
		const [readable, setReadable, getReadable] = useReadableCell(props.initial);
		const [emptyState] = useCell();
		const emptyRef = useReference();
		const [emptyReadable, , getEmptyReadable] = useReadableCell();
		const [emptyDirectReadable, , getEmptyDirectReadable] = useState();
		const nested = useEmpty();
		const [directState] = useState(props.initial);
		const directRef = useRef(props.initial);
		const [manualState] = useExplicitState(props.initial);
		const manualRef = useExplicitRef(props.initial);
		const [manualReadable, , getManualReadable] = useExplicitReadable(props.initial);
		const [boundState] = useBoundState(props.initial);
		const boundRef = useBoundRef(props.initial);
		const [boundReadable, , getBoundReadable] = useBoundReadable(props.initial);
		const [forwardedState] = useForwardedState(props.initial);
		const forwardedRef = useForwardedRef(props.initial);
		const [forwardedReadable, , getForwardedReadable] = useForwardedReadable(props.initial);
		props.report({ state, ref, readable, getReadable,
			empty: [emptyState, emptyRef.current, emptyReadable, getEmptyReadable(), emptyDirectReadable, getEmptyDirectReadable()],
			nested, direct: [directState, directRef.current],
			manual: [manualState, manualRef.current, manualReadable, getManualReadable()],
			bound: [boundState, boundRef.current, boundReadable, getBoundReadable()],
			forwarded: [forwardedState, forwardedRef.current, forwardedReadable, getForwardedReadable()] });
		const update = () => { setState(props.next); setReadable(props.next); };
	`;
	return `
		import {createElement, useState, useRef} from 'octane';
		import {useCell, useReference, useReadableCell, useExplicitState,
			useExplicitRef, useExplicitReadable, useBoundState, useBoundRef, useBoundReadable,
			useForwardedState, useForwardedRef, useForwardedReadable} from './aliases';
		function useEmpty() {
			const [state, , getState] = useState();
			const ref = useRef();
			return [state, getState(), ref.current];
		}
		function App(props) ${
			dialect === 'tsrx'
				? `@{ ${setup} <button onClick={update}>Update</button> }`
				: `{ ${setup} return createElement('button', {onClick: update}, 'Update'); }`
		}
		export const fixture = { App };
	`;
}

describe('symbol initial values through hook aliases', () => {
	for (const mode of ['client', 'server'] as const) {
		for (const dialect of ['ts', 'tsrx'] as const) {
			it.each([false, true])(
				`preserves symbol identity and empty calls in ${mode} .${dialect} (inline=%s)`,
				(inlineHookMemo) => {
					const hooks =
						mode === 'server' ? ServerHooks : { useState, useRef, __useStateWithGetter };
					const runtimeModules = {
						'./aliases': {
							useCell: hooks.useState,
							useReference: hooks.useRef,
							useReadableCell: hooks.__useStateWithGetter,
							useExplicitState: (value: symbol) => hooks.useState(value, undefined),
							useExplicitRef: (value: symbol) => hooks.useRef(value, undefined),
							useExplicitReadable: (value: symbol) => hooks.__useStateWithGetter(value, undefined),
							useBoundState: hooks.useState.bind(null),
							useBoundRef: hooks.useRef.bind(null),
							useBoundReadable: hooks.__useStateWithGetter.bind(null),
							useForwardedState: (value: symbol) => hooks.useState(value),
							useForwardedRef: (value: symbol) => hooks.useRef(value),
							useForwardedReadable: (value: symbol) => hooks.__useStateWithGetter(value),
						},
					};
					const source = symbolHookSource(dialect);
					const id = `symbol-hook-alias.${dialect}`;
					const hmr = process.env.OCTANE_TEST_COMPILE_MODE !== 'prod';
					const {
						fixture: { App },
					} =
						dialect === 'ts'
							? loadPlainHookFixtureSource(source, {
									id,
									mode,
									hmr,
									inlineHookMemo,
									runtimeModules,
								})
							: loadCompiledFixtureSource(source, {
									id,
									mode,
									compileOptions: { hmr, dev: hmr, inlineHookMemo },
									runtimeModules,
								});
					const initial = Symbol('initial');
					const next = Symbol('next');
					const reports: SymbolHookReport[] = [];
					const props = { initial, next, report: (value: SymbolHookReport) => reports.push(value) };
					const check = (state: symbol) => {
						const result = reports.at(-1)!;
						expect(result.state).toBe(state);
						expect(result.ref.current).toBe(initial);
						expect(result.readable).toBe(state);
						expect(result.getReadable()).toBe(state);
						expect(result.empty).toEqual([
							undefined,
							undefined,
							undefined,
							undefined,
							undefined,
							undefined,
						]);
						expect(result.nested).toEqual([undefined, undefined, undefined]);
						expect(result.direct).toEqual([initial, initial]);
						expect(result.manual).toEqual([initial, initial, initial, initial]);
						expect(result.bound).toEqual([initial, initial, initial, initial]);
						expect(result.forwarded).toEqual([initial, initial, initial, initial]);
					};
					if (mode === 'server') {
						expect(Server.renderToString(App, props).html).toContain('Update');
						check(initial);
					} else {
						const root = mount(App, props);
						try {
							check(initial);
							const ref = reports.at(-1)!.ref;
							root.click('button');
							check(next);
							expect(reports.at(-1)!.ref).toBe(ref);
							root.update(App, { ...props, initial: Symbol('later initial') });
							check(next);
							expect(reports.at(-1)!.ref).toBe(ref);
						} finally {
							root.unmount();
						}
					}
				},
			);
		}
	}
});

describe('imported hook aliases in plain modules', () => {
	for (const inlineHookMemo of [false, true]) {
		it.each([
			[
				'imported',
				`import { useCell as cell, useIsomorphicLayoutEffect as effect } from './aliases'; const otherEffect = effect;`,
			],
			[
				'local',
				`import {useState, useEffect, useLayoutEffect} from 'octane'; const chooseEffect = () => typeof document === 'object' ? useLayoutEffect : useEffect; const effect = chooseEffect(); const cell = useState; const otherEffect = typeof document === 'object' ? useLayoutEffect : callback => callback();`,
			],
		])(
			`keeps %s state and effect aliases independent (inline=${inlineHookMemo})`,
			(_kind, declarations) => {
				const error = vi.spyOn(console, 'error').mockImplementation(() => {});
				const aliases = { useCell: useState, useIsomorphicLayoutEffect: useLayoutEffect };
				const hooks = loadPlainHookFixtureSource(
					`
				import { useMemo } from 'octane';
				${declarations}
				export function usePair(report) {
					const [left, setLeft] = cell<number>(1);
					const [right, setRight] = cell<number>(10);
					effect(() => { report('left:' + left); return () => report('clean-left:' + left); }, [left]);
					otherEffect(() => { report('right:' + right); return () => report('clean-right:' + right); }, [right, report]);
					const label = useMemo(() => left + ':' + right, [left, right]);
					return { label, left: () => setLeft(x => x + 1), right: () => setRight(x => x + 1) };
				}
			`,
					{
						id: 'plain-hook-import-alias.ts',
						inlineHookMemo,
						runtimeModules: { './aliases': aliases },
					},
				);
				const { App } = loadCompiledFixtureSource(
					`
				import { usePair } from './hooks';
				export function App({report}) @{
					const pair = usePair(report);
					<div><p>{pair.label as string}</p><button id="left" onClick={pair.left}>left</button><button id="right" onClick={pair.right}>right</button></div>
				}
			`,
					{
						id: 'plain-hook-import-alias.tsrx',
						mode: 'client',
						runtimeModules: { './hooks': hooks },
					},
				);
				const events: string[] = [];
				const root = mount(App, { report: (event: string) => events.push(event) });
				try {
					expect(root.find('p').textContent).toBe('1:10');
					expect(events.splice(0)).toEqual(['left:1', 'right:10']);
					root.click('#left');
					expect(root.find('p').textContent).toBe('2:10');
					expect(events.splice(0)).toEqual(['clean-left:1', 'left:2']);
					root.click('#right');
					expect(root.find('p').textContent).toBe('2:11');
					expect(events.splice(0)).toEqual(['clean-right:10', 'right:11']);
					expect(error).not.toHaveBeenCalled();
				} finally {
					root.unmount();
					error.mockRestore();
				}
				expect(events.sort()).toEqual(['clean-left:2', 'clean-right:11']);
			},
		);
	}

	it('does not assign hook identity to shadowed imports or type imports', () => {
		const source = `import { createElement } from 'octane';
			import { useCell as cell } from './aliases';
			import type { useOther } from './types';
			export function probe(cell) { return cell(1); }
			export function other(useOther) { return useOther(2); }`;
		expect(slotHooks(source, 'shadowed-import.ts')).toBeNull();
	});

	it('slots default aliases without a direct base-hook import and preserves call syntax', () => {
		const { App } = loadPlainHookFixtureSource(
			`
			import { createElement } from 'octane';
			import useCell from './aliases';
			export function App() {
				const [first] = (useCell) /* call ( */ <number>(1,);
				const [second] = useCell<number>(10);
				const [empty] = useCell();
				return createElement('p', null, first + ':' + second + ':' + String(empty));
			}
		`,
			{
				id: 'default-hook-alias.ts',
				inlineHookMemo: false,
				runtimeModules: { './aliases': { default: useState } },
			},
		);
		const root = mount(App);
		try {
			expect(root.find('p').textContent).toBe('1:10:undefined');
		} finally {
			root.unmount();
		}
	});

	it('retains authored hook arguments in an explicitly manually slotted module', () => {
		const source = `import { createElement } from 'octane';
			import { useCell } from './aliases'; export function useValue(slot) { return useCell(1, slot); }`;
		const { useValue } = loadPlainHookFixtureSource(source, {
			id: 'manual-alias.ts',
			inlineHookMemo: false,
			manualSlots: true,
			runtimeModules: { './aliases': { useCell: (...args: unknown[]) => args } },
		});
		const slot = Symbol('authored identity');
		expect(useValue(slot)).toEqual([1, slot]);
	});

	it('does not treat shadowed factories or reassigned values as proven hook aliases', () => {
		const source = `import {useState} from 'octane';
			const choose = () => useState;
			let mutable = useState; mutable = value => [value];
			export function run(choose) { const value = choose(); return value(1); }
			export function other() { return mutable(2); }`;
		expect(slotHooks(source, 'unproven-alias.ts')).toBeNull();
	});

	it.each([false, true])(
		'preserves foreign hook defaults and argument counts (inline=%s)',
		(inlineHookMemo) => {
			const argumentCounts: number[] = [];
			function useOptional(selector = (value: string) => value) {
				argumentCounts.push(arguments.length);
				return selector('default');
			}
			const { App } = loadPlainHookFixtureSource(
				`
			import {createElement, useMemo} from 'octane';
			import {useOptional as read} from '@foreign/hooks';
			export function App() {
				const first = read();
				const second = read(value => value + '!');
				const label = useMemo(() => first + ':' + second, [first, second]);
				return createElement('p', null, label);
			}
		`,
				{
					id: 'foreign-hook-defaults.ts',
					inlineHookMemo,
					runtimeModules: { '@foreign/hooks': { useOptional } },
				},
			);
			const root = mount(App);
			try {
				expect(root.find('p').textContent).toBe('default:default!');
				expect(argumentCounts.splice(0)).toEqual([0, 1]);
				root.update(App);
				expect(argumentCounts).toEqual([0, 1]);
			} finally {
				root.unmount();
			}
		},
	);
});
