import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createRoot, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource } from '../_server-fixture.js';

// A child `@{ … }` block inside JSX that a MODULE-level callback returns has no
// component body to own it. It can close over only the callback's params and
// module bindings, so it compiles in place, like an authored `{() => @{ … }}`
// child. A render-only block groups its output transparently. A block with
// setup is its own render scope and keeps its hook state across parent updates.

type Props = Record<string, unknown>;
type Modules = ReturnType<typeof load>;

function load(source: string, id: string, dev: boolean) {
	const compileOptions = { dev };
	return {
		client: loadCompiledFixtureSource(source, { id, mode: 'client', compileOptions }),
		server: loadCompiledFixtureSource(source, { id, mode: 'server', compileOptions }),
	};
}

const OUTPUT = "<b>{(first + '/' + label) as string}</b>";
const BLOCKS = {
	RenderOnly: '@{ <b>{label as string}</b> }',
	Setup: `@{ const [first] = useState(label); ${OUTPUT} }`,
	// The block owns the directives in its own output. Their arms read the
	// callback's params, which only the block's closure can see.
	SetupIf: `@{ const [first] = useState(label); @if (label !== '') { ${OUTPUT} } }`,
	SetupFor: `@{ const [first] = useState(label); @for (const row of [id]; key 0) { ${OUTPUT} } }`,
	// The authored form a setup-bearing block is shorthand for.
	RenderProp: `{() => @{ const [first] = useState(label); @if (label !== '') { ${OUTPUT} } }}`,
	// Templates nested in the block's setup reach the callback's params only
	// through the block's closure too.
	NestedTemplate: `@{ const [first] = useState(label); const inner = () => @{ @if (label !== '') { ${OUTPUT} } }; <>{inner}</> }`,
	NestedBlock: `@{ const [first] = useState(label); const inner = <>@{ const text = first + '/' + label; <b>{text as string}</b> }</>; <>{inner}</> }`,
} as const;
type Block = keyof typeof BLOCKS;

const HOSTS: {
	name: string;
	open: string;
	close: string;
	html: (inner: string) => string;
	keyed: boolean;
}[] = [
	{
		name: 'an element',
		open: '<p class="row">',
		close: '</p>',
		html: (inner) => `<p class="row">${inner}</p>`,
		keyed: false,
	},
	{
		name: 'a keyed element',
		open: '<p key={id} class="row">',
		close: '</p>',
		html: (inner) => `<p class="row">${inner}</p>`,
		keyed: true,
	},
	{
		name: 'a nested element',
		open: '<div class="wrap"><p class="row">',
		close: '</p></div>',
		html: (inner) => `<div class="wrap"><p class="row">${inner}</p></div>`,
		keyed: false,
	},
	{
		name: 'a fragment',
		open: '<>',
		close: '</>',
		html: (inner) => inner,
		keyed: false,
	},
	{
		name: 'component children',
		open: '<Box>',
		close: '</Box>',
		html: (inner) => `<em>${inner}</em>`,
		keyed: false,
	},
];

function source(open: string, close: string) {
	const callbacks = Object.entries(BLOCKS)
		.map(
			([name, block]) =>
				`const render${name} = (id: number, label: string) => ${open}${block}${close};
export function ${name}({ id, label }: { id: number; label: string }) @{
	<div class="list">{render${name}(id, label)}</div>
}`,
		)
		.join('\n');
	return `import { useState } from 'octane';
function Box({ children }: { children: any }) @{
	<em>{children}</em>
}
${callbacks}
`;
}

// Same key, new label: the block's scope survives. New key: a keyed host
// remounts, so the block's state starts over; an unkeyed host keeps it.
const STATES: Props[] = [
	{ id: 1, label: 'a' },
	{ id: 1, label: 'b' },
	{ id: 2, label: 'c' },
];

