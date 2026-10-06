import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement, createRoot, hydrateRoot, flushSync } from '../../src/index.js';
import { condition, load } from 'octane/hydration';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// STRUCTURAL hydration mismatch: the server DOM's SHAPE differs from what the
// client renders (a swapped @if/@switch branch, a changed tag, a different @for
// list length, a renderable hole whose value changed kind). As in React 19,
// nothing is repaired in place: the nearest Suspense boundary, `<Hydrate>`
// island, or else the root discards its server DOM and renders on the client.
// onRecoverableError fires once for it, a development build also warns with
// the source location, and server nodes outside a failed boundary stay
// adopted. We force the mismatch by server-rendering with one set of props and
// hydrating with another.

const CONTROL = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/control.tsrx');
const FORLIST = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/forlist.tsrx');
const STRUCTURAL = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/structural.tsrx');
const SWAP = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/swap.tsrx');
const EMPTYFOR = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/emptyfor.tsrx');
const NESTEDSWAP = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/nested-swap.tsrx',
);
const MIXEDFRAG = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/mixed-frag.tsrx');
const FRAGMENTSTATICS = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/fragment-statics.tsrx',
);
const TERNARY = join(process.cwd(), 'packages/octane/tests/_fixtures/ternary-mixed-arms.tsrx');

/** The recoverable error a failed boundary or root reports in a development runtime. */
const MISMATCH = /^Hydration failed because the server rendered HTML didn't match the client\./;
/** The same error from a production runtime, which reports the code instead of the message. */
const MINIFIED_MISMATCH = /^Minified Octane error #339;/;

function serverModule(fixture: string, file: string): Record<string, any> {
	return loadServerFixture(fixture, { id: file });
}

function devClientModule(fixture: string, file: string): Record<string, any> {
	return loadCompiledFixtureSource(readFileSync(fixture, 'utf8'), {
		id: file,
		mode: 'client',
		compileOptions: { dev: true },
	});
}

// PROD-compiled client module (dev: false → no `loc` argument to clone(), no
// `__oct_loc` stamps): the mismatch and its fallback must still happen — only
// the warning is dev-gated.
function prodClientModule(fixture: string, file: string): Record<string, any> {
	return loadCompiledFixtureSource(readFileSync(fixture, 'utf8'), { id: file, mode: 'client' });
}

/** Element and text markup, ignoring hydration comments. */
function markup(node: Element): string {
	const copy = node.cloneNode(true) as Element;
	const walker = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT);
	const comments: Node[] = [];
	while (walker.nextNode()) comments.push(walker.currentNode);
	for (const comment of comments) comment.parentNode!.removeChild(comment);
	return copy.innerHTML;
}

/** Every element and non-empty text node under `root`, in document order. */
function contentNodes(root: Node): Node[] {
	const nodes: Node[] = [];
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
	while (walker.nextNode()) {
		const node = walker.currentNode;
		if (node.nodeType === 1 || node.nodeValue !== '') nodes.push(node);
	}
	return nodes;
}

/** The nodes of `nodes` that are still in the document. */
const survivors = (nodes: readonly Node[]) => nodes.filter((node) => node.isConnected);

