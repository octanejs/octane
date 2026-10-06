import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot, lazy } from '../../src/index.js';
import type { ComponentBody } from '../../src/index.js';
import { condition, load } from 'octane/hydration';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// When the server rendered another arm of an @if or @switch, its DOM does not
// match the client's arm, and as in React nothing is repaired in place: the
// nearest owner that can fall back (a Suspense or @try arm, a Hydrate island,
// or else the root) discards its server DOM, renders on the client, and
// reports once, even when a pending sibling replays the hydration attempt. The
// development warning names the directive's own site. A client arm whose DOM
// matches the server's adopts every node of it.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/branch-arm-tail.tsrx',
);
const FILE = 'branch-arm-tail.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');
const LINES = SOURCE.split('\n');

/** `line:column` of the first `directive` after the line containing `text`. */
function siteLoc(text: string, directive: string): string {
	const from = LINES.findIndex((line) => line.includes(text));
	if (from < 0) throw new Error(`fixture has no line containing ${text}`);
	const index = LINES.findIndex((line, i) => i > from && line.includes(directive));
	return `${index + 1}:${LINES[index].indexOf(directive)}`;
}

/** `actual` holds exactly the `expected` nodes: the same objects, in order. */
function expectSameNodes(actual: ArrayLike<Node>, expected: readonly Node[]): void {
	expect(actual).toHaveLength(expected.length);
	Array.from(actual).forEach((node, i) => expect(node).toBe(expected[i]));
}

/** Element and text markup, ignoring hydration comments. */
function markup(node: Element): string {
	const copy = node.cloneNode(true) as Element;
	const walker = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT);
	const comments: Node[] = [];
	while (walker.nextNode()) comments.push(walker.currentNode);
	for (const comment of comments) comment.parentNode!.removeChild(comment);
	return copy.innerHTML;
}