function expected(block: Block, host: (inner: string) => string, keyed: boolean): string[] {
	const inner = block === 'RenderOnly' ? ['a', 'b', 'c'] : ['a/a', 'a/b', keyed ? 'c/c' : 'a/c'];
	return inner.map((text) => `<div class="list">${host(`<b>${text}</b>`)}</div>`);
}

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

function serverHtml(modules: Modules, name: string, props: Props): string {
	return ServerRT.renderToString(modules.server[name], props).html.replace(/<!--[^]*?-->/g, '');
}

function mount(modules: Modules, name: string) {
	const container = newContainer();
	const root = createRoot(container);
	const seen: string[] = [];
	const blocks: (Element | null)[] = [];
	for (const props of STATES) {
		flushSync(() => root.render(modules.client[name], props));
		seen.push(content(container));
		blocks.push(container.querySelector('b'));
	}
	root.unmount();
	return { seen, blocks };
}

async function hydrate(modules: Modules, name: string) {
	const container = newContainer();
	container.innerHTML = ServerRT.renderToString(modules.server[name], STATES[0]).html;
	const serverElements = Array.from(container.querySelectorAll('*'));
	const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
	const recoverable: unknown[] = [];
	const root = hydrateRoot(container, modules.client[name], STATES[0], {
		onRecoverableError: (error) => recoverable.push(error),
	});
	await act(() => {});
	const hydrated = content(container);
	const hydratedElements = Array.from(container.querySelectorAll('*'));
	const block = container.querySelector('b');
	flushSync(() => root.render(modules.client[name], STATES[1]));
	const updated = content(container);
	const updatedBlock = container.querySelector('b');
	root.unmount();
	return {
		hydrated,
		updated,
		serverElements,
		hydratedElements,
		blockSurvived: block !== null && block === updatedBlock,
		recoverable,
		errors: errors.mock.calls,
	};
}

