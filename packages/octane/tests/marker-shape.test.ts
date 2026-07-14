import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import { createRoot, hydrateRoot, flushSync, act } from '../src/index.js';
import * as ServerRT from 'octane/server';
import {
	Chain,
	ChainX,
	ChainKeyed,
	SwapInherit,
	WrapSwap,
	Provided,
	AliasSusp,
	ListSingle,
	ListMulti,
	ListComponent,
	ListComponentMulti,
	ListConditional,
	ListConditionalEmpty,
	TransitionConditionalList,
	Branch,
	BranchEmpty,
	NestedBranch,
	Deopt,
} from './_fixtures/marker-shape.tsrx';

// M0 of docs/comment-marker-elision-plan.md — STRUCTURAL PINS for comment-
// marker minting. Each case renders a representative fixture three ways and
// asserts the EXACT comment count:
//   client — fresh createRoot mount (client minting regimes incl. the
//            existing elisions: forBlock singleRoot items, branch self-mark)
//   ssr    — the server HTML string (pairs are emitted UNCONDITIONALLY today)
//   hydrate— server HTML adopted by hydrateRoot, then exactly-coextensive
//            logical ranges share one counted physical pair (`[N` / `]N`)
// The counts are the CURRENT contract, with the arithmetic in comments. The
// elision phases (M1-M3) are EXPECTED to lower them — edit deliberately, and
// keep client/ssr/hydrate mutually consistent when you do.

const FIXTURE = join(process.cwd(), 'packages/octane/tests/_fixtures/marker-shape.tsrx');

// Server module via explicit server-mode compile (the established evalModule
// technique from the hydration suites).
function evalServer(file: string, extra?: Record<string, any>): Record<string, any> {
	let { code } = compile(readFileSync(file, 'utf8'), file.split('/').pop()!, { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	// Cross-module fixture import → destructure from the pre-evaluated module.
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]\.\/marker-shape-ext\.tsrx['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __ext;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	const fn = new Function('__rt', '__exports', '__ext', code + '\nreturn __exports;');
	return fn(ServerRT, {}, extra ?? {});
}
const serverExt = evalServer(
	join(process.cwd(), 'packages/octane/tests/_fixtures/marker-shape-ext.tsrx'),
);
const server = evalServer(FIXTURE, serverExt);

let container: HTMLElement;
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
});
afterEach(() => container.remove());

function domComments(root: Node): number {
	const w = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
	let n = 0;
	while (w.nextNode()) n++;
	return n;
}
const htmlComments = (html: string): number => (html.match(/<!--/g) || []).length;

function counts(name: string, clientComp: any, props: any) {
	const clientRoot = createRoot(container);
	clientRoot.render(clientComp, props);
	const client = domComments(container);
	clientRoot.unmount();

	const { html } = ServerRT.renderToString(server[name], props);
	const ssr = htmlComments(html);

	container.innerHTML = html;
	const hydRoot = hydrateRoot(container, clientComp, props);
	const hydrate = domComments(container);
	hydRoot.unmount();

	return { client, ssr, hydrate };
}

