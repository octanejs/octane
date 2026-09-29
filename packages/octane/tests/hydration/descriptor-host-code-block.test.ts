import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createRoot, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource } from '../_server-fixture.js';

// The compiler builds a keyed, `noscript`, or parser-repaired host as a
// descriptor rather than a template. A child `@{ … }` block inside one must
// render exactly as it does under an ordinary host, on the client and the
// server: a render-only block is transparent grouping, and a setup-bearing block
// is its own render scope that keeps hook state across parent updates.

type Props = Record<string, unknown>;
type Modules = ReturnType<typeof load>;

function load(source: string, id: string, dev: boolean) {
	const compileOptions = { dev };
	return {
		client: loadCompiledFixtureSource(source, { id, mode: 'client', compileOptions }),
		server: loadCompiledFixtureSource(source, { id, mode: 'server', compileOptions }),
	};
}

const PARAMS = '{ id, label }: { id: number; label: string }';
const RENDER_ONLY = '@{ <b>{label as string}</b> }';
const SETUP = "@{ const [first] = useState(label); <b>{(first + '/' + label) as string}</b> }";

// `open`/`close` wrap the block in the host under test; `Plain*` wrap it in an
// ordinary template `<p>`, the behavior every host must match.
function source(open: string, close: string) {
	const forms = (prefix: string, o: string, c: string) => `
function ${prefix}Body(${PARAMS}) @{ ${o}${RENDER_ONLY}${c} }
function ${prefix}SetupBody(${PARAMS}) @{ ${o}${SETUP}${c} }
function ${prefix}Return(${PARAMS}) { return ${o}${RENDER_ONLY}${c}; }
function ${prefix}SetupReturn(${PARAMS}) { return ${o}${SETUP}${c}; }
function ${prefix}Nested(${PARAMS}) { return <div class="wrap">${o}${RENDER_ONLY}${c}</div>; }
function ${prefix}SetupNested(${PARAMS}) { return <div class="wrap">${o}${SETUP}${c}</div>; }
`;
	const apps = FORMS.map(
		(form) =>
			`export function ${form}(props: { id: number; label: string }) @{ <div class="list"><Host${form} {...props} /></div> }
export function Plain${form}(props: { id: number; label: string }) @{ <div class="list"><Ref${form} {...props} /></div> }`,
	).join('\n');
	return `import { Fragment, useState } from 'octane';
function Box({ children }: { children: any }) @{
	<em>{children}</em>
}
${forms('Host', open, close)}
${forms('Ref', '<p class="row">', '</p>')}
${apps}
`;
}

const FORMS = ['Body', 'SetupBody', 'Return', 'SetupReturn', 'Nested', 'SetupNested'] as const;
type Form = (typeof FORMS)[number];
// A keyed host that is itself a component's returned root does not hydrate in
// place yet, whatever its children (it duplicates the element). The returned
// forms hydrate the same keyed host one template element down instead.
const HYDRATED_FORMS = new Set<Form>(['Body', 'SetupBody', 'Nested', 'SetupNested']);

// Same key, new label: the host and the block's scope survive. New key: a keyed
// host remounts, so the block's state starts over; an unkeyed host keeps it.
const STATES: Props[] = [
	{ id: 1, label: 'a' },
	{ id: 1, label: 'b' },
	{ id: 2, label: 'c' },
];

