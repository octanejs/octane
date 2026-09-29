import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'octane/server';
import { flushSync, hydrateRoot } from '../src/index.js';
import { mount } from './_helpers.js';
import { loadCompiledFixtureSource, type CompiledFixtureModule } from './_server-fixture.js';

// A list row, component, or branch that renders exactly one element may use
// that element as its own boundary. A host the compiler builds imperatively
// (an explicit key, `noscript`, or a tree the HTML parser would repair) or
// hoists into the document head never renders as that one element in place,
// so these shapes must reorder, remove, and hydrate like any other range.

const mode = process.env.OCTANE_TEST_COMPILE_MODE === 'prod' ? 'prod' : 'dev';
const ROW_MODULE = './row.tsrx';

interface Program {
	/** The module that exports `App`. */
	app: string;
	/** An optional sibling module that `app` imports from `./row.tsrx`. */
	row?: string;
}

function compileModule(
	source: string,
	id: string,
	server: boolean,
	runtimeModules?: Record<string, CompiledFixtureModule>,
) {
	return loadCompiledFixtureSource(source, {
		id,
		mode: server ? 'server' : 'client',
		compileOptions: { dev: mode === 'dev', hmr: false },
		runtimeModules,
	});
}

function load(program: Program, server: boolean) {
	const runtimeModules =
		program.row === undefined
			? undefined
			: { [ROW_MODULE]: compileModule(program.row, 'row.tsrx', server) };
	return compileModule(program.app, 'single-root-imperative-hosts.tsrx', server, runtimeModules)
		.App;
}

interface Session {
	container: HTMLElement;
	render(props: Record<string, unknown>): void;
	/** Elements matching `selector` in the server HTML, before hydration. */
	serverNodes: Element[];
	recovered: unknown[];
	/** Hydration mismatch diagnostics printed during the session. */
	mismatches(): string[];
}

const cleanups: (() => void)[] = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function start(
	kind: 'mount' | 'hydrate',
	program: Program,
	props: Record<string, unknown>,
	selector: string,
): Session {
	const error = vi.spyOn(console, 'error').mockImplementation(() => {});
	cleanups.push(() => error.mockRestore());
	const mismatches = () =>
		error.mock.calls
			.map((call) => String(call[0]))
			.filter((text) => /hydration mismatch at/.test(text));
	const App = load(program, false);
	const recovered: unknown[] = [];
	if (kind === 'mount') {
		const r = mount(App, props);
		cleanups.push(() => r.unmount());
		return {
			container: r.container,
			render: (next) => r.update(App, next),
			serverNodes: [],
			recovered,
			mismatches,
		};
	}
	const container = document.createElement('div');
	const { html, head } = renderToString(load(program, true), props, { headChannel: 'separate' });
	container.innerHTML = html;
	document.head.insertAdjacentHTML('beforeend', head ?? '');
	document.body.append(container);
	const serverNodes = [...document.querySelectorAll(selector)];
	const root = hydrateRoot(container, App, props, {
		onRecoverableError: (e) => recovered.push(e),
	});
	cleanups.push(() => {
		root.unmount();
		container.remove();
	});
	flushSync(() => {});
	return {
		container,
		render: (next) => flushSync(() => root.render(App, next)),
		serverNodes,
		recovered,
		mismatches,
	};
}

const rows = (ids: number[]) => ids.map((id) => ({ id }));

/** Nodes between a host's static `<i>` head and `<span>` tail children. */
function between(container: Element, host: string): ChildNode[] {
	const tail = container.querySelector(`${host} > span`);
	const nodes: ChildNode[] = [];
	for (let node = container.querySelector(`${host} > i`)!.nextSibling; node !== tail;) {
		nodes.push(node!);
		node = node!.nextSibling;
	}
	return nodes;
}

const content = (nodes: ChildNode[]) => nodes.filter((node) => node.nodeType !== Node.COMMENT_NODE);

/** Asserts node identity; `toEqual` would accept structurally equal copies. */
function expectSameNodes(actual: Node[], expected: Node[]) {
	expect(actual.length).toBe(expected.length);
	actual.forEach((node, index) => expect(node).toBe(expected[index]));
}

function list(item: string, prelude = '') {
	return `${prelude}
		export function App({rows}) @{ <div class="list"><i>head</i>
			@for (const row of rows; key row.id) { ${item} }
			<span>tail</span>
		</div> }`;
}

const keyedRow = `function Row({id}) @{ <p key={id} class="row">{String(id)}</p> }`;

interface ListShape {
	program: Program;
	/** Why hydration cannot adopt this shape's server rows; it is only mounted. */
	mountOnly?: string;
}