/** React's recoverable hydration error. */
const MISMATCH = /server rendered HTML didn't match the client/;

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — a branch arm that differs from the server arm ($name)', ({ dev }) => {
	const server = loadServerFixture(FIXTURE, { id: FILE });
	const client = loadCompiledFixtureSource(SOURCE, {
		id: FILE,
		mode: 'client',
		compileOptions: { dev },
	});
	let container: HTMLElement;
	let root: { unmount(): void } | null;
	let errSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		root = null;
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

	const report = (component: string, directive: string, expected: string, server: string) =>
		`Octane hydration mismatch at ${FILE}:${siteLoc(`function ${component}(`, directive)}: ` +
		`the client expected ${expected} but the server rendered ${server}. ` +
		'The nearest Suspense or Hydrate boundary, or the root, will be regenerated on the client.';

	const tailReport = (component: string, directive: string, server = 'a control-flow block') =>
		report(component, directive, 'the end of the branch', server);

	const emptyReport = (component: string) =>
		report(component, '@if', 'an empty branch', 'a control-flow block');

	async function hydrate(
		name: string,
		serverProps: Record<string, unknown>,
		props: Record<string, unknown>,
	) {
		container.innerHTML = ServerRT.renderToString(server[name], serverProps).html;
		const host = container.querySelector('#r')!;
		const nodes = [...host.querySelectorAll('*')];
		const recoverable: string[] = [];
		const active = hydrateRoot(container, client[name], props, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
		});
		root = active;
		flushSync(() => {});
		// Recoverable reports are delivered after the hydration burst.
		await act(async () => {});
		return {
			host,
			nodes,
			recoverable,
			live: () => container.querySelector('#r')!,
			render: (next: Record<string, unknown>) => flushSync(() => active.render(client[name], next)),
		};
	}

	/** No server element survives: the whole root rendered on the client. */
	function expectClientRoot(s: { host: Element; nodes: Element[] }): void {
		expect(container.querySelector('#r')).not.toBe(s.host);
		expect(s.host.isConnected).toBe(false);
		expect(s.nodes.filter((node) => node.isConnected)).toEqual([]);
	}

	it('client-renders the root when the server rendered an @if arm with other components', async () => {
		const s = await hydrate('IfComponents', { on: false }, { on: true });

		expectClientRoot(s);
		expect(markup(s.live())).toBe('<em>x</em>');
		expect(s.recoverable).toEqual([expect.stringMatching(MISMATCH)]);
		expect(warnings()).toHaveLength(dev ? 1 : 0);

		s.render({ on: false });
		expect(markup(s.live())).toBe('<em>y</em><em>z</em>');
		s.render({ on: true });
		expect(markup(s.live())).toBe('<em>x</em>');
	});

	it('client-renders the root when the server rendered a longer @switch case', async () => {
		const s = await hydrate('SwitchComponents', { k: 'two' }, { k: 'one' });

		expectClientRoot(s);
		expect(markup(s.live())).toBe('<em>x</em>');
		expect(s.recoverable).toEqual([expect.stringMatching(MISMATCH)]);
		expect(warnings()).toEqual(dev ? [tailReport('SwitchComponents', '@switch')] : []);

		s.render({ k: 'two' });
		expect(markup(s.live())).toBe('<em>x</em><em>z</em>');
		s.render({ k: 'one' });
		expect(markup(s.live())).toBe('<em>x</em>');
	});

	it('client-renders the root when the server rendered a shorter @switch case', async () => {
		const s = await hydrate('SwitchComponents', { k: 'one' }, { k: 'two' });

		expectClientRoot(s);
		expect(markup(s.live())).toBe('<em>x</em><em>z</em>');
		expect(s.recoverable).toEqual([expect.stringMatching(MISMATCH)]);
	});

	// A component that throws while hydrating is not caught in place, as in
	// React: the root renders on the client, where the boundary catches the
	// error. React reports the throw through the boundary, not as recoverable.
	it.each([
		{ name: 'CaughtLast', html: '<em>x</em><p>caught</p>' },
		{ name: 'TryThenHost', html: '<em>x</em><p>caught</p>' },
		{ name: 'TryThenText', html: '<em>x</em><p>caught</p>' },
		{ name: 'BoundaryThenHost', html: '<em>x</em><p>caught</p>' },
	])(
		'client-renders the root when a $name boundary catches a client error in another arm',
		async ({ name, html }) => {
			const s = await hydrate(name, { on: false, boom: false }, { on: true, boom: true });

			expectClientRoot(s);
			expect(markup(s.live())).toBe(html);
			expect(s.recoverable).toEqual([]);
		},
	);

	// Whatever kind of slot ends the client's arm, server content after it is
	// an unhydrated tail.
	it.each([
		{
			name: 'ListThenHost',
			props: {},
			html: '<em>x</em><li>a</li><li>b</li>',
			tail: '<b>tail</b>',
		},
		{ name: 'ListThenText', props: {}, html: '<em>x</em><li>a</li><li>b</li>', tail: 'tail' },
		{
			name: 'TryThenHost',
			props: { boom: false },
			html: '<em>x</em><u>ok</u>',
			tail: '<b>tail</b>',
		},
		{ name: 'TryThenText', props: { boom: false }, html: '<em>x</em><u>ok</u>', tail: 'tail' },
		{
			name: 'BoundaryThenHost',
			props: { boom: false },
			html: '<em>x</em><u>ok</u>',
			tail: '<b>tail</b>',
		},
		{ name: 'ActivityThenHost', props: {}, html: '<em>x</em><u>a</u>', tail: '<b>tail</b>' },
	])(
		'client-renders the root when server content follows the last slot of a $name arm',
		async ({ name, props, html, tail }) => {
			const s = await hydrate(name, { ...props, on: false }, { ...props, on: true });

			expectClientRoot(s);
			expect(markup(s.live())).toBe(html);
			expect(s.recoverable).toEqual([expect.stringMatching(MISMATCH)]);
			expect(warnings()).toEqual(
				dev ? [tailReport(name, '@if', tail === 'tail' ? 'text "tail"' : '<b>')] : [],
			);

			s.render({ ...props, on: false });
			expect(markup(s.live())).toBe(html + tail);
			s.render({ ...props, on: true });
			expect(markup(s.live())).toBe(html);
		},
	);

	it('client-renders the root, pending arm included, when server content follows a boundary that waits', async () => {
		const ready = Object.assign(Promise.resolve('v'), { status: 'fulfilled', value: 'v' });
		let resolve!: (value: string) => void;
		const value = new Promise<string>((accept) => (resolve = accept));
		const s = await hydrate('PendingThenHost', { on: false, value: ready }, { on: true, value });

		// As in React, the client render shows the boundary's pending arm while
		// its body loads.
		expectClientRoot(s);
		expect(markup(s.live())).toBe('<em>x</em><p>loading</p>');
		expect(s.recoverable).toEqual([expect.stringMatching(MISMATCH)]);
		expect(warnings()).toEqual(dev ? [tailReport('PendingThenHost', '@if', '<b>')] : []);

		await act(async () => resolve('v'));
		expect(markup(s.live())).toBe('<em>x</em><u>v</u>');
		expect(s.recoverable).toHaveLength(1);
	});

	it.each([
		{
			name: 'IfHosts',
			directive: '@if',
			from: { on: false },
			to: { on: true },
			html: '<em>x</em>',
			swapped: '<em>x</em><b>z</b>',
			server: '<b>',
		},
		{
			name: 'SwitchHosts',
			directive: '@switch',
			from: { k: 'two' },
			to: { k: 'one' },
			html: '<em>x</em><b>z</b>',
			swapped: '<em>x</em><b>z</b><i>i</i>',
			server: '<i>',
		},
		{
			name: 'IfTextTail',
			directive: '@if',
			from: { on: false },
			to: { on: true },
			html: '<em>x</em>',
			swapped: '<em>x</em>tail',
			server: 'text "tail"',
		},
		{
			name: 'IfNestedRoot',
			directive: '@if',
			from: { on: false },
			to: { on: true },
			html: '<p><em>x</em></p>',
			swapped: '<p><em>x</em></p><b>z</b>',
			server: '<b>',
		},
		{
			name: 'IfRangeAfterHost',
			directive: '@if',
			from: { on: false },
			to: { on: true },
			html: '<em>x</em><b>b</b>',
			swapped: '<em>x</em><b>b</b><em>z</em>',
			server: 'a control-flow block',
		},
		{
			name: 'IfInheritedHost',
			directive: '@if',
			from: { on: false },
			to: { on: true },
			html: '<em>x</em>',
			swapped: '<em>x</em><b>z</b>',
			server: '<b>',
		},
		{
			name: 'IfLaterHost',
			directive: '@if',
			from: { on: false },
			to: { on: true },
			html: '<em>x</em><em>y</em>',
			swapped: '<em>x</em><em>y</em><b>z</b>',
			server: '<b>',
		},
	])(
		'client-renders the root when server content follows the roots a $name arm adopts',
		async ({ name, directive, from, to, html, swapped, server: described }) => {
			const s = await hydrate(name, from, to);

			expectClientRoot(s);
			expect(markup(s.live())).toBe(html);
			expect(s.recoverable).toEqual([expect.stringMatching(MISMATCH)]);
			expect(warnings()).toEqual(dev ? [tailReport(name, directive, described)] : []);

			s.render(from);
			expect(markup(s.live())).toBe(swapped);
			s.render(to);
			expect(markup(s.live())).toBe(html);
		},
	);

	// React compares DOM only, and the client's arm renders exactly the
	// server's elements.
	it('adopts another arm whose DOM matches when a component in a hole adopts in place', async () => {
		const s = await hydrate('HoleWithoutRange', { on: false }, { on: true });

		expect(markup(s.host)).toBe('<em>x</em><b>b</b>');
		expectSameNodes(s.host.querySelectorAll('*'), s.nodes);
		expect(s.recoverable).toEqual([]);
		expect(warnings()).toEqual([]);

		s.render({ on: false });
		expect(markup(s.host)).toBe('<em>x</em><b>b</b>');
		s.render({ on: true });
		expect(markup(s.host)).toBe('<em>x</em><b>b</b>');
	});

	it.each([
		{ name: 'IfComponents', props: { on: false }, html: '<em>y</em><em>z</em>' },
		{ name: 'SwitchComponents', props: { k: 'two' }, html: '<em>x</em><em>z</em>' },
		{ name: 'TrailingHosts', props: { on: true }, html: '<em>x</em><b>b</b><i>i</i>' },
		{ name: 'IfHosts', props: { on: true }, html: '<em>x</em>' },
		{ name: 'IfHosts', props: { on: false }, html: '<em>x</em><b>z</b>' },
		{ name: 'SwitchHosts', props: { k: 'one' }, html: '<em>x</em><b>z</b>' },
		{ name: 'SwitchHosts', props: { k: 'two' }, html: '<em>x</em><b>z</b><i>i</i>' },
		{ name: 'IfTextTail', props: { on: false }, html: '<em>x</em>tail' },
		{ name: 'IfNestedRoot', props: { on: true }, html: '<p><em>x</em></p>' },
		{ name: 'IfNestedRoot', props: { on: false }, html: '<p><em>x</em></p><b>z</b>' },
		{ name: 'IfRangeAfterHost', props: { on: true }, html: '<em>x</em><b>b</b>' },
		{ name: 'IfRangeAfterHost', props: { on: false }, html: '<em>x</em><b>b</b><em>z</em>' },
		{ name: 'IfInheritedHost', props: { on: true }, html: '<em>x</em>' },
		{ name: 'IfLaterHost', props: { on: true }, html: '<em>x</em><em>y</em>' },
		{ name: 'HoleWithoutRange', props: { on: true }, html: '<em>x</em><b>b</b>' },
		{ name: 'ListThenText', props: { on: false }, html: '<em>x</em><li>a</li><li>b</li>tail' },
		{
			name: 'TryThenHost',
			props: { on: false, boom: false },
			html: '<em>x</em><u>ok</u><b>tail</b>',
		},
		{ name: 'BoundaryThenHost', props: { on: true, boom: false }, html: '<em>x</em><u>ok</u>' },
		{ name: 'ActivityThenHost', props: { on: false }, html: '<em>x</em><u>a</u><b>tail</b>' },
		{
			name: 'NestedArms',
			props: { on: true, inner: true },
			html: '<em>x</em><p><i>i</i></p><b>b</b>',
		},
		{ name: 'NestedArms', props: { on: true, inner: false }, html: '<p></p><b>b</b>' },
	])(
		'adopts every node of a matching $name arm ($html) without a report',
		async ({ name, props, html }) => {
			const s = await hydrate(name, props, props);

			expect(markup(s.host)).toBe(html);
			expectSameNodes(s.host.querySelectorAll('*'), s.nodes);
			expect(s.recoverable).toEqual([]);
			expect(warnings()).toEqual([]);
		},
	);

	// A client arm that renders nothing claims nothing of the server's other
	// arm, the same as when the client's @if has no arm to render.
	it.each([
		{ name: 'EmptyArm', props: { on: false } },
		{ name: 'NoElseArm', props: { on: false } },
	])(
		'client-renders the root when a client $name renders nothing over a server arm',
		async ({ name, props }) => {
			const s = await hydrate(name, { ...props, on: true }, props);

			expectClientRoot(s);
			expect(markup(s.live())).toBe('');
			expect(s.recoverable).toEqual([expect.stringMatching(MISMATCH)]);
			expect(warnings()).toEqual(dev ? [emptyReport(name)] : []);

			s.render({ ...props, on: true });
			expect(markup(s.live())).toBe('<em>x</em>');
			s.render(props);
			expect(markup(s.live())).toBe('');
		},
	);

	it.each([
		{ name: 'EmptyArm', props: { on: false } },
		{ name: 'NoElseArm', props: { on: false } },
	])(
		'adopts an empty $name over the same empty server arm without a report',
		async ({ name, props }) => {
			const s = await hydrate(name, props, props);

			expect(markup(s.host)).toBe('');
			expect(s.recoverable).toEqual([]);
			expect(warnings()).toEqual([]);

			s.render({ ...props, on: true });
			expect(markup(s.host)).toBe('<em>x</em>');
		},
	);

	it('keeps the server content of a boundary that ends the arm while it loads', async () => {
		container.innerHTML = ServerRT.renderToString(server.TrailingTry, {
			on: true,
			Child: server.Tail,
		}).html;
		const host = container.querySelector('#r')!;
		const tail = container.querySelector('u')!;
		const recoverable: string[] = [];
		let deliver!: (module: { default: ComponentBody }) => void;
		const Child = lazy(
			() => new Promise<{ default: ComponentBody }>((accept) => (deliver = accept)),
		);
		await act(() => {
			root = hydrateRoot(
				container,
				client.TrailingTry,
				{ on: true, Child },
				{ onRecoverableError: (error: unknown) => recoverable.push((error as Error).message) },
			);
		});

		expect(markup(host)).toBe('<em>x</em><u>tail</u>');
		expect(container.querySelector('u')).toBe(tail);

		await act(async () => deliver({ default: client.Tail }));

		expect(markup(host)).toBe('<em>x</em><u>tail</u>');
		expect(container.querySelector('u')).toBe(tail);
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);
	});

	/** Hydrates `name` with a Child that loads until `deliver` settles it. */
	async function hydrateLoading(name: string, serverOn: boolean, on: boolean) {
		container.innerHTML = ServerRT.renderToString(server[name], {
			on: serverOn,
			Child: server.Tail,
		}).html;
		const host = container.querySelector('#r')!;
		const nodes = [...host.querySelectorAll('*')];
		const recoverable: string[] = [];
		let deliver!: (module: { default: ComponentBody }) => void;
		const Child = lazy(
			() => new Promise<{ default: ComponentBody }>((accept) => (deliver = accept)),
		);
		await act(() => {
			root = hydrateRoot(
				container,
				client[name],
				{ on, Child },
				{ onRecoverableError: (error: unknown) => recoverable.push((error as Error).message) },
			);
		});
		await act(async () => deliver({ default: client.Tail }));
		return { host, nodes, recoverable, live: () => container.querySelector('#r')! };
	}

	it('client-renders the root once when a pending sibling replays its attempt', async () => {
		const s = await hydrateLoading('IfThenChild', false, true);

		expectClientRoot(s);
		expect(markup(s.live())).toBe('<em>x</em><u>tail</u>');
		expect(s.recoverable).toEqual([expect.stringMatching(MISMATCH)]);
		expect(warnings()).toEqual(dev ? [tailReport('IfThenChild', '@if')] : []);
	});

	it('client-renders only the @try arm once when a pending sibling replays it', async () => {
		const s = await hydrateLoading('TryIfThenChild', false, true);

		// The boundary's arm renders on the client; the root around it is kept.
		expect(s.live()).toBe(s.host);
		expect(markup(s.host)).toBe('<section><em>x</em><u>tail</u></section>');
		expect(s.nodes.filter((node) => node.isConnected)).toEqual([]);
		expect(s.recoverable).toEqual([expect.stringMatching(MISMATCH)]);
		expect(warnings()).toEqual(dev ? [tailReport('TryIfThenChild', '@if')] : []);
	});

	it('client-renders the root once when a pending sibling replays an empty arm', async () => {
		const s = await hydrateLoading('EmptyArmThenChild', true, false);

		expectClientRoot(s);
		expect(markup(s.live())).toBe('<u>tail</u>');
		expect(s.recoverable).toEqual([expect.stringMatching(MISMATCH)]);
		expect(warnings()).toEqual(dev ? [emptyReport('EmptyArmThenChild')] : []);
	});

	// Captures that changed before a dormant boundary activated legitimately
	// differ from the server's: the island renders on the client, but reports
	// nothing, as React reports nothing for an update that reaches a dehydrated
	// boundary.
	it('client-renders a dormant island silently when its branch changed before activation', async () => {
		const serverProps = { on: false, when: condition(false) };
		container.innerHTML = ServerRT.renderToString(server.DormantIf, serverProps).html;
		const host = container.querySelector('#r')!;
		const section = container.querySelector('section')!;
		const recoverable: string[] = [];
		const active = hydrateRoot(container, client.DormantIf, serverProps, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
		});
		root = active;
		flushSync(() => {});
		expect(markup(section)).toBe('<em>x</em><em>z</em>');

		await act(() => active.render(client.DormantIf, { on: true, when: load() }));
		await act(async () => {});

		expect(container.querySelector('#r')).toBe(host);
		expect(section.isConnected).toBe(false);
		expect(markup(container.querySelector('section')!)).toBe('<em>x</em>');
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);
	});
});

