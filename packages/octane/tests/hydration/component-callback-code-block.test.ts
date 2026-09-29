import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createRoot, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource } from '../_server-fixture.js';

// A child `@{ … }` block inside JSX that a callback declared in a component body
// returns can read the callback's params, which do not exist in the component
// body. The block, and any `@if` or `@for` in its output, must still see them,
// alongside the component's own locals. A block with setup is its own render
// scope, so its hook state survives parent updates on the client, the server,
// and through hydration.

type Props = Record<string, unknown>;
type Modules = ReturnType<typeof load>;

function load(source: string, id: string, dev: boolean) {
	const compileOptions = { dev };
	return {
		client: loadCompiledFixtureSource(source, { id, mode: 'client', compileOptions }),
		server: loadCompiledFixtureSource(source, { id, mode: 'server', compileOptions }),
	};
}

const OUTPUT = '<b>{(first + sep + label) as string}</b>';
const BLOCKS = {
	RenderOnly: '@{ <b>{(label + sep + label) as string}</b> }',
	Setup: `@{ const [first] = useState(label); ${OUTPUT} }`,
	// The block owns the directives in its own output. Their arms read the
	// callback's params, which only the block's closure can see.
	SetupIf: `@{ const [first] = useState(label); @if (label !== '') { ${OUTPUT} } }`,
	SetupFor: `@{ const [first] = useState(label); @for (const row of [id]; key 0) { ${OUTPUT} } }`,
	// The authored form a setup-bearing block is shorthand for.
	RenderProp: `{() => @{ const [first] = useState(label); @if (label !== '') { ${OUTPUT} } }}`,
	// A directive with no block, whose arm reads the callback's names.
	DirectIf: "@if (label !== '') { <b>{(label + sep + label) as string}</b> }",
} as const;
type Block = keyof typeof BLOCKS;
const STATELESS = new Set<Block>(['RenderOnly', 'DirectIf']);

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

// Where the callback is declared. Each form renders `<div class="list">` around
// the callback's result for the row, with `sep` a local of the component. The
// component binds the row under other names, so only the callback's own
// bindings can supply `id` and `label`.
const FORMS: { name: string; component: (name: string, jsx: string) => string }[] = [
	{
		name: 'a setup callback',
		component: (name, jsx) => `export function ${name}({ id: rowId, label: rowLabel }: Row) @{
	const sep = '/';
	const render = (id: number, label: string) => ${jsx};
	<div class="list">{render(rowId, rowLabel)}</div>
}`,
	},
	{
		// `label` is bound in a nested block of the callback, not by its params.
		name: 'a callback with a nested block',
		component: (name, jsx) => `export function ${name}({ id: rowId, label: rowLabel }: Row) @{
	const sep = '/';
	const render = (id: number, raw: string) => {
		if (id > 0) {
			const label = raw;
			return ${jsx};
		}
		return null;
	};
	<div class="list">{render(rowId, rowLabel)}</div>
}`,
	},
	{
		name: 'a callback in a returned-JSX component',
		component: (name, jsx) => `export function ${name}({ id: rowId, label: rowLabel }: Row) {
	const sep = '/';
	const render = (id: number, label: string) => ${jsx};
	return <div class="list">{render(rowId, rowLabel)}</div>;
}`,
	},
	{
		name: 'an inline attribute callback',
		component: (name, jsx) => `export function ${name}({ id: rowId, label: rowLabel }: Row) @{
	const sep = '/';
	<Slot id={rowId} label={rowLabel} render={(id: number, label: string) => ${jsx}} />
}`,
	},
];

