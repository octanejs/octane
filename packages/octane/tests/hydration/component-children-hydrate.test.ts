import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import { hydrateRoot, flushSync } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { Pair, Tree } from './_fixtures/component-children.tsrx';

// A host whose children are all component slots with @if-root bodies. The
// server frames each component range; hydration must adopt the rendered
// elements (same node instances), keep them interactive, and post-hydration
// updates must build fresh client DOM correctly inside the adopted tree —
// including arm flips that replace a leaf with a whole new subtree.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/component-children.tsrx',
);

function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'component-children.tsrx', {
		mode: 'server',
	});
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
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

describe('hydrateRoot — host with only component children (@if-root components)', () => {
	it('adopts both children (same elements) and keeps them interactive', () => {
		const { html } = ServerRT.renderToString(server.Pair, { aBig: true, bBig: true });
		expect(html).toContain('A:0');
		expect(html).toContain('B:0');

		container.innerHTML = html;
		const bigs = container.querySelectorAll('.big');
		expect(bigs.length).toBe(2);
		const [a, b] = [bigs[0], bigs[1]];
		const root = hydrateRoot(container, Pair, { aBig: true, bBig: true });
		flushSync(() => {});

		// Server elements were adopted, not rebuilt.
		const after = container.querySelectorAll('.big');
		expect(after[0]).toBe(a);
		expect(after[1]).toBe(b);

		// Handlers are live on both.
		flushSync(() => (a as HTMLElement).click());
		expect(a.textContent).toBe('A:1');
		flushSync(() => (b as HTMLElement).click());
		expect(b.textContent).toBe('B:1');
		root.unmount();
	});

	it('post-hydration arm flip of one child keeps the sibling’s adopted node', () => {
		const { html } = ServerRT.renderToString(server.Pair, { aBig: true, bBig: true });
		container.innerHTML = html;
		const b = container.querySelectorAll('.big')[1];
		const root = hydrateRoot(container, Pair, { aBig: true, bBig: true });
		flushSync(() => {});

		root.render(Pair, { aBig: false, bBig: true });
		flushSync(() => {});
		const host = container.querySelector('.host')!;
		expect(host.querySelector('.leaf')?.textContent).toBe('A');
		expect(host.querySelectorAll('.big').length).toBe(1);
		expect(host.querySelectorAll('.big')[0]).toBe(b);
		// Order: the flipped child still precedes its sibling.
		const kids = Array.from(host.children);
		expect(kids.indexOf(host.querySelector('.leaf')!)).toBeLessThan(
			kids.indexOf(host.querySelector('.big')!),
		);
		root.unmount();
	});

	it('adopts a recursive tree and grows it client-side (fresh anchorless mounts inside adopted DOM)', () => {
		const { html } = ServerRT.renderToString(server.Tree, { depth: 2, path: 'r' });
		container.innerHTML = html;
		const serverLeaves = Array.from(container.querySelectorAll('.leaf'));
		expect(serverLeaves.map((el) => el.textContent)).toEqual(['rLL', 'rLR', 'rRL', 'rRR']);

		const root = hydrateRoot(container, Tree, { depth: 2, path: 'r' });
		flushSync(() => {});
		// Adoption: the leaf nodes are the server's instances.
		const adopted = Array.from(container.querySelectorAll('.leaf'));
		expect(adopted.length).toBe(4);
		adopted.forEach((el, i) => expect(el).toBe(serverLeaves[i]));

		// Grow: every leaf arm flips into an interior node, whose two component
		// children mount as fresh client DOM inside the hydrated tree.
		root.render(Tree, { depth: 3, path: 'r' });
		flushSync(() => {});
		expect(Array.from(container.querySelectorAll('.leaf')).map((el) => el.textContent)).toEqual([
			'rLLL',
			'rLLR',
			'rLRL',
			'rLRR',
			'rRLL',
			'rRLR',
			'rRRL',
			'rRRR',
		]);
		expect(container.querySelectorAll('.n').length).toBe(7);

		// Shrink back: the fresh interior nodes flip to leaves again.
		root.render(Tree, { depth: 2, path: 'r' });
		flushSync(() => {});
		expect(Array.from(container.querySelectorAll('.leaf')).map((el) => el.textContent)).toEqual([
			'rLL',
			'rLR',
			'rRL',
			'rRR',
		]);

		root.unmount();
		expect(container.innerHTML).toBe('');
	});
});
