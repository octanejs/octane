import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot, type Root } from '../../src/index.js';
import { renderToString } from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture.js';

// A root with no Suspense boundary keeps showing the server's content while
// its hydrating attempt is suspended. A server text, attribute, or style value
// that the suspended attempt repaired is discarded with the rest of that
// attempt, so the server's value stays in place while pending. The attempt
// that commits finds the same mismatch and reports it once, as a hydration
// that never suspends reports it. Recoverable errors publish in dev and prod;
// the console diagnostic needs the development compile's source locations.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/root-suspended-value-mismatch.tsrx',
);
const FILE = 'root-suspended-value-mismatch.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');
type Fixture = typeof import('./_fixtures/root-suspended-value-mismatch.tsrx');
type Component = Exclude<keyof Fixture, 'gate'>;

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
	/** The repaired value, in the form a client render produces it. */
	observe: (span: HTMLElement) => string | null;
	/** A fixture snippet that begins at the host owning the value. */
	site: string;
	what: string;
	/** Server and client values as the diagnostic prints them. */
	printed?: [string, string];
	/** A text repair also reports a recoverable error. */
	recoverable: boolean;
	/** The server's value stays, as it does for raw HTML. */
	kept?: true;
};

const CASES: Case[] = [
	{
		name: 'RootText',
		server: 'server',
		client: 'client',
		observe: (span) => span.textContent,
		site: '<span>{props.label as string}</span>\n\t\t<GateLeaf />',
		what: 'text',
		recoverable: true,
	},
	{
		name: 'RootSiblingText',
		server: 'server',
		client: 'client',
		observe: (span) => span.lastChild!.nodeValue,
		site: '<span>\n\t\t\t<u>',
		what: 'text',
		recoverable: true,
	},
	{
		name: 'RootAttribute',
		server: 'server',
		client: 'client',
		observe: (span) => span.getAttribute('title'),
		site: "<span title={props.label}>{'t'}</span>\n\t\t<GateLeaf />",
		what: 'attribute `title`',
		recoverable: false,
	},
	{
		name: 'RootStyle',
		server: 'red',
		client: 'blue',
		observe: (span) => span.style.cssText,
		site: "<span style={{ color: props.label }}>{'t'}</span>\n\t\t<GateLeaf />",
		what: 'style',
		printed: ['color: red;', 'color: blue;'],
		recoverable: false,
	},
	{
		name: 'RootStyleText',
		server: 'red',
		client: 'blue',
		observe: (span) => span.style.cssText,
		site: '<span style={`color: ${props.label}`}>',
		what: 'style',
		printed: ['color: red;', 'color: blue;'],
		recoverable: false,
	},
	{
		name: 'RootStaticStyle',
		server: 'red',
		client: 'blue',
		observe: (span) => span.style.cssText,
		site: "<span style={{ display: 'block', color: props.label }}>",
		what: 'style',
		printed: ['display: block; color: red;', 'display: block; color: blue;'],
		recoverable: false,
	},
	{
		name: 'RootClass',
		server: 'server',
		client: 'client',
		observe: (span) => span.getAttribute('class'),
		site: "<span class={props.label}>{'t'}</span>\n\t\t<GateLeaf />",
		what: 'attribute `class`',
		recoverable: false,
	},
	{
		name: 'RootHtml',
		server: 'server',
		client: 'client',
		observe: (span) => span.innerHTML,
		site: '<span dangerouslySetInnerHTML',
		what: '`dangerouslySetInnerHTML` content',
		recoverable: false,
		kept: true,
	},
	{
		name: 'RootArmText',
		server: 'server',
		client: 'client',
		observe: (span) => span.textContent,
		site: '<span>{props.label as string}</span>\n\t\t} @pending',
		what: 'text',
		recoverable: true,
	},
	{
		name: 'RootArmClass',
		server: 'server',
		client: 'client',
		observe: (span) => span.getAttribute('class'),
		site: "<span class={props.label}>{'t'}</span>\n\t\t} @pending",
		what: 'attribute `class`',
		recoverable: false,
	},
	{
		name: 'RootArmStyle',
		server: 'red',
		client: 'blue',
		observe: (span) => span.style.cssText,
		site: "<span style={{ color: props.label }}>{'t'}</span>\n\t\t} @pending",
		what: 'style',
		printed: ['color: red;', 'color: blue;'],
		recoverable: false,
	},
];

const XLINK = 'http://www.w3.org/1999/xlink';

