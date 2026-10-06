import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadServerFixture } from '../_server-fixture';
import * as client from './_fixtures/render-phase-text.tsrx';

// A component that updates its own state while it renders is rendered again
// before React compares any of its output with the server's, so only the text
// that render settles on meets the server text. Here the update is queued
// while the template renders, before the text: the text the first render
// shows decides nothing. A settled text that matches keeps the server's node;
// one that differs is a mismatch, and its fallback owner renders on the
// client and reports once, as React's does.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/render-phase-text.tsrx',
);
const server = loadServerFixture<typeof client>(FIXTURE, { id: 'render-phase-text.tsrx' });
const dev = process.env.OCTANE_TEST_COMPILE_MODE !== 'prod';

/** React's recoverable hydration error. */
const MISMATCH = /server rendered HTML didn't match the client/;

const ROUTES = [
	{ route: 'an only-child text binding', name: 'SettlingText' },
	{ route: 'a text binding beside an element', name: 'SettlingSiblingText' },
	{ route: 'an only-child renderable hole', name: 'SettlingHoleText' },
] as const;

/** The text a <p> renders beside its elements. */
const ownText = (p: Element) =>
	Array.from(p.childNodes, (node) => (node.nodeType === 3 ? node.nodeValue : '')).join('');

const containers: HTMLElement[] = [];
afterEach(() => {
	for (const container of containers.splice(0)) container.remove();
	vi.restoreAllMocks();
});

async function hydrate(
	name: keyof typeof client,
	serverText: string,
	props: { first: string; settled: string },
) {
	const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
	const container = document.createElement('div');
	document.body.appendChild(container);
	containers.push(container);
	container.innerHTML = ServerRT.renderToString(server[name] as any, {
		settle: false,
		first: serverText,
		settled: serverText,
	}).html;
	const serverP = container.querySelector('p')!;
	const serverOutside = container.querySelector('b');
	expect(ownText(serverP)).toBe(serverText);
	const recovered: unknown[] = [];
	let root!: ReturnType<typeof hydrateRoot>;
	flushSync(() => {
		root = hydrateRoot(
			container,
			client[name] as any,
			{ settle: true, ...props },
			{ onRecoverableError: (error) => recovered.push(error) },
		);
	});
	await Promise.resolve();
	const warnings = () =>
		errors.mock.calls
			.map((call) => String(call[0]))
			.filter((message) => message.includes('hydration mismatch'));
	return {
		container,
		root,
		serverP,
		serverOutside,
		recovered,
		warnings,
		p: () => container.querySelector('p')!,
	};
}

describe('hydrateRoot — text that a render-phase update renders again', () => {
	describe.each(ROUTES)('$route', ({ name }) => {
		it('keeps the server text when the settled text matches it', async () => {
			const { p, serverP, recovered, warnings, root } = await hydrate(name, 'a', {
				first: 'x',
				settled: 'a',
			});
			expect(p()).toBe(serverP);
			expect(ownText(serverP)).toBe('a');
			expect(recovered).toEqual([]);
			expect(warnings()).toEqual([]);
			root.unmount();
		});

		it('keeps an empty server text when the settled text is empty', async () => {
			const { p, serverP, recovered, warnings, root } = await hydrate(name, '', {
				first: 'x',
				settled: '',
			});
			expect(p()).toBe(serverP);
			expect(ownText(serverP)).toBe('');
			expect(recovered).toEqual([]);
			expect(warnings()).toEqual([]);
			root.unmount();
		});

		it.each([
			{ case: 'the first render differs too', first: 'x' },
			{ case: 'the first render matched it', first: 'a' },
		])(
			'renders the root on the client when the settled text differs from the server text and $case',
			async ({ first }) => {
				const { p, serverP, recovered, warnings, root } = await hydrate(name, 'a', {
					first,
					settled: 'b',
				});
				expect(serverP.isConnected).toBe(false);
				expect(ownText(p())).toBe('b');
				expect(recovered).toHaveLength(1);
				expect(String((recovered[0] as Error).message)).toMatch(MISMATCH);
				expect(warnings()).toEqual(
					dev
						? [
								expect.stringMatching(
									/render-phase-text\.tsrx:\d+:\d+: the client expected text "b" but the server rendered text "a"\./,
								),
							]
						: [],
				);
				root.unmount();
			},
		);

		it('renders the root on the client when the settled text differs from an empty server text', async () => {
			const { p, serverP, recovered, root } = await hydrate(name, '', {
				first: '',
				settled: 'b',
			});
			expect(serverP.isConnected).toBe(false);
			expect(ownText(p())).toBe('b');
			expect(recovered).toHaveLength(1);
			expect(String((recovered[0] as Error).message)).toMatch(MISMATCH);
			root.unmount();
		});
	});

	// The settled text is compared before the boundary's attempt commits, so
	// the boundary, not the root, renders on the client.
	it('renders only the enclosing Suspense boundary on the client when the settled text differs', async () => {
		const { p, serverP, serverOutside, container, recovered, root } = await hydrate(
			'SettlingTextInSuspense',
			'a',
			{ first: 'a', settled: 'b' },
		);
		expect(serverP.isConnected).toBe(false);
		expect(ownText(p())).toBe('b');
		expect(container.querySelector('b')).toBe(serverOutside);
		expect(recovered).toHaveLength(1);
		root.unmount();
	});
});
