import { describe, expect, it, vi } from 'vitest';
import * as Client from '../src/runtime.js';
import * as Server from '../src/runtime.server.js';
import * as Universal from '../src/universal-native.js';
import { renderToString } from '../src/server/index.js';
import { mount } from './_helpers.js';
import { loadCompiledFixtureSource, loadPlainHookFixtureSource } from './_server-fixture.js';

const automaticSource = `
  import { useState, useRef } from 'octane';
  export const defaultValue = Symbol('foreign default');
  export function useAutomatic(value = defaultValue) {
    const [state] = useState(value);
    const ref = useRef(value);
    return { state, ref: ref.current, argc: arguments.length };
  }
`;
const manualSource = `
  import { useState, useRef, withSlot, createSubSlot } from 'octane';
  import { useAutomatic } from './automatic';
  const child = createSubSlot({ global: false });
  export function useNested(value, slot) {
    return { value: useRef(value, child(slot, 'value')).current, argc: arguments.length };
  }
  export function useThrow(value, slot) {
    useRef(child(slot, 'empty'));
    throw new Error('expected provider failure');
  }
  export function useManual(value, slot) {
    const nested = useNested(value, child(slot, 'nested'));
    const before = withSlot(child(slot, 'before'), useAutomatic, value);
    try { withSlot(child(slot, 'throw'), useThrow, value); } catch {}
    const after = withSlot(child(slot, 'after'), useAutomatic, value);
    const defaulted = withSlot(child(slot, 'defaulted'), useAutomatic);
    const [empty] = useState(child(slot, 'empty'));
    return { nested, before, after, defaulted, empty, argc: arguments.length };
  }
`;

interface AutomaticResult {
	state: symbol;
	ref: symbol;
	argc: number;
}
interface Report {
	caught: boolean;
	manual: {
		nested: { value: symbol; argc: number };
		before: AutomaticResult;
		after: AutomaticResult;
		defaulted: AutomaticResult;
		empty: unknown;
		argc: number;
	};
	after: AutomaticResult;
}