// The production runtime adopts compiled templates straight from their source,
// without parsing them. NODE_ENV is read at call time, so stubbing it around
// hydrateRoot exercises those branches. A fragment arm then takes its root count
// from the compiler, and never parses a template to adopt a matching arm.
describe('hydrateRoot — a branch arm that differs from the server arm (production runtime)', () => {
	const server = loadServerFixture(FIXTURE, { id: FILE });
	let container: HTMLElement;
	let root: { unmount(): void } | null;
	let createElement: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		root = null;
		vi.stubEnv('NODE_ENV', 'production');
		createElement = vi.spyOn(document, 'createElement');
	});

	afterEach(() => {
		createElement.mockRestore();
		vi.unstubAllEnvs();
		root?.unmount();
		container.remove();
	});

	async function hydrate(
		name: string,
		serverProps: Record<string, unknown>,
		props: Record<string, unknown>,
	) {
		// A fresh module, so that no earlier mount parsed its templates.
		const client = loadCompiledFixtureSource(SOURCE, {
			id: FILE,
			mode: 'client',
			compileOptions: { dev: false },
		});
		container.innerHTML = ServerRT.renderToString(server[name], serverProps).html;
		const host = container.querySelector('#r')!;
		const nodes = [...host.querySelectorAll('*')];
		const recoverable: string[] = [];
		createElement.mockClear();
		root = hydrateRoot(container, client[name], props, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
		});
		flushSync(() => {});
		const parsed = createElement.mock.calls.filter(
			(call: unknown[]) => call[0] === 'template',
		).length;
		await act(async () => {});
		return { host, nodes, recoverable, parsed };
	}

	it.each([
		{ name: 'SwitchHosts', from: { k: 'two' }, to: { k: 'one' }, html: '<em>x</em><b>z</b>' },
		{ name: 'IfRangeAfterHost', from: { on: false }, to: { on: true }, html: '<em>x</em><b>b</b>' },
	])(
		'client-renders the root when server content follows the roots of a $name fragment arm',
		async ({ name, from, to, html }) => {
			const s = await hydrate(name, from, to);

			expect(markup(container.querySelector('#r')!)).toBe(html);
			expect(s.host.isConnected).toBe(false);
			expect(s.nodes.filter((node) => node.isConnected)).toEqual([]);
			// The production runtime reports React's message by its code.
			expect(s.recoverable).toEqual([expect.stringMatching(/errors\/339\b/)]);
		},
	);

	it.each([
		{ name: 'SwitchHosts', props: { k: 'one' }, html: '<em>x</em><b>z</b>' },
		{ name: 'TrailingHosts', props: { on: true }, html: '<em>x</em><b>b</b><i>i</i>' },
		{
			name: 'NestedArms',
			props: { on: true, inner: true },
			html: '<em>x</em><p><i>i</i></p><b>b</b>',
		},
	])('adopts every node of a matching $name fragment arm', async ({ name, props, html }) => {
		const s = await hydrate(name, props, props);

		expect(markup(s.host)).toBe(html);
		expectSameNodes(s.host.querySelectorAll('*'), s.nodes);
		expect(s.recoverable).toEqual([]);
		expect(s.parsed).toBe(0);
	});
});
