import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createOctaneCompiler } from '../src/compiler/bundler.js';
import { slotHooks } from '../src/compiler/slot-hooks.js';
import { mount } from './_helpers';
import { loadPlainHookFixtureSource } from './_server-fixture';

function fixture(hook: string, memo: boolean) {
	const call = (initial: number, slot: string) =>
		hook === 'useReducer'
			? `useValue((_previous, next) => next, ${initial}, undefined, ${slot})`
			: hook === 'useLinkedState'
				? `useValue(${initial}, (source) => source, undefined, ${slot})`
				: `useValue(${initial}, ${slot})`;
	return `
		import { createElement, ${hook} as useValue, useMemo } from 'octane';
		const leftSlot = Symbol('left');
		const rightSlot = Symbol('right');
		const memoSlot = Symbol('memo');
		export function App(props) {
			const [left, updateLeft, getLeft] = ${call(1, 'leftSlot')};
			const [right, , getRight] = ${call(10, 'rightSlot')};
			const label = ${memo ? "useMemo(() => left + ':' + right, [left, right], memoSlot)" : "left + ':' + right"};
			return createElement('button', { onClick() {
				updateLeft(getLeft() + 1);
				updateLeft(getLeft() + 1);
				props.report(getLeft(), getRight());
			} }, label);
		}
	`;
}

describe('state getter capability in manually slotted modules', () => {
	for (const inlineHookMemo of [false, true]) {
		for (const hook of ['useState', 'useReducer', 'useLinkedState']) {
			it(`keeps ${hook} getters current without changing authored slots (inline=${inlineHookMemo})`, () => {
				const source = fixture(hook, true);
				const { App } = loadPlainHookFixtureSource(source, {
					id: 'manual-state-getters.ts',
					manualSlots: true,
					inlineHookMemo,
				});
				const reports: number[][] = [];
				const root = mount(App, { report: (...values: number[]) => reports.push(values) });
				try {
					expect(root.find('button').textContent).toBe('1:10');
					root.click('button');
					expect(reports).toEqual([[3, 10]]);
					expect(root.find('button').textContent).toBe('3:10');
					root.click('button');
					expect(reports).toEqual([
						[3, 10],
						[5, 10],
					]);
					expect(root.find('button').textContent).toBe('5:10');
				} finally {
					root.unmount();
				}
				const code = slotHooks(source, 'manual-state-getters.ts', {
					manualSlots: true,
					inlineHookMemo,
				})?.code;
				expect(code).toBeDefined();
				expect(code).not.toMatch(/hookSlots|Symbol\.for|withSlot/);
			});
		}

		it(`selects a getter without an inlineable memo (inline=${inlineHookMemo})`, () => {
			const { App } = loadPlainHookFixtureSource(fixture('useState', false), {
				id: 'manual-state-getters-no-memo.ts',
				manualSlots: true,
				inlineHookMemo,
			});
			const reports: number[][] = [];
			const root = mount(App, { report: (...values: number[]) => reports.push(values) });
			try {
				root.click('button');
				expect(reports).toEqual([[3, 10]]);
				expect(root.find('button').textContent).toBe('3:10');
			} finally {
				root.unmount();
			}
		});
	}

	it('applies getter capabilities through a package manual-slot declaration', () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-manual-getter-'));
		try {
			writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'app', private: true }));
			const packageRoot = join(root, 'node_modules/manual-binding');
			mkdirSync(join(packageRoot, 'src'), { recursive: true });
			writeFileSync(
				join(packageRoot, 'package.json'),
				JSON.stringify({
					name: 'manual-binding',
					peerDependencies: { octane: '*' },
					octane: { hookSlots: { manual: ['src'] } },
				}),
			);
			const source = `import { useState } from 'octane';
				export function useCounter(slot) { return useState(1, slot); }`;
			const compiler = createOctaneCompiler({ root });
			for (const environment of ['client', 'server'] as const) {
				const output = compiler.transform(source, join(packageRoot, 'src/counter.ts'), {
					environment,
					explicitRuntimeRequests: true,
				});
				expect(output?.code).toContain('__useStateWithGetter');
				expect(output?.code).not.toMatch(/hookSlots|Symbol\.for|withSlot/);
				expect(output?.code).toContain('(1, slot)');
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