const listShapes: Record<string, ListShape> = {
	'a noscript row': { program: { app: list(`<noscript class="row">{String(row.id)}</noscript>`) } },
	'a row root keyed like its row': {
		program: { app: list(`<p key={row.id} class="row">{String(row.id)}<b class="mark"/></p>`) },
	},
	'a keyed @if arm': {
		program: {
			app: list(`@if (row.id % 2) { <p key={'o' + row.id} class="row">{String(row.id)}</p> }
				@else { <p class="row">{String(row.id)}</p> }`),
		},
	},
	'a keyed component root': { program: { app: list(`<Row id={row.id}/>`, keyedRow) } },
	'a noscript component root': {
		program: {
			app: list(
				`<Row id={row.id}/>`,
				`function Row({id}) @{ <noscript class="row">{String(id)}</noscript> }`,
			),
		},
	},
	'a component with a keyed @if arm': {
		program: {
			app: list(
				`<Row id={row.id}/>`,
				`function Row({id}) @{ @if (id % 2) { <p key={'o' + id} class="row">{String(id)}</p> }
					@else { <p class="row">{String(id)}</p> } }`,
			),
		},
	},
	'a component with a keyed @switch arm': {
		program: {
			app: list(
				`<Row id={row.id}/>`,
				`function Row({id}) @{ @switch (id % 2) {
					@case 1: { <p key={'o' + id} class="row">{String(id)}</p> }
					@default: { <p class="row">{String(id)}</p> }
				} }`,
			),
		},
	},
	'a component whose @if arm is a keyed-root component': {
		program: {
			app: list(
				`<Row id={row.id}/>`,
				`function Leaf({id}) @{ <p key={id} class="row">{String(id)}</p> }
				function Row({id}) @{ @if (id % 2) { <Leaf id={id}/> } @else { <p class="row">{String(id)}</p> } }`,
			),
		},
	},
	'an imported keyed component root': {
		program: {
			app: list(`<Row id={row.id}/>`, `import { Row } from '${ROW_MODULE}';`),
			row: `export ${keyedRow}`,
		},
	},
	'a keyed return-JSX component root': {
		program: {
			app: list(
				`<Row id={row.id}/>`,
				`function Row({id}) { return <p key={id} class="row">{String(id)}</p>; }`,
			),
		},
		mountOnly: 'a returned keyed element does not hydrate its server range',
	},
	'a row the HTML parser repairs': {
		program: { app: list(`<p class="row"><div>{String(row.id)}</div></p>`) },
		mountOnly: 'the parser splits the server row before hydration can adopt it',
	},
};

describe('@for rows whose sole host is not a template element', () => {
	describe.each(['mount', 'hydrate'] as const)('%s', (kind) => {
		it.each(Object.entries(listShapes).filter(([, shape]) => kind === 'mount' || !shape.mountOnly))(
			'reorders and removes %s without leaking nodes',
			async (_name, { program }) => {
				const s = start(kind, program, { rows: rows([0, 1, 2, 3]) }, '.row');
				const rowsOf = () => [...s.container.querySelectorAll('.list > .row')];
				const initial = rowsOf();
				expect(initial.map((row) => row.textContent)).toEqual(['0', '1', '2', '3']);
				if (kind === 'hydrate') expectSameNodes(initial, s.serverNodes);

				s.render({ rows: rows([1, 2, 3, 4]) });
				const shifted = rowsOf();
				expect(shifted.map((row) => row.textContent)).toEqual(['1', '2', '3', '4']);
				expectSameNodes(shifted.slice(0, 3), initial.slice(1));
				expect(initial[0].isConnected).toBe(false);

				s.render({ rows: rows([3, 2, 5]) });
				const reordered = rowsOf();
				expect(reordered.map((row) => row.textContent)).toEqual(['3', '2', '5']);
				expectSameNodes(reordered.slice(0, 2), [initial[3], initial[2]]);
				expect(initial[1].isConnected).toBe(false);
				expect(shifted[3].isConnected).toBe(false);

				// Emptying the list leaves only its own boundary, and a full refill
				// and empty cycle returns to exactly that state.
				s.render({ rows: [] });
				const empty = between(s.container, '.list');
				expect(content(empty)).toEqual([]);
				s.render({ rows: rows([3, 2, 5]) });
				expect(rowsOf().map((row) => row.textContent)).toEqual(['3', '2', '5']);
				s.render({ rows: [] });
				expect(between(s.container, '.list')).toEqual(empty);

				await Promise.resolve();
				expect(s.recovered).toEqual([]);
				expect(s.mismatches()).toEqual([]);
			},
		);
	});

	it('rebuilds and removes hydrated rows that the HTML parser repaired', async () => {
		// The parser splits each server row before hydration, so hydration
		// rebuilds it, discards the split nodes, and reports the recovery. The
		// rebuilt rows must still reorder, and removing them must leave nothing.
		const program = listShapes['a row the HTML parser repairs'].program;
		const s = start('hydrate', program, { rows: rows([0, 1, 2, 3]) }, '.row');
		const built = () => [...s.container.querySelectorAll('.list > p.row > div')];
		const onlyRows = () =>
			expect(content(between(s.container, '.list'))).toEqual(built().map((div) => div.parentNode));
		expect(built().map((div) => div.textContent)).toEqual(['0', '1', '2', '3']);
		onlyRows();
		await Promise.resolve();
		expect(s.recovered).toHaveLength(1);
		expect(s.mismatches().length > 0).toBe(mode === 'dev');

		s.render({ rows: rows([1, 2, 3, 4]) });
		expect(built().map((div) => div.textContent)).toEqual(['1', '2', '3', '4']);
		onlyRows();
		s.render({ rows: rows([3, 2, 5]) });
		expect(built().map((div) => div.textContent)).toEqual(['3', '2', '5']);
		onlyRows();
		s.render({ rows: [] });
		expect(content(between(s.container, '.list'))).toEqual([]);
	});
});