/** A location-bearing structural warning from `file` (development builds only). */
function structuralWarning(file: string, expected = '.+', actual = '.+'): RegExp {
	return new RegExp(
		`^Octane hydration mismatch at [^ ]*${file.replace(/\./g, '\\.')}:\\d+:\\d+: ` +
			`the client expected ${expected} but the server rendered ${actual}\\. The nearest ` +
			`Suspense or Hydrate boundary, or the root, will be regenerated on the client\\.`,
	);
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('hydrateRoot — STRUCTURAL mismatch with no boundary renders the root on the client', () => {
	const server = serverModule(CONTROL, 'control.tsrx');
	const clientDev = devClientModule(CONTROL, 'control.tsrx');
	let container: HTMLElement;
	let errSpy: ReturnType<typeof vi.spyOn>;
	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});
	afterEach(() => {
		container.remove();
		errSpy.mockRestore();
	});

	const warns = () =>
		errSpy.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('hydration mismatch'));

	/** Hydrate `html` with `Component`, recording what the server rendered and every report. */
	async function hydrateOver(html: string, Component: unknown, props: Record<string, unknown>) {
		container.innerHTML = html;
		const serverNodes = contentNodes(container);
		const recovered: Error[] = [];
		const root = hydrateRoot(container, Component as never, props as never, {
			onRecoverableError: (error) => recovered.push(error as Error),
		});
		flushSync(() => {});
		// Recoverable reports are delivered after the hydration burst.
		await act(async () => {});
		return { serverNodes, recovered, root };
	}

	it('@if branch swap: server <button>, client <span> → the root renders on the client', async () => {
		const { html } = await ServerRT.renderToString(server.Toggle, { on: true });
		expect(html).toContain('<button id="hit"');
		const { serverNodes, recovered, root } = await hydrateOver(html, clientDev.Toggle, {
			on: false,
		});
		try {
			expect(markup(container)).toBe('<div id="toggle"><span class="off">off</span></div>');
			expect(survivors(serverNodes)).toEqual([]);
			expect(recovered.map((error) => error.message)).toEqual([expect.stringMatching(MISMATCH)]);
			expect(warns()).toEqual([
				expect.stringMatching(structuralWarning('control.tsrx', '.+', '<button>')),
			]);
		} finally {
			root.unmount();
		}
	});

	// React skips server nodes it cannot match directly inside the root
	// container, so a third party's sibling stays where it was.
	it('leaves an unmatched server sibling after the adopted root in place', async () => {
		const { html } = await ServerRT.renderToString(server.Toggle, { on: true });
		container.innerHTML = `${html}<p id="stale-tail">stale</p>`;
		const button = container.querySelector('#hit')!;
		const tail = container.querySelector('#stale-tail')!;
		const recovered: unknown[] = [];
		const root = hydrateRoot(
			container,
			clientDev.Toggle,
			{ on: true },
			{ onRecoverableError: (error) => recovered.push(error) },
		);
		flushSync(() => {});
		await act(async () => {});
		try {
			expect(container.querySelector('#hit')).toBe(button);
			expect(container.querySelector('#stale-tail')).toBe(tail);
			expect(markup(container)).toBe(
				'<div id="toggle"><button id="hit" class="on">on:0</button></div><p id="stale-tail">stale</p>',
			);
			flushSync(() => (button as HTMLButtonElement).click());
			expect(button.textContent).toBe('on:1');
			expect(recovered).toEqual([]);
			expect(warns()).toEqual([]);
		} finally {
			root.unmount();
		}
	});

	// The prod root fallback skips the location lookup; dev must still name the
	// root component and both sides of the divergence.
	it('a fragment root over unmatched server markup renders on the client and warns with the root location in dev', async () => {
		const { serverNodes, recovered, root } = await hydrateOver(
			'<section id="stale">server</section>',
			devClientModule(MIXEDFRAG, 'mixed-frag.tsrx').MixedFrag,
			{},
		);
		try {
			expect(survivors(serverNodes)).toEqual([]);
			expect(markup(container)).toBe('<div class="leaf">A</div><input type="text">');
			expect(recovered.map((error) => error.message)).toEqual([expect.stringMatching(MISMATCH)]);
			expect(warns()).toEqual([expect.stringMatching(structuralWarning('mixed-frag.tsrx'))]);
		} finally {
			root.unmount();
		}
	});

	it('@switch case swap (different tags): server <em>, client <strong> → the root renders on the client', async () => {
		const srv = serverModule(STRUCTURAL, 'structural.tsrx');
		const cli = devClientModule(STRUCTURAL, 'structural.tsrx');
		const { html } = await ServerRT.renderToString(srv.Pick, { k: 'a' });
		expect(html).toContain('<em class="a">');
		const { serverNodes, recovered, root } = await hydrateOver(html, cli.Pick, { k: 'b' });
		try {
			expect(markup(container)).toBe('<div id="pick"><strong class="b">BBB</strong></div>');
			expect(survivors(serverNodes)).toEqual([]);
			expect(recovered).toHaveLength(1);
			expect(warns()).toEqual([
				expect.stringMatching(structuralWarning('structural.tsrx', '.+', '<em>')),
			]);
		} finally {
			root.unmount();
		}
	});

	// Every case is a <span> distinguished only by a static class, so the tag
	// matches. The class is kept as the server rendered it, but the case's text
	// differs, and a text mismatch falls back like a structural one.
	it('@switch same-tag swap: server <span class="a">AAA, client <span class="b">BBB → the text renders the root on the client', async () => {
		const { html } = await ServerRT.renderToString(server.Pick, { k: 'a' });
		expect(html).toContain('<span class="a">');
		const { serverNodes, recovered, root } = await hydrateOver(html, clientDev.Pick, { k: 'b' });
		try {
			expect(markup(container)).toBe('<div id="pick"><span class="b">BBB</span></div>');
			expect(survivors(serverNodes)).toEqual([]);
			expect(recovered.map((error) => error.message)).toEqual([expect.stringMatching(MISMATCH)]);
			expect(warns().length).toBeGreaterThanOrEqual(1);
		} finally {
			root.unmount();
		}
	});

	it('host → component swap: server <p>, client <Inner> → the root renders on the client', async () => {
		const srv = serverModule(SWAP, 'swap.tsrx');
		const cli = devClientModule(SWAP, 'swap.tsrx');
		const { html } = await ServerRT.renderToString(srv.Swap, { host: true });
		expect(html).toContain('<p class="host">');
		const { serverNodes, recovered, root } = await hydrateOver(html, cli.Swap, { host: false });
		try {
			expect(markup(container)).toBe('<div id="swap"><b class="inner">C</b></div>');
			expect(survivors(serverNodes)).toEqual([]);
			expect(recovered).toHaveLength(1);
			expect(warns()).toEqual([expect.stringMatching(structuralWarning('swap.tsrx', '.+', '<p>'))]);
		} finally {
			root.unmount();
		}
	});

	it('component → host swap: server <Inner>, client <p> → the root renders on the client', async () => {
		const srv = serverModule(SWAP, 'swap.tsrx');
		const cli = devClientModule(SWAP, 'swap.tsrx');
		const { html } = await ServerRT.renderToString(srv.Swap, { host: false });
		expect(html).toContain('<b class="inner">');
		const { serverNodes, recovered, root } = await hydrateOver(html, cli.Swap, { host: true });
		try {
			expect(markup(container)).toBe('<div id="swap"><p class="host">H</p></div>');
			expect(survivors(serverNodes)).toEqual([]);
			expect(recovered).toHaveLength(1);
			expect(warns()).toEqual([
				expect.stringMatching(structuralWarning('swap.tsrx', '<p>', 'a control-flow block')),
			]);
		} finally {
			root.unmount();
		}
	});

	// OCTANE DIVERGENCE: an adopted template is matched by its root's node type
	// and tag in development and production alike, so production never walks
	// static template content. The nested static markup the server rendered is
	// kept, and only a development build compares it, warning that it won't be
	// patched up. React hydrates every element and would render the root on the
	// client here.
	it('same root, different NESTED static structure: keeps the server markup and warns in dev', async () => {
		const srv = serverModule(NESTEDSWAP, 'nested-swap.tsrx');
		const cli = devClientModule(NESTEDSWAP, 'nested-swap.tsrx');
		const { html } = await ServerRT.renderToString(srv.NestedStatic, { x: true });
		expect(html).toContain('<span class="s1">');
		const { serverNodes, recovered, root } = await hydrateOver(html, cli.NestedStatic, {
			x: false,
		});
		try {
			expect(survivors(serverNodes)).toEqual(serverNodes);
			expect(container.querySelector('section.box span.s1')?.textContent).toBe('one');
			expect(recovered).toEqual([]);
			expect(warns()).toEqual([expect.stringContaining("This won't be patched up")]);
			flushSync(() => root.render(cli.NestedStatic, { x: true }));
			expect(markup(container.querySelector('#ns')!)).toBe(
				'<section class="box"><span class="s1">one</span></section>',
			);
		} finally {
			root.unmount();
		}
	});

	// OCTANE DIVERGENCE (as above): a fragment has no wrapper, so the roots its
	// adoption matches are checked one by one. Their static differences are kept
	// and only warned about in development.
	it.each([
		{
			name: 'a root fragment',
			server: 'ServerRootFragment',
			client: 'ClientRootFragment',
			kept: '<h1 class="title">Heading</h1><section class="box"><span class="s1">one</span></section>',
			listed: '<section>',
		},
		{
			name: 'a fragment nested in a host',
			server: 'ServerNestedFragment',
			client: 'ClientNestedFragment',
			kept: '<div id="nested"><b class="server">bold</b><i>italic</i></div>',
			listed: '<b>',
		},
	])(
		'$name with different static markup: keeps the server markup and warns in dev',
		async ({ server: serverName, client: clientName, kept, listed }) => {
			const srv = serverModule(FRAGMENTSTATICS, 'fragment-statics.tsrx');
			const cli = devClientModule(FRAGMENTSTATICS, 'fragment-statics.tsrx');
			const { html } = await ServerRT.renderToString(srv[serverName], {});
			const { serverNodes, recovered, root } = await hydrateOver(html, cli[clientName], {});
			try {
				expect(markup(container)).toBe(kept);
				expect(survivors(serverNodes)).toEqual(serverNodes);
				expect(recovered).toEqual([]);
				expect(warns()).toEqual([expect.stringContaining("This won't be patched up")]);
				expect(warns()[0]).toContain(`static attributes or markup of the server's ${listed}`);
			} finally {
				root.unmount();
			}
		},
	);

	it('PROD build: @if branch swap renders the root on the client SILENTLY (no dev location needed)', async () => {
		const clientProd = prodClientModule(CONTROL, 'control.tsrx');
		const { html } = await ServerRT.renderToString(server.Toggle, { on: true });
		expect(html).toContain('<button id="hit"');
		const { serverNodes, recovered, root } = await hydrateOver(html, clientProd.Toggle, {
			on: false,
		});
		try {
			expect(markup(container)).toBe('<div id="toggle"><span class="off">off</span></div>');
			expect(survivors(serverNodes)).toEqual([]);
			expect(recovered.map((error) => error.message)).toEqual([expect.stringMatching(MISMATCH)]);
			expect(warns()).toEqual([]); // a production compile has no location to warn with
		} finally {
			root.unmount();
		}
	});

	it('PROD build: matching branch adopts hosts without a false-positive mismatch', async () => {
		const clientProd = prodClientModule(CONTROL, 'control.tsrx');
		const { html } = await ServerRT.renderToString(server.Toggle, { on: true });
		container.innerHTML = html;
		const toggle = container.querySelector('#toggle')!;
		const button = container.querySelector('#hit') as HTMLButtonElement;
		const root = hydrateRoot(container, clientProd.Toggle, { on: true });
		flushSync(() => {});
		expect(container.querySelector('#toggle')).toBe(toggle);
		expect(container.querySelector('#hit')).toBe(button);
		expect(button.textContent).toBe('on:0');
		// A compact server range may already be minimal, so adoption cannot be
		// identified by deleting comments; the adopted host must stay interactive.
		flushSync(() => button.click());
		expect(container.querySelector('#hit')).toBe(button);
		expect(button.textContent).toBe('on:1');
		root.render(clientProd.Toggle, { on: true });
		flushSync(() => {});
		expect(container.querySelector('#toggle')).toBe(toggle);
		expect(container.querySelector('#hit')).toBe(button);
		expect(button.textContent).toBe('on:1');
		expect(warns()).toEqual([]);
		root.unmount();
	});

	it('no warning + adopted hosts when the branch matches', async () => {
		const { html } = await ServerRT.renderToString(server.Toggle, { on: true });
		container.innerHTML = html;
		const toggle = container.querySelector('#toggle')!;
		const button = container.querySelector('#hit') as HTMLButtonElement;
		const root = hydrateRoot(container, clientDev.Toggle, { on: true });
		flushSync(() => {});
		expect(container.querySelector('#toggle')).toBe(toggle);
		expect(container.querySelector('#hit')).toBe(button);
		expect(button.textContent).toBe('on:0');
		flushSync(() => button.click());
		expect(container.querySelector('#hit')).toBe(button);
		expect(button.textContent).toBe('on:1');
		root.render(clientDev.Toggle, { on: true });
		flushSync(() => {});
		expect(container.querySelector('#toggle')).toBe(toggle);
		expect(container.querySelector('#hit')).toBe(button);
		expect(button.textContent).toBe('on:1');
		expect(warns()).toEqual([]);
		root.unmount();
	});

	it('@for list grow: server 2 items, client 3 → the root renders all 3 on the client', async () => {
		const srv = serverModule(FORLIST, 'forlist.tsrx');
		const cli = devClientModule(FORLIST, 'forlist.tsrx');
		const two = [
			{ id: 1, name: 'a' },
			{ id: 2, name: 'b' },
		];
		const three = [...two, { id: 3, name: 'c' }];
		const { html } = await ServerRT.renderToString(srv.List, { items: two, onPick: () => {} });
		const { serverNodes, recovered, root } = await hydrateOver(html, cli.List, {
			items: three,
			onPick: () => {},
		});
		try {
			const names = [...container.querySelectorAll('span.name')].map((s) => s.textContent);
			expect(names).toEqual(['a', 'b', 'c']);
			expect(survivors(serverNodes)).toEqual([]);
			expect(recovered).toHaveLength(1);
			expect(warns()).toEqual([expect.stringMatching(structuralWarning('forlist.tsrx'))]);
		} finally {
			root.unmount();
		}
	});

	it('@for list shrink: server 3 items, client 2 → the unhydrated server row renders the root on the client', async () => {
		const srv = serverModule(FORLIST, 'forlist.tsrx');
		const cli = devClientModule(FORLIST, 'forlist.tsrx');
		const three = [
			{ id: 1, name: 'a' },
			{ id: 2, name: 'b' },
			{ id: 3, name: 'c' },
		];
		const { html } = await ServerRT.renderToString(srv.List, { items: three, onPick: () => {} });
		const { serverNodes, recovered, root } = await hydrateOver(html, cli.List, {
			items: three.slice(0, 2),
			onPick: () => {},
		});
		try {
			const names = [...container.querySelectorAll('span.name')].map((s) => s.textContent);
			expect(names).toEqual(['a', 'b']);
			expect(container.querySelectorAll('li.row')).toHaveLength(2);
			expect(survivors(serverNodes)).toEqual([]);
			expect(recovered).toHaveLength(1);
		} finally {
			root.unmount();
		}
	});

	it('@for list shrink: the client-rendered rows are interactive and reconcile afterwards', async () => {
		const srv = serverModule(FORLIST, 'forlist.tsrx');
		const cli = devClientModule(FORLIST, 'forlist.tsrx');
		const picked: number[] = [];
		const three = [
			{ id: 1, name: 'a' },
			{ id: 2, name: 'b' },
			{ id: 3, name: 'c' },
		];
		const onPick = (id: number) => picked.push(id);
		const { html } = await ServerRT.renderToString(srv.List, { items: three, onPick: () => {} });
		const { root } = await hydrateOver(html, cli.List, { items: three.slice(0, 2), onPick });
		try {
			const btns = container.querySelectorAll<HTMLButtonElement>('button.pick');
			expect(btns.length).toBe(2);
			flushSync(() => btns[1].click());
			expect(picked).toEqual([2]);
			flushSync(() => root.render(cli.List, { items: three, onPick }));
			const names = [...container.querySelectorAll('span.name')].map((s) => s.textContent);
			expect(names).toEqual(['a', 'b', 'c']);
		} finally {
			root.unmount();
		}
	});

	it('@empty: server rendered items, client is empty → the root renders @empty on the client', async () => {
		const srv = serverModule(EMPTYFOR, 'emptyfor.tsrx');
		const cli = devClientModule(EMPTYFOR, 'emptyfor.tsrx');
		const { html } = await ServerRT.renderToString(srv.WithEmpty, {
			items: [
				{ id: 1, name: 'a' },
				{ id: 2, name: 'b' },
			],
		});
		expect(html).toContain('<li class="row">');
		const { serverNodes, recovered, root } = await hydrateOver(html, cli.WithEmpty, { items: [] });
		try {
			expect(markup(container)).toBe('<ul id="we"><li class="empty">No items yet</li></ul>');
			expect(survivors(serverNodes)).toEqual([]);
			expect(recovered).toHaveLength(1);
		} finally {
			root.unmount();
		}
	});

	it('@empty: server rendered @empty, client has items → the root renders the items on the client', async () => {
		const srv = serverModule(EMPTYFOR, 'emptyfor.tsrx');
		const cli = devClientModule(EMPTYFOR, 'emptyfor.tsrx');
		const { html } = await ServerRT.renderToString(srv.WithEmpty, { items: [] });
		expect(html).toContain('<li class="empty">');
		const { serverNodes, recovered, root } = await hydrateOver(html, cli.WithEmpty, {
			items: [
				{ id: 1, name: 'a' },
				{ id: 2, name: 'b' },
			],
		});
		try {
			expect(markup(container)).toBe(
				'<ul id="we"><li class="row">a</li><li class="row">b</li></ul>',
			);
			expect(survivors(serverNodes)).toEqual([]);
			expect(recovered).toHaveLength(1);
		} finally {
			root.unmount();
		}
	});
});

