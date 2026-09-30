import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createRoot, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, type CompiledFixtureModule } from '../_server-fixture.js';

// `@{ … }` is shorthand for returning JSX, so `(x) => @{ <li /> }` means
// `(x) => <li />`. A template function handed to other code as a call argument
// is called by that code, like `Array.prototype.map` calling it with
// `(item, index, array)`, so it must return a JSX value there and render
// exactly what its returned-JSX twin renders: on a client mount and update, on
// the server, and through hydration of that server markup. Positions where the
// runtime renders the function itself, such as a render prop, a render-function
// child, or a `memo` or `createElement` component, keep rendering it too.

type Props = { xs: string[] };

interface Case {
	/** The module, written with the `@{ … }` function. */
	block: string;
	/** The same module, written with the function's returned-JSX form. */
	returned: string;
	/** The markup, without range markers, that `H` renders for each state. */
	html: (xs: string[]) => string;
}

const section = (inner: string) => `<section>${inner}<b>x</b></section>`;
const items = (xs: string[]) => `<ul>${xs.map((x) => `<li>${x}</li>`).join('')}</ul>`;

const CASES: Record<string, Case> = {
	'an arrow passed to map': {
		block: `export function H(props: { xs: string[] }) @{
	<section><ul>{props.xs.map((x) => @{ <li key={x}>{x}</li> })}</ul><b>x</b></section>
}`,
		returned: `export function H(props: { xs: string[] }) @{
	<section><ul>{props.xs.map((x) => <li key={x}>{x}</li>)}</ul><b>x</b></section>
}`,
		html: (xs) => section(items(xs)),
	},
	'a function expression passed to map': {
		block: `export function H(props: { xs: string[] }) @{
	<section><ul>{props.xs.map(function (x: string) @{ <li key={x}>{x}</li> })}</ul><b>x</b></section>
}`,
		returned: `export function H(props: { xs: string[] }) @{
	<section><ul>{props.xs.map(function (x: string) {
		return <li key={x}>{x}</li>;
	})}</ul><b>x</b></section>
}`,
		html: (xs) => section(items(xs)),
	},
	'an arrow with setup passed to map': {
		block: `export function H(props: { xs: string[] }) @{
	<section><ul>{props.xs.map((x, i) => @{
		const label = x.toUpperCase() + i;
		<li key={x}>{label}</li>
	})}</ul><b>x</b></section>
}`,
		returned: `export function H(props: { xs: string[] }) @{
	<section><ul>{props.xs.map((x, i) => {
		const label = x.toUpperCase() + i;
		return <li key={x}>{label}</li>;
	})}</ul><b>x</b></section>
}`,
		html: (xs) =>
			section(`<ul>${xs.map((x, i) => `<li>${x.toUpperCase()}${i}</li>`).join('')}</ul>`),
	},
	'an arrow with an early return passed to map': {
		block: `export function H(props: { xs: string[] }) @{
	<section><ul>{props.xs.map((x) => @{
		if (x === 'b') return null;
		<li key={x}>{x}</li>
	})}</ul><b>x</b></section>
}`,
		returned: `export function H(props: { xs: string[] }) @{
	<section><ul>{props.xs.map((x) => {
		if (x === 'b') return null;
		return <li key={x}>{x}</li>;
	})}</ul><b>x</b></section>
}`,
		html: (xs) => section(items(xs.filter((x) => x !== 'b'))),
	},
	'an arrow rendering a directive passed to map': {
		block: `export function H(props: { xs: string[] }) @{
	<section><ul>{props.xs.map((x) => @{
		<li key={x}>
			@if (x === 'a') {
				<i>{x}</i>
			} @else {
				<em>{x}</em>
			}
		</li>
	})}</ul><b>x</b></section>
}`,
		returned: `export function H(props: { xs: string[] }) @{
	<section><ul>{props.xs.map((x) => <li key={x}>
		@if (x === 'a') {
			<i>{x}</i>
		} @else {
			<em>{x}</em>
		}
	</li>)}</ul><b>x</b></section>
}`,
		html: (xs) =>
			section(
				`<ul>${xs.map((x) => (x === 'a' ? `<li><i>${x}</i></li>` : `<li><em>${x}</em></li>`)).join('')}</ul>`,
			),
	},
	'an arrow passed to flatMap': {
		block: `export function H(props: { xs: string[] }) @{
	<section><ul>{props.xs.flatMap((x) => @{ <li key={x}>{x}</li> })}</ul><b>x</b></section>
}`,
		returned: `export function H(props: { xs: string[] }) @{
	<section><ul>{props.xs.flatMap((x) => <li key={x}>{x}</li>)}</ul><b>x</b></section>
}`,
		html: (xs) => section(items(xs)),
	},
	'an arrow passed to an optional map call': {
		block: `export function H(props: { xs: string[] }) @{
	<section><ul>{props.xs?.map((x) => @{ <li key={x}>{x}</li> })}</ul><b>x</b></section>
}`,
		returned: `export function H(props: { xs: string[] }) @{
	<section><ul>{props.xs?.map((x) => <li key={x}>{x}</li>)}</ul><b>x</b></section>
}`,
		html: (xs) => section(items(xs)),
	},
	'a parenthesized, asserted arrow passed to map': {
		block: `import type { OctaneNode } from 'octane';
export function H(props: { xs: string[] }) @{
	<section><ul>{props.xs.map(((x: string) => @{ <li key={x}>{x}</li> }) as (x: string) => OctaneNode)}</ul><b>x</b></section>
}`,
		returned: `import type { OctaneNode } from 'octane';
export function H(props: { xs: string[] }) @{
	<section><ul>{props.xs.map(((x: string) => <li key={x}>{x}</li>) as (x: string) => OctaneNode)}</ul><b>x</b></section>
}`,
		html: (xs) => section(items(xs)),
	},
	'an arrow nested in a mapped arrow': {
		block: `export function H(props: { xs: string[] }) @{
	<section><ul>{props.xs.map((x) => @{
		<li key={x}>{[x, x + '!'].map((y) => @{ <i key={y}>{y}</i> })}</li>
	})}</ul><b>x</b></section>
}`,
		returned: `export function H(props: { xs: string[] }) @{
	<section><ul>{props.xs.map((x) => <li key={x}>{[x, x + '!'].map((y) => <i key={y}>{y}</i>)}</li>)}</ul><b>x</b></section>
}`,
		html: (xs) => section(`<ul>${xs.map((x) => `<li><i>${x}</i><i>${x}!</i></li>`).join('')}</ul>`),
	},
	'an arrow passed to a user function': {
		block: `import type { OctaneNode } from 'octane';
const run = (render: (xs: string[]) => OctaneNode, xs: string[]) => render(xs);
export function H(props: { xs: string[] }) @{
	<section>{run((xs) => @{ <ul>{xs.map((x) => <li key={x}>{x}</li>)}</ul> }, props.xs)}<b>x</b></section>
}`,
		returned: `import type { OctaneNode } from 'octane';
const run = (render: (xs: string[]) => OctaneNode, xs: string[]) => render(xs);
export function H(props: { xs: string[] }) @{
	<section>{run((xs) => <ul>{xs.map((x) => <li key={x}>{x}</li>)}</ul>, props.xs)}<b>x</b></section>
}`,
		html: (xs) => section(items(xs)),
	},
	'an arrow passed to a constructor': {
		block: `import type { OctaneNode } from 'octane';
class Renderer {
	render: (xs: string[]) => OctaneNode;
	constructor(render: (xs: string[]) => OctaneNode) {
		this.render = render;
	}
}
export function H(props: { xs: string[] }) @{
	const renderer = new Renderer((xs) => @{ <ul>{xs.map((x) => <li key={x}>{x}</li>)}</ul> });
	<section>{renderer.render(props.xs)}<b>x</b></section>
}`,
		returned: `import type { OctaneNode } from 'octane';
class Renderer {
	render: (xs: string[]) => OctaneNode;
	constructor(render: (xs: string[]) => OctaneNode) {
		this.render = render;
	}
}
export function H(props: { xs: string[] }) @{
	const renderer = new Renderer((xs) => <ul>{xs.map((x) => <li key={x}>{x}</li>)}</ul>);
	<section>{renderer.render(props.xs)}<b>x</b></section>
}`,
		html: (xs) => section(items(xs)),
	},
	'an arrow passed to useMemo': {
		block: `import { useMemo } from 'octane';
export function H(props: { xs: string[] }) @{
	const list = useMemo(() => @{ <ul>{props.xs.map((x) => <li key={x}>{x}</li>)}</ul> }, [props.xs]);
	<section>{list}<b>x</b></section>
}`,
		returned: `import { useMemo } from 'octane';
export function H(props: { xs: string[] }) @{
	const list = useMemo(() => <ul>{props.xs.map((x) => <li key={x}>{x}</li>)}</ul>, [props.xs]);
	<section>{list}<b>x</b></section>
}`,
		html: (xs) => section(items(xs)),
	},
	'a map callback in a module-level function': {
		block: `function list(xs: string[]) {
	return <ul>{xs.map((x) => @{ <li key={x}>{x}</li> })}</ul>;
}
export function H(props: { xs: string[] }) @{
	<section>{list(props.xs)}<b>x</b></section>
}`,
		returned: `function list(xs: string[]) {
	return <ul>{xs.map((x) => <li key={x}>{x}</li>)}</ul>;
}
export function H(props: { xs: string[] }) @{
	<section>{list(props.xs)}<b>x</b></section>
}`,
		html: (xs) => section(items(xs)),
	},
	'a map callback in a returned-JSX component': {
		block: `export function H(props: { xs: string[] }) {
	return <section><ul>{props.xs.map((x) => @{ <li key={x}>{x}</li> })}</ul><b>x</b></section>;
}`,
		returned: `export function H(props: { xs: string[] }) {
	return <section><ul>{props.xs.map((x) => <li key={x}>{x}</li>)}</ul><b>x</b></section>;
}`,
		html: (xs) => section(items(xs)),
	},
	'a map callback at module scope': {
		block: `const FIXED = ['p', 'q'].map((x) => @{ <li key={x}>{x}</li> });
export function H(props: { xs: string[] }) @{
	<section><ul>{FIXED}</ul>{props.xs.length as number}<b>x</b></section>
}`,
		returned: `const FIXED = ['p', 'q'].map((x) => <li key={x}>{x}</li>);
export function H(props: { xs: string[] }) @{
	<section><ul>{FIXED}</ul>{props.xs.length as number}<b>x</b></section>
}`,
		html: (xs) => section(`${items(['p', 'q'])}${xs.length}`),
	},
	// A named helper that escapes to a call, beyond the `map(helper)` shape.
	'a helper passed to flatMap': {
		block: `export function H(props: { xs: string[] }) @{
	const row = (x: string) => @{ <li key={x}>{x}</li> };
	<section><ul>{props.xs.flatMap(row)}</ul><b>x</b></section>
}`,
		returned: `export function H(props: { xs: string[] }) @{
	const row = (x: string) => <li key={x}>{x}</li>;
	<section><ul>{props.xs.flatMap(row)}</ul><b>x</b></section>
}`,
		html: (xs) => section(items(xs)),
	},
	'a helper passed to a user function': {
		block: `import type { OctaneNode } from 'octane';
const run = (render: (xs: string[]) => OctaneNode, xs: string[]) => render(xs);
export function H(props: { xs: string[] }) @{
	function list(xs: string[]) @{ <ul>{xs.map((x) => <li key={x}>{x}</li>)}</ul> }
	<section>{run(list, props.xs)}<b>x</b></section>
}`,
		returned: `import type { OctaneNode } from 'octane';
const run = (render: (xs: string[]) => OctaneNode, xs: string[]) => render(xs);
export function H(props: { xs: string[] }) @{
	function list(xs: string[]) {
		return <ul>{xs.map((x) => <li key={x}>{x}</li>)}</ul>;
	}
	<section>{run(list, props.xs)}<b>x</b></section>
}`,
		html: (xs) => section(items(xs)),
	},
	// The runtime renders these functions itself, beside the calls above.
	'a render prop': {
		block: `import type { OctaneNode } from 'octane';
function Each(props: { xs: string[]; row: (row: { x: string }) => OctaneNode }) @{
	<ul>
		@for (const x of props.xs; key x) {
			<props.row x={x} />
		}
	</ul>
}
export function H(props: { xs: string[] }) @{
	<section><Each xs={props.xs} row={(row) => @{ <li>{row.x}</li> }} /><b>x</b></section>
}`,
		returned: `import type { OctaneNode } from 'octane';
function Each(props: { xs: string[]; row: (row: { x: string }) => OctaneNode }) @{
	<ul>
		@for (const x of props.xs; key x) {
			<props.row x={x} />
		}
	</ul>
}
export function H(props: { xs: string[] }) @{
	<section><Each xs={props.xs} row={(row) => <li>{row.x}</li>} /><b>x</b></section>
}`,
		html: (xs) => section(items(xs)),
	},
	'a render-function child': {
		block: `export function H(props: { xs: string[] }) @{
	<section><ul>{() => @{ <li>{props.xs.join('+')}</li> }}</ul><b>x</b></section>
}`,
		returned: `export function H(props: { xs: string[] }) @{
	<section><ul>{() => <li>{props.xs.join('+')}</li>}</ul><b>x</b></section>
}`,
		html: (xs) => section(`<ul><li>${xs.join('+')}</li></ul>`),
	},
	'a memo component': {
		block: `import { memo } from 'octane';
const Row = memo((row: { x: string }) => @{ <li>{row.x}</li> });
export function H(props: { xs: string[] }) @{
	<section>
		<ul>
			@for (const x of props.xs; key x) {
				<Row x={x} />
			}
		</ul>
		<b>x</b>
	</section>
}`,
		returned: `import { memo } from 'octane';
const Row = memo((row: { x: string }) => <li>{row.x}</li>);
export function H(props: { xs: string[] }) @{
	<section>
		<ul>
			@for (const x of props.xs; key x) {
				<Row x={x} />
			}
		</ul>
		<b>x</b>
	</section>
}`,
		html: (xs) => section(items(xs)),
	},
	'a createElement component and child': {
		block: `import { createElement } from 'octane';
export function H(props: { xs: string[] }) @{
	<section>
		{createElement((list: { xs: string[] }) => @{ <ul>{list.xs.map((x) => <li key={x}>{x}</li>)}</ul> }, { xs: props.xs })}
		{createElement('p', null, () => @{ <i>{props.xs.join('+')}</i> })}
		<b>x</b>
	</section>
}`,
		returned: `import { createElement } from 'octane';
export function H(props: { xs: string[] }) @{
	<section>
		{createElement((list: { xs: string[] }) => <ul>{list.xs.map((x) => <li key={x}>{x}</li>)}</ul>, { xs: props.xs })}
		{createElement('p', null, () => <i>{props.xs.join('+')}</i>)}
		<b>x</b>
	</section>
}`,
		html: (xs) => section(`${items(xs)}<p><i>${xs.join('+')}</i></p>`),
	},
};