const headRowShapes: Record<string, Program> = {
	'a metadata row': { app: list(`<meta name={'row-' + row.id} content="x"/>`) },
	'a metadata component root': {
		app: list(
			`<Row id={row.id}/>`,
			`function Row({id}) @{ <meta name={'row-' + id} content="x"/> }`,
		),
	},
	'a component whose @switch arms are all metadata': {
		app: list(
			`<Row id={row.id}/>`,
			`function Row({id}) @{ @switch (id % 2) {
				@case 1: { <meta name={'row-' + id} content="odd"/> }
				@default: { <meta name={'row-' + id} content="even"/> }
			} }`,
		),
	},
};

describe('@for rows whose sole host hoists into the document head', () => {
	describe.each(['mount', 'hydrate'] as const)('%s', (kind) => {
		it.each(Object.entries(headRowShapes))(
			'keeps the list boundary for %s',
			async (_name, program) => {
				const s = start(kind, program, { rows: rows([0, 1, 2, 3]) }, 'meta[name^="row-"]');
				const names = () =>
					[...document.head.querySelectorAll('meta[name^="row-"]')]
						.map((meta) => meta.getAttribute('name'))
						.sort();
				expect(names()).toEqual(['row-0', 'row-1', 'row-2', 'row-3']);
				if (kind === 'hydrate')
					expectSameNodes([...document.head.querySelectorAll('meta[name^="row-"]')], s.serverNodes);
				s.render({ rows: rows([1, 2, 3, 4]) });
				expect(names()).toEqual(['row-1', 'row-2', 'row-3', 'row-4']);
				s.render({ rows: rows([3, 2, 5]) });
				expect(names()).toEqual(['row-2', 'row-3', 'row-5']);
				expect(content(between(s.container, '.list'))).toEqual([]);
				s.render({ rows: [] });
				expect(names()).toEqual([]);
				const empty = between(s.container, '.list');
				expect(content(empty)).toEqual([]);
				s.render({ rows: rows([3, 2, 5]) });
				expect(names()).toEqual(['row-2', 'row-3', 'row-5']);
				s.render({ rows: [] });
				expect(between(s.container, '.list')).toEqual(empty);
				await Promise.resolve();
				expect(s.recovered).toEqual([]);
				expect(s.mismatches()).toEqual([]);
			},
		);
	});
});

const conditionalShapes: Record<string, Program> = {
	'a keyed component root': {
		app: `${keyedRow}
			export function App({show, id}) @{ <div class="host"><i>head</i>@if (show) { <Row id={id}/> }<span>tail</span></div> }`,
	},
	'a noscript component root': {
		app: `function Row({id}) @{ <noscript class="row">{String(id)}</noscript> }
			export function App({show, id}) @{ <div class="host"><i>head</i>@if (show) { <Row id={id}/> }<span>tail</span></div> }`,
	},
};

describe('conditional components whose sole host is not a template element', () => {
	describe.each(['mount', 'hydrate'] as const)('%s', (kind) => {
		it.each(Object.entries(conditionalShapes))(
			'hides and shows %s without leaking nodes',
			async (_name, program) => {
				const s = start(kind, program, { show: true, id: 1 }, '.row');
				const shown = () => [...s.container.querySelectorAll('.host > .row')];
				const first = shown();
				expect(first.map((row) => row.textContent)).toEqual(['1']);
				if (kind === 'hydrate') expectSameNodes(first, s.serverNodes);
				s.render({ show: true, id: 1 });
				expectSameNodes(shown(), first);

				s.render({ show: false, id: 1 });
				expect(first[0].isConnected).toBe(false);
				const hidden = between(s.container, '.host');
				expect(content(hidden)).toEqual([]);

				s.render({ show: true, id: 2 });
				expect(shown().map((row) => row.textContent)).toEqual(['2']);
				expect(shown()[0].nextElementSibling?.tagName).toBe('SPAN');
				s.render({ show: false, id: 2 });
				expect(between(s.container, '.host')).toEqual(hidden);

				await Promise.resolve();
				expect(s.recovered).toEqual([]);
				expect(s.mismatches()).toEqual([]);
			},
		);
	});
});