// PROD RUNTIME validation contract (NODE_ENV=production — the runtime reads it at
// call time, so stubbing it around hydrateRoot exercises the build-time-stripped
// production branches under vitest). In prod, an adoption root is validated by
// nodeType + tag ONLY, answered from the template SOURCE, so the happy path never
// parses a template; tag-level and text-level mismatches still fall back.
describe('hydrateRoot — PROD runtime validation (root nodeType+tag only, parse-free happy path)', () => {
	const server = serverModule(CONTROL, 'control.tsrx');
	let container: HTMLElement;
	let errSpy: ReturnType<typeof vi.spyOn>;
	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.stubEnv('NODE_ENV', 'production');
	});
	afterEach(() => {
		vi.unstubAllEnvs();
		container.remove();
		errSpy.mockRestore();
	});

	const warns = () =>
		errSpy.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('hydration mismatch'));

	it('happy path adopts the server DOM without parsing or cloning any template', async () => {
		// Fresh module → cold template records: proves the adoption itself never
		// forces the lazy parse (the news-bench hydrate cost this contract removes)
		// and never clones template DOM (Svelte-5 parity: hydration adopts the
		// server nodes — a clone would be built only to be thrown away).
		const clientProd = prodClientModule(CONTROL, 'control.tsrx');
		const { html } = await ServerRT.renderToString(server.Toggle, { on: true });
		container.innerHTML = html;
		const button = container.querySelector('#hit') as HTMLButtonElement;
		const createEl = vi.spyOn(document, 'createElement');
		const cloneSpy = vi.spyOn(Node.prototype, 'cloneNode');
		hydrateRoot(container, clientProd.Toggle, { on: true });
		flushSync(() => {});
		// Adopted, not rebuilt — the template stayed an unparsed source string and
		// no DOM was cloned anywhere in the hydrate window.
		expect(container.querySelector('#hit')).toBe(button);
		expect(createEl.mock.calls.filter((c) => String(c[0]) === 'template')).toEqual([]);
		expect(cloneSpy).not.toHaveBeenCalled();
		createEl.mockRestore();
		cloneSpy.mockRestore();
		// The adopted branch is live (delegated handler reaches the server node).
		flushSync(() => button.click());
		expect(button.textContent).toBe('on:1');
		expect(warns()).toEqual([]);
	});

	it('tag-level branch mismatch renders the root on the client and reports it minified in prod', async () => {
		const clientProd = prodClientModule(CONTROL, 'control.tsrx');
		const { html } = await ServerRT.renderToString(server.Toggle, { on: true });
		expect(html).toContain('<button id="hit"');
		container.innerHTML = html;
		const serverNodes = contentNodes(container);
		const recovered: Error[] = [];
		const root = hydrateRoot(
			container,
			clientProd.Toggle,
			{ on: false },
			{ onRecoverableError: (error) => recovered.push(error as Error) },
		);
		flushSync(() => {});
		await act(async () => {});
		try {
			expect(markup(container)).toBe('<div id="toggle"><span class="off">off</span></div>');
			expect(survivors(serverNodes)).toEqual([]);
			expect(recovered.map((error) => error.message)).toEqual([
				expect.stringMatching(MINIFIED_MISMATCH),
			]);
			expect(warns()).toEqual([]);
		} finally {
			root.unmount();
		}
	});

	// Production matches an adopted root by tag, never by its static class; the
	// case's differing text is what falls back.
	it('same-tag branch divergence with differing text renders the root on the client in prod', async () => {
		const clientProd = prodClientModule(CONTROL, 'control.tsrx');
		const { html } = await ServerRT.renderToString(server.Pick, { k: 'a' });
		expect(html).toContain('<span class="a">');
		container.innerHTML = html;
		const serverNodes = contentNodes(container);
		const recovered: unknown[] = [];
		const root = hydrateRoot(
			container,
			clientProd.Pick,
			{ k: 'b' },
			{ onRecoverableError: (error) => recovered.push(error) },
		);
		flushSync(() => {});
		await act(async () => {});
		try {
			expect(markup(container)).toBe('<div id="pick"><span class="b">BBB</span></div>');
			expect(survivors(serverNodes)).toEqual([]);
			expect(recovered).toHaveLength(1);
			expect(warns()).toEqual([]);
		} finally {
			root.unmount();
		}
	});

	it('multi-root fragment component hydrates by adoption in prod', async () => {
		const srv = serverModule(MIXEDFRAG, 'mixed-frag.tsrx');
		const cli = prodClientModule(MIXEDFRAG, 'mixed-frag.tsrx');
		const { html } = await ServerRT.renderToString(srv.MixedFrag, {});
		container.innerHTML = html;
		const input = container.querySelector('input')!;
		const leaf = container.querySelector('.leaf')!;
		hydrateRoot(container, cli.MixedFrag, {});
		flushSync(() => {});
		expect(container.querySelector('input')).toBe(input);
		expect(container.querySelector('.leaf')).toBe(leaf);
		expect(leaf.textContent).toBe('A');
		expect(warns()).toEqual([]);
	});

	// A server sibling the root container cannot match stays in place, and a root
	// that cannot adopt the server markup renders on the client. Either way the
	// source location only feeds the dev warning: prod must not stringify the
	// root component's source to find a location nobody reads.
	it.each([
		{
			name: 'stale server siblings after the adopted root',
			html: async () =>
				(await ServerRT.renderToString(server.Toggle, { on: true })).html +
				'<p id="stale-tail">stale</p>',
			body: () => prodClientModule(CONTROL, 'control.tsrx').Toggle,
			props: { on: true },
			expected:
				'<div id="toggle"><button id="hit" class="on">on:0</button></div><p id="stale-tail">stale</p>',
			survives: true,
			reports: 0,
		},
		{
			name: 'an unframed string root over stale server markup',
			html: async () => '<p id="stale">server</p>',
			body: () =>
				function StringRoot() {
					return 'client';
				},
			props: {},
			expected: 'client',
			survives: false,
			reports: 1,
		},
		{
			name: 'a fragment root whose statics do not match the server',
			html: async () => '<section id="stale">server</section>',
			body: () => prodClientModule(MIXEDFRAG, 'mixed-frag.tsrx').MixedFrag,
			props: {},
			expected: '<div class="leaf">A</div><input type="text">',
			survives: false,
			reports: 1,
		},
	])(
		'hydrates $name without reading the root source',
		async ({ html, body, props, expected, survives, reports }) => {
			container.innerHTML = await html();
			const serverNodes = contentNodes(container);
			const Root = body();
			const recovered: unknown[] = [];
			const toString = vi.spyOn(Function.prototype, 'toString');
			let rootSourceReads: number;
			const root = hydrateRoot(container, Root, props, {
				onRecoverableError: (error) => recovered.push(error),
			});
			try {
				flushSync(() => {});
				rootSourceReads = toString.mock.contexts.filter((context) => context === Root).length;
			} finally {
				toString.mockRestore();
			}
			await act(async () => {});
			expect(markup(container)).toBe(expected);
			expect(survivors(serverNodes)).toEqual(survives ? serverNodes : []);
			expect(recovered).toHaveLength(reports);
			expect(rootSourceReads).toBe(0);
			expect(warns()).toEqual([]);
			root.unmount();
		},
	);
});

