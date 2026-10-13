import { describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import { mount } from './_helpers';
import { loadCompiledFixtureSource, loadPlainHookFixtureSource } from './_server-fixture';

const imports = `"use strong"; import { createElement, useMemo } from 'octane';`;
const calculations = `
  const manual = useMemo(() => props.value, [props.revision]);
  const inferred = useMemo(() => props.value);
  const always = useMemo(() => props.value, null);
  const ordered = useMemo((second, first) => first + ':' + second, [props.second, props.first]);
  const result = manual + '|' + inferred + '|' + always + '|' + ordered;
`;
const compiledSource = `${imports}
export function App(props) @{ ${calculations} <p>{result as string}</p> }`;
const plainSource = `${imports}
export function App(props) { ${calculations} return createElement('p', null, result); }`;

describe('Strong useMemo dependency control', () => {
	it.each([
		[
			'development compiled module',
			() =>
				loadCompiledFixtureSource(compiledSource, {
					id: '/src/StrongMemo.tsrx',
					mode: 'client',
					compileOptions: { dev: true, hmr: false },
				}),
		],
		[
			'production compiled module',
			() =>
				loadCompiledFixtureSource(compiledSource, {
					id: '/src/StrongMemo.tsrx',
					mode: 'client',
					compileOptions: { dev: false, hmr: false },
				}),
		],
		[
			'plain module',
			() =>
				loadPlainHookFixtureSource(plainSource, {
					id: '/src/StrongMemo.ts',
					inlineHookMemo: false,
				}),
		],
		[
			'plain module with inline hooks',
			() =>
				loadPlainHookFixtureSource(plainSource, {
					id: '/src/StrongMemo.ts',
					inlineHookMemo: true,
				}),
		],
	] as const)(
		'honors authored, inferred, and every-render dependencies in a %s',
		(_label, load) => {
			const { App } = load();
			const initial = { value: 'one', revision: 0, first: 'a', second: 'b' };
			const root = mount(App, initial);
			try {
				expect(root.find('p').textContent).toBe('one|one|one|a:b');
				root.update(App, { ...initial, value: 'two', second: 'c' });
				expect(root.find('p').textContent).toBe('one|two|two|a:c');
				root.update(App, { ...initial, value: 'three', revision: 1 });
				expect(root.find('p').textContent).toBe('three|three|three|a:b');
			} finally {
				root.unmount();
			}
		},
	);

	it.each([false, true])('renders authored dependency arguments on the server in dev=%s', (dev) => {
		const { App } = loadCompiledFixtureSource(compiledSource, {
			id: '/src/StrongMemo.tsrx',
			mode: 'server',
			compileOptions: { dev, hmr: false },
		});
		const container = document.createElement('div');
		container.innerHTML = renderToString(App, {
			value: 'one',
			revision: 0,
			first: 'a',
			second: 'b',
		}).html;
		expect(container.querySelector('p')?.textContent).toBe('one|one|one|a:b');
	});
});
