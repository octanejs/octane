import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, flushSync, hydrateRoot, type Root } from '../src/runtime.js';
import { renderToString } from '../src/runtime.server.js';
import { mount } from './_helpers.js';
import { loadCompiledFixtureSource, loadPlainHookFixtureSource } from './_server-fixture.js';

// A plain module composes hooks it declares itself: a declaration, an arrow
// value, a hook passed as a parameter, and a value alias, each called twice.
// Every call site owns its own state, exactly as it would in a `.tsrx` module.
const HOOKS = `
import { useId, useMemo, useState } from 'octane';

function useCell(initial: string) {
	const [value, setValue] = useState(initial);
	const id = useId();
	const label = useMemo(() => value + '@' + id, [value, id]);
	return { label, set: setValue };
}

const useFlag = (initial: boolean) => {
	const [on, setOn] = useState(initial);
	return { on, toggle: () => setOn((previous) => !previous) };
};

const cell = useCell;

function useEither(useImpl: typeof useCell, left: string, right: string) {
	return [useImpl(left), useImpl(right)];
}

export function useBoard() {
	const direct = [useCell('a'), useCell('b')];
	const passed = useEither(useCell, 'c', 'd');
	const aliased = [cell('e'), cell('f')];
	return { cells: [...direct, ...passed, ...aliased], flags: [useFlag(true), useFlag(false)] };
}
`;

const APP = `
import { useBoard } from './hooks';

export function App() @{
	const { cells, flags } = useBoard();
	<div>
		<p id="cells">{cells.map((entry) => entry.label).join(' ') as string}</p>
		<p id="flags">{flags.map((flag) => String(flag.on)).join(' ') as string}</p>
		<button id="set-cells" onClick={() => [1, 3, 5].forEach((index) => cells[index].set('changed'))}>{'set'}</button>
		<button id="toggle-first" onClick={() => flags[0].toggle()}>{'toggle'}</button>
	</div>
}
`;

const MODES = [
	{ dev: false, inlineHookMemo: false },
	{ dev: false, inlineHookMemo: true },
	{ dev: true, inlineHookMemo: false },
];

function load(mode: 'client' | 'server', dev: boolean, inlineHookMemo: boolean) {
	const hooks = loadPlainHookFixtureSource(HOOKS, {
		id: '/src/local-hooks.ts',
		mode,
		hmr: dev,
		inlineHookMemo,
	});
	return loadCompiledFixtureSource(APP, {
		id: '/src/local-hooks-app.tsrx',
		mode,
		compileOptions: { hmr: false, dev },
		runtimeModules: { './hooks': hooks },
	}).App;
}

const INITIAL = { values: ['a', 'b', 'c', 'd', 'e', 'f'], ids: 6 };
// Updating the second call of each pair must leave its sibling untouched.
const CHANGED = ['a', 'changed', 'c', 'changed', 'e', 'changed'];

// Each label is `value@id`; ids must be distinct for distinct call sites.
function readCells(text: string | null | undefined) {
	const labels = (text ?? '').split(' ');
	return {
		values: labels.map((label) => label.split('@')[0]),
		ids: new Set(labels.map((label) => label.split('@')[1])).size,
	};
}

describe('module-declared custom hooks in plain modules', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it.each(MODES)('keeps each call site independent (%j)', ({ dev, inlineHookMemo }) => {
		const root = mount(load('client', dev, inlineHookMemo));
		try {
			expect(readCells(root.find('#cells').textContent)).toEqual(INITIAL);
			expect(root.find('#flags').textContent).toBe('true false');
			root.click('#set-cells');
			expect(readCells(root.find('#cells').textContent).values).toEqual(CHANGED);
			root.click('#toggle-first');
			expect(root.find('#flags').textContent).toBe('false false');
		} finally {
			root.unmount();
		}
	});

	it.each(MODES)(
		'hydrates the server state of every call site (%j)',
		async ({ dev, inlineHookMemo }) => {
			const server = load('server', dev, inlineHookMemo);
			const client = load('client', dev, inlineHookMemo);
			const container = document.createElement('div');
			document.body.append(container);
			const html = renderToString(server, undefined).html;
			container.innerHTML = html;
			const serverCells = container.querySelector('#cells')!;
			expect(readCells(serverCells.textContent)).toEqual(INITIAL);
			expect(container.querySelector('#flags')!.textContent).toBe('true false');
			const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
			const recoverable: unknown[] = [];
			let root: Root | undefined;
			try {
				await act(() => {
					root = hydrateRoot(container, client, undefined, {
						onRecoverableError: (error) => recoverable.push(error),
					});
				});
				expect(errors.mock.calls).toEqual([]);
				expect(recoverable).toEqual([]);
				expect(container.innerHTML).toBe(html);
				expect(container.querySelector('#cells')).toBe(serverCells);
				flushSync(() => (container.querySelector('#set-cells') as HTMLButtonElement).click());
				expect(readCells(serverCells.textContent).values).toEqual(CHANGED);
			} finally {
				root?.unmount();
				container.remove();
			}
		},
	);

	it.each(
		(['client', 'server'] as const).flatMap((mode) =>
			[false, true].map((inlineHookMemo) => ({ mode, inlineHookMemo })),
		),
	)(
		'evaluates hook-named calls made while the module initializes (%j)',
		({ mode, inlineHookMemo }) => {
			const module = loadPlainHookFixtureSource(
				`
			import { useMemo } from 'octane';
			import { useImportedDefault } from './defaults';
			function useLocalDefault() { return 'local'; }
			export const defaults = [useImportedDefault(), useLocalDefault()];
			export function useValue(value: string) { return useMemo(() => value, [value]); }
		`,
				{
					id: '/src/module-scope-hooks.ts',
					mode,
					inlineHookMemo,
					runtimeModules: { './defaults': { useImportedDefault: () => 'imported' } },
				},
			);
			expect(module.defaults).toEqual(['imported', 'local']);
		},
	);
});