const STATES: Props[] = [{ xs: ['a', 'b'] }, { xs: ['c', 'a'] }];

const containers: HTMLElement[] = [];
afterEach(() => {
	for (const container of containers.splice(0)) container.remove();
	vi.restoreAllMocks();
});

function newContainer(): HTMLElement {
	const container = document.createElement('div');
	document.body.appendChild(container);
	containers.push(container);
	return container;
}

// Hydration and range markers are not part of the rendered content.
const content = (html: string) => html.replace(/<!--[^]*?-->/g, '');

interface Compiled {
	client: CompiledFixtureModule;
	server: CompiledFixtureModule;
}

function load(source: string, id: string, dev: boolean): Compiled {
	const compileOptions = { dev };
	return {
		client: loadCompiledFixtureSource(source, { id, mode: 'client', compileOptions }),
		server: loadCompiledFixtureSource(source, { id, mode: 'server', compileOptions }),
	};
}

function serverHtml(compiled: Compiled, props: Props): string {
	return ServerRT.renderToString(compiled.server.H, props).html;
}

function mount(compiled: Compiled) {
	const container = newContainer();
	const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
	const root = createRoot(container);
	const seen: string[] = [];
	for (const props of STATES) {
		flushSync(() => root.render(compiled.client.H, props));
		seen.push(content(container.innerHTML));
	}
	root.unmount();
	return { seen, errors: errors.mock.calls };
}