function source(form: (typeof FORMS)[number], open: string, close: string) {
	const components = Object.entries(BLOCKS)
		.map(([name, block]) => form.component(name, `${open}${block}${close}`))
		.join('\n');
	return `import { useState } from 'octane';
type Row = { id: number; label: string };
function Box({ children }: { children: any }) @{
	<em>{children}</em>
}
function Slot({ id, label, render }: Row & { render: (id: number, label: string) => any }) @{
	<div class="list">{render(id, label)}</div>
}
${components}
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
	const inner = STATELESS.has(block)
		? ['a/a', 'b/b', 'c/c']
		: ['a/a', 'a/b', keyed ? 'c/c' : 'a/c'];
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

function mount(modules: Modules, name: string, states: Props[] = STATES) {
	const container = newContainer();
	const root = createRoot(container);
	const seen: string[] = [];
	const blocks: (Element | null)[] = [];
	for (const props of states) {
		flushSync(() => root.render(modules.client[name], props));
		seen.push(content(container));
		blocks.push(container.querySelector('b'));
	}
	root.unmount();
	return { seen, blocks };
}

async function hydrate(modules: Modules, name: string, states: Props[] = STATES) {
	const container = newContainer();
	container.innerHTML = ServerRT.renderToString(modules.server[name], states[0]).html;
	const serverElements = Array.from(container.querySelectorAll('*'));
	const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
	const recoverable: unknown[] = [];
	const root = hydrateRoot(container, modules.client[name], states[0], {
		onRecoverableError: (error) => recoverable.push(error),
	});
	await act(() => {});
	const hydrated = content(container);
	const hydratedElements = Array.from(container.querySelectorAll('*'));
	const block = container.querySelector('b');
	flushSync(() => root.render(modules.client[name], states[1]));
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

describe.each([false, true])('a child @{} block in a component callback (dev: %s)', (dev) => {
	for (const [formIndex, form] of FORMS.entries()) {
		describe(`in ${form.name}`, () => {
			for (const [hostIndex, host] of HOSTS.entries()) {
				let compiled: Modules | undefined;
				const modules = () =>
					(compiled ??= load(
						source(form, host.open, host.close),
						`component-callback-block-${formIndex}-${hostIndex}.tsrx`,
						dev,
					));

				for (const block of Object.keys(BLOCKS) as Block[]) {
					it(`renders a ${block} block under ${host.name} on the server and on mount and update`, () => {
						const html = expected(block, host.html, host.keyed);
						expect(serverHtml(modules(), block, STATES[0])).toBe(html[0]);
						const mounted = mount(modules(), block);
						expect(mounted.seen).toEqual(html);
						// A same-key update keeps the block's DOM.
						expect(mounted.blocks[1]).toBe(mounted.blocks[0]);
					});

					it(`hydrates a ${block} block under ${host.name} from renderToString`, async () => {
						const html = expected(block, host.html, host.keyed);
						const result = await hydrate(modules(), block);
						expect(result.recoverable).toEqual([]);
						expect(result.errors).toEqual([]);
						expect(result.hydrated).toBe(html[0]);
						expect(result.hydratedElements).toEqual(result.serverElements);
						expect(result.updated).toBe(html[1]);
						expect(result.blockSurvived).toBe(true);
					});
				}
			}
		});
	}

	// `.map` over an array in the output compiles each row as its own item body.
	// A `.map` in setup, and the output `.map` over anything that is not an
	// array, call the authored callback instead, so the block must close over
	// its param there too.
	const listModules = () =>
		load(
			`import { useState } from 'octane';
export function SetupList({ ids, label }: { ids: number[]; label: string }) @{
	const sep = '/';
	const rows = ids.map((id) => <li key={id}>@{ const [first] = useState(label); <b>{(first + sep + label + id) as string}</b> }</li>);
	<div class="list"><ul>{rows}</ul></div>
}
export function OutputList({ ids, label }: { ids: { map: (row: (id: number) => any) => any[] }; label: string }) @{
	const sep = '/';
	<div class="list"><ul>{ids.map((id) => <li key={id}>@{ const [first] = useState(label); <b>{(first + sep + label + id) as string}</b> }</li>)}</ul></div>
}
`,
			'component-callback-block-map.tsrx',
			dev,
		);
	// Not an array, so the output `.map` takes its callback fallback.
	const mappable = (...ids: number[]) => ({ map: (row: (id: number) => unknown) => ids.map(row) });
	const LISTS = [
		{ name: 'SetupList', ids: (...ids: number[]) => ids },
		{ name: 'OutputList', ids: mappable },
	];

	for (const list of LISTS) {
		it(`renders a block per row of ${list.name} and keeps each row's state`, async () => {
			const modules = listModules();
			const html = (...rows: string[]) =>
				`<div class="list"><ul>${rows.map((row) => `<li><b>${row}</b></li>`).join('')}</ul></div>`;
			expect(serverHtml(modules, list.name, { ids: list.ids(1, 2), label: 'a' })).toBe(
				html('a/a1', 'a/a2'),
			);

			const container = newContainer();
			const root = createRoot(container);
			flushSync(() => root.render(modules.client[list.name], { ids: list.ids(1, 2), label: 'a' }));
			expect(content(container)).toBe(html('a/a1', 'a/a2'));
			const second = container.querySelectorAll('b')[1];
			// Row 2 keeps its state and its DOM when it moves; row 3 starts fresh.
			flushSync(() => root.render(modules.client[list.name], { ids: list.ids(2, 3), label: 'b' }));
			expect(content(container)).toBe(html('a/b2', 'b/b3'));
			expect(container.querySelectorAll('b')[0]).toBe(second);
			root.unmount();

			const hydrated = newContainer();
			hydrated.innerHTML = ServerRT.renderToString(modules.server[list.name], {
				ids: list.ids(1, 2),
				label: 'a',
			}).html;
			const serverRows = Array.from(hydrated.querySelectorAll('b'));
			const recoverable: unknown[] = [];
			const hydratedRoot = hydrateRoot(
				hydrated,
				modules.client[list.name],
				{ ids: list.ids(1, 2), label: 'a' },
				{ onRecoverableError: (error) => recoverable.push(error) },
			);
			await act(() => {});
			expect(recoverable).toEqual([]);
			expect(Array.from(hydrated.querySelectorAll('b'))).toEqual(serverRows);
			flushSync(() =>
				hydratedRoot.render(modules.client[list.name], { ids: list.ids(1, 2), label: 'b' }),
			);
			expect(content(hydrated)).toBe(html('a/b1', 'a/b2'));
			hydratedRoot.unmount();
		});
	}

	it('runs the setup of a code-only block with the callback params and renders nothing for it', async () => {
		const modules = load(
			`import { useEffect } from 'octane';
export function Effect({ id: rowId, log }: { id: number; log: string[] }) @{
	const prefix = 'effect ';
	const render = (id: number) => <p>@{ useEffect(() => { log.push(prefix + id); }); }</p>;
	<div class="list">{render(rowId)}</div>
}
`,
			'component-callback-block-effect.tsrx',
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

	// A `() => @{ … }` body compiled where it is written sees every name in scope
	// there, not only its own locals, so what it hoists out of itself is handed
	// the component's names as well as its own.
	it('threads a component prop into the @if arm of a render prop in a returned-JSX component', async () => {
		const modules = load(
			`export function Title({ title }: { title: string }) {
	const heading = <section>{() => @{ @if (title !== '') { <b>{title as string}</b> } }}</section>;
	return <div class="list">{heading}</div>;
}
`,
			'component-callback-block-returned.tsrx',
			dev,
		);
		const states = [{ title: 'a' }, { title: 'b' }];
		const html = states.map(
			({ title }) => `<div class="list"><section><b>${title}</b></section></div>`,
		);
		expect(serverHtml(modules, 'Title', states[0])).toBe(html[0]);
		const mounted = mount(modules, 'Title', states);
		expect(mounted.seen).toEqual(html);
		expect(mounted.blocks[1]).toBe(mounted.blocks[0]);

		const result = await hydrate(modules, 'Title', states);
		expect(result.recoverable).toEqual([]);
		expect(result.errors).toEqual([]);
		expect(result.hydrated).toBe(html[0]);
		expect(result.hydratedElements).toEqual(result.serverElements);
		expect(result.updated).toBe(html[1]);
		expect(result.blockSurvived).toBe(true);
	});

	it('hands a component prop to a handler in a portal body alongside the body state', () => {
		const modules = load(
			`import { useState, createPortal } from 'octane';
export function Counter({ log, target }: { log: (n: number) => void; target: HTMLElement }) @{
	<div class="list">
		{createPortal(
			() => @{
				const [n, setN] = useState(0);
				<button onClick={() => {
					log(n);
					setN(n + 1);
				}}>{n as string}</button>
			},
			target,
		)}
	</div>
}
`,
			'component-callback-block-portal.tsrx',
			dev,
		);
		const target = newContainer();
		const root = createRoot(newContainer());
		const log: number[] = [];
		flushSync(() =>
			root.render(modules.client.Counter, { log: (n: number) => log.push(n), target }),
		);
		const button = target.querySelector('button')!;
		flushSync(() => button.click());
		flushSync(() => button.click());
		expect(log).toEqual([0, 1]);
		expect(button.textContent).toBe('2');
		root.unmount();
	});

	// A name a nested scope declares for itself (a block's setup, a `@catch` param)
	// is not a read of the callback's same-named binding. Here that binding lives in
	// a sibling block, so it is not in scope where the block is written at all.
	describe('with a callback binding that only a nested scope shares', () => {
		const SIBLING = `if (x < 0) {
			const y = -x;
			console.log(y);
		}
		try {
			console.log(x);
		} catch (reset) {
			console.log(reset);
		}`;
		const SHAPES: Record<string, { jsx: string; inner: (id: number) => string }> = {
			BlockLocal: {
				jsx: '<p>@{ const y = x + 1; <b>{y as string}</b> }</p>',
				inner: (id) => `<b>${id + 1}</b>`,
			},
			// The arm hoists, and threads what the nested block reads from the call site.
			ArmBlockLocal: {
				jsx: '<p>@if (x > 0) { <i>@{ const y = x + 1; <b>{y as string}</b> }</i> }</p>',
				inner: (id) => `<i><b>${id + 1}</b></i>`,
			},
			CatchReset: {
				jsx: "<p>@try { <b>{x as string}</b> } @catch (err, reset) { <button onClick={() => reset()}>{'retry'}</button> }</p>",
				inner: (id) => `<b>${id}</b>`,
			},
		};
		let compiled: Modules | undefined;
		const modules = () =>
			(compiled ??= load(
				Object.entries(SHAPES)
					.map(
						([name, shape]) => `export function ${name}({ id: rowId }: { id: number }) @{
	const render = (x: number) => {
		${SIBLING}
		return ${shape.jsx};
	};
	<div class="list">{render(rowId)}</div>
}`,
					)
					.join('\n'),
				'component-callback-block-shadow.tsrx',
				dev,
			));
		const states = [{ id: 1 }, { id: 2 }];

		for (const [name, shape] of Object.entries(SHAPES)) {
			const html = states.map(({ id }) => `<div class="list"><p>${shape.inner(id)}</p></div>`);

			it(`renders ${name} on the server and on mount and update`, () => {
				expect(serverHtml(modules(), name, states[0])).toBe(html[0]);
				const mounted = mount(modules(), name, states);
				expect(mounted.seen).toEqual(html);
				expect(mounted.blocks[1]).toBe(mounted.blocks[0]);
			});

			it(`hydrates ${name} from renderToString`, async () => {
				const result = await hydrate(modules(), name, states);
				expect(result.recoverable).toEqual([]);
				expect(result.errors).toEqual([]);
				expect(result.hydrated).toBe(html[0]);
				expect(result.hydratedElements).toEqual(result.serverElements);
				expect(result.updated).toBe(html[1]);
				expect(result.blockSurvived).toBe(true);
			});
		}
	});
});
