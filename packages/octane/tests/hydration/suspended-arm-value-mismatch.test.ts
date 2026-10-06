import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// A resolved @try arm hydrates speculatively: when its first attempt suspends,
// the attempt is discarded and a later one adopts the same server nodes. As in
// React 19, a server text that differs from the client's does not match the
// client render, so the nearest boundary renders on the client and reports
// the mismatch once, whether or not an attempt suspended. A differing
// attribute, class, style or raw HTML is never patched: the server's value
// stays through every attempt and after the commit, a development build warns
// that it won't be patched up, and nothing is reported as recoverable.

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

const MISMATCH = /^Hydration failed because the server rendered HTML didn't match the client\./;

type TextCase = {
	name: string;
	/** The text the client renders, read where the case renders it. */
	observe: (span: HTMLElement) => string | null;
	/** A fixture snippet that begins at the host owning the text. */
	site: string;
};

const TEXT_CASES: TextCase[] = [
	{
		name: 'TextArm',
		observe: (span) => span.textContent,
		site: '<span>{props.label as string}</span>',
	},
	{
		name: 'SiblingTextArm',
		observe: (span) => span.lastChild!.nodeValue,
		site: '<span>\n',
	},
];

type KeptCase = {
	name: string;
	server: string;
	client: string;
	/** The value as the server rendered it, which hydration keeps. */
	observe: (span: HTMLElement) => string | null;
	/** What the development warning names. */
	what: string;
};

const KEPT_CASES: KeptCase[] = [
	{
		name: 'AttributeArm',
		server: 'server',
		client: 'client',
		observe: (span) => span.getAttribute('title'),
		what: 'title',
	},
	{
		name: 'StyleArm',
		server: 'red',
		client: 'blue',
		observe: (span) => span.style.cssText,
		what: 'style',
	},
	{
		name: 'ClassArm',
		server: 'server',
		client: 'client',
		observe: (span) => span.getAttribute('class'),
		what: 'class',
	},
	{
		name: 'NestedClassArm',
		server: 'server',
		client: 'client',
		observe: (span) => span.getAttribute('class'),
		what: 'class',
	},
	{
		name: 'HtmlArm',
		server: 'server',
		client: 'client',
		observe: (span) => span.innerHTML,
		what: 'dangerouslySetInnerHTML',
	},
];