async function hydrate(compiled: Compiled) {
	const container = newContainer();
	container.innerHTML = serverHtml(compiled, STATES[0]);
	const serverElements = Array.from(container.querySelectorAll('*'));
	const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
	const recoverable: unknown[] = [];
	const root = hydrateRoot(container, compiled.client.H, STATES[0], {
		onRecoverableError: (error) => recoverable.push(error),
	});
	await act(() => {});
	const hydrated = content(container.innerHTML);
	const hydratedElements = Array.from(container.querySelectorAll('*'));
	flushSync(() => root.render(compiled.client.H, STATES[1]));
	const updated = content(container.innerHTML);
	root.unmount();
	return {
		hydrated,
		updated,
		serverElements,
		hydratedElements,
		recoverable,
		errors: errors.mock.calls,
	};
}

describe.each([false, true])('a @{} function passed as a call argument (dev: %s)', (dev) => {
	for (const [name, testCase] of Object.entries(CASES)) {
		const id = `inline-callback-code-block-${Object.keys(CASES).indexOf(name)}`;
		let shared: { block: Compiled; returned: Compiled } | undefined;
		const modules = () =>
			(shared ??= {
				block: load(testCase.block, `${id}.tsrx`, dev),
				returned: load(testCase.returned, `${id}-returned.tsrx`, dev),
			});
		const expected = STATES.map((props) => testCase.html(props.xs));

		it(`renders ${name} on the server like its returned-JSX form`, () => {
			const { block, returned } = modules();
			for (const [i, props] of STATES.entries()) {
				const html = serverHtml(block, props);
				expect(content(html)).toBe(expected[i]);
				expect(content(html)).toBe(content(serverHtml(returned, props)));
			}
		});

		it(`mounts and updates ${name} like its returned-JSX form`, () => {
			const { block, returned } = modules();
			const mounted = mount(block);
			expect(mounted.errors).toEqual([]);
			expect(mounted.seen).toEqual(expected);
			expect(mounted.seen).toEqual(mount(returned).seen);
		});

		it(`hydrates ${name} from its server markup`, async () => {
			const result = await hydrate(modules().block);
			expect(result.recoverable).toEqual([]);
			expect(result.errors).toEqual([]);
			expect(result.hydrated).toBe(expected[0]);
			// Hydration adopts every server element instead of rebuilding it.
			expect(result.hydratedElements).toEqual(result.serverElements);
			expect(result.updated).toBe(expected[1]);
		});
	}
});
