import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hydrateRoot, flushSync } from '../../src/index.js';
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