// RDX-HYD-006 — adapted from TanStack/redact's
// hydration-mismatch-recovery.test.tsx. A failed Suspense boundary renders on
// the client without disturbing the server nodes outside it; with no boundary,
// the whole root does. Either way the replacement content is live.
describe.each([
	{
		name: 'development compile',
		client: devClientModule(STRUCTURAL, 'structural.tsrx'),
		warns: true,
	},
	{
		name: 'production compile',
		client: prodClientModule(STRUCTURAL, 'structural.tsrx'),
		warns: false,
	},
])('hydrateRoot — mismatch containment ($name)', ({ client, warns: shouldWarn }) => {
	const server = serverModule(STRUCTURAL, 'structural.tsrx');
	let container: HTMLElement;
	let errSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		container.remove();
		errSpy.mockRestore();
	});

	function expectDiagnostics(recovered: readonly unknown[]): void {
		const messages = errSpy.mock.calls
			.map((call) => String(call[0]))
			.filter((message) => message.includes('hydration mismatch'));
		if (shouldWarn)
			expect(messages).toEqual([expect.stringMatching(structuralWarning('structural.tsrx'))]);
		else expect(messages).toEqual([]);
		expect(recovered).toHaveLength(1);
	}

	function hydrate(Component: unknown) {
		const recovered: unknown[] = [];
		const root = hydrateRoot(container, Component as never, { isClient: true } as never, {
			onRecoverableError: (error) => recovered.push(error),
		});
		flushSync(() => {});
		return { recovered, root };
	}

	// Per Redact hydration-mismatch-recovery.test.tsx:53-64.
	it('root recovery leaves one clean client tree with a live replacement handler', async () => {
		const { html } = await ServerRT.renderToString(server.RootScopedRecovery, {
			isClient: false,
		});
		container.innerHTML = html;
		const staleRoot = container.querySelector('#root-server')!;
		const staleLeaf = container.querySelector('#root-stale')!;
		const { recovered, root } = hydrate(client.RootScopedRecovery);
		await act(async () => {});

		try {
			expect(staleRoot.isConnected).toBe(false);
			expect(staleLeaf.isConnected).toBe(false);
			expect(container.querySelectorAll('#root-client')).toHaveLength(1);
			expect(container.querySelector('#root-server')).toBeNull();

			const action = container.querySelector<HTMLButtonElement>('#root-recovered-action')!;
			expect(action.textContent?.trim()).toBe('root:0');
			flushSync(() => action.click());
			expect(action.textContent?.trim()).toBe('root:1');
			expectDiagnostics(recovered);
		} finally {
			root.unmount();
		}
	});

	// Per Redact hydration-mismatch-recovery.test.tsx:262-297. Without a Suspense
	// boundary between them, a stable host does not contain the mismatch: as in
	// React, the root renders on the client.
	it('a mismatch beneath a stable host with no Suspense boundary renders the whole root on the client', async () => {
		const { html } = await ServerRT.renderToString(server.HostScopedRecovery, {
			isClient: false,
		});
		container.innerHTML = html;
		const serverNodes = contentNodes(container);
		const { recovered, root } = hydrate(client.HostScopedRecovery);
		await act(async () => {});

		try {
			expect(survivors(serverNodes)).toEqual([]);
			expect(container.querySelectorAll('#host-recovery-root')).toHaveLength(1);
			expect(container.querySelector('#host-server-range')).toBeNull();
			expect(container.querySelectorAll('#host-client-range')).toHaveLength(1);

			const recoveredAction = container.querySelector<HTMLButtonElement>('#host-recovered-action')!;
			const outsideAction = container.querySelector<HTMLButtonElement>('#host-outside-action')!;
			flushSync(() => recoveredAction.click());
			expect(recoveredAction.textContent?.trim()).toBe('inside:1');
			flushSync(() => outsideAction.click());
			expect(outsideAction.textContent?.trim()).toBe('outside:1');
			expectDiagnostics(recovered);
		} finally {
			root.unmount();
		}
	});

	// Per Redact hydration-mismatch-recovery.test.tsx:183-260.
	it('Suspense-scoped recovery preserves outside objects and installs the regenerated handler', async () => {
		const { html } = await ServerRT.renderToString(server.SuspenseScopedRecovery, {
			isClient: false,
		});
		container.innerHTML = html;
		const stableRoot = container.querySelector('#suspense-recovery-root')!;
		const stableHeader = container.querySelector('#suspense-stable-header')!;
		const outsideAction = container.querySelector<HTMLButtonElement>('#suspense-outside-action')!;
		const stableFooter = container.querySelector('#suspense-stable-footer')!;
		const staleRange = container.querySelector('#suspense-server-range')!;
		const { recovered, root } = hydrate(client.SuspenseScopedRecovery);
		await act(async () => {});

		try {
			expect(container.querySelector('#suspense-recovery-root')).toBe(stableRoot);
			expect(container.querySelector('#suspense-stable-header')).toBe(stableHeader);
			expect(container.querySelector('#suspense-outside-action')).toBe(outsideAction);
			expect(container.querySelector('#suspense-stable-footer')).toBe(stableFooter);
			expect(staleRange.isConnected).toBe(false);
			expect(container.querySelectorAll('#suspense-client-range')).toHaveLength(1);
			expect(container.querySelector('#suspense-recovery-fallback')).toBeNull();

			const recoveredAction = container.querySelector<HTMLButtonElement>(
				'#suspense-recovered-action',
			)!;
			flushSync(() => recoveredAction.click());
			expect(recoveredAction.textContent?.trim()).toBe('inside:1');
			flushSync(() => outsideAction.click());
			expect(outsideAction.textContent?.trim()).toBe('outside:1');
			expectDiagnostics(recovered);
		} finally {
			root.unmount();
		}
	});
});

