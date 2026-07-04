import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import { hydrateRoot, flushSync, createElement } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { MatchSpread, Wrap, RPLike } from './_fixtures/tryif-spread.tsrx';

// Regression for the router `Match` shape around a non-suspending LAYOUT route whose
// root element carries a spread: ... > @try > @if { <SpreadRoot/> } > header with
// {...attrs}. Hydration must ADOPT the server <header> for the spread, not a block
// comment (which made setSpread throw `el.setAttribute is not a function`). Covers
// both the simple shape and the full nested router shape (providers passing
// descriptor children → childSlot → a fragment-returning component).

const FIXTURE = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/tryif-spread.tsrx');

function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'tryif-spread.tsrx', { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		'const {$1} = __rt;',
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, '__exports.$1 = function $1');
	const fn = new Function('__rt', '__exports', code + '\nreturn __exports;');
	return fn(ServerRT, {});
}
const server = serverModule();

let container: HTMLElement;
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
});
afterEach(() => container.remove());

const attrs = { class: 'app', 'data-testid': 'app' };
const props = { show: true, label: 'Hello', attrs };

function assertCleanHydration(serverBody: string, clientComp: any, clientProps: any): void {
	container.innerHTML = serverBody;
	const header = container.querySelector('header') as HTMLElement;
	expect(header).not.toBeNull();
	expect(header.getAttribute('class')).toBe('app');
	expect(header.textContent).toBe('Hello');

	// A desynced cursor surfaces as a `tryBlock with no catch arm received error: …
	// setAttribute is not a function` console.error from a descendant boundary —
	// even when the final DOM recovers (the row count would double on a re-render).
	const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	const root = hydrateRoot(container, clientComp, clientProps);
	flushSync(() => {});
	const errors = errSpy.mock.calls.map((c) => String(c[0]));
	errSpy.mockRestore();
	expect(errors).toEqual([]);

	expect(container.querySelectorAll('header').length).toBe(1); // adopted, not doubled
	expect(container.querySelector('header')).toBe(header); // SAME node
	expect(container.querySelector('header')!.getAttribute('class')).toBe('app');
	expect(container.querySelector('.loading')).toBeNull();
	expect(container.querySelector('script[data-octane-suspense]')).toBeNull();
	root.unmount();
}

describe('hydrateRoot — router Match shape: @try > @if > component with a spread root', () => {
	// Simple shape: <div><MatchesLike/></div> hydrated directly.
	it('adopts the server <header> for the spread (no throw, no rebuild)', async () => {
		const { html } = ServerRT.renderToString(server.MatchSpread, props);
		assertCleanHydration(html, MatchSpread, props);
	});

	// The full app shape: nested context providers whose children are createElement
	// DESCRIPTORS (the `.tsx` entry: `<QCP><RouterProvider/></QCP>`) → childSlot → a
	// fragment-returning component (<Matches/>). This is what desynced the hydration
	// cursor in the real Hacker News example.
	it('adopts through descriptor-children providers → fragment component (the real app shape)', async () => {
		// Mirrors the real entry: <QCP><RouterProvider/></QCP> where RouterProvider
		// renders <Matches/> (a fragment component) inline. Wrap = QCP (descriptor
		// children → childSlot); RPLike = RouterProvider (renders MatchesLike inline).
		// Server + client render the IDENTICAL tree (as hydration requires): two
		// context providers whose children are createElement DESCRIPTORS (the `.tsx`
		// `<QCP><RouterProvider/></QCP>` shape) → childSlot → RPLike, which renders the
		// fragment-returning <MatchesLike/> inline. This is the deep nesting that
		// desynced the cursor before the runtime fixes (childSlot must not clear the
		// adopted DOM; componentSlot must advance the cursor past an empty component).
		const tree = (re: any, comps: { Wrap: any; RPLike: any }) =>
			re.createElement(comps.Wrap, {
				value: 'a',
				children: re.createElement(comps.RPLike, props),
			});
		const serverTree = (_p: any, scope: any) =>
			(ServerRT as any).ssrChild(
				tree(ServerRT, { Wrap: server.Wrap, RPLike: server.RPLike }),
				scope,
			);
		const clientTree = () => tree({ createElement }, { Wrap, RPLike });
		const { html } = ServerRT.renderToString(serverTree, {});
		assertCleanHydration(html, clientTree, {});
	});
});
