import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import * as ClientRT from '../../src/index.js';
import { hydrateRoot, flushSync } from '../../src/index.js';
import * as ServerRT from 'octane/server';

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

function serverModule(fixture: string, file: string): Record<string, any> {
	let { code } = compile(readFileSync(fixture, 'utf8'), file, { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		'const {$1} = __rt;',
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, '__exports.$1 = function $1');
	return new Function('__rt', '__exports', code + '\nreturn __exports;')(ServerRT, {});
}

function devClientModule(fixture: string, file: string): Record<string, any> {
	let { code } = compile(readFileSync(fixture, 'utf8'), file, { mode: 'client', dev: true });
	code = code.replace(/import\s*\{([^}]*)\}\s*from\s*['"]octane['"];?/g, 'const {$1} = __rt;');
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, '__exports.$1 = function $1');
	return new Function('__rt', '__exports', code + '\nreturn __exports;')(ClientRT, {});
}

// PROD-compiled client module (dev: false → no `loc` argument to clone(), no
// `__oct_loc` stamps): the structural detection + rebuild must still run — only
// the warning is dev-gated.
function prodClientModule(fixture: string, file: string): Record<string, any> {
	let { code } = compile(readFileSync(fixture, 'utf8'), file, { mode: 'client' });
	code = code.replace(/import\s*\{([^}]*)\}\s*from\s*['"]octane['"];?/g, 'const {$1} = __rt;');
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, '__exports.$1 = function $1');
	return new Function('__rt', '__exports', code + '\nreturn __exports;')(ClientRT, {});
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
		const { body } = await ServerRT.render(server.Toggle, { on: true });
		expect(body).toContain('<button id="hit"');
		container.innerHTML = body;

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
		const { body } = await ServerRT.render(srv.Pick, { k: 'a' });
		expect(body).toContain('<em class="a">');
		container.innerHTML = body;

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
		const { body } = await ServerRT.render(server.Pick, { k: 'a' });
		expect(body).toContain('<span class="a">');
		container.innerHTML = body;

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
		const { body } = await ServerRT.render(srv.Swap, { host: true });
		expect(body).toContain('<p class="host">');
		container.innerHTML = body;

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
		const { body } = await ServerRT.render(srv.Swap, { host: false });
		expect(body).toContain('<b class="inner">');
		container.innerHTML = body;

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
		const { body } = await ServerRT.render(srv.NestedStatic, { x: true });
		expect(body).toContain('<span class="s1">');
		container.innerHTML = body;

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
		const { body } = await ServerRT.render(server.Toggle, { on: true });
		expect(body).toContain('<button id="hit"');
		container.innerHTML = body;

		hydrateRoot(container, clientProd.Toggle, { on: false });
		flushSync(() => {});

		const div = container.querySelector('#toggle')!;
		expect(div.querySelector('span.off')).not.toBeNull(); // rebuilt to the client branch
		expect(div.querySelector('#hit')).toBeNull(); // stale server branch discarded
		expect(div.textContent).toContain('off');
		expect(warns()).toEqual([]); // prod: recovery without the dev warning
	});

	it('PROD build: matching branch adopts unchanged (structural check has no false positives)', async () => {
		const clientProd = prodClientModule(CONTROL, 'control.tsrx');
		const { body } = await ServerRT.render(server.Toggle, { on: true });
		container.innerHTML = body;
		const before = container.innerHTML;
		hydrateRoot(container, clientProd.Toggle, { on: true });
		flushSync(() => {});
		expect(container.innerHTML).toBe(before);
		expect(warns()).toEqual([]);
	});

	it('no warning + adopted unchanged when the branch matches', async () => {
		const { body } = await ServerRT.render(server.Toggle, { on: true });
		container.innerHTML = body;
		const before = container.innerHTML;
		hydrateRoot(container, clientDev.Toggle, { on: true });
		flushSync(() => {});
		expect(container.innerHTML).toBe(before);
		expect(warns()).toEqual([]);
	});

	it('@for list grow: server 2 items, client 3 → no crash, 3 items rendered, warns', async () => {
		const srv = serverModule(FORLIST, 'forlist.tsrx');
		const cli = devClientModule(FORLIST, 'forlist.tsrx');
		const two = [
			{ id: 1, name: 'a' },
			{ id: 2, name: 'b' },
		];
		const three = [...two, { id: 3, name: 'c' }];
		const { body } = await ServerRT.render(srv.List, { items: two, onPick: () => {} });
		container.innerHTML = body;

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
		const { body } = await ServerRT.render(srv.List, { items: three, onPick: () => {} });
		container.innerHTML = body;

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
		const { body } = await ServerRT.render(srv.List, { items: three, onPick: () => {} });
		container.innerHTML = body;

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
		const { body } = await ServerRT.render(srv.WithEmpty, {
			items: [
				{ id: 1, name: 'a' },
				{ id: 2, name: 'b' },
			],
		});
		expect(body).toContain('<li class="row">');
		container.innerHTML = body;

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
		const { body } = await ServerRT.render(srv.WithEmpty, { items: [] });
		expect(body).toContain('<li class="empty">');
		container.innerHTML = body;

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
