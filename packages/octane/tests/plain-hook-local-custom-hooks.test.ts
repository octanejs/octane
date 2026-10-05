import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, flushSync, hydrateRoot, type Root } from '../src/runtime.js';
import { renderToString } from '../src/runtime.server.js';
import { slotHooks } from '../src/compiler/slot-hooks.js';
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

// Calls whose boundary the plain pass omits, and calls that keep it because a
// hook's execution could reach the same call again on the same path. Each
// shape renders two cells whose state must stay separate.
const CELL = `import { useState } from 'octane';
type Cell = readonly [string, (value: string) => void];`;
const OMITTED_BOUNDARY_SHAPES: Record<string, { source: string; boundaries: number }> = {
	'a hook that reads no slot': {
		source: `${CELL}
function useLabel(value: string) {
	return value;
}
function useCell(initial: string): Cell {
	const [value, setValue] = useState(useLabel(initial));
	return [value, setValue];
}
export default function usePair(): Cell[] {
	return [useCell('d1'), useCell('d0')];
}`,
		boundaries: 2,
	},
	'the only call of a hook, made by another hook': {
		source: `${CELL}
function useInner(initial: string): Cell {
	const [value, setValue] = useState(initial);
	return [value, setValue];
}
function useOuter(initial: string) {
	return useInner(initial);
}
export default function usePair(): Cell[] {
	return [useOuter('d1'), useOuter('d0')];
}`,
		boundaries: 2,
	},
	'only calls of two hooks that call each other': {
		source: `${CELL}
function useLevel(depth: number): Cell[] {
	const [value, setValue] = useState('d' + depth);
	return depth > 0 ? [[value, setValue], ...useNext(depth - 1)] : [[value, setValue]];
}
function useNext(depth: number) {
	return useLevel(depth);
}
export default useLevel;`,
		boundaries: 2,
	},
	'the only call of a hook whose caller escapes as a value': {
		source: `${CELL}
function useInner(depth: number, again: (depth: number) => Cell[]): Cell[] {
	const [value, setValue] = useState('d' + depth);
	return depth > 0 ? [[value, setValue], ...again(depth - 1)] : [[value, setValue]];
}
function useLevel(depth: number): Cell[] {
	return useInner(depth, useLevel);
}
export default useLevel;`,
		boundaries: 1,
	},
};

const PAIR = `
import usePair from './hooks';

export function Pair() @{
	const [first, second] = usePair(1);
	<div>
		<button onClick={() => first[1]('updated')}>{first[0] as string}</button>
		<output>{second[0] as string}</output>
	</div>
}
`;

function loadPair(
	source: string,
	mode: 'client' | 'server',
	dev: boolean,
	inlineHookMemo: boolean,
) {
	return loadCompiledFixtureSource(PAIR, {
		id: '/src/pair.tsrx',
		mode,
		compileOptions: { hmr: false, dev },
		runtimeModules: {
			'./hooks': loadPlainHookFixtureSource(source, {
				id: '/src/pair-hooks.ts',
				mode,
				hmr: dev,
				inlineHookMemo,
			}),
		},
	}).Pair;
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

	for (const [shape, { source, boundaries }] of Object.entries(OMITTED_BOUNDARY_SHAPES)) {
		it.each(MODES)(`keeps state separate for ${shape} (%j)`, ({ dev, inlineHookMemo }) => {
			const load = (mode: 'client' | 'server') => loadPair(source, mode, dev, inlineHookMemo);
			expect(renderToString(load('server'), undefined).html).toBe(
				'<div><button>d1</button><output>d0</output></div>',
			);
			const root = mount(load('client'));
			try {
				expect(root.container.textContent).toBe('d1d0');
				root.click('button');
				expect(root.container.textContent).toBe('updatedd0');
			} finally {
				root.unmount();
			}
		});

		it(`gives ${shape} only the boundaries a repeated path needs`, () => {
			const code = slotHooks(source, '/src/pair-hooks.ts', { dev: false, hmr: false })!.code;
			expect(code.match(/withSlot\(/g)?.length ?? 0).toBe(boundaries);
		});
	}

	for (const read of ['source.cell', 'source?.cell'] as const) {
		const source = `${CELL}
class CellSource {
	constructor(readonly initial: string) {}
	get cell(): Cell {
		const [value, setValue] = useState(this.initial);
		return [value, setValue];
	}
}
function useCell(source: CellSource): Cell {
	return ${read};
}
export default function usePair(): Cell[] {
	return [useCell(new CellSource('d1')), useCell(new CellSource('d0'))];
}`;
		it.each(MODES)(
			`hydrates and updates independent state read through ${read} (%j)`,
			async ({ dev, inlineHookMemo }) => {
				const container = document.createElement('div');
				document.body.append(container);
				const server = loadPair(source, 'server', dev, inlineHookMemo);
				const client = loadPair(source, 'client', dev, inlineHookMemo);
				container.innerHTML = renderToString(server, undefined).html;
				const button = container.querySelector('button')!;
				const output = container.querySelector('output')!;
				expect(container.textContent).toBe('d1d0');
				const recoverable: unknown[] = [];
				let root: Root | undefined;
				try {
					await act(() => {
						root = hydrateRoot(container, client, undefined, {
							onRecoverableError: (error) => recoverable.push(error),
						});
					});
					expect(recoverable).toEqual([]);
					expect(container.textContent).toBe('d1d0');
					expect(container.querySelector('button')).toBe(button);
					expect(container.querySelector('output')).toBe(output);
					flushSync(() => button.click());
					expect(container.textContent).toBe('updatedd0');
				} finally {
					root?.unmount();
					container.remove();
				}
			},
		);
	}

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
