import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { hydrateRoot, flushSync } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadServerFixture } from '../_server-fixture.js';
import {
	MapArm,
	StringArm,
	ChildrenArm,
	NestedTernary,
	RootFragArm,
} from '../_fixtures/ternary-mixed-arms.tsrx';

// The server has always rendered BOTH arms of `{cond ? A : B}` correctly; the
// client regression dropped the non-JSX arm's value, so SSR markup showed
// content the hydrating client would blank out. These tests pin client/server
// agreement: the client adopts the server's non-JSX-arm content (same nodes,
// no rebuild) and the branch stays interactive afterward.

const FIXTURE = join(process.cwd(), 'packages/octane/tests/_fixtures/ternary-mixed-arms.tsrx');
const server = loadServerFixture(FIXTURE);

let container: HTMLElement;
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
});
afterEach(() => container.remove());

describe('hydrateRoot — ternary child hole with one JSX arm', () => {
	it('adopts the keyed `.map` array arm and swaps branches after a click', async () => {
		const { html } = await ServerRT.renderToString(server.MapArm, {});
		expect(html).toContain('<i>x</i>');
		expect(html).toContain('<i>y</i>');

		container.innerHTML = html;
		const first = container.querySelector('.host i') as HTMLElement;
		const root = hydrateRoot(container, MapArm);
		flushSync(() => {});

		// The server's array items were ADOPTED (same node), not rebuilt.
		expect(container.querySelector('.host i')).toBe(first);
		expect(Array.from(container.querySelectorAll('.host i')).map((n) => n.textContent)).toEqual([
			'x',
			'y',
		]);

		// The block is live: flipping reaches the component arm.
		flushSync(() => (container.querySelector('.next') as HTMLButtonElement).click());
		expect(container.querySelector('.host em')?.textContent).toBe('chip');
		root.unmount();
	});

	it('adopts a string arm as text and stays interactive', async () => {
		const { html } = await ServerRT.renderToString(server.StringArm, {});
		expect(html).toContain('nope');

		container.innerHTML = html;
		const host = container.querySelector('.host') as HTMLElement;
		const root = hydrateRoot(container, StringArm);
		flushSync(() => {});

		expect(container.querySelector('.host')).toBe(host); // adopted host
		expect(host.textContent).toBe('nope');

		flushSync(() => (container.querySelector('.flip') as HTMLButtonElement).click());
		expect(host.querySelector('b')?.textContent).toBe('yes');

		flushSync(() => (container.querySelector('.flip') as HTMLButtonElement).click());
		expect(host.textContent).toBe('nope');
		root.unmount();
	});

	it('adopts a nested ternary: the inner ternary is a value hole on both sides', async () => {
		// The outer ternary claims branch ranges; the INNER one sits at the
		// branch's fragment root, which renders as a value hole. Server and
		// client must agree on that split or the adopted ranges misalign.
		const { html } = await ServerRT.renderToString(server.NestedTernary, {});
		expect(html).toContain('0'); // n=2 → the nested else tail

		container.innerHTML = html;
		const host = container.querySelector('.host') as HTMLElement;
		const root = hydrateRoot(container, NestedTernary);
		flushSync(() => {});

		expect(container.querySelector('.host')).toBe(host); // adopted
		expect(host.textContent).toBe('0');

		// Walk every level through the live handler.
		flushSync(() => (container.querySelector('.next') as HTMLButtonElement).click());
		expect(host.querySelector('b')?.textContent).toBe('a'); // n=3 → outer then

		flushSync(() => (container.querySelector('.next') as HTMLButtonElement).click());
		expect(host.querySelector('i')?.textContent).toBe('b'); // n=4 → nested then

		flushSync(() => (container.querySelector('.next') as HTMLButtonElement).click());
		expect(host.textContent).toBe('0'); // n=5 → nested else again
		root.unmount();
	});

	it('adopts a fragment-root ternary as a value hole', async () => {
		const { html } = await ServerRT.renderToString(server.RootFragArm, {});
		expect(html).toContain('nope');

		container.innerHTML = html;
		const btn = container.querySelector('.flip') as HTMLButtonElement;
		const root = hydrateRoot(container, RootFragArm);
		flushSync(() => {});

		expect(container.querySelector('.flip')).toBe(btn); // adopted
		expect(container.textContent).toBe('flipnope');

		flushSync(() => btn.click());
		expect(container.querySelector('b')?.textContent).toBe('yes');

		flushSync(() => btn.click());
		expect(container.textContent).toBe('flipnope');
		root.unmount();
	});

	it('adopts a component-children ternary (value fold on both sides)', async () => {
		const { html } = await ServerRT.renderToString(server.ChildrenArm, {});
		expect(html).toContain('nope');

		container.innerHTML = html;
		const section = container.querySelector('.host section') as HTMLElement;
		const root = hydrateRoot(container, ChildrenArm);
		flushSync(() => {});

		expect(container.querySelector('.host section')).toBe(section); // adopted
		expect(section.textContent).toBe('nope');

		flushSync(() => (container.querySelector('.flip') as HTMLButtonElement).click());
		expect(section.querySelector('b')?.textContent).toBe('yes');

		flushSync(() => (container.querySelector('.flip') as HTMLButtonElement).click());
		expect(section.textContent).toBe('nope');
		root.unmount();
	});
});
