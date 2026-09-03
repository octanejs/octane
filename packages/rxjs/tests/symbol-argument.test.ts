import { describe, expect, it } from 'vitest';
import { of } from 'rxjs';
import { bind } from '@octanejs/rxjs';
import { mount, nextPaint } from './_helpers';
import {
	loadCompiledFixtureSource,
	loadPlainHookFixtureSource,
} from '../../octane/tests/_server-fixture';

describe('bound observable Symbol arguments', () => {
	for (const dialect of ['ts', 'tsrx'] as const) {
		it.each([false, true])(
			`preserves the factory argument from .${dialect} (inline=%s)`,
			async (inlineHookMemo) => {
				const observed: unknown[] = [];
				const [useKey] = bind((key: symbol) => {
					observed.push(key);
					return of(String(key));
				}, 'pending');
				const setup = `import { createElement } from 'octane'; import { useKey } from './bound-symbol';`;
				const source =
					dialect === 'ts'
						? `${setup} export function App(props) { const value = useKey(props.value); return createElement('output', null, value); }`
						: `${setup} export function App(props) @{ const value = useKey(props.value); <output>{value as string}</output> }`;
				const runtimeModules = { './bound-symbol': { useKey } };
				const { App } =
					dialect === 'ts'
						? loadPlainHookFixtureSource(source, {
								id: 'bound-symbol.ts',
								inlineHookMemo,
								runtimeModules,
							})
						: loadCompiledFixtureSource(source, {
								id: 'bound-symbol.tsrx',
								mode: 'client',
								compileOptions: { inlineHookMemo },
								runtimeModules,
							});
				const first = Symbol('first');
				const next = Symbol('next');
				const root = mount(App, { value: first });
				try {
					await nextPaint();
					expect(root.find('output').textContent).toBe(String(first));
					expect(observed).toContain(first);
					root.update(App, { value: next });
					await nextPaint();
					expect(root.find('output').textContent).toBe(String(next));
					expect(observed).toContain(next);
					expect(observed).not.toContain(undefined);
				} finally {
					root.unmount();
				}
			},
		);
	}
});