describe('manual provider context', () => {
	for (const mode of ['client', 'server', 'universal'] as const) {
		it.each(['expression', 'declaration'] as const)(
			`restores enclosing call sites after a %s provider first throws inside a nested call in ${mode}`,
			async (form) => {
				vi.resetModules();
				const runtime =
					mode === 'client'
						? await import('../src/runtime.js')
						: mode === 'server'
							? await import('../src/runtime.server.js')
							: await import('../src/universal-native.js');
				const outer = Symbol('outer call');
				const inner = Symbol('inner call');
				const value = Symbol('authored value');
				const failure = Symbol('throw');
				function original(...args: unknown[]) {
					if (args[0] === failure) throw new Error('expected provider failure');
					return args;
				}
				let provider!: (...args: unknown[]) => unknown[];
				runtime.withSlot(outer, () => {
					runtime.withSlot(inner, () => {
						provider =
							form === 'expression'
								? runtime.manualHook(original)
								: function useCreated(this: unknown, ..._args: unknown[]) {
										return runtime.invokeManualHook(original, this, arguments);
									};
						expect(() => provider(failure)).toThrow('expected provider failure');
						expect(provider(value)).toEqual([value, inner]);
					});
					expect(provider(value)).toEqual([value, outer]);
				});
				expect(provider(value)).toEqual([value]);
			},
		);
	}

	for (const mode of ['client', 'server'] as const) {
		for (const dialect of ['ts', 'tsrx'] as const) {
			it(`restores automatic arguments and nested explicit slots after throws in ${mode} .${dialect}`, () => {
				const hmr = process.env.OCTANE_TEST_COMPILE_MODE !== 'prod';
				const automatic = loadPlainHookFixtureSource(automaticSource, {
					id: 'automatic-provider.ts',
					mode,
					hmr,
					inlineHookMemo: true,
				});
				const manual = loadPlainHookFixtureSource(manualSource, {
					id: 'manual-context-provider.ts',
					mode,
					hmr,
					manualSlots: true,
					inlineHookMemo: true,
					runtimeModules: { './automatic': automatic },
				});
				const setup = `
          let caught = false;
          try { useThrow(props.value); } catch { caught = true; }
          const manual = useManual(props.value);
          const after = useAutomatic(props.value);
          props.report({ caught, manual, after });
        `;
				const source = `
          import { createElement } from 'octane';
          import { useManual, useThrow } from './manual';
          import { useAutomatic } from './automatic';
          function App(props) ${
						dialect === 'tsrx'
							? `@{ ${setup} <div>complete</div> }`
							: `{ ${setup} return createElement('div', null, 'complete'); }`
					}
          export const fixture = { App };
        `;
				const runtimeModules = { './manual': manual, './automatic': automatic };
				const {
					fixture: { App },
				} =
					dialect === 'ts'
						? loadPlainHookFixtureSource(source, {
								id: 'manual-context-caller.ts',
								mode,
								hmr,
								inlineHookMemo: true,
								runtimeModules,
							})
						: loadCompiledFixtureSource(source, {
								id: 'manual-context-caller.tsrx',
								mode,
								compileOptions: { hmr, dev: hmr },
								runtimeModules,
							});
				const value = Symbol('authored initial');
				let report!: Report;
				const props = {
					value,
					report: (next: Report) => {
						report = next;
					},
				};
				const check = () => {
					expect(report.caught).toBe(true);
					expect(report.manual.nested).toEqual({ value, argc: 2 });
					expect(report.manual.argc).toBe(2);
					expect(report.manual.empty).toBeUndefined();
					for (const actual of [report.manual.before, report.manual.after, report.after]) {
						expect(actual).toEqual({ state: value, ref: value, argc: 1 });
					}
					expect(report.manual.defaulted).toEqual({
						state: automatic.defaultValue,
						ref: automatic.defaultValue,
						argc: 0,
					});
				};
				if (mode === 'server') {
					expect(renderToString(App, props).html).toContain('complete');
					check();
				} else {
					const root = mount(App, props);
					try {
						check();
						root.update(App, props);
						check();
					} finally {
						root.unmount();
					}
				}
			});
		}
	}

	for (const [name, runtime] of [
		['client', Client],
		['server', Server],
		['universal', Universal],
	] as const) {
		it.each(['expression', 'declaration'] as const)(
			`forwards omitted, explicit undefined and variadic Symbol arguments through a %s provider in ${name}`,
			(form) => {
				const value = Symbol('authored tail');
				const slot = Symbol('provider slot');
				const receiver = { label: 'owner' };
				function original(this: unknown, ...args: unknown[]) {
					return { args, receiver: this };
				}
				const provider =
					form === 'expression'
						? runtime.manualHook(original)
						: function useVariadic(this: unknown, ..._args: unknown[]) {
								return runtime.invokeManualHook(original, this, arguments);
							};
				for (const args of [
					[],
					[value],
					[undefined, value],
					[1, 2, value],
					[1, 2, 3, value],
					[1, 2, 3, 4, value],
					[1, 2, 3, 4, 5, value],
				]) {
					expect(runtime.withSlot(slot, provider.bind(receiver), ...args)).toEqual({
						args: [...args, slot],
						receiver,
					});
					expect(provider.apply(receiver, args)).toEqual({ args, receiver });
				}
			},
		);

		it(`preserves receiver, name, length and bound/forwarded invocation in ${name}`, () => {
			function useProvider(this: { label: string }, value: symbol, slot?: symbol) {
				return { receiver: this.label, value, slot, argc: arguments.length };
			}
			const provider = runtime.manualHook(useProvider);
			const receiver = { label: 'owner' };
			const value = Symbol('data');
			const slot = Symbol('site');
			expect(provider.name).toBe(useProvider.name);
			expect(provider.length).toBe(useProvider.length);
			expect(runtime.withSlot(slot, provider.bind(receiver), value)).toEqual({
				receiver: 'owner',
				value,
				slot,
				argc: 2,
			});
			expect(
				runtime.withSlot(slot, (...args: [symbol]) => provider.apply(receiver, args), value),
			).toEqual({
				receiver: 'owner',
				value,
				slot,
				argc: 2,
			});
			expect(provider.call(receiver, value, slot)).toEqual({
				receiver: 'owner',
				value,
				slot,
				argc: 2,
			});
		});
	}
});
