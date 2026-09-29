import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createRoot, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource } from '../_server-fixture.js';

// The client builds a keyed, `noscript`, or document host as a descriptor, not a
// template. When a component returns one, its directive children must still
// render: the client used to fold them into record holes that nothing read, so
// `return <p key={id}>@if … </p>` mounted an empty `<p>` while the server, and
// the same element in a `@{ … }` body, rendered the arm.

type Props = Record<string, unknown>;
type Modules = ReturnType<typeof load>;

function load(source: string, id: string) {
	return {
		client: loadCompiledFixtureSource(source, { id, mode: 'client' }),
		server: loadCompiledFixtureSource(source, { id, mode: 'server' }),
	};
}

const PARAMS = '{ id, items }: { id: number; items?: string[] }';

// `App` renders a component that returns `host`; `Nested` renders one that
// returns `host` inside a template element; `Body` renders `host` from a
// `@{}` body.
function hostSource(host: string, setup = '') {
	return `import { Fragment } from 'octane';
function Box({ children }: { children: any }) @{
	<em>{children}</em>
}
function Root(${PARAMS}) {
	${setup}
	return ${host};
}
function Wrapped(${PARAMS}) {
	${setup}
	return <div class="wrap">${host}</div>;
}
export function App(${PARAMS}) @{ <div class="list"><Root id={id} items={items} /></div> }
export function Nested(${PARAMS}) @{ <div class="list"><Wrapped id={id} items={items} /></div> }
export function Body(${PARAMS}) @{
	${setup}
	<div class="list">${host}</div>
}
`;
}

const IF = "@if (id % 2) { <b>{'odd'}</b> } @else { <i>{'even'}</i> }";

// `html[i]` is the returned host's content for `states[i]`.
const CASES: { name: string; host: string; setup?: string; states: Props[]; html: string[] }[] = [
	{
		name: '@if',
		host: `<p key={id} class="row">${IF}</p>`,
		states: [{ id: 0 }, { id: 1 }, { id: 2 }],
		html: [
			'<p class="row"><i>even</i></p>',
			'<p class="row"><b>odd</b></p>',
			'<p class="row"><i>even</i></p>',
		],
	},
	{
		name: '@for rows and @empty reading a setup local',
		setup: "const prefix = 'item-';",
		host: "<ul key={id}>@for (const item of items!; key item) { <li>{(prefix + item) as string}</li> } @empty { <li>{'none'}</li> }</ul>",
		states: [
			{ id: 0, items: ['a', 'b'] },
			{ id: 0, items: ['b', 'c'] },
			{ id: 1, items: [] },
		],
		html: [
			'<ul><li>item-a</li><li>item-b</li></ul>',
			'<ul><li>item-b</li><li>item-c</li></ul>',
			'<ul><li>none</li></ul>',
		],
	},
	{
		name: '@switch',
		host: "<p key={id}>@switch (id % 3) { @case 0: { <b>{'zero'}</b> } @case 1: { <i>{'one'}</i> } @default: { <u>{'two'}</u> } }</p>",
		states: [{ id: 0 }, { id: 1 }, { id: 2 }],
		html: ['<p><b>zero</b></p>', '<p><i>one</i></p>', '<p><u>two</u></p>'],
	},
	{
		name: '@try',
		host: "<p key={id}>@try { <b>{String(id) as string}</b> } @catch (error) { <i>{'failed'}</i> }</p>",
		states: [{ id: 0 }, { id: 1 }],
		html: ['<p><b>0</b></p>', '<p><b>1</b></p>'],
	},
	{
		name: 'an @if in component children',
		host: `<p key={id}><Box>${IF}</Box></p>`,
		states: [{ id: 0 }, { id: 1 }],
		html: ['<p><em><i>even</i></em></p>', '<p><em><b>odd</b></em></p>'],
	},
	{
		name: 'an @if in a nested host',
		host: `<p key={id}><span>${IF}</span></p>`,
		states: [{ id: 0 }, { id: 1 }],
		html: ['<p><span><i>even</i></span></p>', '<p><span><b>odd</b></span></p>'],
	},
	{
		name: 'an @if in a fragment',
		host: `<p key={id}><>{'#'}${IF}</></p>`,
		states: [{ id: 0 }, { id: 1 }],
		html: ['<p>#<i>even</i></p>', '<p>#<b>odd</b></p>'],
	},
	{
		name: 'an @if in a long-form Fragment',
		host: `<p key={id}><Fragment>${IF}</Fragment></p>`,
		states: [{ id: 0 }, { id: 1 }],
		html: ['<p><i>even</i></p>', '<p><b>odd</b></p>'],
	},
];

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
function content(container: HTMLElement): string {
	return container.innerHTML.replace(/<!--[^]*?-->/g, '');
}

