import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement, createRoot, hydrateRoot, flushSync } from '../../src/index.js';
import { condition, load } from 'octane/hydration';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// P3 — STRUCTURAL hydration mismatch: the server DOM's SHAPE differs from what the client
// renders (a swapped @if/@switch branch, a changed tag, a different @for list length). The
// runtime must NOT crash or silently corrupt the DOM: it warns (dev, with LOC) and rebuilds
// the mismatched subtree on the client. We force the mismatch by server-rendering with one
// set of props/branch and hydrating with another.

const CONTROL = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/control.tsrx');
const FORLIST = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/forlist.tsrx');
const STRUCTURAL = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/structural.tsrx');
const SWAP = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/swap.tsrx');
const EMPTYFOR = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/emptyfor.tsrx');
const NESTEDSWAP = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/nested-swap.tsrx',
);
const TERNARY = join(process.cwd(), 'packages/octane/tests/_fixtures/ternary-mixed-arms.tsrx');

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
// `__oct_loc` stamps): the structural detection + rebuild must still run — only
// the warning is dev-gated.
function prodClientModule(fixture: string, file: string): Record<string, any> {
	return loadCompiledFixtureSource(readFileSync(fixture, 'utf8'), { id: file, mode: 'client' });
}

describe('hydrateRoot — STRUCTURAL mismatch (detect + rebuild + cursor stays aligned)', () => {
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

	it('@if branch swap: server <button>, client <span> → rebuilds the span, discards the button', async () => {
		const { html } = await ServerRT.renderToString(server.Toggle, { on: true });
		expect(html).toContain('<button id="hit"');
		container.innerHTML = html;

		// Hydrate with on:false → the client takes the ELSE (span) branch.
		hydrateRoot(container, clientDev.Toggle, { on: false });
		flushSync(() => {});

		const div = container.querySelector('#toggle')!;
		// The span branch is present and the stale server button was discarded (not duplicated).
		expect(div.querySelector('span.off')).not.toBeNull();
		expect(div.querySelector('#hit')).toBeNull();
		expect(div.textContent).toContain('off');
		const w = warns();
		expect(w.length).toBeGreaterThanOrEqual(1);
		expect(w[0]).toContain('control.tsrx:');
	});

	// The prod root-recovery paths skip the location lookup; dev must still name
	// the root component and both sides of the divergence.
	it('root recovery warns with the root location in dev', async () => {
		const MIXEDFRAG = join(
			process.cwd(),
			'packages/octane/tests/hydration/_fixtures/mixed-frag.tsrx',
		);
		const { html } = await ServerRT.renderToString(server.Toggle, { on: true });
		container.innerHTML = `${html}<p id="stale-tail">stale</p>`;
		let root = hydrateRoot(container, clientDev.Toggle, { on: true });
		flushSync(() => {});
		expect(container.querySelector('#stale-tail')).toBeNull();
		expect(warns()).toEqual([
			expect.stringMatching(
				/^Octane hydration mismatch at [^ ]*control\.tsrx.*the client expected the end of the root but the server rendered <p>\./,
			),
		]);
		root.unmount();

		errSpy.mockClear();
		container.innerHTML = '<section id="stale">server</section>';
		root = hydrateRoot(container, devClientModule(MIXEDFRAG, 'mixed-frag.tsrx').MixedFrag, {});
		flushSync(() => {});
		expect(container.querySelector('#stale')).toBeNull();
		expect(warns()).toEqual([
			expect.stringMatching(
				/^Octane hydration mismatch at [^ ]*mixed-frag\.tsrx.*the client expected a fragment starting with a comment but the server rendered <section>\./,
			),
		]);
		root.unmount();
	});

	it('@switch case swap (different tags): server <em>, client <strong> → rebuilds case b', async () => {
		const srv = serverModule(STRUCTURAL, 'structural.tsrx');
		const cli = devClientModule(STRUCTURAL, 'structural.tsrx');
		const { html } = await ServerRT.renderToString(srv.Pick, { k: 'a' });
		expect(html).toContain('<em class="a">');
		container.innerHTML = html;

		hydrateRoot(container, cli.Pick, { k: 'b' });
		flushSync(() => {});

		const div = container.querySelector('#pick')!;
		expect(div.querySelector('strong.b')).not.toBeNull();
		expect(div.querySelector('em.a')).toBeNull();
		expect(div.textContent).toContain('BBB');
		expect(warns().length).toBeGreaterThanOrEqual(1);
	});

	it('@switch SAME-tag swap (static class differs): server <span class="a">, client class "b"', async () => {
		// control.tsrx Pick: every case is a <span>, distinguished only by a STATIC class.
		// The tag-only check would miss this; the static-attribute check catches it + rebuilds.
		const { html } = await ServerRT.renderToString(server.Pick, { k: 'a' });
		expect(html).toContain('<span class="a">');
		container.innerHTML = html;

		hydrateRoot(container, clientDev.Pick, { k: 'b' });
		flushSync(() => {});

		const div = container.querySelector('#pick')!;
		expect(div.querySelector('span.b')).not.toBeNull(); // rebuilt to the client branch
		expect(div.querySelector('span.a')).toBeNull(); // stale server branch discarded
		expect(div.textContent).toContain('BBB');
		expect(warns().length).toBeGreaterThanOrEqual(1);
	});

	it('host → component swap: server <p>, client <Inner> → rebuilds the component', async () => {
		const srv = serverModule(SWAP, 'swap.tsrx');
		const cli = devClientModule(SWAP, 'swap.tsrx');
		const { html } = await ServerRT.renderToString(srv.Swap, { host: true });
		expect(html).toContain('<p class="host">');
		container.innerHTML = html;

		hydrateRoot(container, cli.Swap, { host: false });
		flushSync(() => {});

		const div = container.querySelector('#swap')!;
		expect(div.querySelector('b.inner')).not.toBeNull(); // component rebuilt
		expect(div.querySelector('p.host')).toBeNull(); // stale host discarded
		expect(div.textContent).toContain('C');
		expect(warns().length).toBeGreaterThanOrEqual(1);
	});

	it('component → host swap: server <Inner>, client <p> → rebuilds the host', async () => {
		const srv = serverModule(SWAP, 'swap.tsrx');
		const cli = devClientModule(SWAP, 'swap.tsrx');
		const { html } = await ServerRT.renderToString(srv.Swap, { host: false });
		expect(html).toContain('<b class="inner">');
		container.innerHTML = html;

		hydrateRoot(container, cli.Swap, { host: true });
		flushSync(() => {});

		const div = container.querySelector('#swap')!;
		expect(div.querySelector('p.host')).not.toBeNull(); // host rebuilt
		expect(div.querySelector('b.inner')).toBeNull(); // stale component discarded
		expect(div.textContent).toContain('H');
		expect(warns().length).toBeGreaterThanOrEqual(1);
	});

	it('same-root, different NESTED static structure: server <span>, client <p> → rebuilds', async () => {
		const srv = serverModule(NESTEDSWAP, 'nested-swap.tsrx');
		const cli = devClientModule(NESTEDSWAP, 'nested-swap.tsrx');
		const { html } = await ServerRT.renderToString(srv.NestedStatic, { x: true });
		expect(html).toContain('<span class="s1">');
		container.innerHTML = html;

		// Both branches are `<section class="box">` — only the nested static markup differs.
		hydrateRoot(container, cli.NestedStatic, { x: false });
		flushSync(() => {});

		const section = container.querySelector('section.box')!;
		expect(section.querySelector('p.p1')).not.toBeNull(); // nested structure rebuilt
		expect(section.querySelector('span.s1')).toBeNull(); // stale nested markup discarded
		expect(section.textContent).toContain('two');
		expect(warns().length).toBeGreaterThanOrEqual(1);
	});

	it('PROD build: @if branch swap rebuilds SILENTLY (recovery is not gated on the dev loc)', async () => {
		// clone()'s structural check used to be gated on the dev-only `loc` argument,
		// so prod builds silently adopted the WRONG server branch. The detection +
		// rebuild now run in dev AND prod; only the warning needs `loc`.
		const clientProd = prodClientModule(CONTROL, 'control.tsrx');
		const { html } = await ServerRT.renderToString(server.Toggle, { on: true });
		expect(html).toContain('<button id="hit"');
		container.innerHTML = html;

		hydrateRoot(container, clientProd.Toggle, { on: false });
		flushSync(() => {});

		const div = container.querySelector('#toggle')!;
		expect(div.querySelector('span.off')).not.toBeNull(); // rebuilt to the client branch
		expect(div.querySelector('#hit')).toBeNull(); // stale server branch discarded
		expect(div.textContent).toContain('off');
		expect(warns()).toEqual([]); // prod: recovery without the dev warning
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

	it('@for list grow: server 2 items, client 3 → no crash, 3 items rendered, warns', async () => {
		const srv = serverModule(FORLIST, 'forlist.tsrx');
		const cli = devClientModule(FORLIST, 'forlist.tsrx');
		const two = [
			{ id: 1, name: 'a' },
			{ id: 2, name: 'b' },
		];
		const three = [...two, { id: 3, name: 'c' }];
		const { html } = await ServerRT.renderToString(srv.List, { items: two, onPick: () => {} });
		container.innerHTML = html;

		hydrateRoot(container, cli.List, { items: three, onPick: () => {} });
		flushSync(() => {});

		const rows = container.querySelectorAll('li.row');
		expect(rows.length).toBe(3); // the extra client item was built fresh (no crash)
		expect(container.querySelector('#list')!.textContent).toContain('c');
		expect(warns().length).toBeGreaterThanOrEqual(1);
	});

	it('@for list shrink: server 3 items, client 2 → leftover server row discarded', async () => {
		const srv = serverModule(FORLIST, 'forlist.tsrx');
		const cli = devClientModule(FORLIST, 'forlist.tsrx');
		const three = [
			{ id: 1, name: 'a' },
			{ id: 2, name: 'b' },
			{ id: 3, name: 'c' },
		];
		const two = three.slice(0, 2);
		const { html } = await ServerRT.renderToString(srv.List, { items: three, onPick: () => {} });
		container.innerHTML = html;

		hydrateRoot(container, cli.List, { items: two, onPick: () => {} });
		flushSync(() => {});

		const rows = container.querySelectorAll('li.row');
		expect(rows.length).toBe(2); // the extra server row was removed
		const names = [...container.querySelectorAll('span.name')].map((s) => s.textContent);
		expect(names).toEqual(['a', 'b']); // the leftover 'c' row is gone
	});

	it('@for list shrink stays interactive + reconciles afterwards (cursor aligned)', async () => {
		const srv = serverModule(FORLIST, 'forlist.tsrx');
		const cli = devClientModule(FORLIST, 'forlist.tsrx');
		const picked: number[] = [];
		const three = [
			{ id: 1, name: 'a' },
			{ id: 2, name: 'b' },
			{ id: 3, name: 'c' },
		];
		const { html } = await ServerRT.renderToString(srv.List, { items: three, onPick: () => {} });
		container.innerHTML = html;

		hydrateRoot(container, cli.List, {
			items: three.slice(0, 2),
			onPick: (id: number) => picked.push(id),
		});
		flushSync(() => {});

		// The surviving rows are interactive (handlers attached to the adopted nodes).
		const btns = container.querySelectorAll<HTMLButtonElement>('button.pick');
		expect(btns.length).toBe(2);
		flushSync(() => btns[1].click());
		expect(picked).toEqual([2]);
	});

	it('@empty: server rendered items, client is empty → items discarded, @empty shown', async () => {
		const srv = serverModule(EMPTYFOR, 'emptyfor.tsrx');
		const cli = devClientModule(EMPTYFOR, 'emptyfor.tsrx');
		const { html } = await ServerRT.renderToString(srv.WithEmpty, {
			items: [
				{ id: 1, name: 'a' },
				{ id: 2, name: 'b' },
			],
		});
		expect(html).toContain('<li class="row">');
		container.innerHTML = html;

		hydrateRoot(container, cli.WithEmpty, { items: [] });
		flushSync(() => {});

		const ul = container.querySelector('#we')!;
		expect(ul.querySelector('li.empty')).not.toBeNull(); // @empty branch built
		expect(ul.querySelectorAll('li.row').length).toBe(0); // server items discarded
		expect(ul.textContent).toContain('No items yet');
	});

	it('@empty: server rendered @empty, client has items → @empty discarded, items shown', async () => {
		const srv = serverModule(EMPTYFOR, 'emptyfor.tsrx');
		const cli = devClientModule(EMPTYFOR, 'emptyfor.tsrx');
		const { html } = await ServerRT.renderToString(srv.WithEmpty, { items: [] });
		expect(html).toContain('<li class="empty">');
		container.innerHTML = html;

		hydrateRoot(container, cli.WithEmpty, {
			items: [
				{ id: 1, name: 'a' },
				{ id: 2, name: 'b' },
			],
		});
		flushSync(() => {});

		const ul = container.querySelector('#we')!;
		expect(ul.querySelectorAll('li.row').length).toBe(2); // items built
		expect(ul.querySelector('li.empty')).toBeNull(); // server @empty discarded
		expect(ul.textContent).not.toContain('No items yet');
	});
});

// PROD RUNTIME validation contract (NODE_ENV=production — the runtime reads it at
// call time, so stubbing it around hydrateRoot exercises the build-time-stripped
// production branches under vitest). In prod, an adoption root is validated by
// nodeType + tag ONLY, answered from the template SOURCE, so the happy path never
// parses a template; tag-level and text-level mismatches still detect + recover.
describe('hydrateRoot — PROD runtime validation (root nodeType+tag only, parse-free happy path)', () => {
	const MIXEDFRAG = join(
		process.cwd(),
		'packages/octane/tests/hydration/_fixtures/mixed-frag.tsrx',
	);
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

	it('tag-level branch mismatch still detects + rebuilds (silently) in prod', async () => {
		const clientProd = prodClientModule(CONTROL, 'control.tsrx');
		const { html } = await ServerRT.renderToString(server.Toggle, { on: true });
		expect(html).toContain('<button id="hit"');
		container.innerHTML = html;
		hydrateRoot(container, clientProd.Toggle, { on: false });
		flushSync(() => {});
		const div = container.querySelector('#toggle')!;
		expect(div.querySelector('span.off')).not.toBeNull(); // rebuilt to the client branch
		expect(div.querySelector('#hit')).toBeNull(); // stale server branch discarded
		expect(div.textContent).toContain('off');
		expect(warns()).toEqual([]); // prod recovery is silent
	});

	it('same-tag attribute-only branch divergence is NOT detected in prod (server attrs kept; text holes still self-correct)', async () => {
		// OCTANE DIVERGENCE (documented narrowing, React parity: prod React hydration
		// does not attribute-validate either): prod validates an adoption root by
		// nodeType + tag only, so @switch branches that share a tag and differ only in
		// STATIC attributes adopt the server branch as-is. Dev still detects + rebuilds
		// (see the SAME-tag swap test above). Text holes carry a compiler-seeded prev
		// value, so text divergence self-corrects even in prod.
		const clientProd = prodClientModule(CONTROL, 'control.tsrx');
		const { html } = await ServerRT.renderToString(server.Pick, { k: 'a' });
		expect(html).toContain('<span class="a">');
		container.innerHTML = html;
		const span = container.querySelector('#pick span')!;
		hydrateRoot(container, clientProd.Pick, { k: 'b' });
		flushSync(() => {});
		expect(container.querySelector('#pick span')).toBe(span); // adopted, not rebuilt
		expect(span.className).toBe('a'); // server static attribute kept
		expect(span.textContent).toBe('BBB'); // the text hole was still patched
		expect(warns()).toEqual([]);
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

	// Root recovery (stale trailing siblings, an unframed root over stale markup,
	// a fragment root whose statics diverge) still runs in prod, but its source
	// location only feeds the dev warning. Prod must not stringify the root
	// component's source to find a location nobody reads.
	it.each([
		{
			name: 'stale server siblings after the adopted root',
			html: async () =>
				(await ServerRT.renderToString(server.Toggle, { on: true })).html +
				'<p id="stale-tail">stale</p>',
			body: () => prodClientModule(CONTROL, 'control.tsrx').Toggle,
			props: { on: true },
			expected: '<div id="toggle"><!--[--><button id="hit" class="on">on:0</button><!--]--></div>',
		},
		{
			name: 'an unframed string root over stale server markup',
			html: async () => '<p id="stale">server</p>',
			body: () =>
				function StringRoot() {
					return 'client';
				},
			props: {},
			expected: 'client<!---->',
		},
		{
			name: 'a fragment root whose statics do not match the server',
			html: async () => '<section id="stale">server</section>',
			body: () => prodClientModule(MIXEDFRAG, 'mixed-frag.tsrx').MixedFrag,
			props: {},
			expected: '<div class="leaf">A</div><!----><input type="text">',
		},
	])('recovers $name without reading the root source', async ({ html, body, props, expected }) => {
		container.innerHTML = await html();
		const Root = body();
		const toString = vi.spyOn(Function.prototype, 'toString');
		let rootSourceReads: number;
		const root = hydrateRoot(container, Root, props);
		try {
			flushSync(() => {});
			rootSourceReads = toString.mock.contexts.filter((context) => context === Root).length;
		} finally {
			toString.mockRestore();
		}
		expect(container.innerHTML).toBe(expected);
		expect(container.querySelector('#stale, #stale-tail')).toBeNull();
		expect(rootSourceReads).toBe(0);
		expect(warns()).toEqual([]);
		root.unmount();
	});
});

// RDX-HYD-006 — adapted from TanStack/redact's
// hydration-mismatch-recovery.test.tsx. Octane recovers its compiler-owned DOM
// ranges in place rather than unwinding Redact checkpoints, so the observable
// contract is identity outside the failed range plus live replacement content.
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

	function expectDiagnostics(): void {
		const messages = errSpy.mock.calls
			.map((call) => String(call[0]))
			.filter((message) => message.includes('hydration mismatch'));
		if (shouldWarn) expect(messages.length).toBeGreaterThanOrEqual(1);
		else expect(messages).toEqual([]);
	}

	// Per Redact hydration-mismatch-recovery.test.tsx:53-64.
	it('root recovery leaves one clean client tree with a live replacement handler', async () => {
		const { html } = await ServerRT.renderToString(server.RootScopedRecovery, {
			isClient: false,
		});
		container.innerHTML = html;
		const staleRoot = container.querySelector('#root-server')!;
		const staleLeaf = container.querySelector('#root-stale')!;
		const root = hydrateRoot(container, client.RootScopedRecovery, { isClient: true });
		flushSync(() => {});

		try {
			expect(staleRoot.isConnected).toBe(false);
			expect(staleLeaf.isConnected).toBe(false);
			expect(container.querySelectorAll('#root-client')).toHaveLength(1);
			expect(container.querySelector('#root-server')).toBeNull();

			const action = container.querySelector<HTMLButtonElement>('#root-recovered-action')!;
			expect(action.textContent?.trim()).toBe('root:0');
			flushSync(() => action.click());
			expect(action.textContent?.trim()).toBe('root:1');
			expectDiagnostics();
		} finally {
			root.unmount();
		}
	});

	// Per Redact hydration-mismatch-recovery.test.tsx:262-297.
	it('nearest-host recovery preserves outside objects and both outside and regenerated handlers', async () => {
		const { html } = await ServerRT.renderToString(server.HostScopedRecovery, {
			isClient: false,
		});
		container.innerHTML = html;
		const stableRoot = container.querySelector('#host-recovery-root')!;
		const stableHeader = container.querySelector('#host-stable-header')!;
		const stableScope = container.querySelector('#host-recovery-scope')!;
		const stableFooter = container.querySelector('#host-stable-footer')!;
		const outsideAction = container.querySelector<HTMLButtonElement>('#host-outside-action')!;
		const staleRange = container.querySelector('#host-server-range')!;
		const root = hydrateRoot(container, client.HostScopedRecovery, { isClient: true });
		flushSync(() => {});

		try {
			expect(container.querySelector('#host-recovery-root')).toBe(stableRoot);
			expect(container.querySelector('#host-stable-header')).toBe(stableHeader);
			expect(container.querySelector('#host-recovery-scope')).toBe(stableScope);
			expect(container.querySelector('#host-stable-footer')).toBe(stableFooter);
			expect(container.querySelector('#host-outside-action')).toBe(outsideAction);
			expect(staleRange.isConnected).toBe(false);
			expect(container.querySelectorAll('#host-client-range')).toHaveLength(1);

			const recoveredAction = container.querySelector<HTMLButtonElement>('#host-recovered-action')!;
			flushSync(() => recoveredAction.click());
			expect(recoveredAction.textContent?.trim()).toBe('inside:1');
			flushSync(() => outsideAction.click());
			expect(outsideAction.textContent?.trim()).toBe('outside:1');
			expectDiagnostics();
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
		const root = hydrateRoot(container, client.SuspenseScopedRecovery, { isClient: true });
		flushSync(() => {});

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
			expectDiagnostics();
		} finally {
			root.unmount();
		}
	});
});

// A renderable `{expr}` hole that is its host's only child renders markerless:
// the server serializes a primitive as the host's bare text, and frames an
// element, a component, or a list in a range the client's child slot adopts.
// When the server rendered text but the client value is one of those, the host
// holds nothing the value can adopt. The text must be discarded and reported
// where the hole is, without giving up on the rest of the root.
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
		// The hole's own line, so the warning cannot name a template inside its value.
		const holeLine =
			readFileSync(OBJECT, 'utf8')
				.split('\n')
				.findIndex((line) => line.includes('<div>{pick(props.kind, props.v)}</div>')) + 1;
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

		/** Element and text markup, ignoring hydration comments. */
		function markup(node: Element): string {
			const copy = node.cloneNode(true) as Element;
			const walker = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT);
			const comments: Node[] = [];
			while (walker.nextNode()) comments.push(walker.currentNode);
			for (const comment of comments) comment.parentNode!.removeChild(comment);
			return copy.innerHTML;
		}

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
		async function expectReported(recovered: unknown[], file: string, line: number | null) {
			await Promise.resolve();
			expect(recovered).toHaveLength(1);
			expect(String((recovered[0] as Error).message)).toMatch(/hydration mismatch/i);
			if (!dev) {
				expect(warns()).toEqual([]);
				return;
			}
			expect(warns()).toEqual([
				expect.stringMatching(
					new RegExp(
						`^Octane hydration mismatch at [^ ]*${file.replace(/\./g, '\\.')}:` +
							`${line ?? '\\d+'}:\\d+: the client expected a renderable range but the ` +
							`server rendered text "A"\\.`,
					),
				),
			]);
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
				'discards server text for a client %s value, reports it once, and keeps hydrating',
				async (kind) => {
					const { div, tail, tailText, recovered, root, render, expected } = hydrate('text', kind);
					try {
						expect(container.querySelector('section > div')).toBe(div);
						expect(markup(div)).toBe(expected({ kind, v: 'A', tail: 't' }));
						// The recovery stays local: the next hole still adopts its server text.
						expect(container.querySelector('b')).toBe(tail);
						expectSameNodes(tail.childNodes, [tailText]);
						expect(tail.textContent).toBe('t');
						await expectReported(recovered, 'renderable-text-object.tsrx', holeLine);

						render({ kind: 'text', v: 'B', tail: 'u' });
						expect(markup(div)).toBe('B');
						expect(tail.innerHTML).toBe('u');
						render({ kind, v: 'C', tail: 'u' });
						expect(markup(div)).toBe(expected({ kind, v: 'C', tail: 'u' }));
						render({ kind: 'text', v: 'D', tail: 'u' });
						expect(markup(div)).toBe('D');
						await Promise.resolve();
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

			// A server that rendered nothing leaves nothing to discard, like a text
			// hole whose server text is missing.
			it.each(OBJECT_KINDS)(
				'builds a client %s value into a host the server left empty',
				async (kind) => {
					const { div, tail, tailText, recovered, root, expected } = hydrate('empty', kind);
					try {
						expect(container.querySelector('section > div')).toBe(div);
						expect(markup(div)).toBe(expected({ kind, v: 'A', tail: 't' }));
						expect(container.querySelector('b')).toBe(tail);
						expectSameNodes(tail.childNodes, [tailText]);
						await Promise.resolve();
						expect(recovered).toEqual([]);
						expect(warns()).toEqual([]);
					} finally {
						root.unmount();
					}
				},
			);
		});

		// A textarea's text is its default value, owned by its value props (or its
		// text children), never by markup the value renders beside it.
		it('keeps a textarea host’s server text and keeps hydrating the root', async () => {
			container.innerHTML = ServerRT.renderToString(server.AreaHole, {
				kind: 'text',
				v: 'A',
				tail: 't',
			}).html;
			const textarea = container.querySelector('textarea')!;
			const serverText = textarea.firstChild;
			const tail = container.querySelector('b')!;
			const tailText = tail.firstChild;
			const recovered: unknown[] = [];
			const root = hydrateRoot(
				container,
				client.AreaHole,
				{ kind: 'p', v: 'A', tail: 't' },
				{ onRecoverableError: (error) => recovered.push(error) },
			);
			flushSync(() => {});
			try {
				expect(container.querySelector('textarea')).toBe(textarea);
				expect(textarea.firstChild).toBe(serverText);
				expect(textarea.defaultValue).toBe('A');
				expect(textarea.value).toBe('A');
				expect(container.querySelector('b')).toBe(tail);
				expectSameNodes(tail.childNodes, [tailText]);
				expect(tail.textContent).toBe('t');
				await Promise.resolve();
				expect(recovered).toEqual([]);
				expect(warns()).toEqual([]);
			} finally {
				root.unmount();
			}
		});

		// The boundary's next attempt finds the value's own client DOM where the
		// server text was. Rebuilding it must neither report it nor duplicate it.
		it('reports once and builds once when the client value suspends', async () => {
			container.innerHTML = ServerRT.renderToString(server.SuspendingHole, {
				text: null,
				v: 'A',
			}).html;
			const div = container.querySelector('section > div')!;
			const textarea = container.querySelector('textarea')!;
			const serverText = textarea.firstChild;
			const tail = container.querySelector('b')!;
			expect(div.textContent).toBe('A');
			expect(textarea.defaultValue).toBe('A');
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
				await act(async () => {
					resolve('R');
					await text;
				});
				expect(container.querySelector('section > div')).toBe(div);
				expect(markup(div)).toBe('<em class="waits">R</em>');
				expect(container.querySelector('textarea')).toBe(textarea);
				expect(textarea.firstChild).toBe(serverText);
				expect(markup(textarea)).toBe('A<em class="waits">R</em>');
				expect(container.querySelector('b')).toBe(tail);
				expect(tail.textContent).toBe('A');
				await expectReported(recovered, 'renderable-text-object.tsrx', null);
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

			it('discards server text for a client element value', async () => {
				container.innerHTML = ServerRT.renderToString(tsxServer.Hole, {
					kind: 'text',
					v: 'A',
					tail: 't',
				}).html;
				const div = container.querySelector('section > div')!;
				const tail = container.querySelector('b')!;
				const recovered: unknown[] = [];
				const root = hydrateRoot(
					container,
					tsxClient.Hole,
					{ kind: 'p', v: 'A', tail: 't' },
					{ onRecoverableError: (error) => recovered.push(error) },
				);
				flushSync(() => {});
				try {
					expect(container.querySelector('section > div')).toBe(div);
					expect(markup(div)).toBe('<p class="x">A</p>');
					expect(container.querySelector('b')).toBe(tail);
					expect(tail.textContent).toBe('t');
					await expectReported(recovered, 'renderable-text-object-tsx.tsx', null);
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
			])('discards server text for a client $kind value', async ({ value }) => {
				container.innerHTML = ServerRT.renderToString(signalServer.Hole, {
					value: 'A',
					label: 't',
				}).html;
				const div = container.querySelector('section > div')!;
				const tail = container.querySelector('i')!;
				const recovered: unknown[] = [];
				const props = { value: value(), label: 't' };
				const root = hydrateRoot(container, signalClient.Hole, props, {
					onRecoverableError: (error) => recovered.push(error),
				});
				flushSync(() => {});
				try {
					expect(container.querySelector('section > div')).toBe(div);
					expect(markup(div)).toBe(clientMarkup(signalClient.Hole, props, 'section > div'));
					expect(container.querySelector('i')).toBe(tail);
					expect(tail.textContent).toBe('t');
					await expectReported(recovered, 'renderable-text-object-signal.tsrx', null);
					flushSync(() => root.render(signalClient.Hole, { value: 'B', label: 't' }));
					expect(markup(div)).toBe('B');
				} finally {
					root.unmount();
				}
			});
		});

		// Captures that changed before a dormant boundary activated legitimately
		// differ from the server's: repair the hole, but report nothing.
		it('repairs a dormant boundary whose value became an element before activation without reporting', async () => {
			const serverProps = { when: condition(false), kind: 'text', v: 'A' };
			container.innerHTML = ServerRT.renderToString(server.DormantHole, serverProps).html;
			const recovered: unknown[] = [];
			const root = hydrateRoot(container, client.DormantHole, serverProps, {
				onRecoverableError: (error) => recovered.push(error),
			});
			flushSync(() => {});
			try {
				const div = container.querySelector('section > div')!;
				expect(div.textContent).toBe('A');
				await act(() => root.render(client.DormantHole, { when: load(), kind: 'p', v: 'A' }));
				expect(container.querySelector('section > div')).toBe(div);
				expect(markup(div)).toBe('<p class="x">A</p>');
				await Promise.resolve();
				expect(recovered).toEqual([]);
				expect(warns()).toEqual([]);
				flushSync(() => root.render(client.DormantHole, { when: load(), kind: 'text', v: 'B' }));
				expect(markup(div)).toBe('B');
			} finally {
				root.unmount();
			}
		});
	},
);

// The server HTML below is a LEGACY shape for a sole-child mixed-arm-ternary hole:
// an outer value pair wrapping one pair per keyed item. Today's client claims that
// hole as an @if-lowered block whose branch hosts the keyed list, so every adopted
// pair sits one nesting level off from where the client expects it. Recovery from
// that misalignment must rebuild the subtree and never throw — stale server HTML
// (an older octane version, a cached edge response) is exactly what the prod
// recovery safety net exists for.
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

	it('legacy nested-pair list shape: rebuilds the keyed list and stays interactive', () => {
		container.innerHTML = LEGACY_HTML;
		const root = hydrateRoot(container, client.ForArm);
		flushSync(() => {});

		try {
			const itemTexts = () =>
				Array.from(container.querySelectorAll('.host i'), (n) => n.textContent);
			expect(itemTexts()).toEqual(['x', 'y']);

			// The rebuilt block must leave a coherent slot boundary behind: flip to the
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
	// by the compiler's ternary suites). This case pins only what RECOVERY
	// owns: no throw, the stale server list fully discarded (never leaked into
	// later arms), and a slot boundary the swaps can keep using.
	it('legacy nested-pair list shape under the inline ternary: discards, never throws or leaks', () => {
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
// rendered text but the client value is empty, the client renders no node the
// server text could belong to. It must be discarded and reported, not kept
// beside every later value the hole renders.
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

	/** Element and text markup, ignoring hydration comments. */
	function markup(node: Element): string {
		const copy = node.cloneNode(true) as Element;
		const walker = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT);
		const comments: Node[] = [];
		while (walker.nextNode()) comments.push(walker.currentNode);
		for (const comment of comments) comment.parentNode!.removeChild(comment);
		return copy.innerHTML;
	}

	const texts = (node: Element) => [...node.childNodes].filter((child) => child.nodeType === 3);

	/** Exactly one report: the recoverable error always, the warning in DEV only. */
	async function expectReported(recovered: unknown[], file: string, actual: string) {
		await Promise.resolve();
		expect(recovered).toHaveLength(1);
		expect(String((recovered[0] as Error).message)).toMatch(/hydration mismatch/i);
		if (!dev) {
			expect(warns()).toEqual([]);
			return;
		}
		expect(warns()).toEqual([
			expect.stringMatching(
				new RegExp(
					`^Octane hydration mismatch at [^ ]*${file.replace(/\./g, '\\.')}:\\d+:\\d+: ` +
						`the client expected nothing but the server rendered ${actual}\\.`,
				),
			),
		]);
	}

	const EMPTY_KINDS = ['undefined', null, 'false', 'true', 'empty'] as const;

	describe.each([
		{ where: 'in the root component', name: 'Hole' },
		{ where: 'in a nested component', name: 'NestedHole' },
	])('$where', ({ name }) => {
		it.each(EMPTY_KINDS)(
			'discards server text for a client %j value, reports it once, and stays clean',
			async (kind) => {
				container.innerHTML = ServerRT.renderToString(server[name], {
					kind: 'text',
					v: 'A',
					tail: 't',
				}).html;
				const div = container.querySelector('section > div')!;
				const tail = container.querySelector('b')!;
				const [tailText] = texts(tail);
				expect(div.textContent).toBe('A');
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
					expect(container.querySelector('section > div')).toBe(div);
					expect(markup(div)).toBe('');
					// The recovery stays local: the next hole still adopts its server text.
					expect(container.querySelector('b')).toBe(tail);
					expect(texts(tail)).toEqual([tailText]);
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

		// The ternary child is framed by the server (`<!--[-->A<!--]-->`), so the
		// discard must take the frame too.
		it.each([undefined, null, false, ''])(
			'discards a framed server text for a client %j value',
			async (label) => {
				container.innerHTML = ServerRT.renderToString(tsxServer.ConditionalChild, {
					on: false,
					label: 'A',
				}).html;
				const div = container.querySelector('div')!;
				expect(div.textContent).toBe('A');
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
	});

	// A direct-host @for row inlines its binding guards instead of calling the
	// cached-value helper; its first render must reach the hole just the same.
	it('discards server text for a client undefined value in a keyed @for row', async () => {
		container.innerHTML = ServerRT.renderToString(server.ListHole, {
			rows: [
				{ id: 1, label: 'A' },
				{ id: 2, label: 'B' },
			],
		}).html;
		const items = [...container.querySelectorAll('li')];
		const [kept] = texts(items[1]);
		expect(items.map((item) => item.textContent)).toEqual(['A', 'B']);
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
			expect([...container.querySelectorAll('li')]).toEqual(items);
			expect(markup(items[0])).toBe('');
			expect(texts(items[1])).toEqual([kept]);
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
			'discards server text for a client %j value',
			async (value) => {
				container.innerHTML = ServerRT.renderToString(signalServer.Hole, {
					value: 'A',
					label: 't',
				}).html;
				const div = container.querySelector('section > div')!;
				expect(div.textContent).toBe('A');
				const recovered: unknown[] = [];
				const root = hydrateRoot(
					container,
					signalClient.Hole,
					{ value, label: 't' },
					{ onRecoverableError: (error) => recovered.push(error) },
				);
				flushSync(() => {});
				try {
					expect(container.querySelector('section > div')).toBe(div);
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

	// Captures that changed before a dormant boundary activated legitimately
	// differ from the server's: repair the hole, but report nothing.
	it.each(EMPTY_KINDS)(
		'repairs a dormant boundary whose value became %j before activation without reporting',
		async (kind) => {
			const serverProps = { when: condition(false), kind: 'text', v: 'A' };
			container.innerHTML = ServerRT.renderToString(server.DormantHole, serverProps).html;
			const recovered: unknown[] = [];
			const root = hydrateRoot(container, client.DormantHole, serverProps, {
				onRecoverableError: (error) => recovered.push(error),
			});
			flushSync(() => {});
			try {
				const div = container.querySelector('section > div')!;
				expect(div.textContent).toBe('A');
				await act(() => root.render(client.DormantHole, { when: load(), kind, v: 'A' }));
				expect(container.querySelector('section > div')).toBe(div);
				expect(markup(div)).toBe('');
				await Promise.resolve();
				expect(recovered).toEqual([]);
				expect(warns()).toEqual([]);
				flushSync(() => root.render(client.DormantHole, { when: load(), kind: 'text', v: 'B' }));
				expect(markup(div)).toBe('B');
			} finally {
				root.unmount();
			}
		},
	);
});
