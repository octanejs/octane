import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot, type Root } from '../../src/index.js';
import { renderToString } from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture.js';

// Value differences in a root with no Suspense boundary whose hydration
// suspends at GateLeaf, as React handles them. A differing server text does
// not match: the root renders on the client and reports once, or, inside a
// resolved @try/@pending arm, only that arm does. A differing attribute, class,
// style, or raw HTML is never patched: the server's value stays, and
// development warns once that it won't be patched up. While the root is
// suspended nothing commits, even when the root already fell back and its
// client render is the one that suspends: the server's content stays exactly as
// it was rendered and nothing is reported. The attempt that commits after the
// value resolves reports exactly what a hydration that never suspends reports.
// Recoverable errors publish in dev and prod; the console diagnostic needs the
// development compile's source locations.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/root-suspended-value-mismatch.tsrx',
);
const FILE = 'root-suspended-value-mismatch.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');
type Fixture = typeof import('./_fixtures/root-suspended-value-mismatch.tsrx');
type Component = Exclude<keyof Fixture, 'gate'>;
const MISMATCH = /^Hydration failed because the server rendered HTML didn't match the client\./;

/** 1-based line of the `<span>` that begins the fixture snippet `site`. */
function siteLine(site: string): number {
	const at = SOURCE.indexOf(site);
	if (at < 0) throw new Error(`fixture has no ${JSON.stringify(site)}`);
	if (SOURCE.indexOf(site, at + 1) >= 0) throw new Error(`${JSON.stringify(site)} is ambiguous`);
	return SOURCE.slice(0, at + site.indexOf('<span')).split('\n').length;
}

type Case = {
	name: Component;
	server: string;
	client: string;
	/** The value under test, in the form a client render produces it. */
	observe: (span: HTMLElement) => string | null;
	/** A fixture snippet that begins at the host owning the value. */
	site: string;
	/**
	 * `root`: a text difference renders the root on the client. `arm`: it renders
	 * the @try arm on the client. `kept`: the server's value stays.
	 */
	outcome: 'root' | 'arm' | 'kept';
	/** For a kept value, what the warning lists and its printed server and client values. */
	what?: string;
	printed?: [string, string];
};

const CASES: Case[] = [
	{
		name: 'RootText',
		server: 'server',
		client: 'client',
		observe: (span) => span.textContent,
		site: '<span>{props.label as string}</span>\n\t\t<GateLeaf />',
		outcome: 'root',
	},
	{
		name: 'RootSiblingText',
		server: 'server',
		client: 'client',
		observe: (span) => span.lastChild!.nodeValue,
		site: '<span>\n\t\t\t<u>',
		outcome: 'root',
	},
	{
		name: 'RootAttribute',
		server: 'server',
		client: 'client',
		observe: (span) => span.getAttribute('title'),
		site: "<span title={props.label}>{'t'}</span>\n\t\t<GateLeaf />",
		outcome: 'kept',
		what: 'attribute `title`',
	},
	{
		name: 'RootStyle',
		server: 'red',
		client: 'blue',
		observe: (span) => span.style.cssText,
		site: "<span style={{ color: props.label }}>{'t'}</span>\n\t\t<GateLeaf />",
		outcome: 'kept',
		what: 'style',
		printed: ['color: red;', 'color: blue;'],
	},
	{
		name: 'RootStyleText',
		server: 'red',
		client: 'blue',
		observe: (span) => span.style.cssText,
		site: '<span style={`color: ${props.label}`}>',
		outcome: 'kept',
		what: 'style',
		printed: ['color: red;', 'color: blue;'],
	},
	{
		name: 'RootStaticStyle',
		server: 'red',
		client: 'blue',
		observe: (span) => span.style.cssText,
		site: "<span style={{ display: 'block', color: props.label }}>",
		outcome: 'kept',
		what: 'style',
		printed: ['display: block; color: red;', 'display: block; color: blue;'],
	},
	{
		name: 'RootClass',
		server: 'server',
		client: 'client',
		observe: (span) => span.getAttribute('class'),
		site: "<span class={props.label}>{'t'}</span>\n\t\t<GateLeaf />",
		outcome: 'kept',
		what: 'attribute `class`',
	},
	{
		name: 'RootHtml',
		server: 'server',
		client: 'client',
		observe: (span) => span.innerHTML,
		site: '<span dangerouslySetInnerHTML',
		outcome: 'kept',
		what: '`dangerouslySetInnerHTML` content',
	},
	{
		name: 'RootArmText',
		server: 'server',
		client: 'client',
		observe: (span) => span.textContent,
		site: '<span>{props.label as string}</span>\n\t\t} @pending',
		outcome: 'arm',
	},
	{
		name: 'RootArmClass',
		server: 'server',
		client: 'client',
		observe: (span) => span.getAttribute('class'),
		site: "<span class={props.label}>{'t'}</span>\n\t\t} @pending",
		outcome: 'kept',
		what: 'attribute `class`',
	},
	{
		name: 'RootArmStyle',
		server: 'red',
		client: 'blue',
		observe: (span) => span.style.cssText,
		site: "<span style={{ color: props.label }}>{'t'}</span>\n\t\t} @pending",
		outcome: 'kept',
		what: 'style',
		printed: ['color: red;', 'color: blue;'],
	},
];

