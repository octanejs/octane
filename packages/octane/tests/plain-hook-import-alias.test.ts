import { describe, expect, it, vi } from 'vitest';
import { useLayoutEffect, useState } from '../src/index.js';
import { slotHooks } from '../src/compiler/slot-hooks.js';
import { mount } from './_helpers.js';
import { loadCompiledFixtureSource, loadPlainHookFixtureSource } from './_server-fixture.js';

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

	it('retains the authored policy in an explicitly manually slotted module', () => {
		const source = `import { createElement } from 'octane';
			import { useCell } from './aliases'; export function useValue(slot) { return useCell(1, slot); }`;
		expect(slotHooks(source, 'manual-alias.ts', { manualSlots: true })).toBeNull();
	});

	it('does not treat shadowed factories or reassigned values as proven hook aliases', () => {
		const source = `import {useState} from 'octane';
			const choose = () => useState;
			let mutable = useState; mutable = value => [value];
			export function run(choose) { const value = choose(); return value(1); }
			export function other() { return mutable(2); }`;
		expect(slotHooks(source, 'unproven-alias.ts')).toBeNull();
	});
});