function expected(form: Form, host: (inner: string) => string, keyed: boolean): string[] {
	const setup = form.startsWith('Setup');
	const inner = setup ? ['a/a', 'a/b', keyed ? 'c/c' : 'a/c'] : ['a', 'b', 'c'];
	const nested = form.endsWith('Nested');
	return inner.map((text) => {
		const rendered = host(`<b>${text}</b>`);
		return `<div class="list">${nested ? `<div class="wrap">${rendered}</div>` : rendered}</div>`;
	});
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

const HOSTS: {
	name: string;
	open: string;
	close: string;
	html: (inner: string) => string;
	keyed: boolean;
	hydrates: boolean;
}[] = [
	{
		name: 'a keyed host',
		open: '<p key={id} class="row">',
		close: '</p>',
		html: (inner) => `<p class="row">${inner}</p>`,
		keyed: true,
		hydrates: true,
	},
	{
		name: 'a nested host in a keyed host',
		open: '<p key={id} class="row"><span>',
		close: '</span></p>',
		html: (inner) => `<p class="row"><span>${inner}</span></p>`,
		keyed: true,
		hydrates: true,
	},
	{
		name: 'a fragment in a keyed host',
		open: '<p key={id} class="row"><>',
		close: '</></p>',
		html: (inner) => `<p class="row">${inner}</p>`,
		keyed: true,
		hydrates: true,
	},
	{
		name: 'a long-form Fragment in a keyed host',
		open: '<p key={id} class="row"><Fragment>',
		close: '</Fragment></p>',
		html: (inner) => `<p class="row">${inner}</p>`,
		keyed: true,
		hydrates: true,
	},
	{
		name: 'component children in a keyed host',
		open: '<p key={id} class="row"><Box>',
		close: '</Box></p>',
		html: (inner) => `<p class="row"><em>${inner}</em></p>`,
		keyed: true,
		hydrates: true,
	},
	{
		// Hydration treats `<noscript>` as raw text, as a scripting browser parses
		// it; jsdom parses its content as elements, so only mount and SSR run here.
		name: 'a noscript host',
		open: '<noscript>',
		close: '</noscript>',
		html: (inner) => `<noscript>${inner}</noscript>`,
		keyed: false,
		hydrates: false,
	},
	{
		// The `<div>` child makes the HTML parser split the `<p>`, so the client
		// builds this host imperatively (the server keeps its template). Parsing
		// the server HTML splits it, so only mount and SSR run here.
		name: 'a parser-repaired host',
		open: '<p class="row">',
		close: "<div>{'!'}</div></p>",
		html: (inner) => `<p class="row">${inner}<div>!</div></p>`,
		keyed: false,
		hydrates: false,
	},
];

describe.each([false, true])(
	'a child @{} block inside a descriptor-built host (dev: %s)',
	(dev) => {
		for (const [index, host] of HOSTS.entries()) {
			const modules = () =>
				load(source(host.open, host.close), `descriptor-host-block-${index}.tsrx`, dev);

			for (const form of FORMS) {
				it(`renders ${host.name} ${form} block on the server and on mount and update`, () => {
					const compiled = modules();
					const html = expected(form, host.html, host.keyed);
					// The same block under an ordinary host is the reference.
					const plain = mount(compiled, `Plain${form}`);
					expect(plain.seen).toEqual(
						expected(form, (inner) => `<p class="row">${inner}</p>`, false),
					);

					expect(serverHtml(compiled, form, STATES[0])).toBe(html[0]);
					const mounted = mount(compiled, form);
					expect(mounted.seen).toEqual(html);
					// A same-key update keeps the block's DOM, as the ordinary host does.
					expect(mounted.blocks[1]).toBe(mounted.blocks[0]);
					expect(plain.blocks[1]).toBe(plain.blocks[0]);
				});

				if (!host.hydrates || !HYDRATED_FORMS.has(form)) continue;
				it(`hydrates ${host.name} ${form} block from renderToString`, async () => {
					const compiled = modules();
					const html = expected(form, host.html, host.keyed);
					const result = await hydrate(compiled, form);
					expect(result.recoverable).toEqual([]);
					expect(result.errors).toEqual([]);
					expect(result.hydrated).toBe(html[0]);
					expect(result.hydratedElements).toEqual(result.serverElements);
					expect(result.updated).toBe(html[1]);
					expect(result.blockSurvived).toBe(true);
				});
			}
		}
	},
);

describe.each([false, true])('a child @{} block that is not HTML content (dev: %s)', (dev) => {
	const SVG_NS = 'http://www.w3.org/2000/svg';
	const compiled = () =>
		load(
			`import { useEffect, useState } from 'octane';
function SvgHost({ id, label }: { id: number; label: string }) {
	return <svg><g key={id}>@{ const [first] = useState(label); <text>{(first + '/' + label) as string}</text> }</g></svg>;
}
function EffectHost({ id, log }: { id: number; log: string[] }) {
	return <p key={id}>@{ useEffect(() => { log.push('effect ' + id); }); }</p>;
}
export function SvgBody({ id, label }: { id: number; label: string }) @{
	<div class="list"><svg><g key={id}>@{ const [first] = useState(label); <text>{(first + '/' + label) as string}</text> }</g></svg></div>
}
export function SvgReturn(props: { id: number; label: string }) @{ <div class="list"><SvgHost {...props} /></div> }
export function EffectBody({ id, log }: { id: number; log: string[] }) @{
	<div class="list"><p key={id}>@{ useEffect(() => { log.push('effect ' + id); }); }</p></div>
}
export function EffectReturn(props: { id: number; log: string[] }) @{ <div class="list"><EffectHost {...props} /></div> }
`,
			'descriptor-host-block-special.tsrx',
			dev,
		);

	for (const name of ['SvgBody', 'SvgReturn']) {
		it(`renders ${name} in the SVG namespace and hydrates it`, async () => {
			const modules = compiled();
			const svg = (text: string) =>
				`<div class="list"><svg><g><text>${text}</text></g></svg></div>`;
			expect(serverHtml(modules, name, STATES[0])).toBe(svg('a/a'));

			const container = newContainer();
			const root = createRoot(container);
			flushSync(() => root.render(modules.client[name], STATES[0]));
			expect(content(container)).toBe(svg('a/a'));
			expect(container.querySelector('text')!.namespaceURI).toBe(SVG_NS);
			flushSync(() => root.render(modules.client[name], STATES[1]));
			expect(content(container)).toBe(svg('a/b'));
			root.unmount();

			const result = await hydrate(modules, name);
			expect(result.recoverable).toEqual([]);
			expect(result.errors).toEqual([]);
			expect(result.hydrated).toBe(svg('a/a'));
			expect(result.hydratedElements).toEqual(result.serverElements);
			expect(result.updated).toBe(svg('a/b'));
		});
	}

	for (const name of ['EffectBody', 'EffectReturn']) {
		it(`runs the setup of a code-only ${name} block and renders nothing for it`, async () => {
			const modules = compiled();
			const empty = '<div class="list"><p></p></div>';
			expect(serverHtml(modules, name, { id: 1, log: [] })).toBe(empty);

			const container = newContainer();
			const root = createRoot(container);
			const log: string[] = [];
			await act(() => root.render(modules.client[name], { id: 1, log }));
			expect(content(container)).toBe(empty);
			expect(log).toEqual(['effect 1']);
			root.unmount();

			const hydrated = newContainer();
			hydrated.innerHTML = ServerRT.renderToString(modules.server[name], { id: 1, log: [] }).html;
			const paragraph = hydrated.querySelector('p');
			const recoverable: unknown[] = [];
			const hydrateLog: string[] = [];
			const hydratedRoot = hydrateRoot(
				hydrated,
				modules.client[name],
				{ id: 1, log: hydrateLog },
				{
					onRecoverableError: (error) => recoverable.push(error),
				},
			);
			await act(() => {});
			expect(recoverable).toEqual([]);
			expect(hydrateLog).toEqual(['effect 1']);
			expect(hydrated.querySelector('p')).toBe(paragraph);
			hydratedRoot.unmount();
		});
	}
});