// A renderable `{expr}` hole that is its host's only child renders markerless:
// the server serializes a primitive as the host's bare text, and frames an
// element, a component, or a list in a range the client's child slot adopts.
// When the server rendered text but the client value is one of those, or the
// server rendered nothing for it, the server HTML does not match the client
// render. With no boundary around it, the root renders on the client and the
// mismatch is reported once.
describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])(
	'hydrateRoot — only-child renderable hole whose client value is an element, component, or list ($name)',
	({ dev }) => {
		const OBJECT = join(
			process.cwd(),
			'packages/octane/tests/hydration/_fixtures/renderable-text-object.tsrx',
		);
		const server = serverModule(OBJECT, 'renderable-text-object.tsrx');
		const client = dev
			? devClientModule(OBJECT, 'renderable-text-object.tsrx')
			: prodClientModule(OBJECT, 'renderable-text-object.tsrx');
		let container: HTMLElement;
		let errSpy: ReturnType<typeof vi.spyOn>;

		beforeEach(() => {
			container = document.createElement('div');
			document.body.appendChild(container);
			errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		});

		afterEach(() => {
			container.remove();
			errSpy.mockRestore();
		});

		const warns = () =>
			errSpy.mock.calls
				.map((call: unknown[]) => String(call[0]))
				.filter((message: string) => message.includes('hydration mismatch'));

		/** The same node objects, not merely equal ones. */
		function expectSameNodes(actual: ArrayLike<Node>, expected: readonly (Node | null)[]) {
			expect(actual).toHaveLength(expected.length);
			for (let i = 0; i < expected.length; i++) expect(actual[i]).toBe(expected[i]);
		}

		/** The markup a client render of the same props puts in `selector`. */
		function clientMarkup(
			component: unknown,
			props: Record<string, unknown>,
			selector: string,
		): string {
			const host = document.createElement('div');
			const root = createRoot(host);
			flushSync(() => root.render(component as never, props));
			try {
				return markup(host.querySelector(selector)!);
			} finally {
				root.unmount();
			}
		}

		/** Exactly one report: the recoverable error always, the warning in DEV only. */
		async function expectReported(recovered: unknown[], file: string, actual: string) {
			await act(async () => {});
			expect(recovered).toHaveLength(1);
			expect(String((recovered[0] as Error).message)).toMatch(MISMATCH);
			expect(warns()).toEqual(
				dev ? [expect.stringMatching(structuralWarning(file, '.+', escape(actual)))] : [],
			);
		}

		const OBJECT_KINDS = ['p', 'inner', 'list'] as const;

		describe.each([
			{ where: 'in the root component', name: 'Hole' },
			{ where: 'in a nested component', name: 'NestedHole' },
		])('$where', ({ name }) => {
			function hydrate(serverKind: string, kind: string) {
				container.innerHTML = ServerRT.renderToString(server[name], {
					kind: serverKind,
					v: 'A',
					tail: 't',
				}).html;
				const div = container.querySelector('section > div')!;
				const serverNodes = contentNodes(container);
				const serverElements = [...div.querySelectorAll('*')];
				const serverMarkup = markup(div);
				const tail = container.querySelector('b')!;
				const tailText = tail.firstChild;
				const recovered: unknown[] = [];
				const root = hydrateRoot(
					container,
					client[name],
					{ kind, v: 'A', tail: 't' },
					{ onRecoverableError: (error) => recovered.push(error) },
				);
				flushSync(() => {});
				return {
					div,
					serverNodes,
					serverElements,
					serverMarkup,
					tail,
					tailText,
					recovered,
					root,
					render: (props: Record<string, unknown>) =>
						flushSync(() => root.render(client[name], props)),
					expected: (props: Record<string, unknown>) =>
						clientMarkup(client[name], props, 'section > div'),
				};
			}

			it.each(OBJECT_KINDS)(
				'renders the root on the client for a client %s value over server text, reporting it once',
				async (kind) => {
					const { serverNodes, recovered, root, render, expected } = hydrate('text', kind);
					try {
						expect(survivors(serverNodes)).toEqual([]);
						const div = container.querySelector('section > div')!;
						expect(markup(div)).toBe(expected({ kind, v: 'A', tail: 't' }));
						expect(container.querySelector('b')!.textContent).toBe('t');
						await expectReported(recovered, 'renderable-text-object.tsrx', 'text "A"');

						// The client-rendered tree updates like any other.
						render({ kind: 'text', v: 'B', tail: 'u' });
						expect(markup(div)).toBe('B');
						expect(container.querySelector('b')!.innerHTML).toBe('u');
						render({ kind, v: 'C', tail: 'u' });
						expect(markup(div)).toBe(expected({ kind, v: 'C', tail: 'u' }));
						render({ kind: 'text', v: 'D', tail: 'u' });
						expect(markup(div)).toBe('D');
						await act(async () => {});
						expect(recovered).toHaveLength(1);
					} finally {
						root.unmount();
					}
				},
			);

			it.each(OBJECT_KINDS)('adopts a matching server %s value silently', async (kind) => {
				const { div, serverElements, serverMarkup, recovered, root, render } = hydrate(kind, kind);
				try {
					expect(serverElements.length).toBeGreaterThan(0);
					expectSameNodes(div.querySelectorAll('*'), serverElements);
					expect(markup(div)).toBe(serverMarkup);
					await Promise.resolve();
					expect(recovered).toEqual([]);
					expect(warns()).toEqual([]);
					render({ kind: 'text', v: 'B', tail: 't' });
					expect(markup(div)).toBe('B');
				} finally {
					root.unmount();
				}
			});

			// A host the server left empty is missing the node the client renders
			// into it, which React treats as a mismatch like any other.
			it.each(OBJECT_KINDS)(
				'renders the root on the client for a client %s value in a host the server left empty',
				async (kind) => {
					const { serverNodes, tail, tailText, recovered, root, expected } = hydrate('empty', kind);
					try {
						expect(survivors(serverNodes)).toEqual([]);
						expect(markup(container.querySelector('section > div')!)).toBe(
							expected({ kind, v: 'A', tail: 't' }),
						);
						expect(container.querySelector('b')).not.toBe(tail);
						expect(tailText!.isConnected).toBe(false);
						await act(async () => {});
						expect(recovered).toHaveLength(1);
					} finally {
						root.unmount();
					}
				},
			);
		});

		// A textarea's children are its default value, so they must be text on
		// both sides (textarea-children-hydrate.test.ts). An element value is an
		// authoring error, not markup to render beside the server text.
		it('rejects an element value inside a textarea on both sides', async () => {
			container.innerHTML = ServerRT.renderToString(server.AreaHole, {
				kind: 'text',
				v: 'A',
				tail: 't',
			}).html;
			expect(() =>
				ServerRT.renderToString(server.AreaHole, { kind: 'p', v: 'A', tail: 't' }),
			).toThrow(/`<textarea>` children must be text/);
			const recovered: unknown[] = [];
			const uncaught: unknown[] = [];
			const root = hydrateRoot(
				container,
				client.AreaHole,
				{ kind: 'p', v: 'A', tail: 't' },
				{
					onRecoverableError: (error) => recovered.push(error),
					onUncaughtError: (error) => uncaught.push(error),
				},
			);
			flushSync(() => {});
			try {
				expect(uncaught).toHaveLength(1);
				expect(String((uncaught[0] as Error).message)).toMatch(
					/children must be text.*One child was an element\./,
				);
				await Promise.resolve();
				expect(recovered).toEqual([]);
				expect(warns()).toEqual([]);
			} finally {
				root.unmount();
			}
		});

		// Suspending while hydrating keeps the server HTML; when the value resolves,
		// it does not match the server text, so the boundary renders on the client
		// once while the server nodes outside it stay adopted.
		it('renders the boundary on the client once when a suspended client value resolves to an element', async () => {
			container.innerHTML = ServerRT.renderToString(server.SuspendingHole, {
				text: null,
				v: 'A',
			}).html;
			const main = container.querySelector('main')!;
			const div = container.querySelector('section > div')!;
			const tail = container.querySelector('b')!;
			expect(div.textContent).toBe('A');
			let resolve!: (text: string) => void;
			const text = new Promise<string>((r) => (resolve = r));
			const recovered: unknown[] = [];
			const root = hydrateRoot(
				container,
				client.SuspendingHole,
				{ text, v: 'A' },
				{ onRecoverableError: (error) => recovered.push(error) },
			);
			flushSync(() => {});
			try {
				// While the client value is pending, the server HTML stays on screen.
				await act(async () => {});
				expect(container.querySelector('section > div')).toBe(div);
				expect(div.textContent).toBe('A');
				expect(container.querySelector('i')).toBeNull();
				expect(recovered).toEqual([]);
				await act(async () => {
					resolve('R');
					await text;
				});
				expect(container.querySelector('main')).toBe(main);
				expect(div.isConnected).toBe(false);
				expect(tail.isConnected).toBe(false);
				expect(markup(container.querySelector('section > div')!)).toBe('<em class="waits">R</em>');
				expect(container.querySelector('b')!.textContent).toBe('A');
				expect(container.querySelectorAll('em.waits')).toHaveLength(1);
				await act(async () => {});
				expect(recovered).toHaveLength(1);
				expect(String((recovered[0] as Error).message)).toMatch(MISMATCH);
			} finally {
				root.unmount();
			}
		});

		describe('in .tsx', () => {
			const TSX = join(
				process.cwd(),
				'packages/octane/tests/hydration/_fixtures/renderable-text-object-tsx.tsx',
			);
			const tsxServer = loadServerFixture(TSX, { id: 'renderable-text-object-tsx.tsx' });
			const tsxClient = loadCompiledFixtureSource(readFileSync(TSX, 'utf8'), {
				id: 'renderable-text-object-tsx.tsx',
				mode: 'client',
				compileOptions: { dev },
			});

			it('renders the root on the client for a client element value over server text', async () => {
				container.innerHTML = ServerRT.renderToString(tsxServer.Hole, {
					kind: 'text',
					v: 'A',
					tail: 't',
				}).html;
				const serverNodes = contentNodes(container);
				const recovered: unknown[] = [];
				const root = hydrateRoot(
					container,
					tsxClient.Hole,
					{ kind: 'p', v: 'A', tail: 't' },
					{ onRecoverableError: (error) => recovered.push(error) },
				);
				flushSync(() => {});
				try {
					expect(survivors(serverNodes)).toEqual([]);
					const div = container.querySelector('section > div')!;
					expect(markup(div)).toBe('<p class="x">A</p>');
					expect(container.querySelector('b')!.textContent).toBe('t');
					await expectReported(recovered, 'renderable-text-object-tsx.tsx', 'text "A"');
					flushSync(() => root.render(tsxClient.Hole, { kind: 'text', v: 'B', tail: 't' }));
					expect(markup(div)).toBe('B');
				} finally {
					root.unmount();
				}
			});
		});

		// bindSignalChild has no cached-value helper in front of childTextHole, so
		// its first render reaches the same hole by another route.
		describe('through signal bindings', () => {
			const SIGNAL = join(
				process.cwd(),
				'packages/octane/tests/hydration/_fixtures/renderable-text-object-signal.tsrx',
			);
			const signalServer = serverModule(SIGNAL, 'renderable-text-object-signal.tsrx');
			const signalClient = dev
				? devClientModule(SIGNAL, 'renderable-text-object-signal.tsrx')
				: prodClientModule(SIGNAL, 'renderable-text-object-signal.tsrx');

			it.each([
				{ kind: 'element', value: () => createElement('p', { class: 'x' }, 'A') },
				{ kind: 'list', value: () => [createElement('p', { key: 'a', class: 'x' }, 'A'), 'A'] },
			])(
				'renders the root on the client for a client $kind value over server text',
				async ({ value }) => {
					container.innerHTML = ServerRT.renderToString(signalServer.Hole, {
						value: 'A',
						label: 't',
					}).html;
					const serverNodes = contentNodes(container);
					const recovered: unknown[] = [];
					const props = { value: value(), label: 't' };
					const root = hydrateRoot(container, signalClient.Hole, props, {
						onRecoverableError: (error) => recovered.push(error),
					});
					flushSync(() => {});
					try {
						expect(survivors(serverNodes)).toEqual([]);
						const div = container.querySelector('section > div')!;
						expect(markup(div)).toBe(clientMarkup(signalClient.Hole, props, 'section > div'));
						expect(container.querySelector('i')!.textContent).toBe('t');
						await expectReported(recovered, 'renderable-text-object-signal.tsrx', 'text "A"');
						flushSync(() => root.render(signalClient.Hole, { value: 'B', label: 't' }));
						expect(markup(div)).toBe('B');
					} finally {
						root.unmount();
					}
				},
			);
		});

		// Captures that changed before a dormant island activated legitimately
		// differ from the server's: the island renders on the client, and its
		// server output predating the client state is not reported as a mismatch.
		it('renders a dormant island on the client without reporting when its value became an element before activation', async () => {
			const serverProps = { when: condition(false), kind: 'text', v: 'A' };
			container.innerHTML = ServerRT.renderToString(server.DormantHole, serverProps).html;
			const main = container.querySelector('main')!;
			const recovered: unknown[] = [];
			const root = hydrateRoot(container, client.DormantHole, serverProps, {
				onRecoverableError: (error) => recovered.push(error),
			});
			flushSync(() => {});
			try {
				const div = container.querySelector('section > div')!;
				expect(div.textContent).toBe('A');
				await act(() => root.render(client.DormantHole, { when: load(), kind: 'p', v: 'A' }));
				expect(container.querySelector('main')).toBe(main);
				expect(div.isConnected).toBe(false);
				const live = container.querySelector('section > div')!;
				expect(markup(live)).toBe('<p class="x">A</p>');
				await act(async () => {});
				expect(recovered).toEqual([]);
				expect(warns()).toEqual([]);
				flushSync(() => root.render(client.DormantHole, { when: load(), kind: 'text', v: 'B' }));
				expect(markup(live)).toBe('B');
			} finally {
				root.unmount();
			}
		});
	},
);

// The server HTML below is a LEGACY shape for a sole-child mixed-arm-ternary hole:
// an outer value pair wrapping one pair per keyed item. Today's client claims that
// hole as an @if-lowered block whose branch hosts the keyed list, so every adopted
// pair sits one nesting level off from where the client expects it. Hydration must
// never throw over that misalignment — stale server HTML (an older octane version,
// a cached edge response) is exactly what the fallback exists for — and must leave
// a tree whose later updates keep working.
describe.each([
	{
		name: 'development compile',
		client: devClientModule(TERNARY, 'ternary-mixed-arms.tsrx'),
		warns: true,
	},
	{
		name: 'production compile',
		client: prodClientModule(TERNARY, 'ternary-mixed-arms.tsrx'),
		warns: false,
	},
])('hydrateRoot — recovery inside a misadopted range ($name)', ({ client, warns: shouldWarn }) => {
	let container: HTMLElement;
	let errSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		container.remove();
		errSpy.mockRestore();
	});

	function expectDiagnostics(): void {
		const messages = errSpy.mock.calls
			.map((call) => String(call[0]))
			.filter((message) => message.includes('hydration mismatch'));
		if (shouldWarn) expect(messages.length).toBeGreaterThanOrEqual(1);
		else expect(messages).toEqual([]);
	}

	const LEGACY_HTML =
		'<div><button class="next">next</button><div class="host">' +
		'<!--[--><!--[--><i>x</i><!--]--><!--[--><i>y</i><!--]--><!--]-->' +
		'</div></div>';

	it('legacy nested-pair list shape: renders the keyed list and stays interactive', () => {
		container.innerHTML = LEGACY_HTML;
		const root = hydrateRoot(container, client.ForArm);
		flushSync(() => {});

		try {
			const itemTexts = () =>
				Array.from(container.querySelectorAll('.host i'), (n) => n.textContent);
			expect(itemTexts()).toEqual(['x', 'y']);

			// The tree must leave a coherent slot boundary behind: flip to the
			// component arm and back to the keyed list through the live click handler.
			const next = container.querySelector<HTMLButtonElement>('.next')!;
			flushSync(() => next.click());
			expect(container.querySelector('.host i')).toBeNull();
			expect(container.querySelector('.host em')?.textContent).toBe('chip');
			flushSync(() => next.click());
			expect(itemTexts()).toEqual(['x', 'y']);
			expect(container.querySelector('.host em')).toBeNull();
			expectDiagnostics();
		} finally {
			root.unmount();
		}
	});

	// The inline-ternary form of the same shape (arm rendering itself is owned
	// by the compiler's ternary suites). This case pins only what the fallback
	// owns: no throw, the stale server list never leaked into later arms, and a
	// slot boundary the swaps can keep using.
	it('legacy nested-pair list shape under the inline ternary: never throws or leaks', () => {
		container.innerHTML = LEGACY_HTML;
		const root = hydrateRoot(container, client.MapArm);
		flushSync(() => {});

		try {
			const next = container.querySelector<HTMLButtonElement>('.next')!;
			flushSync(() => next.click());
			// Component arm on screen; no stale server <i> may survive alongside it.
			expect(container.querySelector('.host i')).toBeNull();
			expect(container.querySelector('.host em')?.textContent).toBe('chip');
			flushSync(() => next.click());
			// Back on the array arm: the chip must be gone through the same boundary.
			expect(container.querySelector('.host em')).toBeNull();
			expectDiagnostics();
		} finally {
			root.unmount();
		}
	});
});