describe.each([
	{ mode: 'development compile', dev: true },
	{ mode: 'production compile', dev: false },
])('hydrateRoot — value repair in a suspended root without a boundary ($mode)', ({ dev }) => {
	const server = loadServerFixture<Fixture>(FIXTURE, { id: FILE });
	const client = loadCompiledFixtureSource<Fixture>(SOURCE, {
		id: FILE,
		mode: 'client',
		compileOptions: { dev },
	});
	let container: HTMLElement;
	let root: Root | undefined;
	let error: MockInstance<typeof console.error>;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.append(container);
		server.gate.promise = undefined;
		client.gate.promise = undefined;
		error = vi.spyOn(console, 'error').mockImplementation(() => {});
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

	/** Server-render `name` with `label` into the container. */
	function serve(name: Component, label: string): void {
		container.innerHTML = renderToString(server[name], { label }).html;
	}

	/** Hydrate the served `name` with `label`; returns its recoverable errors. */
	function hydrate(name: Component, label: string): unknown[] {
		const recoverable: unknown[] = [];
		root = hydrateRoot(
			container,
			client[name],
			{ label },
			{ onRecoverableError: (reason) => recoverable.push(reason) },
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
			label: c.kept ? c.server : c.client,
		}).html;
		return { value: c.observe(reference.querySelector('span')!), text: reference.textContent };
	}

	function expectCommitted(c: Case, span: HTMLElement, recoverable: unknown[]) {
		const committed = reference(c);
		expect(container.querySelector('span')).toBe(span);
		expect(c.observe(span)).toBe(committed.value);
		expect(container.textContent).toBe(committed.text);
		expect(container.querySelector('i')!.textContent).toBe('ok');
		expect(recoverable).toHaveLength(c.recoverable ? 1 : 0);
		for (const reason of recoverable) expect(reason).toBeInstanceOf(Error);
		const reported = warnings();
		if (!dev) {
			expect(reported).toEqual([]);
			return;
		}
		const [printedServer, printedClient] = c.printed ?? [c.server, c.client];
		expect(reported).toEqual([
			expect.stringContaining(`Octane hydration mismatch at ${FILE}:${siteLine(c.site)}:`),
		]);
		expect(reported[0]).toContain(
			`server rendered ${c.what} ${JSON.stringify(printedServer)} but the client rendered ` +
				`${JSON.stringify(printedClient)}. The ${c.kept ? 'server' : 'client'} value was ` +
				(c.kept ? 'kept.' : 'used.'),
		);
	}

	it.each(CASES)('reports $name once when the root never suspends', async (c) => {
		serve(c.name, c.server);
		const span = container.querySelector('span')!;
		const recoverable = hydrate(c.name, c.client);
		await act(() => {});

		expectCommitted(c, span, recoverable);
	});

	it.each(CASES)(
		'keeps the server value of $name while pending and reports once at commit',
		async (c) => {
			const resume = suspend();
			serve(c.name, c.server);
			const span = container.querySelector('span')!;
			const serverMarkup = container.innerHTML;
			const recoverable = hydrate(c.name, c.client);
			await act(() => {});

			// The server's content stays exactly as it was rendered.
			expect(container.innerHTML).toBe(serverMarkup);
			expect(container.querySelector('span')).toBe(span);
			expect(container.querySelector('b')).toBeNull();
			expect(container.querySelector('i')!.textContent).toBe('ok');
			expect(recoverable).toEqual([]);
			expect(warnings()).toEqual([]);

			await resume();

			expectCommitted(c, span, recoverable);
		},
	);

	it.each([
		{ name: 'RootXlink' as const, committed: null },
		{ name: 'RootXlinkValue' as const, committed: '#client' },
	])('restores the namespaced attribute of $name while pending', async ({ name, committed }) => {
		const resume = suspend();
		serve(name, 'server');
		const use = container.querySelector('use')!;
		hydrate(name, 'client');
		await act(() => {});

		expect(use.getAttributeNS(XLINK, 'href')).toBe('#server');
		expect([...use.attributes].map((attr) => [attr.namespaceURI, attr.name])).toEqual([
			[XLINK, 'xlink:href'],
		]);
		expect(warnings()).toEqual([]);

		await resume();

		expect(container.querySelector('use')).toBe(use);
		expect(use.getAttributeNS(XLINK, 'href')).toBe(committed);
		expect(use.attributes).toHaveLength(committed === null ? 0 : 1);
		expect(warnings()).toEqual(
			dev
				? [
						expect.stringContaining(
							'server rendered attribute `xlink:href` "#server" but the client rendered ' +
								`${JSON.stringify(committed)}.`,
						),
					]
				: [],
		);
	});

	/** What hydrating `name`, served for 'server', with `label` publishes once it commits. */
	async function committedReports(name: Component, label: string, suspended: boolean) {
		const resume = suspended ? suspend() : undefined;
		serve(name, 'server');
		const recoverable = hydrate(name, label);
		await act(() => {});
		await resume?.();
		const reports = {
			html: container.innerHTML,
			text: recoverable.filter((reason) => /text differed/.test(String(reason))).length,
			values: warnings().filter((message) => /value was (used|kept)/.test(message)),
		};
		root!.unmount();
		root = undefined;
		error.mockClear();
		return reports;
	}

	it('commits a branch rebuilt before the root suspended as a hydration that never suspends', async () => {
		const expected = await committedReports('RootRebuilt', 'blue', false);
		expect(expected.html).toContain('<span title="blue" style="color: blue;">blue</span>');

		expect(await committedReports('RootRebuilt', 'blue', true)).toEqual(expected);
	});

	it('reports nothing for values a caught try body adopted before the root suspended', async () => {
		const expected = await committedReports('RootCaughtBody', 'client', false);
		expect(expected.html).toContain('<b>caught</b>');
		expect(expected.values).toEqual([]);

		expect(await committedReports('RootCaughtBody', 'client', true)).toEqual(expected);
	});

	it('reports no text mismatch for a clone rebuilt before the root suspended', async () => {
		const reports = await committedReports('RootHoleClone', 'blue', true);

		// The rebuild is a structural recovery. Its clone never held the server's
		// text, so committing it reports no text mismatch.
		expect(reports.html).toContain('>blue</span>');
		expect(reports.text).toBe(0);
		expect(reports.values.filter((message) => message.includes('rendered text'))).toEqual([]);
	});

	it('keeps the server value while a retry suspends again', async () => {
		const resume = suspend();
		serve('RootText', 'server');
		const span = container.querySelector('span')!;
		const recoverable = hydrate('RootText', 'client');
		await act(() => {});
		let open!: () => void;
		const again = new Promise<void>((done) => {
			open = done;
		});
		// The retry suspends on a new promise before it commits.
		await resume(again);

		expect(span.textContent).toBe('server');
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);

		await act(async () => {
			client.gate.promise = undefined;
			open();
			await again;
		});

		expectCommitted(CASES[0], span, recoverable);
	});
});