const XLINK = 'http://www.w3.org/1999/xlink';

describe.each([
	{ mode: 'development compile', dev: true },
	{ mode: 'production compile', dev: false },
])('hydrateRoot — value differences in a suspended root without a boundary ($mode)', ({ dev }) => {
	const server = loadServerFixture<Fixture>(FIXTURE, { id: FILE });
	const client = loadCompiledFixtureSource<Fixture>(SOURCE, {
		id: FILE,
		mode: 'client',
		compileOptions: { dev },
	});
	let container: HTMLElement;
	let root: Root | undefined;
	let error: MockInstance<typeof console.error>;
	let caught: unknown[];

	beforeEach(() => {
		container = document.createElement('div');
		document.body.append(container);
		server.gate.promise = undefined;
		client.gate.promise = undefined;
		error = vi.spyOn(console, 'error').mockImplementation(() => {});
		caught = [];
	});

	afterEach(() => {
		root?.unmount();
		root = undefined;
		container.remove();
		client.gate.promise = undefined;
		error.mockRestore();
	});

	const warnings = (): string[] =>
		error.mock.calls
			.map((call) => String(call[0]))
			.filter((message) => message.includes('hydration mismatch'));

	/** Server-render `name` with `label` into the container; returns its elements. */
	function serve(name: Component, label: string): Element[] {
		container.innerHTML = renderToString(server[name], { label }).html;
		return [...container.querySelectorAll('*')];
	}

	/** Hydrate the served `name` with `label`; returns its recoverable errors. */
	function hydrate(name: Component, label: string): unknown[] {
		const recoverable: unknown[] = [];
		root = hydrateRoot(
			container,
			client[name],
			{ label },
			{
				onRecoverableError: (reason) => recoverable.push(reason),
				onCaughtError: (reason) => caught.push(reason),
			},
		);
		flushSync(() => {});
		return recoverable;
	}

	/**
	 * Suspend the client's gate until the returned function resolves it. The
	 * gate then holds `next`, or opens.
	 */
	function suspend(): (next?: Promise<void>) => Promise<void> {
		let resolve!: () => void;
		const promise = new Promise<void>((done) => {
			resolve = done;
		});
		client.gate.promise = promise;
		return (next) =>
			act(async () => {
				client.gate.promise = next;
				resolve();
				await promise;
			});
	}

	/** The committed DOM: the client's render, or the server's where it is kept. */
	function reference(c: Case) {
		const reference = document.createElement('div');
		reference.innerHTML = renderToString(server[c.name], {
			label: c.outcome === 'kept' ? c.server : c.client,
		}).html;
		return { value: c.observe(reference.querySelector('span')!), text: reference.textContent };
	}

	function expectCommitted(c: Case, served: Element[], recoverable: unknown[]) {
		const committed = reference(c);
		const span = container.querySelector('span')!;
		const div = container.firstElementChild;
		expect(c.observe(span)).toBe(committed.value);
		expect(container.textContent).toBe(committed.text);
		expect(container.querySelector('i')!.textContent).toBe('ok');
		if (c.outcome === 'root') {
			// No server node survives.
			expect(served.filter((node) => node.isConnected)).toEqual([]);
		} else if (c.outcome === 'arm') {
			// Only the arm's server DOM is replaced.
			expect(div).toBe(served[0]);
			expect(served.includes(span)).toBe(false);
			expect(served.includes(container.querySelector('i')!)).toBe(true);
		} else {
			expect(served.filter((node) => !node.isConnected)).toEqual([]);
		}
		expect(recoverable).toEqual(c.outcome === 'kept' ? [] : [expect.any(Error)]);
		for (const reason of recoverable) expect((reason as Error).message).toMatch(MISMATCH);
		const reported = warnings();
		if (!dev) {
			expect(reported).toEqual([]);
			return;
		}
		const at = `${FILE}:${siteLine(c.site)}:`;
		if (c.outcome !== 'kept') {
			expect(reported).toEqual([expect.stringContaining(`Octane hydration mismatch at ${at}`)]);
			expect(reported[0]).toContain(
				`the client expected text "${c.client}" but the server rendered text "${c.server}".`,
			);
			return;
		}
		const [printedServer, printedClient] = c.printed ?? [c.server, c.client];
		expect(reported).toEqual([expect.stringContaining("This won't be patched up.")]);
		expect(reported[0]).toContain(at);
		expect(reported[0]).toContain(
			`: ${c.what}: the server rendered ${JSON.stringify(printedServer)}, the client ` +
				`${JSON.stringify(printedClient)}`,
		);
	}

	it.each(CASES)('hydrates $name as React does when the root never suspends', async (c) => {
		const served = serve(c.name, c.server);
		const recoverable = hydrate(c.name, c.client);
		await act(() => {});

		expectCommitted(c, served, recoverable);
	});

	it.each(CASES)(
		'keeps the server content of $name while pending and reports once at commit',
		async (c) => {
			const resume = suspend();
			const served = serve(c.name, c.server);
			const span = container.querySelector('span')!;
			const serverMarkup = container.innerHTML;
			const recoverable = hydrate(c.name, c.client);
			await act(() => {});

			// Nothing commits while the root is suspended.
			expect(container.innerHTML).toBe(serverMarkup);
			expect(container.querySelector('span')).toBe(span);
			expect(container.querySelector('b')).toBeNull();
			expect(container.querySelector('i')!.textContent).toBe('ok');
			expect(recoverable).toEqual([]);
			expect(warnings()).toEqual([]);

			await resume();

			expectCommitted(c, served, recoverable);
		},
	);

	it.each([
		{ name: 'RootXlink' as const, client: null },
		{ name: 'RootXlinkValue' as const, client: '#client' },
	])('keeps the server namespaced attribute of $name', async ({ name, client: clientValue }) => {
		const resume = suspend();
		serve(name, 'server');
		const use = container.querySelector('use')!;
		hydrate(name, 'client');
		await act(() => {});

		expect(use.getAttributeNS(XLINK, 'href')).toBe('#server');
		expect(warnings()).toEqual([]);

		await resume();

		expect(container.querySelector('use')).toBe(use);
		expect(use.getAttributeNS(XLINK, 'href')).toBe('#server');
		expect([...use.attributes].map((attr) => [attr.namespaceURI, attr.name])).toEqual([
			[XLINK, 'xlink:href'],
		]);
		expect(warnings()).toEqual(
			dev
				? [
						expect.stringContaining(
							'attribute `xlink:href`: the server rendered "#server", the client ' +
								`${JSON.stringify(clientValue)}`,
						),
					]
				: [],
		);
	});

	/** What hydrating `name`, served for 'server', with `label` publishes once it commits. */
	async function committedReports(name: Component, label: string, suspended: boolean) {
		const resume = suspended ? suspend() : undefined;
		const served = serve(name, 'server');
		const serverMarkup = container.innerHTML;
		const recoverable = hydrate(name, label);
		await act(() => {});
		const pending = container.innerHTML;
		await resume?.();
		const reports = {
			pending: suspended ? pending : serverMarkup,
			html: container.innerHTML,
			survivors: served.filter((node) => node.isConnected).map((node) => node.localName),
			recoverable: recoverable.map((reason) => (reason as Error).message),
			caught: caught.map((reason) => (reason as Error).message),
			warnings: warnings(),
		};
		root!.unmount();
		root = undefined;
		error.mockClear();
		caught = [];
		return { serverMarkup, reports };
	}

	it.each([
		{
			shape: 'a branch the server rendered another arm of',
			name: 'RootRebuilt' as const,
			html: '<span title="blue" style="color: blue;">blue</span>',
		},
		{
			shape: 'a renderable hole the server rendered as text',
			name: 'RootHoleClone' as const,
			html: '<span title="blue" style="color: blue;">blue</span>',
		},
	])(
		'renders the root on the client once for $shape, whether or not it suspends first',
		async ({ name, html }) => {
			const { reports: expected } = await committedReports(name, 'blue', false);
			expect(expected.html).toContain(html);
			expect(expected.survivors).toEqual([]);
			expect(expected.recoverable).toEqual([expect.stringMatching(MISMATCH)]);
			expect(expected.warnings).toHaveLength(dev ? 1 : 0);

			const { serverMarkup, reports } = await committedReports(name, 'blue', true);
			// While the root is suspended the server's content stays.
			expect(reports.pending).toBe(serverMarkup);
			expect(reports).toEqual({ ...expected, pending: serverMarkup });
		},
	);

	// A component that throws while hydrating fails the hydration of its nearest
	// Suspense boundary, here the root, even when a catch arm catches it: the
	// root renders on the client, where the body throws again and its catch arm
	// renders. As in React, that client render ends in a caught error, so
	// onCaughtError reports it and onRecoverableError reports nothing.
	it('renders the root on the client for a try body that throws while hydrating, whether or not the root suspends first', async () => {
		const { reports: expected } = await committedReports('RootCaughtBody', 'client', false);
		expect(expected.html).toContain('<b>caught</b>');
		expect(expected.survivors).toEqual([]);
		expect(expected.recoverable).toEqual([]);
		expect(expected.caught).toEqual(['client body failed']);
		expect(expected.warnings).toEqual([]);

		const { serverMarkup, reports } = await committedReports('RootCaughtBody', 'client', true);
		// While the root is suspended the server's content stays.
		expect(reports.pending).toBe(serverMarkup);
		expect(reports).toEqual({ ...expected, pending: serverMarkup });
	});

	it('keeps the server content while a retry suspends again', async () => {
		const resume = suspend();
		const served = serve('RootText', 'server');
		const serverMarkup = container.innerHTML;
		const recoverable = hydrate('RootText', 'client');
		await act(() => {});
		let open!: () => void;
		const again = new Promise<void>((done) => {
			open = done;
		});
		// The retry suspends on a new promise before it commits.
		await resume(again);

		expect(container.innerHTML).toBe(serverMarkup);
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);

		await act(async () => {
			client.gate.promise = undefined;
			open();
			await again;
		});

		expectCommitted(CASES[0], served, recoverable);
	});
});