// A renderable `{expr}` hole that is its host's only child renders markerless:
// the server serializes text as the host's bare text and every empty value
// (`null`, `undefined`, a boolean, `''`) as no children at all. When the server
// rendered text but the client value is empty, the server text is content the
// client render does not have: the root renders on the client and the mismatch
// is reported once.
describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — only-child renderable hole whose client value is empty ($name)', ({ dev }) => {
	const EMPTY = join(
		process.cwd(),
		'packages/octane/tests/hydration/_fixtures/renderable-empty-text.tsrx',
	);
	const server = serverModule(EMPTY, 'renderable-empty-text.tsrx');
	const client = dev
		? devClientModule(EMPTY, 'renderable-empty-text.tsrx')
		: prodClientModule(EMPTY, 'renderable-empty-text.tsrx');
	let container: HTMLElement;
	let errSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		container.remove();
		errSpy.mockRestore();
	});

	const warns = () =>
		errSpy.mock.calls
			.map((call: unknown[]) => String(call[0]))
			.filter((message: string) => message.includes('hydration mismatch'));

	const texts = (node: Element) => [...node.childNodes].filter((child) => child.nodeType === 3);

	/** Exactly one report: the recoverable error always, the warning in DEV only. */
	async function expectReported(recovered: unknown[], file: string, actual: string) {
		await act(async () => {});
		expect(recovered).toHaveLength(1);
		expect(String((recovered[0] as Error).message)).toMatch(MISMATCH);
		expect(warns()).toEqual(
			dev ? [expect.stringMatching(structuralWarning(file, '.+', escape(actual)))] : [],
		);
	}

	const EMPTY_KINDS = ['undefined', null, 'false', 'true', 'empty'] as const;

	describe.each([
		{ where: 'in the root component', name: 'Hole' },
		{ where: 'in a nested component', name: 'NestedHole' },
	])('$where', ({ name }) => {
		it.each(EMPTY_KINDS)(
			'renders the root on the client for a client %j value over server text, reporting it once',
			async (kind) => {
				container.innerHTML = ServerRT.renderToString(server[name], {
					kind: 'text',
					v: 'A',
					tail: 't',
				}).html;
				const serverNodes = contentNodes(container);
				expect(container.querySelector('section > div')!.textContent).toBe('A');
				const recovered: unknown[] = [];
				const root = hydrateRoot(
					container,
					client[name],
					{ kind, v: 'A', tail: 't' },
					{ onRecoverableError: (error) => recovered.push(error) },
				);
				flushSync(() => {});
				const render = (props: Record<string, unknown>) =>
					flushSync(() => root.render(client[name], props));
				try {
					expect(survivors(serverNodes)).toEqual([]);
					const div = container.querySelector('section > div')!;
					const tail = container.querySelector('b')!;
					expect(markup(div)).toBe('');
					expect(tail.textContent).toBe('t');
					await expectReported(recovered, 'renderable-empty-text.tsrx', 'text "A"');

					render({ kind: 'text', v: 'B', tail: 'u' });
					expect(markup(div)).toBe('B');
					expect(markup(tail)).toBe('u');
					render({ kind, v: 'B', tail: 'u' });
					expect(markup(div)).toBe('');
					render({ kind: 'text', v: 'C', tail: 'u' });
					expect(markup(div)).toBe('C');
					expect(recovered).toHaveLength(1);
				} finally {
					root.unmount();
				}
			},
		);

		it.each(EMPTY_KINDS)('adopts a matching empty %j value silently', async (kind) => {
			container.innerHTML = ServerRT.renderToString(server[name], { kind, v: 'A', tail: 't' }).html;
			const div = container.querySelector('section > div')!;
			const [tailText] = texts(container.querySelector('b')!);
			expect(markup(div)).toBe('');
			const recovered: unknown[] = [];
			const root = hydrateRoot(
				container,
				client[name],
				{ kind, v: 'A', tail: 't' },
				{ onRecoverableError: (error) => recovered.push(error) },
			);
			flushSync(() => {});
			try {
				expect(container.querySelector('section > div')).toBe(div);
				expect(markup(div)).toBe('');
				expect(texts(container.querySelector('b')!)).toEqual([tailText]);
				await Promise.resolve();
				expect(recovered).toEqual([]);
				expect(warns()).toEqual([]);
				flushSync(() => root.render(client[name], { kind: 'text', v: 'B', tail: 't' }));
				expect(markup(div)).toBe('B');
			} finally {
				root.unmount();
			}
		});
	});

	describe('in .tsx', () => {
		const TSX = join(
			process.cwd(),
			'packages/octane/tests/hydration/_fixtures/markerless-text.tsx',
		);
		const tsxServer = loadServerFixture(TSX, { id: 'markerless-text.tsx' });
		const tsxClient = loadCompiledFixtureSource(readFileSync(TSX, 'utf8'), {
			id: 'markerless-text.tsx',
			mode: 'client',
			compileOptions: { dev },
		});

		// The ternary child is framed by the server (`<!--[-->A<!--]-->`); the
		// framed text is content the empty client value does not have.
		it.each([undefined, null, false, ''])(
			'renders the root on the client for a client %j value over a framed server text',
			async (label) => {
				container.innerHTML = ServerRT.renderToString(tsxServer.ConditionalChild, {
					on: false,
					label: 'A',
				}).html;
				const serverNodes = contentNodes(container);
				expect(container.querySelector('div')!.textContent).toBe('A');
				const recovered: unknown[] = [];
				const root = hydrateRoot(
					container,
					tsxClient.ConditionalChild,
					{ on: false, label },
					{ onRecoverableError: (error) => recovered.push(error) },
				);
				flushSync(() => {});
				try {
					expect(survivors(serverNodes)).toEqual([]);
					const div = container.querySelector('div')!;
					expect(markup(div)).toBe('');
					await expectReported(recovered, 'markerless-text.tsx', 'text "A"');
					flushSync(() => root.render(tsxClient.ConditionalChild, { on: false, label: 'B' }));
					expect(markup(div)).toBe('B');
					flushSync(() => root.render(tsxClient.ConditionalChild, { on: true, label: 'B' }));
					expect(markup(div)).toBe('<b>yes</b>');
				} finally {
					root.unmount();
				}
			},
		);

		// An empty ternary arm serializes as an empty frame: a match, not content.
		it.each([undefined, null, false, ''])(
			'adopts a framed empty %j value silently',
			async (label) => {
				container.innerHTML = ServerRT.renderToString(tsxServer.ConditionalChild, {
					on: false,
					label,
				}).html;
				const div = container.querySelector('div')!;
				expect(markup(div)).toBe('');
				const recovered: unknown[] = [];
				const root = hydrateRoot(
					container,
					tsxClient.ConditionalChild,
					{ on: false, label },
					{ onRecoverableError: (error) => recovered.push(error) },
				);
				flushSync(() => {});
				try {
					expect(container.querySelector('div')).toBe(div);
					expect(div.textContent).toBe('');
					await Promise.resolve();
					expect(recovered).toEqual([]);
					expect(warns()).toEqual([]);
					flushSync(() => root.render(tsxClient.ConditionalChild, { on: false, label: 'B' }));
					expect(div.textContent).toBe('B');
					flushSync(() => root.render(tsxClient.ConditionalChild, { on: true, label: 'B' }));
					expect(div.querySelector('b')?.textContent).toBe('yes');
					expect(div.textContent).toBe('yes');
				} finally {
					root.unmount();
				}
			},
		);

		// The framed server text is the host's text content, as a bare one is.
		// React compares an empty string's text content, which the host's
		// suppressHydrationWarning keeps until the text changes, but hydrates no
		// child for any other empty value, and suppression keeps no unhydrated
		// child.
		function hydrateSuppressed(label: unknown) {
			container.innerHTML = ServerRT.renderToString(tsxServer.SuppressedConditionalChild, {
				on: false,
				label: 'A',
			}).html;
			const serverNodes = contentNodes(container);
			const div = container.querySelector('div')!;
			expect(div.textContent).toBe('A');
			const recovered: unknown[] = [];
			const root = hydrateRoot(
				container,
				tsxClient.SuppressedConditionalChild,
				{ on: false, label },
				{ onRecoverableError: (error) => recovered.push(error) },
			);
			flushSync(() => {});
			return { div, serverNodes, recovered, root };
		}

		it('keeps a framed server text in a suppressed host for an empty string', async () => {
			const { div, serverNodes, recovered, root } = hydrateSuppressed('');
			try {
				expect(survivors(serverNodes)).toEqual(serverNodes);
				expect(container.querySelector('div')).toBe(div);
				expect(div.textContent).toBe('A');
				await act(async () => {});
				expect(recovered).toEqual([]);
				expect(warns()).toEqual([]);
				flushSync(() =>
					root.render(tsxClient.SuppressedConditionalChild, { on: false, label: 'B' }),
				);
				expect(markup(div)).toBe('B');
			} finally {
				root.unmount();
			}
		});

		it.each([undefined, null, false])(
			'renders the root on the client for a client %j value over a framed server text in a suppressed host',
			async (label) => {
				const { serverNodes, recovered, root } = hydrateSuppressed(label);
				try {
					expect(survivors(serverNodes)).toEqual([]);
					expect(markup(container.querySelector('div')!)).toBe('');
					await act(async () => {});
					expect(recovered).toHaveLength(1);
					expect(String((recovered[0] as Error).message)).toMatch(MISMATCH);
				} finally {
					root.unmount();
				}
			},
		);
	});

	// A direct-host @for row inlines its binding guards instead of calling the
	// cached-value helper; its first render must reach the hole just the same.
	it('renders the root on the client for a client undefined value in a keyed @for row', async () => {
		container.innerHTML = ServerRT.renderToString(server.ListHole, {
			rows: [
				{ id: 1, label: 'A' },
				{ id: 2, label: 'B' },
			],
		}).html;
		const serverNodes = contentNodes(container);
		expect([...container.querySelectorAll('li')].map((item) => item.textContent)).toEqual([
			'A',
			'B',
		]);
		const recovered: unknown[] = [];
		const root = hydrateRoot(
			container,
			client.ListHole,
			{
				rows: [
					{ id: 1, label: undefined },
					{ id: 2, label: 'B' },
				],
			},
			{ onRecoverableError: (error) => recovered.push(error) },
		);
		flushSync(() => {});
		try {
			expect(survivors(serverNodes)).toEqual([]);
			const items = [...container.querySelectorAll('li')];
			expect(items.map(markup)).toEqual(['', 'B']);
			await expectReported(recovered, 'renderable-empty-text.tsrx', 'text "A"');
			flushSync(() =>
				root.render(client.ListHole, {
					rows: [
						{ id: 1, label: 'C' },
						{ id: 2, label: 'B' },
					],
				}),
			);
			expect(items.map(markup)).toEqual(['C', 'B']);
		} finally {
			root.unmount();
		}
	});

	// bindSignalChild has no cached-value helper in front of childTextHole, so
	// its first render reaches the same markerless path by another route.
	describe('through signal bindings', () => {
		const SIGNAL = join(
			process.cwd(),
			'packages/octane/tests/hydration/_fixtures/renderable-empty-text-signal.tsrx',
		);
		const signalServer = serverModule(SIGNAL, 'renderable-empty-text-signal.tsrx');
		const signalClient = dev
			? devClientModule(SIGNAL, 'renderable-empty-text-signal.tsrx')
			: prodClientModule(SIGNAL, 'renderable-empty-text-signal.tsrx');

		it.each([undefined, null, false, true, ''])(
			'renders the root on the client for a client %j value over server text',
			async (value) => {
				container.innerHTML = ServerRT.renderToString(signalServer.Hole, {
					value: 'A',
					label: 't',
				}).html;
				const serverNodes = contentNodes(container);
				expect(container.querySelector('section > div')!.textContent).toBe('A');
				const recovered: unknown[] = [];
				const root = hydrateRoot(
					container,
					signalClient.Hole,
					{ value, label: 't' },
					{ onRecoverableError: (error) => recovered.push(error) },
				);
				flushSync(() => {});
				try {
					expect(survivors(serverNodes)).toEqual([]);
					const div = container.querySelector('section > div')!;
					expect(markup(div)).toBe('');
					expect(container.querySelector('i')!.textContent).toBe('t');
					await expectReported(recovered, 'renderable-empty-text-signal.tsrx', 'text "A"');
					flushSync(() => root.render(signalClient.Hole, { value: 'B', label: 't' }));
					expect(markup(div)).toBe('B');
				} finally {
					root.unmount();
				}
			},
		);
	});

	// Captures that changed before a dormant island activated legitimately
	// differ from the server's: the island renders on the client, and its server
	// output predating the client state is not reported as a mismatch.
	it.each(EMPTY_KINDS)(
		'renders a dormant island on the client without reporting when its value became %j before activation',
		async (kind) => {
			const serverProps = { when: condition(false), kind: 'text', v: 'A' };
			container.innerHTML = ServerRT.renderToString(server.DormantHole, serverProps).html;
			const main = container.querySelector('main')!;
			const recovered: unknown[] = [];
			const root = hydrateRoot(container, client.DormantHole, serverProps, {
				onRecoverableError: (error) => recovered.push(error),
			});
			flushSync(() => {});
			try {
				const div = container.querySelector('section > div')!;
				expect(div.textContent).toBe('A');
				await act(() => root.render(client.DormantHole, { when: load(), kind, v: 'A' }));
				expect(container.querySelector('main')).toBe(main);
				expect(div.isConnected).toBe(false);
				const live = container.querySelector('section > div')!;
				expect(markup(live)).toBe('');
				await act(async () => {});
				expect(recovered).toEqual([]);
				expect(warns()).toEqual([]);
				flushSync(() => root.render(client.DormantHole, { when: load(), kind: 'text', v: 'B' }));
				expect(markup(live)).toBe('B');
			} finally {
				root.unmount();
			}
		},
	);
});

