import { describe, expect, it } from 'vitest';
import { createElement } from 'octane';
import { renderToString } from 'octane/server';
import { mount } from './_helpers';
import { loadCompiledFixtureSource, loadPlainHookFixtureSource } from './_server-fixture';

// Strong plain modules cannot build element descriptors, so their markup comes
// from this ordinary module.
const view = {
	paragraph: (text: string) => createElement('p', null, text),
	buttons: (handlers: Record<string, () => void>) =>
		createElement(
			'div',
			null,
			...Object.entries(handlers).map(([id, onClick]) =>
				createElement('button', { id, onClick }, id),
			),
		),
};
const runtimeModules = { './view': view };
const imports = `"use strong"; import { useMemo } from 'octane';`;
const calculations = `
  const manual = useMemo(() => props.value, [props.revision]);
  const inferred = useMemo(() => props.value);
  const always = useMemo(() => props.value, null);
  const ordered = useMemo((second, first) => first + ':' + second, [props.second, props.first]);
  const result = manual + '|' + inferred + '|' + always + '|' + ordered;
`;
const compiledSource = `${imports}
export function App(props) @{ ${calculations} <p>{result as string}</p> }`;
const plainSource = `${imports} import { paragraph } from './view';
export function App(props) { ${calculations} return paragraph(result); }`;

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
					runtimeModules,
				}),
		],
		[
			'plain module with inline hooks',
			() =>
				loadPlainHookFixtureSource(plainSource, {
					id: '/src/StrongMemo.ts',
					inlineHookMemo: true,
					runtimeModules,
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

const callbacks = `
  const manual = useCallback(() => props.report('manual:' + props.value), [props.revision]);
  const inferred = useCallback(() => props.report('inferred:' + props.value));
  const optional = useCallback(() => props.report('optional:' + props.value), undefined);
  const always = useCallback(() => props.report('always:' + props.value), null);
`;
const callbackSource = `"use strong"; import { useCallback } from 'octane';
export function App(props) @{ ${callbacks}
  <div>
    <button id="manual" onClick={manual}>Manual</button>
    <button id="inferred" onClick={inferred}>Inferred</button>
    <button id="optional" onClick={optional}>Optional</button>
    <button id="always" onClick={always}>Always</button>
  </div>
}`;
const callbackPlainSource = `"use strong"; import { useCallback } from 'octane'; import { buttons } from './view';
export function App(props) { ${callbacks} return buttons({ manual, inferred, optional, always }); }`;

describe('Strong useCallback dependency control', () => {
	it.each([
		[
			'development compiled module',
			() =>
				loadCompiledFixtureSource(callbackSource, {
					id: '/src/StrongCallbacks.tsrx',
					mode: 'client',
					compileOptions: { dev: true, hmr: false },
				}),
		],
		[
			'production compiled module',
			() =>
				loadCompiledFixtureSource(callbackSource, {
					id: '/src/StrongCallbacks.tsrx',
					mode: 'client',
					compileOptions: { dev: false, hmr: false },
				}),
		],
		[
			'plain module',
			() =>
				loadPlainHookFixtureSource(callbackPlainSource, {
					id: '/src/StrongCallbacks.ts',
					inlineHookMemo: false,
					runtimeModules,
				}),
		],
		[
			'plain module with inline hooks',
			() =>
				loadPlainHookFixtureSource(callbackPlainSource, {
					id: '/src/StrongCallbacks.ts',
					inlineHookMemo: true,
					runtimeModules,
				}),
		],
	] as const)('honors authored and inferred callback captures in a %s', (_label, load) => {
		const { App } = load();
		const received: string[] = [];
		const props = { value: 'one', revision: 0, report: (value: string) => received.push(value) };
		const root = mount(App, props);
		const click = () => {
			root.click('#manual');
			root.click('#inferred');
			root.click('#optional');
			root.click('#always');
		};
		try {
			click();
			expect(received.splice(0)).toEqual([
				'manual:one',
				'inferred:one',
				'optional:one',
				'always:one',
			]);
			root.update(App, { ...props, value: 'two' });
			click();
			expect(received.splice(0)).toEqual([
				'manual:one',
				'inferred:two',
				'optional:two',
				'always:two',
			]);
			root.update(App, { ...props, value: 'three', revision: 1 });
			click();
			expect(received).toEqual([
				'manual:three',
				'inferred:three',
				'optional:three',
				'always:three',
			]);
		} finally {
			root.unmount();
		}
	});

	it.each([
		[true, '[props.revision]', false],
		[false, '[props.revision]', false],
		[true, 'null', true],
		[false, 'null', true],
	])(
		'replaces capture-free aliased callback refs according to deps (dev=%s, deps=%s)',
		(dev, dependencies, everyRender) => {
			const received: string[] = [];
			const { App } = loadCompiledFixtureSource(
				`"use strong";
import { useCallback as useFn } from 'octane';
import { record } from './probe';
export function App(props) @{
  const element = useFn((node) => record(node ? 'attach' : 'detach'), ${dependencies});
  <p ref={element}>{props.label as string}</p>
}`,
				{
					id: '/src/AliasedStrongCallback.tsrx',
					mode: 'client',
					compileOptions: { dev, hmr: false },
					runtimeModules: { './probe': { record: (event: string) => received.push(event) } },
				},
			);
			const root = mount(App, { label: 'one', revision: 0 });
			try {
				expect(received.splice(0)).toEqual(['attach']);
				root.update(App, { label: 'two', revision: 0 });
				expect(root.find('p').textContent).toBe('two');
				expect(received.splice(0)).toEqual(everyRender ? ['detach', 'attach'] : []);
				root.update(App, { label: 'three', revision: 1 });
				expect(root.find('p').textContent).toBe('three');
				expect(received.splice(0)).toEqual(['detach', 'attach']);
			} finally {
				root.unmount();
			}
		},
	);
});
