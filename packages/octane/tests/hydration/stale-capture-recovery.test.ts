import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// When a dormant Hydrate boundary's captures change before it activates, the
// server HTML predates the client's state, and a dormant boundary never renders
// its stale captures to compare them. As React does for an update that reaches
// a dehydrated boundary it cannot hydrate, a boundary whose output differs
// renders on the client with no hydration warning and no onRecoverableError,
// and takes the client's values even where a real mismatch would keep the
// server's: suppressHydrationWarning and dangerouslySetInnerHTML. Each Plain*
// control renders the same tree without a boundary, where the same difference
// is a real mismatch: the root renders on the client and reports.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/stale-capture-recovery.tsrx',
);
const FILE = 'stale-capture-recovery.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');

/** Element and text markup, ignoring hydration comments. */
function markup(node: Element): string {
	const copy = node.cloneNode(true) as Element;
	const walker = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT);
	const comments: Node[] = [];
	while (walker.nextNode()) comments.push(walker.currentNode);
	for (const comment of comments) comment.parentNode!.removeChild(comment);
	return copy.innerHTML;
}

const MISMATCH = /^Hydration failed because the server rendered HTML didn't match the client\./;

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — recovery under captures that changed before activation ($name)', ({ dev }) => {
	const server = loadServerFixture(FIXTURE, { id: FILE });
	const client = loadCompiledFixtureSource(SOURCE, {
		id: FILE,
		mode: 'client',
		compileOptions: { dev },
	});
	let container: HTMLElement;
	let root: { render(component: unknown, props: unknown): void; unmount(): void } | null;
	let errSpy: ReturnType<typeof vi.spyOn>;
	let recoverable: string[];

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		root = null;
		recoverable = [];
		errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		root?.unmount();
		container.remove();
		errSpy.mockRestore();
	});

	const warnings = () =>
		errSpy.mock.calls
			.map((call: unknown[]) => String(call[0]))
			.filter((message: string) => message.includes('hydration mismatch'));

	async function hydrate(name: string, props: Record<string, unknown>) {
		root = hydrateRoot(container, client[name], props, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
		});
		flushSync(() => {});
		// Recoverable reports are delivered after the hydration burst.
		await act(async () => {});
	}

	/** Hydrate a dormant boundary over its own server HTML, then change its captures. */
	async function activate(name: string, serverProps: object, clientProps: object) {
		container.innerHTML = ServerRT.renderToString(server[name], serverProps).html;
		await hydrate(name, serverProps as Record<string, unknown>);
		flushSync(() => root!.render(client[name], clientProps));
		await act(async () => {});
	}

	const structural = [
		{
			site: 'a hole whose server text became a component',
			name: 'Hole',
			serverProps: { label: 'server' },
			clientProps: { label: 'client' },
			html: '<section><b>x</b><i>x</i><b>y</b><i>y</i><b>z</b><i>z</i></section>',
		},
		{
			site: 'a createElement list that shrank',
			name: 'List',
			serverProps: { items: ['a', 'b'] },
			clientProps: { items: ['a'] },
			html: '<section><ul><li>a</li></ul></section>',
		},
		{
			site: 'a dynamic host tag that changed',
			name: 'Tag',
			serverProps: { tag: 'b' },
			clientProps: { tag: 'i' },
			html: '<section><i>t</i></section>',
		},
	];

	it.each(structural)(
		'renders the root on the client and reports $site when the captures are unchanged',
		async ({ name, serverProps, clientProps, html }) => {
			container.innerHTML = ServerRT.renderToString(server[`Plain${name}`], serverProps).html;
			const served = [...container.querySelectorAll('*')];
			await hydrate(`Plain${name}`, clientProps);

			expect(markup(container.querySelector('section')!.parentElement!)).toBe(html);
			expect(served.filter((node) => node.isConnected)).toEqual([]);
			expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
			expect(warnings()).toHaveLength(dev ? 1 : 0);
		},
	);

	it.each(structural)(
		'renders $site on the client without a report when the captures changed',
		async ({ name, serverProps, clientProps, html }) => {
			container.innerHTML = ServerRT.renderToString(server[`Dormant${name}`], serverProps).html;
			const outer = container.firstElementChild;
			const section = container.querySelector('section')!;
			await hydrate(`Dormant${name}`, serverProps as Record<string, unknown>);
			flushSync(() => root!.render(client[`Dormant${name}`], clientProps));
			await act(async () => {});

			expect(markup(container.querySelector('section')!.parentElement!)).toBe(html);
			// Only the boundary renders on the client.
			expect(container.firstElementChild).toBe(outer);
			expect(section.isConnected).toBe(false);
			expect(recoverable).toEqual([]);
			expect(warnings()).toEqual([]);
		},
	);

	it('keeps the server dangerouslySetInnerHTML when the captures are unchanged', async () => {
		container.innerHTML = ServerRT.renderToString(server.PlainHTML, { html: '<b>old</b>' }).html;
		await hydrate('PlainHTML', { html: '<i>new</i>' });

		expect(container.querySelector('article')!.innerHTML).toBe('<b>old</b>');
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual(
			dev
				? [
						expect.stringContaining(
							'`dangerouslySetInnerHTML` content: the server rendered "<b>old</b>", the client "<i>new</i>"',
						),
					]
				: [],
		);
	});

	it('writes the newer dangerouslySetInnerHTML when the captures changed', async () => {
		await activate('DormantHTML', { html: '<b>old</b>' }, { html: '<i>new</i>' });

		expect(container.querySelector('article')!.innerHTML).toBe('<i>new</i>');
		expect(container.querySelector('em')!.textContent).toBe('<i>new</i>');
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);

		flushSync(() => root!.render(client.DormantHTML, { html: '<i>new</i>' }));
		expect(container.querySelector('article')!.innerHTML).toBe('<i>new</i>');
		flushSync(() => root!.render(client.DormantHTML, { html: '<u>next</u>' }));
		expect(container.querySelector('article')!.innerHTML).toBe('<u>next</u>');
	});

	const values = (el: HTMLElement) => ({
		text: el.textContent,
		title: el.getAttribute('title'),
		class: el.getAttribute('class'),
		color: el.style.color,
	});

	it('keeps a suppressed element’s server values when the captures are unchanged', async () => {
		container.innerHTML = ServerRT.renderToString(server.PlainSuppressed, { v: 'red' }).html;
		await hydrate('PlainSuppressed', { v: 'blue' });

		expect(values(container.querySelector('em')!)).toEqual({
			text: 'red',
			title: 'red',
			class: 'red',
			color: 'red',
		});
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);
	});

	it('gives suppressed and plain elements the newer values silently when the captures changed', async () => {
		await activate('DormantSuppressed', { v: 'red' }, { v: 'blue' });

		const em = container.querySelector('em')!;
		const i = container.querySelector('i')!;
		const blue = { text: 'blue', title: 'blue', class: 'blue', color: 'blue' };
		expect(values(em)).toEqual(blue);
		expect(values(i)).toEqual(blue);
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);

		// Later renders patch from the client's values, not the server's.
		flushSync(() => root!.render(client.DormantSuppressed, { v: 'blue' }));
		expect(values(em)).toEqual(blue);
		flushSync(() => root!.render(client.DormantSuppressed, { v: 'green' }));
		expect(values(em)).toEqual({ text: 'green', title: 'green', class: 'green', color: 'green' });
	});

	it('shows the pending arm while the newer HTML waits for a value in the same @try arm', async () => {
		container.innerHTML = ServerRT.renderToString(server.DormantArmHTML, {
			server: true,
			html: '<b>old</b>',
			leaf: Promise.resolve('z'),
		}).html;
		const outer = container.firstElementChild;
		await hydrate('DormantArmHTML', {
			server: true,
			html: '<b>old</b>',
			leaf: Promise.resolve('z'),
		});
		let resolve!: (value: string) => void;
		const leaf = new Promise<string>((done) => (resolve = done));
		flushSync(() => root!.render(client.DormantArmHTML, { html: '<i>new</i>', leaf }));
		await act(async () => {});

		// The arm's newer content suspends outside a transition, so its @pending
		// arm shows until the value resolves.
		expect(container.querySelector('p')!.textContent).toBe('pending');

		await act(async () => resolve('y'));
		expect(markup(container.querySelector('section')!)).toBe(
			'<article><i>new</i></article><u>y</u>',
		);
		expect(container.firstElementChild).toBe(outer);
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);
	});

	// suppressHydrationWarning keeps a differing server text one level deep, but
	// never a structural difference: an element where the client renders text
	// does not match, so the root renders on the client and reports, as in React.
	it('renders the root on the client where a suppressed host lost its server text node', async () => {
		const html = (name: string) => {
			container.innerHTML = ServerRT.renderToString(server[name], { v: 'red' }).html;
			// Something outside Octane replaced the server's text with another node.
			const em = container.querySelector('em')!;
			em.replaceChild(document.createElement('s'), em.lastChild!);
			return em;
		};

		const plain = html('PlainSwap');
		await hydrate('PlainSwap', { v: 'red' });
		expect(plain.isConnected).toBe(false);
		expect(container.querySelector('em')!.innerHTML).toBe('<b>b</b>red');
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
		expect(warnings()).toHaveLength(dev ? 1 : 0);
	});

	it('renders the dormant boundary on the client where a suppressed host lost its server text node', async () => {
		container.innerHTML = ServerRT.renderToString(server.DormantSwap, { v: 'red' }).html;
		const outer = container.firstElementChild;
		// Something outside Octane replaced the server's text with another node.
		const em = container.querySelector('em')!;
		em.replaceChild(document.createElement('s'), em.lastChild!);
		await hydrate('DormantSwap', { v: 'red' });
		flushSync(() => root!.render(client.DormantSwap, { v: 'blue' }));
		await act(async () => {});
		expect(em.isConnected).toBe(false);
		expect(container.firstElementChild).toBe(outer);
		expect(container.querySelector('em')!.innerHTML).toBe('<b>b</b>blue');
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);
	});
});