// A renderable `{expr}` hole whose server value was an element, a component, or
// a list, but whose client value is text or empty. Whatever the server rendered
// beyond what the client renders is a mismatch, so with no boundary around it
// the root renders on the client and reports it once.
describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — renderable hole whose client value is text or empty ($name)', ({ dev }) => {
	const RENDERABLE = join(
		process.cwd(),
		'packages/octane/tests/hydration/_fixtures/renderable-text-swap.tsrx',
	);
	const server = serverModule(RENDERABLE, 'renderable-text-swap.tsrx');
	const client = dev
		? devClientModule(RENDERABLE, 'renderable-text-swap.tsrx')
		: prodClientModule(RENDERABLE, 'renderable-text-swap.tsrx');
	let container: HTMLElement;
	let errSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		container.remove();
		errSpy.mockRestore();
	});

	const warns = () =>
		errSpy.mock.calls
			.map((call: unknown[]) => String(call[0]))
			.filter((message: string) => message.includes('hydration mismatch'));

	/**
	 * Exactly one report: the recoverable error always, the located warning in
	 * DEV only. `actual` is omitted where the server content's description
	 * depends on how it serializes a list.
	 */
	async function expectReported(
		recovered: unknown[],
		actual?: string,
		file = 'renderable-text-swap.tsrx',
	) {
		await act(async () => {});
		expect(recovered).toHaveLength(1);
		expect(String((recovered[0] as Error).message)).toMatch(MISMATCH);
		expect(warns()).toEqual(
			dev
				? [
						expect.stringMatching(
							structuralWarning(file, '.+', actual === undefined ? '.+' : escape(actual)),
						),
					]
				: [],
		);
	}

	// OCTANE DIVERGENCE: where the hole is its host's only child and the client
	// value is text, React compares only the host's whole textContent, so a
	// server `<div><p>A</p></div>` passes for a client `<div>A</div>` and keeps
	// the server element. Octane hydrates the hole's content and falls back on
	// the element, as it does for every other shape.
	describe.each([
		{ shape: 'the only child of its host', name: 'Hole', host: 'section > div' },
		{ shape: 'beside a sibling', name: 'SiblingHole', host: 'section' },
		{ shape: "its component's entire output", name: 'SoleHole', host: 'section' },
	])('a hole that is $shape', ({ name, host }) => {
		// The markup after the hole in its host: the tail when they share one.
		const tailHtml = (text: string) => (host === 'section' ? `<i>${text}</i>` : '');

		function hydrate(serverProps: Record<string, unknown>, props: Record<string, unknown>) {
			container.innerHTML = ServerRT.renderToString(server[name], serverProps).html;
			const serverNodes = contentNodes(container);
			const recovered: unknown[] = [];
			const root = hydrateRoot(container, client[name], props, {
				onRecoverableError: (error) => recovered.push(error),
			});
			flushSync(() => {});
			return {
				serverNodes,
				recovered,
				parent: () => container.querySelector(host)!,
				render: (next: Record<string, unknown>) => flushSync(() => root.render(client[name], next)),
				unmount: () => root.unmount(),
			};
		}

		it.each([
			{ from: 'p', to: 'text', text: 'A', server: '<p>' },
			{ from: 'inner', to: 'text', text: 'A', server: '<b>' },
			{ from: 'list', to: 'text', text: 'A', server: undefined },
			{ from: 'p', to: null, text: '', server: '<p>' },
			{ from: 'p', to: 'undefined', text: '', server: '<p>' },
			{ from: 'inner', to: null, text: '', server: '<b>' },
			{ from: 'list', to: null, text: '', server: undefined },
			{ from: 'textThenP', to: null, text: '', server: 'text "A"' },
			{ from: 'textThenP', to: 'text', text: 'A', server: '<p>' },
		])(
			'renders the root on the client for a server $from and a client $to value, reporting it once',
			async ({ from, to, text, server: serverDescription }) => {
				const s = hydrate({ kind: from, v: 'A', tail: 't' }, { kind: to, v: 'A', tail: 't' });
				try {
					expect(survivors(s.serverNodes)).toEqual([]);
					const parent = s.parent();
					expect(markup(parent)).toBe(text + tailHtml('t'));
					await expectReported(s.recovered, serverDescription);

					// The client-rendered tree updates like any other.
					s.render({ kind: 'text', v: 'B', tail: 't' });
					expect(markup(parent)).toBe('B' + tailHtml('t'));
					s.render({ kind: 'p', v: 'C', tail: 'u' });
					expect(markup(parent)).toBe('<p class="x">C</p>' + tailHtml('u'));
					s.render({ kind: null, v: 'C', tail: 'u' });
					expect(markup(parent)).toBe(tailHtml('u'));
					expect(container.querySelector('i')!.textContent).toBe('u');
				} finally {
					s.unmount();
				}
			},
		);

		it.each([{ kind: 'text' }, { kind: null }, { kind: 'p' }, { kind: 'inner' }])(
			'adopts a matching $kind value silently',
			async ({ kind }) => {
				container.innerHTML = ServerRT.renderToString(server[name], {
					kind,
					v: 'A',
					tail: 't',
				}).html;
				const parent = container.querySelector(host)!;
				const serverMarkup = markup(parent);
				const serverNodes: Node[] = [
					...parent.querySelectorAll('*'),
					...[...parent.childNodes].filter((node) => node.nodeType === 3),
				];
				const recovered: unknown[] = [];
				const root = hydrateRoot(
					container,
					client[name],
					{ kind, v: 'A', tail: 't' },
					{ onRecoverableError: (error) => recovered.push(error) },
				);
				flushSync(() => {});
				try {
					expect(markup(parent)).toBe(serverMarkup);
					for (const node of serverNodes) expect(parent.contains(node)).toBe(true);
					await Promise.resolve();
					expect(recovered).toEqual([]);
					expect(warns()).toEqual([]);
				} finally {
					root.unmount();
				}
			},
		);
	});

	describe('in .tsx', () => {
		const TSX = join(
			process.cwd(),
			'packages/octane/tests/hydration/_fixtures/renderable-text-swap-tsx.tsx',
		);
		const tsxServer = loadServerFixture(TSX, { id: 'renderable-text-swap-tsx.tsx' });
		const tsxClient = loadCompiledFixtureSource(readFileSync(TSX, 'utf8'), {
			id: 'renderable-text-swap-tsx.tsx',
			mode: 'client',
			compileOptions: { dev },
		});

		it.each([
			{ name: 'Hole', host: 'section > div', to: 'text', expected: 'A' },
			{ name: 'Hole', host: 'section > div', to: null, expected: '' },
			{ name: 'SiblingHole', host: 'section', to: 'text', expected: 'A<i>t</i>' },
			{ name: 'SiblingHole', host: 'section', to: null, expected: '<i>t</i>' },
		])(
			'$name renders the root on the client for a server element and a client $to value',
			async ({ name, host, to, expected }) => {
				container.innerHTML = ServerRT.renderToString(tsxServer[name], {
					kind: 'p',
					v: 'A',
					tail: 't',
				}).html;
				const serverNodes = contentNodes(container);
				const recovered: unknown[] = [];
				const root = hydrateRoot(
					container,
					tsxClient[name],
					{ kind: to, v: 'A', tail: 't' },
					{ onRecoverableError: (error) => recovered.push(error) },
				);
				flushSync(() => {});
				try {
					expect(survivors(serverNodes)).toEqual([]);
					const parent = container.querySelector(host)!;
					expect(markup(parent)).toBe(expected);
					await expectReported(recovered, '<p>', 'renderable-text-swap-tsx.tsx');
					flushSync(() => root.render(tsxClient[name], { kind: 'p', v: 'B', tail: 't' }));
					expect(markup(parent)).toBe(expected.replace(/^A?/, '<p class="x">B</p>'));
				} finally {
					root.unmount();
				}
			},
		);
	});

	// Captures that changed before a dormant island activated legitimately
	// differ from the server's: the island renders on the client, and its server
	// output predating the client state is not reported as a mismatch.
	it('renders a dormant island on the client without reporting when it was updated before activation', async () => {
		const serverProps = { when: condition(false), kind: 'p', v: 'A' };
		container.innerHTML = ServerRT.renderToString(server.DormantHole, serverProps).html;
		const main = container.querySelector('main')!;
		const recovered: unknown[] = [];
		const root = hydrateRoot(container, client.DormantHole, serverProps, {
			onRecoverableError: (error) => recovered.push(error),
		});
		flushSync(() => {});
		try {
			const div = container.querySelector('section > div')!;
			expect(markup(div)).toBe('<p class="x">A</p>');
			await act(() => root.render(client.DormantHole, { when: load(), kind: 'text', v: 'A' }));
			expect(container.querySelector('main')).toBe(main);
			expect(div.isConnected).toBe(false);
			expect(markup(container.querySelector('section > div')!)).toBe('A');
			await act(async () => {});
			expect(recovered).toEqual([]);
			expect(warns()).toEqual([]);
		} finally {
			root.unmount();
		}
	});
});