describe.each([false, true])('a child @{} block in a module-level callback (dev: %s)', (dev) => {
	for (const [index, host] of HOSTS.entries()) {
		const modules = () =>
			load(source(host.open, host.close), `module-callback-block-${index}.tsrx`, dev);

		for (const block of Object.keys(BLOCKS) as Block[]) {
			it(`renders a ${block} block under ${host.name} on the server and on mount and update`, () => {
				const compiled = modules();
				const html = expected(block, host.html, host.keyed);
				expect(serverHtml(compiled, block, STATES[0])).toBe(html[0]);
				const mounted = mount(compiled, block);
				expect(mounted.seen).toEqual(html);
				// A same-key update keeps the block's DOM.
				expect(mounted.blocks[1]).toBe(mounted.blocks[0]);
			});

			it(`hydrates a ${block} block under ${host.name} from renderToString`, async () => {
				const compiled = modules();
				const html = expected(block, host.html, host.keyed);
				const result = await hydrate(compiled, block);
				expect(result.recoverable).toEqual([]);
				expect(result.errors).toEqual([]);
				expect(result.hydrated).toBe(html[0]);
				expect(result.hydratedElements).toEqual(result.serverElements);
				expect(result.updated).toBe(html[1]);
				expect(result.blockSurvived).toBe(true);
			});
		}
	}

	it('renders a block in a module-level .map callback per row', async () => {
		const modules = load(
			`import { useState } from 'octane';
const suffix = '!';
const renderList = (ids: number[], label: string) =>
	<ul>{ids.map((id) => <li key={id}>@{ const [first] = useState(label); <b>{(first + '/' + label + id + suffix) as string}</b> }</li>)}</ul>;
export function List({ ids, label }: { ids: number[]; label: string }) @{
	<div class="list">{renderList(ids, label)}</div>
}
`,
			'module-callback-block-map.tsrx',
			dev,
		);
		const list = (...rows: string[]) =>
			`<div class="list"><ul>${rows.map((row) => `<li><b>${row}</b></li>`).join('')}</ul></div>`;
		expect(serverHtml(modules, 'List', { ids: [1, 2], label: 'a' })).toBe(list('a/a1!', 'a/a2!'));

		const container = newContainer();
		const root = createRoot(container);
		flushSync(() => root.render(modules.client.List, { ids: [1, 2], label: 'a' }));
		expect(content(container)).toBe(list('a/a1!', 'a/a2!'));
		const second = container.querySelectorAll('b')[1];
		// Row 2 keeps its state and its DOM when it moves; row 3 starts fresh.
		flushSync(() => root.render(modules.client.List, { ids: [2, 3], label: 'b' }));
		expect(content(container)).toBe(list('a/b2!', 'b/b3!'));
		expect(container.querySelectorAll('b')[0]).toBe(second);
		root.unmount();

		const hydrated = newContainer();
		hydrated.innerHTML = ServerRT.renderToString(modules.server.List, {
			ids: [1, 2],
			label: 'a',
		}).html;
		const serverRows = Array.from(hydrated.querySelectorAll('b'));
		const recoverable: unknown[] = [];
		const hydratedRoot = hydrateRoot(
			hydrated,
			modules.client.List,
			{ ids: [1, 2], label: 'a' },
			{ onRecoverableError: (error) => recoverable.push(error) },
		);
		await act(() => {});
		expect(recoverable).toEqual([]);
		expect(Array.from(hydrated.querySelectorAll('b'))).toEqual(serverRows);
		flushSync(() => hydratedRoot.render(modules.client.List, { ids: [1, 2], label: 'b' }));
		expect(content(hydrated)).toBe(list('a/b1!', 'a/b2!'));
		hydratedRoot.unmount();
	});

	it('runs the setup of a code-only block and renders nothing for it', async () => {
		const modules = load(
			`import { useEffect } from 'octane';
const renderEffect = (id: number, log: string[]) => <p>@{ useEffect(() => { log.push('effect ' + id); }); }</p>;
export function Effect({ id, log }: { id: number; log: string[] }) @{
	<div class="list">{renderEffect(id, log)}</div>
}
`,
			'module-callback-block-effect.tsrx',
			dev,
		);
		const empty = '<div class="list"><p></p></div>';
		expect(serverHtml(modules, 'Effect', { id: 1, log: [] })).toBe(empty);

		const container = newContainer();
		const root = createRoot(container);
		const log: string[] = [];
		await act(() => root.render(modules.client.Effect, { id: 1, log }));
		expect(content(container)).toBe(empty);
		expect(log).toEqual(['effect 1']);
		root.unmount();

		const hydrated = newContainer();
		hydrated.innerHTML = ServerRT.renderToString(modules.server.Effect, { id: 1, log: [] }).html;
		const paragraph = hydrated.querySelector('p');
		const recoverable: unknown[] = [];
		const hydrateLog: string[] = [];
		const hydratedRoot = hydrateRoot(
			hydrated,
			modules.client.Effect,
			{ id: 1, log: hydrateLog },
			{ onRecoverableError: (error) => recoverable.push(error) },
		);
		await act(() => {});
		expect(recoverable).toEqual([]);
		expect(hydrateLog).toEqual(['effect 1']);
		expect(hydrated.querySelector('p')).toBe(paragraph);
		hydratedRoot.unmount();
	});

	it('reports an unowned directive in a render-only block instead of dropping it', () => {
		// A render-only block is transparent, so its `@if` is as unowned as a bare one.
		const blockSource = `const render = (ok: boolean) => <p>@{ @if (ok) { <b /> } }</p>;
export function App() @{ <div>{render(true)}</div> }
`;
		for (const mode of ['client', 'server'] as const) {
			expect(() =>
				loadCompiledFixtureSource(blockSource, {
					id: `module-callback-block-if-${mode}.tsrx`,
					mode,
					compileOptions: { dev },
				}),
			).toThrow(/`@if` is not supported inside a module-level callback/);
		}
	});
});