function serverContent(modules: Modules, name: string, props: Props): string {
	const container = newContainer();
	container.innerHTML = ServerRT.renderToString(modules.server[name], props).html;
	return content(container);
}

function mount(modules: Modules, name: string, states: Props[]): string[] {
	const container = newContainer();
	const root = createRoot(container);
	const seen: string[] = [];
	for (const props of states) {
		flushSync(() => root.render(modules.client[name], props));
		seen.push(content(container));
	}
	root.unmount();
	return seen;
}

async function hydrate(modules: Modules, name: string, props: Props, next: Props) {
	const container = newContainer();
	container.innerHTML = ServerRT.renderToString(modules.server[name], props).html;
	const serverElements = Array.from(container.querySelectorAll('*'));
	const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
	const recoverable: unknown[] = [];
	const root = hydrateRoot(container, modules.client[name], props, {
		onRecoverableError: (error) => recoverable.push(error),
	});
	await act(() => {});
	const hydrated = content(container);
	const hydratedElements = Array.from(container.querySelectorAll('*'));
	flushSync(() => root.render(modules.client[name], next));
	const updated = content(container);
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

const list = (html: string) => `<div class="list">${html}</div>`;
const wrapped = (html: string) => `<div class="list"><div class="wrap">${html}</div></div>`;

describe('a returned descriptor-built host with directive children', () => {
	for (const [index, { name, host, setup, states, html }] of CASES.entries()) {
		const modules = () => load(hostSource(host, setup), `returned-host-children-${index}.tsrx`);

		it(`renders ${name} as the returned root, like a @{} body and the server`, () => {
			const compiled = modules();
			expect(serverContent(compiled, 'App', states[0])).toBe(list(html[0]));
			expect(mount(compiled, 'Body', states)).toEqual(html.map(list));
			expect(mount(compiled, 'App', states)).toEqual(html.map(list));
		});

		it(`renders and hydrates ${name} under a returned template host`, async () => {
			const compiled = modules();
			expect(serverContent(compiled, 'Nested', states[0])).toBe(wrapped(html[0]));
			expect(mount(compiled, 'Nested', states)).toEqual(html.map(wrapped));

			const result = await hydrate(compiled, 'Nested', states[0], states[1]);
			expect(result.recoverable).toEqual([]);
			expect(result.errors).toEqual([]);
			expect(result.hydrated).toBe(wrapped(html[0]));
			expect(result.hydratedElements).toEqual(result.serverElements);
			expect(result.updated).toBe(wrapped(html[1]));
		});
	}

	it('renders the directive children of a returned noscript', () => {
		const compiled = load(hostSource(`<noscript>${IF}</noscript>`), 'returned-noscript.tsrx');
		const even = list('<noscript><i>even</i></noscript>');
		const odd = list('<noscript><b>odd</b></noscript>');
		expect(serverContent(compiled, 'App', { id: 0 })).toBe(even);
		expect(mount(compiled, 'App', [{ id: 0 }, { id: 1 }])).toEqual([even, odd]);
	});

	it('renders and hydrates the .map() children of a keyed returned .tsx root', async () => {
		const compiled = load(
			`/** @jsxImportSource octane */
function Row({ id, items }: { id: number; items: string[] }) {
	return <ul key={id} className="list">{items.map((item) => <li key={item}>{item}</li>)}</ul>;
}
export function App({ id, items }: { id: number; items: string[] }) {
	return <div><Row id={id} items={items} /></div>;
}
`,
			'returned-host-map.tsx',
		);
		const ab = '<div><ul class="list"><li>a</li><li>b</li></ul></div>';
		const ba = '<div><ul class="list"><li>b</li><li>a</li></ul></div>';
		const states = [
			{ id: 0, items: ['a', 'b'] },
			{ id: 0, items: ['b', 'a'] },
		];
		expect(serverContent(compiled, 'App', states[0])).toBe(ab);
		expect(mount(compiled, 'App', states)).toEqual([ab, ba]);

		const result = await hydrate(compiled, 'App', states[0], states[1]);
		expect(result.recoverable).toEqual([]);
		expect(result.errors).toEqual([]);
		expect(result.hydrated).toBe(ab);
		expect(result.hydratedElements).toEqual(result.serverElements);
		expect(result.updated).toBe(ba);
	});
});
