import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import { createRoot, hydrateRoot, flushSync } from '../src/index.js';
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
	Branch,
	Deopt,
} from './_fixtures/marker-shape.tsrx';

// M0 of docs/comment-marker-elision-plan.md — STRUCTURAL PINS for comment-
// marker minting. Each case renders a representative fixture three ways and
// asserts the EXACT comment count:
//   client — fresh createRoot mount (client minting regimes incl. the
//            existing elisions: forBlock singleRoot items, branch self-mark)
//   ssr    — the server HTML string (pairs are emitted UNCONDITIONALLY today)
//   hydrate— server HTML adopted by hydrateRoot (adoption keeps every server
//            pair, so hydrated counts ≥ client counts)
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
		// keeping the frame pair (and Suspense's own boundary bookkeeping) on
		// both sides. A one-sided decline would desync hydration here; hydrate
		// matching ssr proves the pairs adopted cleanly.
		expect(counts('AliasSusp', AliasSusp, {})).toEqual({ client: 6, ssr: 8, hydrate: 8 });
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

	it('(b) keyed @for, single-root items: client elides item pairs, SSR keeps them', () => {
		const props = { items: ['a', 'b', 'c'] };
		// Client: the template's <!> position anchor (1) + the <!--for--> slot
		// pair (2) = 3; items self-mark (forBlock singleRoot) = 0. SSR: outer
		// for-slot pair (2) + one pair PER ITEM (3×2=6) = 8 — the server always
		// pairs items (open question 2 of the plan). Hydration adopts all
		// server pairs (no template anchor — the server emits none) = 8.
		expect(counts('ListSingle', ListSingle, props)).toEqual({ client: 3, ssr: 8, hydrate: 8 });
	});

	it('(b2) keyed @for, @empty branch active', () => {
		// Client: template anchor (1) + for-slot pair (2) + <!--empty--> branch
		// pair (2) = 5. SSR emits ONLY the outer for-slot pair with the @empty
		// content inline = 2. Hydration adopts the outer pair and mints the
		// client's empty-branch pair around the adopted content = 4 — a known
		// client/server asymmetry (the branch pair is client bookkeeping).
		expect(counts('ListSingle', ListSingle, { items: [] })).toEqual({
			client: 5,
			ssr: 2,
			hydrate: 4,
		});
	});

	it('(c) keyed @for, multi-root items: item pairs on BOTH sides', () => {
		const props = { items: ['a', 'b'] };
		// Client: template anchor (1) + for-slot pair (2) + per-item <!--it-->
		// pairs (2×2=4) = 7 (multi-root items can't self-mark). SSR: for-slot
		// pair (2) + per-item pairs (4) = 6 (no template anchor). Hydrate: 6.
		expect(counts('ListMulti', ListMulti, props)).toEqual({ client: 7, ssr: 6, hydrate: 6 });
	});

	it('(d) @if single-element branch: client self-marks everything', () => {
		// Client: the single-element branch self-marks AND the if slot rides the
		// template's <!> anchor — only that anchor remains = 1. SSR: if-slot
		// pair + taken-branch pair = 4. Hydration adopts both server pairs = 4.
		expect(counts('Branch', Branch, { on: true })).toEqual({ client: 1, ssr: 4, hydrate: 4 });
	});

	it('(e) de-opt descriptor tree: hostElementBody + nested childSlot pairs', () => {
		// The value hole renders a host tree containing a component descriptor —
		// the @octanejs/recharts shape. M2 (owns-parent child slots + item-range
		// borrowing) landed 2026-07-09: client 12 → 8, hydrate 11 → 9 (de-opt
		// hosts hand their whole content to one childSlot that owns the element —
		// no end anchor, no lazy start; component-bearing list items borrow their
		// own <!--it--> pair instead of nesting a second one). SSR unchanged at 14
		// (server emission untouched by design).
		expect(counts('Deopt', Deopt, {})).toEqual({ client: 8, ssr: 14, hydrate: 9 });
	});
});