describe.each([
	{ mode: 'development compile', dev: true },
	{ mode: 'production compile', dev: false },
])('hydrateRoot — value mismatch in a resolved @try arm that suspends ($mode)', ({ dev }) => {
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

	/** A client render of `name` with `label`, as the server serializes it. */
	function reference(name: string, label: string) {
		const reference = document.createElement('div');
		reference.innerHTML = ServerRT.renderToString(server[name], { label }).html;
		return reference;
	}

	function render(name: string, serverLabel: string, clientLabel: string) {
		container.innerHTML = ServerRT.renderToString(server[name], { label: serverLabel }).html;
		const div = container.querySelector('div')!;
		const span = container.querySelector('span')!;
		const serverMarkup = span.outerHTML;
		const recoverable: string[] = [];
		root = hydrateRoot(
			container,
			client[name],
			{ label: clientLabel },
			{ onRecoverableError: (error: unknown) => recoverable.push((error as Error).message) },
		);
		flushSync(() => {});
		return { div, span, serverMarkup, recoverable };
	}

	/** The arm rendered on the client: a new `<span>` inside the adopted `<div>`. */
	function expectClientRendered(
		c: TextCase,
		{ div, span, recoverable }: ReturnType<typeof render>,
	) {
		const expected = reference(c.name, 'client');
		expect(container.querySelector('div')).toBe(div);
		expect(span.isConnected).toBe(false);
		const live = container.querySelector('span')!;
		expect(c.observe(live)).toBe(c.observe(expected.querySelector('span')!));
		expect(container.textContent).toBe(expected.textContent);
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
		expect(warnings()).toEqual(
			dev
				? [expect.stringContaining(`Octane hydration mismatch at ${FILE}:${siteLine(c.site)}:`)]
				: [],
		);
	}

	it.each(TEXT_CASES)(
		'renders the arm of $name on the client and reports once when it never suspends',
		async (c) => {
			const rendered = render(c.name, 'server', 'client');
			await act(async () => {});

			expectClientRendered(c, rendered);
		},
	);

	// The text mismatch renders the arm on the client before its leaf suspends,
	// so the arm shows its pending content until the leaf resumes.
	it.each(TEXT_CASES)(
		'renders the arm of $name on the client when it suspends after a text mismatch, reporting once',
		async (c) => {
			let resume!: () => void;
			gate.promise = new Promise<void>((resolve) => (resume = resolve));
			const rendered = render(c.name, 'server', 'client');
			await act(async () => {});

			expect(container.querySelector('div')).toBe(rendered.div);
			expect(rendered.span.isConnected).toBe(false);
			expect(container.querySelector('p')!.textContent).toBe('pending');

			gate.promise = undefined;
			resume();
			await act(async () => {});

			expect(container.querySelector('p')).toBeNull();
			expectClientRendered(c, rendered);
		},
	);

	// The inner arm is the nearest boundary of the text, so only it renders on
	// the client. While the outer arm's leaf is pending, the outer attempt is
	// discarded with the inner fallback it made, and the server HTML stays.
	it('renders only the inner arm on the client when the outer arm suspends, reporting once at commit', async () => {
		let resume!: () => void;
		gate.promise = new Promise<void>((resolve) => (resume = resolve));
		const { div, span, serverMarkup, recoverable } = render('NestedTextArm', 'server', 'client');
		const leaf = container.querySelector('i')!;
		await act(async () => {});

		expect(container.querySelector('span')).toBe(span);
		expect(span.outerHTML).toBe(serverMarkup);
		expect(container.querySelector('p')).toBeNull();
		expect(recoverable).toEqual([]);

		gate.promise = undefined;
		resume();
		await act(async () => {});

		expect(container.querySelector('div')).toBe(div);
		expect(container.querySelector('i')).toBe(leaf);
		expect(span.isConnected).toBe(false);
		expect(container.querySelector('span')!.textContent).toBe('client');
		expect(container.textContent).toBe('clientok');
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
		expect(warnings()).toEqual(
			dev
				? [
						expect.stringContaining(
							`Octane hydration mismatch at ${FILE}:${siteLine(
								'\t<span>{props.label as string}</span>\n\t\t\t\t} @pending {\n\t\t\t\t\t<b>',
							)}:`,
						),
					]
				: [],
		);
	});

	function expectKept(c: KeptCase, span: HTMLElement, recoverable: string[]) {
		expect(container.querySelector('span')).toBe(span);
		expect(c.observe(span)).toBe(c.observe(reference(c.name, c.server).querySelector('span')!));
		expect(container.textContent).toBe(reference(c.name, c.server).textContent);
		expect(recoverable).toEqual([]);
		if (dev) {
			expect(warnings().length).toBeGreaterThanOrEqual(1);
			for (const warning of warnings()) expect(warning).toContain("This won't be patched up");
			expect(warnings().join('\n')).toContain(c.what);
		} else {
			expect(warnings()).toEqual([]);
		}
	}

	it.each(KEPT_CASES)('keeps the server value of $name when the arm never suspends', async (c) => {
		const { span, recoverable } = render(c.name, c.server, c.client);
		await act(async () => {});

		expectKept(c, span, recoverable);
	});

	it.each(KEPT_CASES)(
		'keeps the server value of $name while pending and after the commit',
		async (c) => {
			let resume!: () => void;
			gate.promise = new Promise<void>((resolve) => (resume = resolve));
			const { span, serverMarkup, recoverable } = render(c.name, c.server, c.client);
			await act(async () => {});

			expect(container.querySelector('span')).toBe(span);
			expect(container.querySelector('i')!.textContent).toBe('ok');
			expect(container.querySelector('p')).toBeNull();
			expect(span.outerHTML).toBe(serverMarkup);
			expect(recoverable).toEqual([]);

			gate.promise = undefined;
			resume();
			await act(async () => {});

			expect(span.outerHTML).toBe(serverMarkup);
			expectKept(c, span, recoverable);
		},
	);

	it('keeps a namespaced attribute the client omits, through a pending attempt and the commit', async () => {
		const XLINK = 'http://www.w3.org/1999/xlink';
		let resume!: () => void;
		gate.promise = new Promise<void>((resolve) => (resume = resolve));
		container.innerHTML = ServerRT.renderToString(server.XlinkArm, { label: 'server' }).html;
		const use = container.querySelector('use')!;
		expect(use.getAttributeNS(XLINK, 'href')).toBe('#server');
		const recoverable: unknown[] = [];
		root = hydrateRoot(
			container,
			client.XlinkArm,
			{ label: 'client' },
			{ onRecoverableError: (error) => recoverable.push(error) },
		);
		flushSync(() => {});
		await act(async () => {});

		expect(use.getAttributeNS(XLINK, 'href')).toBe('#server');
		expect(use.attributes).toHaveLength(1);

		gate.promise = undefined;
		resume();
		await act(async () => {});

		expect(container.querySelector('use')).toBe(use);
		expect(use.getAttributeNS(XLINK, 'href')).toBe('#server');
		expect(use.attributes).toHaveLength(1);
		expect(recoverable).toEqual([]);
		if (dev) expect(warnings().join('\n')).toContain('xlink:href');
		else expect(warnings()).toEqual([]);
	});

	// The server rendered the other @if arm: a structural mismatch the arm's
	// fallback renders on the client before its leaf suspends.
	it('renders an arm whose server branch differs on the client once it resumes, reporting once', async () => {
		let resume!: () => void;
		gate.promise = new Promise<void>((resolve) => (resume = resolve));
		container.innerHTML = ServerRT.renderToString(server.RebuiltArm, { label: 'server' }).html;
		const div = container.querySelector('div')!;
		const stale = container.querySelector('b')!;
		const recoverable: string[] = [];
		root = hydrateRoot(
			container,
			client.RebuiltArm,
			{ label: 'client' },
			{ onRecoverableError: (error: unknown) => recoverable.push((error as Error).message) },
		);
		flushSync(() => {});
		await act(async () => {});
		expect(stale.isConnected).toBe(false);
		gate.promise = undefined;
		resume();
		await act(async () => {});

		expect(container.querySelector('div')).toBe(div);
		const span = container.querySelector('span')!;
		expect(span.getAttribute('title')).toBe('client');
		expect(span.textContent).toBe('client');
		expect(container.textContent).toBe('clientok');
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
	});
});