describe('marker-shape pins (M0) — exact comment counts per minting regime', () => {
	it('(a) sole-child wrapper chain: inherited ranges collapse every layer (M3)', () => {
		// Chain → Mid → Leaf. Each body's sole output is one component call, so
		// every call site INHERITS its parent block's range (M3): the client
		// borrows instead of minting (Chain: the root block's whole-container
		// range; Mid: the same), the server skips renderComponentFramed's pair
		// at both flagged sites, and hydration adopts nothing. Pre-M3 this was
		// client 2 / ssr 4 / hydrate 4.
		expect(counts('Chain', Chain, {})).toEqual({ client: 0, ssr: 0, hydrate: 0 });
	});

	it('(a2) CROSS-MODULE sole child: inherit-range works on imported callees (M3)', () => {
		// ChainX → ExtLeaf (another module). The inherit stamp is a CALL-SITE
		// property (sole root of the body) — no same-module analysis needed, so
		// the cross-module chain elides on all three sides too. Pre-M3: client 0
		// (via the M1 `$$singleRoot` stamp) / ssr 2 / hydrate 2; the M1 sentinel
		// is now superseded by inherit at this site.
		expect(counts('ChainX', ChainX, {})).toEqual({ client: 0, ssr: 0, hydrate: 0 });
	});

	it('(a3) KEYED sole child keeps its pair; the layer below still inherits (M3)', () => {
		// `key=` is excluded from inherit — ChainKeyed's site mints/adopts its own
		// pair (client 2 / ssr 2 / hydrate 2) while Mid → Leaf below it still
		// inherits (0). Also proves the exclusion agrees across all three sides.
		expect(counts('ChainKeyed', ChainKeyed, { k: 'k1' })).toEqual({
			client: 2,
			ssr: 2,
			hydrate: 2,
		});
	});

	it('(a4) inherited identity swap, whole-container regime (root)', () => {
		// SwapInherit's sole-root tag is a per-render LOCAL — the inherit-stamped
		// site swaps identity across renders. At the root the borrow is
		// whole-container (null markers): teardown clears the container, the
		// remount re-renders in place, zero comments throughout — including a
		// MULTI-root replacement body (SwapB), which singleRoot could never hold.
		const root = createRoot(container);
		root.render(SwapInherit, { useA: true });
		expect(container.innerHTML).toBe('<ins class="sa">v:A</ins>');
		expect(domComments(container)).toBe(0);
		flushSync(() => root.render(SwapInherit, { useA: false })); // scheduled otherwise
		expect(container.innerHTML).toBe('<del class="sb">v:B</del><del class="sb2">tail</del>');
		expect(domComments(container)).toBe(0);
		flushSync(() => root.render(SwapInherit, { useA: true }));
		expect(container.innerHTML).toBe('<ins class="sa">v:A</ins>');
		root.unmount();
		expect(container.innerHTML).toBe('');
	});

	it('(a4b) inherited identity swap, borrowed-pair regime: the parent pair survives', () => {
		// Nested under an element, SwapInherit's own slot mints a real pair; the
		// inner `<Comp/>` site borrows it (exclusiveMarkers teardown). The pair
		// must survive every swap — a removed marker would strand the slot.
		const root = createRoot(container);
		root.render(WrapSwap, { useA: true });
		const sec = container.querySelector('section.ws')!;
		expect(domComments(sec)).toBe(2);
		expect(sec.innerHTML).toContain('<ins class="sa">v:A</ins>');
		flushSync(() => root.render(WrapSwap, { useA: false }));
		expect(domComments(sec)).toBe(2);
		expect(sec.innerHTML).toContain('<del class="sb">v:B</del><del class="sb2">tail</del>');
		expect(sec.querySelector('.sa')).toBeNull();
		flushSync(() => root.render(WrapSwap, { useA: true }));
		expect(domComments(sec)).toBe(2);
		expect(sec.innerHTML).toContain('<ins class="sa">v:A</ins>');
		expect(sec.querySelector('.sb')).toBeNull();
		root.unmount();
	});

	it('(a8) MEMBER-TAG sole root (`<Ctx.Provider>`) inherits — the router-stack shape', () => {
		// The Provider's own frame pair is gone on all three sides; what remains
		// is the children render-fn's block pair on the server (the client mounts
		// the children markerless, hydration adopts the server's pair — the
		// ListSingle-style asymmetry).
		expect(counts('Provided', Provided, {})).toEqual({ client: 0, ssr: 2, hydrate: 2 });
	});

	it('(a9) ALIASED boundary builtin declines at RUNTIME on both sides', () => {
		// `const S = Suspense` dodges the compile-time name exclusion — the site
		// is stamped, and componentSlot + ssrComponent both decline by identity,
		// keeping the frame pair (and Suspense's own boundary bookkeeping) on both
		// sides. Hydration compacts one coextensive descendant range but preserves
		// the independent Suspense boundary: 8 server comments → 6 live comments.
		expect(counts('AliasSusp', AliasSusp, {})).toEqual({ client: 6, ssr: 8, hydrate: 6 });
	});

	it('(a5) chain hydration ADOPTS the server DOM (same node, no mismatch)', () => {
		const { html } = ServerRT.renderToString(server.Chain, {});
		container.innerHTML = html;
		const serverLeaf = container.querySelector('div.leaf');
		expect(serverLeaf).not.toBeNull();
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const root = hydrateRoot(container, Chain, {});
			// Adoption, not rebuild: the very node the server rendered survives.
			expect(container.querySelector('div.leaf')).toBe(serverLeaf);
			expect(container.textContent).toBe('n:0');
			expect(errSpy).not.toHaveBeenCalled();
			root.unmount();
		} finally {
			errSpy.mockRestore();
		}
	});

	it('(a6) LEGACY server HTML (pre-M3 frame pairs) still recovers to correct content', () => {
		// Old server output wrapped each chain layer in a frame pair; the new
		// client adopts nothing at inherit sites. Hydrating legacy HTML must fall
		// into mismatch RECOVERY (client re-render), ending with correct content —
		// the plan's server-has-pair/client-expects-none case.
		const { html } = ServerRT.renderToString(server.Chain, {});
		container.innerHTML = '<!--[--><!--[-->' + html + '<!--]--><!--]-->';
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			const root = hydrateRoot(container, Chain, {});
			expect(container.querySelector('div.leaf')).not.toBeNull();
			expect(container.textContent).toBe('n:0');
			root.unmount();
		} finally {
			errSpy.mockRestore();
			warnSpy.mockRestore();
		}
	});

	it('(a7) boundary builtins + positive control: inherit stamping at compile time', () => {
		// Suspense (aliased or not) is EXCLUDED — its pairs are load-bearing for
		// streaming. Both compile modes must agree.
		const excl =
			`import { Suspense } from 'octane';\n` +
			`function Inner() @{ <p>i</p> }\n` +
			`export function Page() @{ <Suspense fallback={'f'}><Inner/></Suspense> }\n`;
		expect(compile(excl, 'x.tsrx').code).not.toMatch(/componentSlot\([^)]*, true\);/);
		expect(compile(excl, 'x.tsrx', { mode: 'server' }).code).not.toMatch(
			/_\$ssrComponent\(__s, Suspense, [^)]*, true\)/,
		);
		// Positive control — a plain sole comp root IS stamped on both sides (so
		// the negative assertions above aren't vacuous).
		const pos = `function Inner() @{ <p>i</p> }\nexport function Page() @{ <Inner/> }\n`;
		expect(compile(pos, 'y.tsrx').code).toMatch(/componentSlot\([^)]*, true\);/);
		expect(compile(pos, 'y.tsrx', { mode: 'server' }).code).toMatch(
			/_\$ssrComponent\(__s, Inner, \{\s*\}, true\)/,
		);
	});

	it('(b) keyed @for, direct-host items: item pairs are elided on client and server', () => {
		const props = { items: ['a', 'b', 'c'] };
		// Client: the template's <!> position anchor is reused as the for slot's
		// end, so the outer range costs 2; items self-mark = 0. The server uses
		// the same direct hosts as item boundaries and emits only its outer pair.
		// Hydration adopts those hosts without minting or retaining item pairs.
		expect(counts('ListSingle', ListSingle, props)).toEqual({ client: 2, ssr: 2, hydrate: 2 });
	});

	it('(b2) keyed @for, @empty branch active', () => {
		// The client reuses its template anchor as the outer range end and the
		// @empty block borrows that range. SSR already emits the empty content
		// directly inside the same outer pair; hydration now adopts it unchanged.
		expect(counts('ListSingle', ListSingle, { items: [] })).toEqual({
			client: 2,
			ssr: 2,
			hydrate: 2,
		});
	});

	it('(c) keyed @for, multi-root items: item pairs on BOTH sides', () => {
		const props = { items: ['a', 'b'] };
		// Client: reused-anchor for-slot pair (2) + per-item <!--it-->
		// pairs (2×2=4) = 6 (multi-root items can't self-mark). SSR: for-slot
		// pair (2) + per-item pairs (4) = 6 (no template anchor). Hydrate: 6.
		expect(counts('ListMulti', ListMulti, props)).toEqual({ client: 6, ssr: 6, hydrate: 6 });
	});

	it('(c2) keyed sole-component items share only proven single-host roots', () => {
		const props = { items: ['a', 'b', 'c'] };
		// SingleItem: client outer pair only. The server protocol remains
		// conservative and keeps both an item pair and component frame per row;
		// hydration adopts them, then stores both logical depths on one counted
		// physical item pair: outer pair (2) + three item pairs (3×2) = 8.
		expect(counts('ListComponent', ListComponent, props)).toEqual({
			client: 2,
			ssr: 14,
			hydrate: 8,
		});
		// MultiItem is not stamped singleRoot, so every client item retains its
		// pair; the sole nested component borrows it. SSR keeps both established
		// logical ranges and hydration coalesces each exact per-item pair.
		expect(counts('ListComponentMulti', ListComponentMulti, props)).toEqual({
			client: 8,
			ssr: 14,
			hydrate: 8,
		});
	});

	it('(c2b) markerless component items preserve identity, state, effects, refs, and events', async () => {
		const effects: string[] = [];
		const refs: string[] = [];
		const onEffect = (entry: string) => effects.push(entry);
		const onRef = (value: string, node: HTMLLIElement | null) =>
			refs.push(`${node === null ? 'detach' : 'attach'}:${value}`);
		const root = createRoot(container);
		root.render(ListComponent, { items: ['a', 'b', 'c'], onEffect, onRef });
		await act(() => {});
		const rows = new Map(
			[...container.querySelectorAll<HTMLElement>('.component-item')].map((row) => [
				row.dataset.value,
				row,
			]),
		);
		expect(domComments(container)).toBe(2);
		expect(effects).toEqual(['mount:a', 'mount:b', 'mount:c']);
		expect(refs).toEqual(['attach:a', 'attach:b', 'attach:c']);
		(rows.get('b')!.querySelector('.increment') as HTMLButtonElement).click();
		expect(rows.get('b')!.textContent).toBe('b:1');

		flushSync(() => root.render(ListComponent, { items: ['c', 'b', 'a'], onEffect, onRef }));
		const reordered = [...container.querySelectorAll<HTMLElement>('.component-item')];
		expect(reordered).toEqual([rows.get('c'), rows.get('b'), rows.get('a')]);
		expect(rows.get('b')!.textContent).toBe('b:1');
		expect(domComments(container)).toBe(2);

		flushSync(() => root.render(ListComponent, { items: ['c', 'a'], onEffect, onRef }));
		await act(() => {});
		expect(container.querySelector('[data-value="b"]')).toBeNull();
		expect([...container.querySelectorAll('.component-item')]).toEqual([
			rows.get('c'),
			rows.get('a'),
		]);
		expect(effects).toContain('cleanup:b');
		expect(refs).toContain('detach:b');
		root.unmount();
		await act(() => {});
		expect(effects).toEqual(expect.arrayContaining(['cleanup:a', 'cleanup:b', 'cleanup:c']));
		expect(refs).toEqual(expect.arrayContaining(['detach:a', 'detach:b', 'detach:c']));
	});

	it('(c2c) component-item server ranges still hydrate and reorder in place', () => {
		const props = { items: ['a', 'b', 'c'] };
		const { html } = ServerRT.renderToString(server.ListComponent, props);
		container.innerHTML = html;
		const rows = new Map(
			[...container.querySelectorAll<HTMLElement>('.component-item')].map((row) => [
				row.dataset.value,
				row,
			]),
		);
		const root = hydrateRoot(container, ListComponent, props);
		expect(container.querySelector('[data-value="a"]')).toBe(rows.get('a'));
		expect(domComments(container)).toBe(8);
		flushSync(() => root.render(ListComponent, { items: ['c', 'a', 'b'] }));
		expect([...container.querySelectorAll<HTMLElement>('.component-item')]).toEqual([
			rows.get('c'),
			rows.get('a'),
			rows.get('b'),
		]);
		root.unmount();
	});

	it('(c4) keyed host-vs-host @if items share the active element boundary', () => {
		const items = [
			{ id: 'a', code: false },
			{ id: 'b', code: true },
			{ id: 'c', code: false },
		];
		expect(counts('ListConditional', ListConditional, { items })).toEqual({
			client: 2,
			ssr: 20,
			hydrate: 8,
		});
		expect(
			counts('ListConditionalEmpty', ListConditionalEmpty, {
				items: items.map((item) => ({ id: item.id, show: false })),
			}),
		).toEqual({ client: 8, ssr: 14, hydrate: 8 });
	});

	it('(c4b) conditional item boundaries follow branch swaps and keyed moves', () => {
		const root = createRoot(container);
		root.render(ListConditional, {
			items: [
				{ id: 'a', code: false },
				{ id: 'b', code: true },
			],
		});
		const oldA = container.querySelector('[data-id="a"]');
		const oldB = container.querySelector('[data-id="b"]');
		expect(oldA?.localName).toBe('p');
		expect(oldB?.localName).toBe('pre');
		expect(domComments(container)).toBe(2);

		flushSync(() =>
			root.render(ListConditional, {
				items: [
					{ id: 'a', code: true },
					{ id: 'b', code: false },
				],
			}),
		);
		const newA = container.querySelector('[data-id="a"]');
		const newB = container.querySelector('[data-id="b"]');
		expect(newA?.localName).toBe('pre');
		expect(newB?.localName).toBe('p');
		expect(newA).not.toBe(oldA);
		expect(newB).not.toBe(oldB);
		expect(domComments(container)).toBe(2);

		flushSync(() =>
			root.render(ListConditional, {
				items: [
					{ id: 'b', code: false },
					{ id: 'a', code: true },
				],
			}),
		);
		expect([...container.querySelectorAll('.conditional-item')]).toEqual([newB, newA]);
		expect(domComments(container)).toBe(2);
		root.unmount();
	});

	it('(c4c) transition branch commits promote the shared item to one durable pair', async () => {
		const root = createRoot(container);
		root.render(TransitionConditionalList, {});
		expect(container.querySelector('.transition-item')?.localName).toBe('p');
		expect(domComments(container)).toBe(2);

		await act(() => (container.querySelector('.transition-flip') as HTMLButtonElement).click());
		expect(container.querySelector('.transition-item')?.localName).toBe('pre');
		// Off-screen transition commits intentionally retain their WIP pair. The
		// item and branch share it, so this is one pair rather than nested pairs.
		expect(domComments(container)).toBe(4);
		root.unmount();
		expect(container.innerHTML).toBe('');
	});

	it('(c4d) hydrated conditional items retain server ranges across swaps', () => {
		const initial = {
			items: [
				{ id: 'a', code: false },
				{ id: 'b', code: true },
			],
		};
		const { html } = ServerRT.renderToString(server.ListConditional, initial);
		container.innerHTML = html;
		const serverA = container.querySelector('[data-id="a"]');
		const root = hydrateRoot(container, ListConditional, initial);
		expect(container.querySelector('[data-id="a"]')).toBe(serverA);

		flushSync(() =>
			root.render(ListConditional, {
				items: [
					{ id: 'a', code: true },
					{ id: 'b', code: false },
				],
			}),
		);
		const newA = container.querySelector('[data-id="a"]');
		const newB = container.querySelector('[data-id="b"]');
		expect(newA?.localName).toBe('pre');
		expect(newB?.localName).toBe('p');
		expect(newA).not.toBe(serverA);
		// Each branch and keyed item already shares one counted physical range;
		// the arm swap updates that logical group without adding nested pairs.
		expect(domComments(container)).toBe(6);

		flushSync(() =>
			root.render(ListConditional, {
				items: [
					{ id: 'b', code: false },
					{ id: 'a', code: true },
				],
			}),
		);
		expect([...container.querySelectorAll('.conditional-item')]).toEqual([newB, newA]);
		root.unmount();
	});

	it('(d) @if single-element branch: client self-marks everything', () => {
		// Client: the single-element branch self-marks AND the if slot rides the
		// template's <!> anchor — only that anchor remains = 1. SSR: if-slot
		// pair + taken-branch pair = 4. Hydration adopts both logical ranges on
		// one counted physical pair = 2.
		expect(counts('Branch', Branch, { on: true })).toEqual({ client: 1, ssr: 4, hydrate: 2 });
	});

	it('(d2) inactive @if uses one anchor and stays markerless through toggles', () => {
		expect(counts('BranchEmpty', BranchEmpty, { on: false })).toEqual({
			client: 1,
			ssr: 2,
			hydrate: 2,
		});

		const hit = vi.fn();
		const root = createRoot(container);
		root.render(BranchEmpty, { on: false, hit });
		const before = container.querySelector('.before');
		const after = container.querySelector('.after');
		expect(domComments(container)).toBe(1);
		flushSync(() => root.render(BranchEmpty, { on: true, hit }));
		const active = container.querySelector('.active') as HTMLButtonElement;
		expect(active).not.toBeNull();
		expect(domComments(container)).toBe(1);
		active.click();
		expect(hit).toHaveBeenCalledTimes(1);
		expect(container.querySelector('.before')).toBe(before);
		expect(container.querySelector('.after')).toBe(after);
		flushSync(() => root.render(BranchEmpty, { on: false, hit }));
		expect(container.querySelector('.active')).toBeNull();
		expect(domComments(container)).toBe(1);
		expect(container.querySelector('.before')).toBe(before);
		expect(container.querySelector('.after')).toBe(after);
		root.unmount();
	});

	it('(d3) nested self-marked branches refresh every shared ancestor boundary', () => {
		const root = createRoot(container);
		root.render(NestedBranch, { outer: true, inner: true });
		expect(container.querySelector('.inner-a')?.textContent).toBe('A');
		flushSync(() => root.render(NestedBranch, { outer: true, inner: false }));
		expect(container.querySelector('.inner-a')).toBeNull();
		expect(container.querySelector('.inner-b')?.textContent).toBe('B');
		flushSync(() => root.render(NestedBranch, { outer: false, inner: false }));
		expect(container.querySelector('.inner-b')).toBeNull();
		expect(container.querySelector('.tail')?.textContent).toBe('tail');
		flushSync(() => root.render(NestedBranch, { outer: true, inner: true }));
		expect(container.querySelector('.inner-a')?.textContent).toBe('A');
		expect([...container.querySelector('.nb')!.children].map((node) => node.className)).toEqual([
			'inner-a',
			'tail',
		]);
		root.unmount();
		expect(container.innerHTML).toBe('');
	});

	it('(c3) ordinary return-JSX functions receive only narrow single-root stamps', () => {
		const positive = compile(
			`export default function Row(props) { const x = props.x; return <li>{x}</li>; }`,
			'row.tsx',
		).code;
		expect(positive).toContain('Row.$$singleRoot = true;');

		const earlyReturn = compile(
			`export default function Row(props) { if (!props.x) return null; return <li>{props.x}</li>; }`,
			'row-early.tsx',
		).code;
		expect(earlyReturn).not.toContain('Row.$$singleRoot = true;');
		const fragment = compile(
			`export default function Row() { return <><li>a</li><li>b</li></>; }`,
			'row-fragment.tsx',
		).code;
		expect(fragment).not.toContain('Row.$$singleRoot = true;');

		const consumer = compile(
			`import Row from './row'; export function List(props) @{ <ul>@for (const x of props.items; key x.id) { <Row x={x}/> }</ul> }`,
			'list.tsrx',
		).code;
		expect(consumer).toContain('Row.$$singleRoot === true ? 2 : 0');
	});

	it('(e) de-opt descriptor tree: hostElementBody + nested childSlot pairs', () => {
		// The value hole renders a host tree containing a component descriptor —
		// the @octanejs/recharts shape. M2 (owns-parent child slots + item-range
		// borrowing): client 12 → 8, hydrate 11 → 9 (de-opt hosts hand their whole
		// content to one childSlot that owns the element — no end anchor, no lazy
		// start; component-bearing list items borrow their own <!--it--> pair
		// instead of nesting a second one). M4: the `{tree}` SOLE-CHILD hole takes
		// the owns-parent regime too (childTextHole's object fallback, −2), and
		// the PURE single-element list item (section.s1) SELF-MARKS instead of
		// minting an `it` pair (−2; the component-bearing s0 keeps + borrows its
		// pair) — client 8 → 4. SSR unchanged at 14 (server emission untouched
		// by design).
		expect(counts('Deopt', Deopt, {})).toEqual({ client: 4, ssr: 14, hydrate: 9 });
	});
});
