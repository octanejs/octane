import { describe, expect, it } from 'vitest';
import * as Server from '../src/server/index.js';
import { slotHooks } from '../src/compiler/slot-hooks.js';
import { mount } from './_helpers.js';
import { loadCompiledFixtureSource, loadPlainHookFixtureSource } from './_server-fixture.js';

function source(dialect: 'ts' | 'tsrx') {
	const setup = `
		const [empty, , getEmpty] = useState(...props.empty);
		const emptyRef = Octane.useRef(...props.empty);
		const [state, setState, getState] = Octane.useState(...props.values);
		const ref = useRef(...props.values);
		const nested = useLocal();
		const explicit = useLocal('provided', ...props.rest);
		const foreign = useOptional();
		const method = props.api.useOptional(...props.empty);
		const memo = useMemo(() => String(state), [state]);
		props.report({ empty, getEmpty: getEmpty(), emptyRef: emptyRef.current,
			state, getState: getState(), ref: ref.current, nested, explicit, foreign, method });
		const update = () => setState(props.next);
	`;
	return `
		import { createElement, useState, useRef, useMemo } from 'octane';
		import * as Octane from 'octane';
		import { useOptional } from './foreign';
		function useLocal(value = 'local', ...rest) {
			const [empty, , getEmpty] = useState();
			const ref = useRef();
			return [value, rest.length, arguments.length, empty, getEmpty(), ref.current];
		}
		export function App(props) ${
			dialect === 'tsrx'
				? `@{ ${setup} <button onClick={update}>{memo as string}</button> }`
				: `{ ${setup} return createElement('button', { onClick: update }, memo); }`
		}
	`;
}

describe('authored hook argument lists', () => {
	it('initializes omitted state independently of a local undefined binding', () => {
		const code = `import { useState } from 'octane';
			function useOptional(value: number) {
				const undefined = value;
				const [state, update, getState] = useState<number>();
				return { state, update, getState, shadow: undefined };
			}

			export function App({ value }: { value: number }) @{
				const { state, update, getState, shadow } = useOptional(value);
				<button onClick={() => update(2)}>
					{String(state) + ':' + String(getState()) + ':' + String(shadow)}
				</button>
			}`;
		const id = 'omitted-state-initializer.tsrx';
		const props = { value: 99 };
		const server = loadCompiledFixtureSource(code, { id, mode: 'server' });
		expect(Server.renderToString(server.App, props).html).toContain(
			'<button>undefined:undefined:99</button>',
		);
		const client = loadCompiledFixtureSource(code, { id, mode: 'client' });
		const view = mount(client.App, props);
		try {
			expect(view.find('button').textContent).toBe('undefined:undefined:99');
			view.click('button');
			expect(view.find('button').textContent).toBe('2:2:99');
		} finally {
			view.unmount();
		}
	});

	it.each([false, true])(
		'preserves manually supplied spread slots (inline=%s)',
		(inlineHookMemo) => {
			const code = slotHooks(
				`import {useState, useRef} from 'octane';
			export function useManual(args) {
				const [state, , read] = useState(...args);
				return [state, read(), useRef(...args)];
			}`,
				'manual-spread.ts',
				{ manualSlots: true, inlineHookMemo },
			)!.code;
			expect(code).toContain('_$__useStateWithGetter(...args)');
			expect(code).toContain('useRef(...args)');
			expect(code).not.toMatch(/withSlot|hookSlots|undefined,/);
		},
	);

	for (const mode of ['client', 'server'] as const) {
		for (const dialect of ['ts', 'tsrx'] as const) {
			it.each([false, true])(
				`preserves empty spreads and default/rest arguments in ${mode} .${dialect} (inline=%s)`,
				(inlineHookMemo) => {
					const runtimeModules = {
						'./foreign': {
							useOptional(value = 'foreign') {
								return [value, arguments.length];
							},
						},
					};
					const code = source(dialect);
					const id = `hook-call-arguments.${dialect}`;
					const { App } =
						dialect === 'ts'
							? loadPlainHookFixtureSource(code, { id, mode, inlineHookMemo, runtimeModules })
							: loadCompiledFixtureSource(code, {
									id,
									mode,
									compileOptions: { inlineHookMemo },
									runtimeModules,
								});
					const initial = Symbol('initial');
					const next = Symbol('next');
					const reports: Array<Record<string, unknown>> = [];
					const props = {
						empty: [],
						values: [initial],
						next,
						rest: [1, 2],
						api: {
							label: 'method',
							useOptional(value = 'default') {
								return [this.label, value, arguments.length];
							},
						},
						report: (value: Record<string, unknown>) => reports.push(value),
					};
					const check = (state: symbol) =>
						expect(reports.at(-1)).toEqual({
							empty: undefined,
							getEmpty: undefined,
							emptyRef: undefined,
							state,
							getState: state,
							ref: initial,
							nested: ['local', 0, 0, undefined, undefined, undefined],
							explicit: ['provided', 2, 3, undefined, undefined, undefined],
							foreign: ['foreign', 0],
							method: ['method', 'default', 0],
						});
					if (mode === 'server') {
						expect(Server.renderToString(App, props).html).toContain('Symbol(initial)');
						check(initial);
					} else {
						const root = mount(App, props);
						try {
							check(initial);
							root.click('button');
							check(next);
						} finally {
							root.unmount();
						}
					}
				},
			);
		}
	}
});