// A template whose root element matches the server's, but whose server element
// lacks the nodes the template's compiled walk reaches, does not match the
// client render, as in React, which finds the missing node: nothing is adopted
// in place, the nearest Suspense boundary or else the root renders on the
// client and reports once. An error thrown while hydrating fails the root the
// same way, as React's throwException makes it: the root renders on the
// client, reporting a recoverable error, and an error its client render throws
// again is uncaught, with no recoverable report.
describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — server nodes that a template walk does not find ($name)', ({ dev }) => {
	const WALK = join(
		process.cwd(),
		'packages/octane/tests/hydration/_fixtures/walk-missing-nodes.tsrx',
	);
	const server = serverModule(WALK, 'walk-missing-nodes.tsrx');
	const client = dev
		? devClientModule(WALK, 'walk-missing-nodes.tsrx')
		: prodClientModule(WALK, 'walk-missing-nodes.tsrx');
	let container: HTMLElement;
	let errSpy: ReturnType<typeof vi.spyOn>;
	let root: ReturnType<typeof hydrateRoot> | null;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		root = null;
	});

	afterEach(() => {
		root?.unmount();
		client.failNext(0);
		container.remove();
		errSpy.mockRestore();
	});

	/**
	 * Server-render `name`, empty the server element `emptied` names, and
	 * hydrate it. Returns the server's content and the root's error reports.
	 */
	async function hydrate(name: string, props: Record<string, unknown>, emptied?: string) {
		container.innerHTML = ServerRT.renderToString(server[name], props).html;
		if (emptied !== undefined) container.querySelector(emptied)!.replaceChildren();
		const serverNodes = contentNodes(container);
		const recovered: unknown[] = [];
		const uncaught: unknown[] = [];
		root = hydrateRoot(container, client[name], props, {
			onRecoverableError: (error) => recovered.push(error),
			onUncaughtError: (error) => uncaught.push(error),
		});
		flushSync(() => {});
		await act(async () => {});
		return { serverNodes, recovered, uncaught };
	}

	/** The client render of `name` with `props`, for comparison. */
	function clientMarkup(name: string, props: Record<string, unknown>): string {
		const fresh = document.createElement('div');
		const freshRoot = createRoot(fresh);
		flushSync(() => freshRoot.render(client[name], props));
		const out = markup(fresh);
		freshRoot.unmount();
		return out;
	}

	it.each([
		{ shape: 'an element with a bound attribute', name: 'Link', props: { url: '/x' } },
		{ shape: 'an element with a text hole', name: 'Bold', props: { t: 'hi' } },
	])(
		'renders the root on the client where the server root lacks $shape',
		async ({ name, props }) => {
			const s = await hydrate(name, props, 'div');

			expect(survivors(s.serverNodes)).toEqual([]);
			expect(markup(container)).toBe(clientMarkup(name, props));
			expect(s.uncaught).toEqual([]);
			expect(s.recovered).toHaveLength(1);
			expect(String((s.recovered[0] as Error).message)).toMatch(MISMATCH);

			// The client-rendered tree updates like any other.
			flushSync(() => root!.render(client[name], { url: '/y', t: 'yo' }));
			expect(markup(container)).toBe(clientMarkup(name, { url: '/y', t: 'yo' }));
		},
	);

	it('renders the root on the client where a nested server element lacks the walked element', async () => {
		const s = await hydrate('Deep', { url: '/x' }, 'p');

		expect(survivors(s.serverNodes)).toEqual([]);
		expect(markup(container)).toBe(clientMarkup('Deep', { url: '/x' }));
		expect(container.querySelector('#deep')!.getAttribute('href')).toBe('/x');
		expect(s.uncaught).toEqual([]);
		expect(s.recovered).toHaveLength(1);
	});

	it('renders only the boundary on the client where its server element lacks the walked element', async () => {
		container.innerHTML = ServerRT.renderToString(server.InBoundary, { url: '/x' }).html;
		const h1 = container.querySelector('h1')!;
		const div = container.querySelector('main div')!;
		div.replaceChildren();
		const recovered: unknown[] = [];
		root = hydrateRoot(
			container,
			client.InBoundary,
			{ url: '/x' },
			{
				onRecoverableError: (error) => recovered.push(error),
			},
		);
		flushSync(() => {});
		await act(async () => {});

		expect(container.querySelector('h1')).toBe(h1);
		expect(div.isConnected).toBe(false);
		expect(container.querySelector('#first')!.getAttribute('href')).toBe('/x');
		expect(recovered).toHaveLength(1);
		expect(String((recovered[0] as Error).message)).toMatch(MISMATCH);
	});

	it('renders the root on the client when a component throws while hydrating', async () => {
		container.innerHTML = ServerRT.renderToString(server.Thrower, {}).html;
		const serverNodes = contentNodes(container);
		client.failNext(1);
		const recovered: unknown[] = [];
		const uncaught: unknown[] = [];
		root = hydrateRoot(
			container,
			client.Thrower,
			{},
			{
				onRecoverableError: (error) => recovered.push(error),
				onUncaughtError: (error) => uncaught.push(error),
			},
		);
		flushSync(() => {});
		await act(async () => {});

		expect(survivors(serverNodes)).toEqual([]);
		expect(markup(container)).toBe('<div><i>ok</i><b>tail</b></div>');
		expect(uncaught).toEqual([]);
		expect(recovered).toHaveLength(1);
		expect(String((recovered[0] as Error).message)).toMatch(/^There was an error while hydrating/);
		expect(((recovered[0] as Error).cause as Error).message).toBe('hydrating render failed');
	});

	it('reports only the uncaught error when the client render throws again', async () => {
		container.innerHTML = ServerRT.renderToString(server.Thrower, {}).html;
		client.failNext(2);
		const recovered: unknown[] = [];
		const uncaught: unknown[] = [];
		root = hydrateRoot(
			container,
			client.Thrower,
			{},
			{
				onRecoverableError: (error) => recovered.push(error),
				onUncaughtError: (error) => uncaught.push(error),
			},
		);
		flushSync(() => {});
		await act(async () => {});

		expect(uncaught).toHaveLength(1);
		expect((uncaught[0] as Error).message).toBe('hydrating render failed');
		expect(recovered).toEqual([]);
	});
});
