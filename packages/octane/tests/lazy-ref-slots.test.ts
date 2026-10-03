import { describe, expect, it, vi } from 'vitest';
import * as Server from '../src/server/index.js';
import { mount } from './_helpers.js';
import { loadCompiledFixtureSource, loadPlainHookFixtureSource } from './_server-fixture.js';

function source(dialect: 'ts' | 'tsrx', custom: boolean) {
	const setup = `
		const first = ${custom ? 'useCell(props.first)' : 'useLazyRef(props.first)'};
		const args = [props.second];
		const second = ${custom ? 'useCell(props.second)' : 'Octane.useLazyRef(...args)'};
		const stored = useRef(props.callback);
		const [count, setCount] = useState(0);
		props.report([first.current, second.current, stored.current]);
		const increment = () => setCount(count + 1);
	`;
	return `
		import { createElement, useRef, useLazyRef, useState } from 'octane';
		import * as Octane from 'octane';
		${custom ? 'function useCell(factory) { return useLazyRef(factory); }' : ''}
		export function App(props) ${
			dialect === 'tsrx'
				? `@{ ${setup} <button onClick={increment}>{count as string}</button> }`
				: `{ ${setup} return createElement('button', { onClick: increment }, count); }`
		}
	`;
}

describe('lazy ref compiler slots', () => {
	for (const mode of ['client', 'server'] as const) {
		for (const dialect of ['ts', 'tsrx'] as const) {
			it.each([
				[false, false],
				[false, true],
				[true, false],
				[true, true],
			])(
				`preserves calls in ${mode} .${dialect} (custom=%s, inline=%s)`,
				(custom, inlineHookMemo) => {
					const id = `lazy-ref-slots.${dialect}`;
					const { App } =
						dialect === 'ts'
							? loadPlainHookFixtureSource(source(dialect, custom), { id, mode, inlineHookMemo })
							: loadCompiledFixtureSource(source(dialect, custom), {
									id,
									mode,
									compileOptions: { inlineHookMemo, hmr: false, dev: false },
								});
					const firstValue = {};
					const secondValue = {};
					const first = vi.fn(() => firstValue);
					const second = vi.fn(() => secondValue);
					const callback = vi.fn();
					const report = vi.fn();
					const props = { first, second, callback, report };
					if (mode === 'server') {
						Server.renderToString(App, props);
					} else {
						const root = mount(App, props);
						try {
							root.click('button');
						} finally {
							root.unmount();
						}
					}
					expect(report).toHaveBeenLastCalledWith([firstValue, secondValue, callback]);
					expect(first).toHaveBeenCalledTimes(1);
					expect(second).toHaveBeenCalledTimes(1);
					expect(callback).not.toHaveBeenCalled();
				},
			);
		}
	}

	// An empty call keeps the factory position, as useState and useRef keep their
	// initializer position, so the missing factory fails as a missing factory
	// rather than as a missing compiler slot.
	it.each(['ts', 'tsrx'] as const)(
		'reserves the factory position in an empty .%s call',
		(dialect) => {
			const source = `import { createElement, useLazyRef } from 'octane';
			export function App() ${
				dialect === 'tsrx'
					? `@{ useLazyRef(); <p /> }`
					: `{ useLazyRef(); return createElement('p'); }`
			}`;
			const id = `lazy-ref-empty.${dialect}`;
			const { App } =
				dialect === 'ts'
					? loadPlainHookFixtureSource(source, { id, mode: 'client', inlineHookMemo: false })
					: loadCompiledFixtureSource(source, {
							id,
							mode: 'client',
							compileOptions: { hmr: false, dev: false },
						});
			expect(() => mount(App)).toThrow(TypeError);
		},
	);
});
