import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import { createRoot, hydrateRoot } from '../src/index.js';
import * as ServerRT from 'octane/server';
import { Chain, ChainX, ListSingle, ListMulti, Branch, Deopt } from './_fixtures/marker-shape.tsrx';

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
	it('(a) sole-child wrapper chain: one pair per non-elided layer', () => {
		// Chain → Mid → Leaf. Client: Mid's slot mints a pair (its root is a
		// COMPONENT, not an element) = 2; Leaf's slot already elides via the
		// same-module componentSlot singleRoot path (its body is one element)
		// = 0. SSR: renderComponentFramed wraps BOTH child layers = 2 pairs = 4;
		// hydration adopts all server pairs = 4. M3 target: client 0, ssr 0
		// (inherited ranges); cross-module chains (the router) get NO client
		// elision today — that's M1/M3.
		expect(counts('Chain', Chain, {})).toEqual({ client: 2, ssr: 4, hydrate: 4 });
	});

	it('(a2) CROSS-MODULE sole child: the $$singleRoot stamp elides the slot pair (M1)', () => {
		// ChainX → ExtLeaf (another module). Client: the call site's `2` sentinel
		// resolves the callee's definition-site stamp → markerless singleRoot
		// mount = 0 comments. SSR still frames the child component = 1 pair = 2;
		// hydration adopts it = 2 (client-mount elision only — the forBlock
		// singleRoot precedent).
		expect(counts('ChainX', ChainX, {})).toEqual({ client: 0, ssr: 2, hydrate: 2 });
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
