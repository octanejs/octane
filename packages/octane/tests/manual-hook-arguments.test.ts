import { describe, expect, it } from 'vitest';
import * as Server from '../src/server/index.js';
import { mount } from './_helpers.js';
import { loadCompiledFixtureSource, loadPlainHookFixtureSource } from './_server-fixture.js';

const providerSource = `
import { useState, useRef, useMemo, createSubSlot } from 'octane';
export type Preserve = <const T>(value: T) => T;
const child = createSubSlot({ global: false });
export function useManual(value, slot) {
  const ref = useRef({ value }, child(slot, 'ref'));
  const [count, update, read] = useState(1, child(slot, 'state'));
  const emptyRef = useRef(child(slot, 'empty-ref'));
  const [empty, , readEmpty] = useState(child(slot, 'empty-state'));
  const visible = useMemo(() => count, [count], child(slot, 'memo'));
  return { value: ref.current.value, count: visible, update, read, emptyRef: emptyRef.current,
    empty, readEmpty: readEmpty(), argc: arguments.length };
}
export const useBound = useManual.bind(null);
export function useForwarded(...args) { return useManual(...args); }
export function useRest(...args) {
  const slot = args.pop();
  const value = args[0];
  return useManual(value, slot);
}
export const useArrow = (value, slot) => useManual(value, slot);
export const useNamedExpression = function implementation(value, slot) { return useManual(value, slot); };
function useLocal(value, slot) { return useManual(value, slot); }
export const useExported = useLocal;
function makeLocalHook() {
  return useReturned;
  function useReturned(value, slot) { return useManual(value, slot); }
}
export const useReturned = makeLocalHook();
export function experimental_usePrefixed(value, slot) { return useManual(value, slot); }
export function UNSTABLE_usePrefixed(value, slot) { return useManual(value, slot); }
export function makeHook() {
  return function useFactory(value, slot) { return useManual(value, slot); };
}
export const useFactory = makeHook();
`;

function callerSource(dialect: 'ts' | 'tsrx', name: string) {
	const setup = `
    const left = useSelected(props.left);
    const right = useSelected(props.right);
    props.report(left, right);
    const update = () => left.update(left.read() + 1);
    const label = left.count + ':' + right.count;
  `;
	return `import { createElement } from 'octane';
    import { ${name} as useSelected } from './manual';
    function App(props) ${
			dialect === 'tsrx'
				? `@{ ${setup} <button onClick={update}>{label as string}</button> }`
				: `{ ${setup} return createElement('button', { onClick: update }, label); }`
		}
    export const fixture = { App };`;
}

describe('manual-provider hook arguments', () => {
	for (const mode of ['client', 'server'] as const) {
		for (const dialect of ['ts', 'tsrx'] as const) {
			it.each([
				'useManual',
				'useBound',
				'useForwarded',
				'useRest',
				'useArrow',
				'useNamedExpression',
				'useExported',
				'useReturned',
				'useFactory',
				'experimental_usePrefixed',
				'UNSTABLE_usePrefixed',
			])(`preserves nested manual slots through %s in ${mode} .${dialect}`, (name) => {
				const hmr = process.env.OCTANE_TEST_COMPILE_MODE !== 'prod';
				const provider = loadPlainHookFixtureSource(providerSource, {
					id: 'manual-provider.ts',
					mode,
					hmr,
					manualSlots: true,
					inlineHookMemo: true,
				});
				const runtimeModules = { './manual': provider };
				const source = callerSource(dialect, name);
				const {
					fixture: { App },
				} =
					dialect === 'ts'
						? loadPlainHookFixtureSource(source, {
								id: 'manual-caller.ts',
								mode,
								hmr,
								inlineHookMemo: true,
								runtimeModules,
							})
						: loadCompiledFixtureSource(source, {
								id: 'manual-caller.tsrx',
								mode,
								compileOptions: { hmr, dev: hmr },
								runtimeModules,
							});
				const left = Symbol('left value');
				const right = Symbol('right value');
				const reports: any[][] = [];
				const props = { left, right, report: (...values: any[]) => reports.push(values) };
				const check = (count: number) => {
					const [a, b] = reports.at(-1)!;
					expect([a.value, b.value]).toEqual([left, right]);
					expect([a.count, a.read(), b.count, b.read()]).toEqual([count, count, 1, 1]);
					expect([a.emptyRef, a.empty, a.readEmpty, b.emptyRef, b.empty, b.readEmpty]).toEqual(
						Array(6).fill(undefined),
					);
					expect([a.argc, b.argc]).toEqual([2, 2]);
				};
				if (mode === 'server') {
					expect(Server.renderToString(App, props).html).toContain('1:1');
					check(1);
				} else {
					const root = mount(App, props);
					try {
						check(1);
						root.click('button');
						check(2);
						expect(root.find('button').textContent).toBe('2:1');
					} finally {
						root.unmount();
					}
				}
			});
		}
	}
});
