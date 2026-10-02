import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// A resolved @try arm hydrates speculatively: when its first attempt
// suspends, the attempt is discarded and a later one adopts the same server
// nodes. A text or attribute value that the discarded attempt repaired must
// still hold the server's value while the arm is pending, so the attempt that
// commits finds the mismatch and reports it once, as a hydration that never
// suspended does. Recoverable errors publish in dev and prod; the console
// diagnostic needs the development compile's source locations.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/suspended-arm-value-mismatch.tsrx',
);
const FILE = 'suspended-arm-value-mismatch.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');

/** 1-based line of the `<span>` that begins the fixture snippet `site`. */
function siteLine(site: string): number {
	const at = SOURCE.indexOf(site);
	if (at < 0) throw new Error(`fixture has no ${JSON.stringify(site)}`);
	return SOURCE.slice(0, at + site.indexOf('<span')).split('\n').length;
}

const TEXT = /server-rendered text differed from the client/;

type Case = {
	name: string;
	server: string;
	client: string;
	/** The repaired value, in the form a client render produces it. */
	observe: (span: HTMLElement) => string | null;
	/** A fixture snippet that begins at the host owning the value. */
	site: string;
	what: string;
	/** Server and client values as the diagnostic prints them. */
	printed?: [string, string];
	recoverable: boolean;
	/** The server's value stays, as it does for raw HTML. */
	kept?: true;
};

const CASES: Case[] = [
	{
		name: 'TextArm',
		server: 'server',
		client: 'client',
		observe: (span) => span.textContent,
		site: '<span>{props.label as string}</span>',
		what: 'text',
		recoverable: true,
	},
	{
		name: 'SiblingTextArm',
		server: 'server',
		client: 'client',
		observe: (span) => span.lastChild!.nodeValue,
		site: '<span>\n',
		what: 'text',
		recoverable: true,
	},
	{
		name: 'AttributeArm',
		server: 'server',
		client: 'client',
		observe: (span) => span.getAttribute('title'),
		site: '<span title={props.label}>',
		what: 'attribute `title`',
		recoverable: false,
	},
	{
		name: 'StyleArm',
		server: 'red',
		client: 'blue',
		observe: (span) => span.style.cssText,
		site: '<span style={{ color: props.label }}>',
		what: 'style',
		printed: ['color: red;', 'color: blue;'],
		recoverable: false,
	},
	{
		name: 'ClassArm',
		server: 'server',
		client: 'client',
		observe: (span) => span.getAttribute('class'),
		site: '<span class={props.label}>',
		what: 'attribute `class`',
		recoverable: false,
	},
	{
		name: 'NestedTextArm',
		server: 'server',
		client: 'client',
		observe: (span) => span.textContent,
		site: '\t<span>{props.label as string}</span>\n\t\t\t\t} @pending {\n\t\t\t\t\t<b>',
		what: 'text',
		recoverable: true,
	},
	{
		name: 'NestedClassArm',
		server: 'server',
		client: 'client',
		observe: (span) => span.getAttribute('class'),
		site: "<span class={props.label}>{'t'}</span>\n\t\t\t\t} @pending {",
		what: 'attribute `class`',
		recoverable: false,
	},
	{
		name: 'HtmlArm',
		server: 'server',
		client: 'client',
		observe: (span) => span.innerHTML,
		site: '<span dangerouslySetInnerHTML',
		what: '`dangerouslySetInnerHTML` content',
		recoverable: false,
		kept: true,
	},
];

