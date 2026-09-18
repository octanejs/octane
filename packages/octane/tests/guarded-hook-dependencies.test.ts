import { describe, expect, it } from 'vitest';
import { mount } from './_helpers';
import { loadCompiledFixtureSource, loadPlainHookFixtureSource } from './_server-fixture';
import {
	GuardedIf,
	GuardedEarlyReturn,
	GuardedLogical,
	GuardedConditional,
	GuardedSwitch,
	GuardedLoop,
	GuardedTry,
	GuardedGetter,
	GuardedMemo,
	GuardedMethod,
} from './_fixtures/guarded-hook-dependencies.tsrx';

describe('guarded inferred dependencies', () => {
	it.each([false, true])(
		'keeps guarded own data dependencies precise (plain hook: %s)',
		(plain) => {
			const entries: string[] = [];
			const setup = `import { useLayoutEffect } from 'octane';
import { observe } from './probe';
export function useRead(props) {
  useLayoutEffect(() => { if (props.enabled) observe(props.label); });
}`;
			for (const dev of [true, false]) {
				entries.length = 0;
				const runtimeModules = { './probe': { observe: (label: string) => entries.push(label) } };
				const hook = plain
					? loadPlainHookFixtureSource(setup, {
							id: '/src/GuardedData.ts',
							inlineHookMemo: true,
							hmr: dev,
							runtimeModules,
						})
					: null;
				const { App } = loadCompiledFixtureSource(
					`${plain ? "import { useRead } from './hook';" : setup}
export function App(props) @{ useRead(props); <p>{props.noise as string}</p> }`,
					{
						id: '/src/GuardedData.tsrx',
						mode: 'client',
						compileOptions: { hmr: false, dev },
						runtimeModules: { ...runtimeModules, ...(hook ? { './hook': hook } : {}) },
					},
				);
				const root = mount(App, { enabled: true, label: 'first', noise: 'one' });
				try {
					root.update(App, { enabled: true, label: 'first', noise: 'two' });
					expect(root.container.textContent).toBe('two');
					expect(entries).toEqual(['first']);
					root.update(App, { enabled: true, label: 'second', noise: 'two' });
					expect(entries).toEqual(['first', 'second']);
				} finally {
					root.unmount();
				}
			}
		},
	);

	it.each([false, true])(
		'leaves guarded getter exceptions in plain and compiled hooks (%s)',
		(plain) => {
			for (const dev of [true, false]) {
				const entries: string[] = [];
				let enabled = false;
				let reads = 0;
				const item = {
					get name() {
						reads++;
						if (!enabled) throw new Error('getter guard bypassed');
						return 'present';
					},
				};
				const setup = `import { useLayoutEffect } from 'octane';
import { observe } from './probe';
export function useRead({ item, enabled }) {
  useLayoutEffect(() => { if (enabled) observe(item.name); });
}`;
				const runtimeModules = { './probe': { observe: (label: string) => entries.push(label) } };
				const hook = plain
					? loadPlainHookFixtureSource(setup, {
							id: '/src/GuardedAccessor.ts',
							inlineHookMemo: true,
							hmr: dev,
							runtimeModules,
						})
					: null;
				const { App } = loadCompiledFixtureSource(
					`${plain ? "import { useRead } from './hook';" : setup}
export function App(props) @{ useRead(props); <p>Ready</p> }`,
					{
						id: '/src/GuardedAccessor.tsrx',
						mode: 'client',
						compileOptions: { hmr: false, dev },
						runtimeModules: { ...runtimeModules, ...(hook ? { './hook': hook } : {}) },
					},
				);
				const root = mount(App, { item, enabled });
				try {
					expect(reads).toBe(0);
					enabled = true;
					root.update(App, { item, enabled });
					expect(entries).toEqual(['present']);
					expect(reads).toBe(1);
					enabled = false;
					root.update(App, { item, enabled });
					expect(reads).toBe(1);
				} finally {
					root.unmount();
				}
			}
		},
	);

	it('keeps a failed descriptor probe inside the authored exception handler', () => {
		const item = new Proxy(
			{},
			{
				getOwnPropertyDescriptor() {
					throw new Error('reflection unavailable');
				},
				get() {
					throw new Error('read unavailable');
				},
			},
		);
		const entries: string[] = [];
		const root = mount(GuardedTry, { item, log: (value: string) => entries.push(value) });
		try {
			expect(root.container.textContent).toBe('Ready');
			expect(entries).toEqual(['missing']);
		} finally {
			root.unmount();
		}
	});

	it.each([
		['switch', `switch (item?.kind) { case undefined: break outer; default: break; }`],
		['loop', `while (!item) { break outer; }`],
		['nested loop', `inner: while (!item) { break outer; }`],
	] as const)('preserves an escaping labeled %s exit', (kind, statement) => {
		// Source bytes exercise valid labeled control flow without relying on
		// fixture formatters to support LabeledStatement printing.
		const source = `
import { useLayoutEffect } from 'octane';
export function Guarded({ item, log }) @{
  useLayoutEffect(() => {
    outer: {
      ${statement}
      log(item.name);
    }
  });
  <p>Ready</p>
}`;
		for (const dev of [true, false]) {
			const body = loadCompiledFixtureSource(source, {
				id: `guarded-labeled-${kind}.tsrx`,
				mode: 'client',
				compileOptions: { hmr: false, dev },
			}).Guarded;
			const entries: string[] = [];
			const log = (value: string) => entries.push(value);
			const root = mount(body, { item: undefined, log });
			try {
				expect(entries).toEqual([]);
				root.update(body, { item: { name: 'first', kind: 'value' }, log });
				root.update(body, { item: { name: 'second', kind: 'value' }, log });
				root.update(body, { item: undefined, log });
				expect(entries).toEqual(['first', 'second']);
				expect(root.container.textContent).toBe('Ready');
			} finally {
				root.unmount();
			}
		}
	});

	it.each([
		['break', 'local: while (true) { break local; }'],
		['continue', 'local: for (let index = 0; index < 1; index++) { continue local; }'],
		['switch break', 'local: switch (true) { case true: break local; }'],
	] as const)('retains precise reads after a self-targeting labeled %s', (kind, statement) => {
		const source = `
import { useLayoutEffect } from 'octane';
export function Read({ item, log }) @{
  useLayoutEffect(() => { ${statement} log(item.name); });
  <p>Ready</p>
}`;
		for (const dev of [true, false]) {
			const body = loadCompiledFixtureSource(source, {
				id: `precise-after-labeled-${kind}.tsrx`,
				mode: 'client',
				compileOptions: { hmr: false, dev },
			}).Read;
			const item = { name: 'first' };
			const entries: string[] = [];
			const log = (value: string) => entries.push(value);
			const root = mount(body, { item, log });
			try {
				item.name = 'second';
				root.update(body, { item, log });
				expect(entries).toEqual(['first', 'second']);
			} finally {
				root.unmount();
			}
		}
	});

	it.each([
		['if', GuardedIf],
		['early return', GuardedEarlyReturn],
		['logical expression', GuardedLogical],
		['conditional expression', GuardedConditional],
		['switch', GuardedSwitch],
		['loop', GuardedLoop],
	] as const)('preserves %s guards while an optional receiver comes and goes', (_, body) => {
		const entries: string[] = [];
		const log = (value: string) => entries.push(value);
		const root = mount(body, { item: undefined, log });
		try {
			expect(root.container.textContent).toBe('Ready');
			expect(entries).toEqual([]);
			root.update(body, { item: { name: 'first', kind: 'value' }, log });
			root.update(body, { item: { name: 'second', kind: 'value' }, log });
			root.update(body, { item: undefined, log });
			expect(entries).toEqual(['first', 'second']);
			expect(root.container.textContent).toBe('Ready');
		} finally {
			root.unmount();
		}
	});

	it('keeps a protected property read inside its authored exception handler', () => {
		const entries: string[] = [];
		const log = (value: string) => entries.push(value);
		const root = mount(GuardedTry, { item: undefined, log });
		try {
			root.update(GuardedTry, { item: { name: 'present' }, log });
			expect(entries).toEqual(['missing', 'present']);
		} finally {
			root.unmount();
		}
	});

	it('does not evaluate a getter before its guard permits the read', () => {
		let enabled = false;
		const item = {
			get name() {
				if (!enabled) throw new Error('guard bypassed');
				return 'present';
			},
		};
		const entries: string[] = [];
		const log = (value: string) => entries.push(value);
		const root = mount(GuardedGetter, { item, enabled, log });
		try {
			expect(entries).toEqual([]);
			enabled = true;
			root.update(GuardedGetter, { item, enabled, log });
			expect(entries).toEqual(['present']);
			enabled = false;
			root.update(GuardedGetter, { item, enabled, log });
			expect(entries).toEqual(['present']);
		} finally {
			root.unmount();
		}
	});

	it('leaves a guarded method getter unread until its condition allows the call', () => {
		let enabled = false;
		const calls: string[] = [];
		const item = {
			get run() {
				if (!enabled) throw new Error('method guard bypassed');
				return () => calls.push('called');
			},
		};
		const root = mount(GuardedMethod, { item, enabled });
		try {
			expect(calls).toEqual([]);
			enabled = true;
			root.update(GuardedMethod, { item, enabled });
			expect(calls).toEqual(['called']);
			enabled = false;
			root.update(GuardedMethod, { item, enabled });
			expect(calls).toEqual(['called']);
		} finally {
			root.unmount();
		}
	});

	it('retains guarded memo fallback and refreshes it when the receiver changes', () => {
		const root = mount(GuardedMemo, { item: undefined });
		try {
			expect(root.container.textContent).toBe('empty');
			root.update(GuardedMemo, { item: { name: 'present' } });
			expect(root.container.textContent).toBe('present');
			root.update(GuardedMemo, { item: undefined });
			expect(root.container.textContent).toBe('empty');
		} finally {
			root.unmount();
		}
	});
});