describe.each([
	{ mode: 'development compile', dev: true },
	{ mode: 'production compile', dev: false },
])('hydrateRoot — value repair in a resolved @try arm that suspends ($mode)', ({ dev }) => {
	const server = loadServerFixture(FIXTURE, { id: FILE });
	const client = loadCompiledFixtureSource(SOURCE, {
		id: FILE,
		mode: 'client',
		compileOptions: { dev },
	});
	const gate = client.gate as { promise?: Promise<void> };
	let container: HTMLElement;
	let root: { unmount(): void } | null;
	let errSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		root = null;
		gate.promise = undefined;
		errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		root?.unmount();
		container.remove();
		gate.promise = undefined;
		errSpy.mockRestore();
	});

	const warnings = (): string[] =>
		errSpy.mock.calls
			.map((call: unknown[]) => String(call[0]))
			.filter((message: string) => message.includes('hydration mismatch'));

	/** The arm's committed DOM: the client's render, or the server's where it is kept. */
	function reference(c: Case) {
		const reference = document.createElement('div');
		reference.innerHTML = ServerRT.renderToString(server[c.name], {
			label: c.kept ? c.server : c.client,
		}).html;
		return { value: c.observe(reference.querySelector('span')!), text: reference.textContent };
	}

	function expectCommitted(c: Case, span: HTMLElement, recoverable: string[]) {
		const committed = reference(c);
		expect(container.querySelector('span')).toBe(span);
		expect(c.observe(span)).toBe(committed.value);
		expect(container.textContent).toBe(committed.text);
		const [printedServer, printedClient] = c.printed ?? [c.server, c.client];
		expect(recoverable).toEqual(c.recoverable ? [expect.stringMatching(TEXT)] : []);
		expect(warnings()).toEqual(
			dev
				? [expect.stringContaining(`Octane hydration mismatch at ${FILE}:${siteLine(c.site)}:`)]
				: [],
		);
		if (dev)
			expect(warnings()[0]).toContain(
				`server rendered ${c.what} ${JSON.stringify(printedServer)} but the client rendered ` +
					`${JSON.stringify(printedClient)}. The ${c.kept ? 'server' : 'client'} value was ` +
					(c.kept ? 'kept.' : 'used.'),
			);
	}

	function render(c: Case) {
		container.innerHTML = ServerRT.renderToString(server[c.name], { label: c.server }).html;
		const span = container.querySelector('span')!;
		const serverMarkup = span.outerHTML;
		const recoverable: string[] = [];
		root = hydrateRoot(
			container,
			client[c.name],
			{ label: c.client },
			{ onRecoverableError: (error: unknown) => recoverable.push((error as Error).message) },
		);
		flushSync(() => {});
		return { span, serverMarkup, recoverable };
	}

	it.each(CASES)('reports $name once when the arm never suspends', async (c) => {
		const { span, recoverable } = render(c);
		await act(async () => {});

		expectCommitted(c, span, recoverable);
	});

	it.each(CASES)(
		'keeps the server value of $name while pending and reports once at commit',
		async (c) => {
			let resume!: () => void;
			gate.promise = new Promise<void>((resolve) => (resume = resolve));
			const { span, serverMarkup, recoverable } = render(c);
			await act(async () => {});

			expect(container.querySelector('span')).toBe(span);
			expect(container.querySelector('i')!.textContent).toBe('ok');
			expect(container.querySelector('p')).toBeNull();
			expect(span.outerHTML).toBe(serverMarkup);
			expect(recoverable).toEqual([]);
			expect(warnings()).toEqual([]);

			gate.promise = undefined;
			resume();
			await act(async () => {});

			expectCommitted(c, span, recoverable);
		},
	);

	it('restores a namespaced attribute that a pending attempt removed', async () => {
		const XLINK = 'http://www.w3.org/1999/xlink';
		let resume!: () => void;
		gate.promise = new Promise<void>((resolve) => (resume = resolve));
		container.innerHTML = ServerRT.renderToString(server.XlinkArm, { label: 'server' }).html;
		const use = container.querySelector('use')!;
		expect(use.getAttributeNS(XLINK, 'href')).toBe('#server');
		root = hydrateRoot(container, client.XlinkArm, { label: 'client' });
		flushSync(() => {});
		await act(async () => {});

		expect(use.getAttributeNS(XLINK, 'href')).toBe('#server');
		expect(use.attributes).toHaveLength(1);
		expect(warnings()).toEqual([]);

		gate.promise = undefined;
		resume();
		await act(async () => {});

		expect(container.querySelector('use')).toBe(use);
		expect(use.attributes).toHaveLength(0);
		expect(warnings()).toEqual(
			dev
				? [
						expect.stringContaining(
							'server rendered attribute `xlink:href` "#server" but the client rendered null.',
						),
					]
				: [],
		);
	});

	it('keeps the client values of a clone rebuilt before the arm suspended', async () => {
		let resume!: () => void;
		gate.promise = new Promise<void>((resolve) => (resume = resolve));
		container.innerHTML = ServerRT.renderToString(server.RebuiltArm, { label: 'server' }).html;
		const recoverable: string[] = [];
		root = hydrateRoot(
			container,
			client.RebuiltArm,
			{ label: 'client' },
			{ onRecoverableError: (error: unknown) => recoverable.push((error as Error).message) },
		);
		flushSync(() => {});
		await act(async () => {});
		gate.promise = undefined;
		resume();
		await act(async () => {});

		const span = container.querySelector('span')!;
		expect(span.getAttribute('title')).toBe('client');
		expect(span.textContent).toBe('client');
		expect(container.textContent).toBe('clientok');
		// The rebuild is a structural recovery. Its clone never held server values,
		// so committing it reports no value mismatch.
		expect(recoverable).not.toContainEqual(expect.stringMatching(TEXT));
		expect(
			warnings().filter((message) => /server rendered (text|attribute)/.test(message)),
		).toEqual([]);
	});
});
