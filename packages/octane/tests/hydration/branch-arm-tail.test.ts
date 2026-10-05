import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot, lazy } from '../../src/index.js';
import type { ComponentBody } from '../../src/index.js';
import { condition, load } from 'octane/hydration';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// When the server rendered another arm of an @if or @switch, the client arm
// adopts the server's arm range from its start. Server content that the client
// arm leaves unclaimed at the end of that range must not stay on screen: the
// client discards it and reports the structural mismatch once, at the
// directive's own site, even when a pending sibling replays the hydration
// attempt.

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

/** Element and text markup, ignoring hydration comments. */
function markup(node: Element): string {
	const copy = node.cloneNode(true) as Element;
	const walker = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT);
	const comments: Node[] = [];
	while (walker.nextNode()) comments.push(walker.currentNode);
	for (const comment of comments) comment.parentNode!.removeChild(comment);
	return copy.innerHTML;
}

const STRUCTURAL = /the mismatched subtree was rebuilt on the client/;

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — a branch arm shorter than the server arm ($name)', ({ dev }) => {
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

	const tailReport = (component: string, directive: string, server = 'a control-flow block') =>
		`Octane hydration mismatch at ${FILE}:${siteLoc(`function ${component}(`, directive)}: ` +
		`the client expected the end of the branch but the server rendered ${server}. ` +
		'The mismatched subtree was rebuilt on the client.';

	const emptyReport = (component: string) =>
		`Octane hydration mismatch at ${FILE}:${siteLoc(`function ${component}(`, '@if')}: ` +
		'the client expected an empty branch but the server rendered a control-flow ' +
		'block. The mismatched subtree was rebuilt on the client.';

	async function hydrate(
		name: string,
		serverProps: Record<string, unknown>,
		props: Record<string, unknown>,
	) {
		container.innerHTML = ServerRT.renderToString(server[name], serverProps).html;
		const host = container.querySelector('#r')!;
		const nodes = [...host.querySelectorAll('*')];
		const ems = [...host.querySelectorAll('em')];
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
			ems,
			recoverable,
			render: (next: Record<string, unknown>) => flushSync(() => active.render(client[name], next)),
		};
	}

	it('discards the server components after the adopted @if arm and reports it once', async () => {
		const s = await hydrate('IfComponents', { on: false }, { on: true });

		expect(container.querySelector('#r')).toBe(s.host);
		expect(markup(s.host)).toBe('<em>x</em>');
		expect(s.host.querySelector('em')).toBe(s.ems[0]);
		expect(s.recoverable).toEqual([expect.stringMatching(STRUCTURAL)]);
		expect(warnings()).toEqual(
			dev
				? [
						tailReport('IfComponents', '@if'),
						expect.stringContaining('server rendered text "y" but the client rendered "x"'),
					]
				: [],
		);

		s.render({ on: false });
		expect(markup(s.host)).toBe('<em>y</em><em>z</em>');
		s.render({ on: true });
		expect(markup(s.host)).toBe('<em>x</em>');
	});

	it('discards the server components after the adopted @switch case and reports it once', async () => {
		const s = await hydrate('SwitchComponents', { k: 'two' }, { k: 'one' });

		expect(markup(s.host)).toBe('<em>x</em>');
		expect(s.host.querySelector('em')).toBe(s.ems[0]);
		expect(s.recoverable).toEqual([expect.stringMatching(STRUCTURAL)]);
		expect(warnings()).toEqual(dev ? [tailReport('SwitchComponents', '@switch')] : []);

		s.render({ k: 'two' });
		expect(markup(s.host)).toBe('<em>x</em><em>z</em>');
		s.render({ k: 'one' });
		expect(markup(s.host)).toBe('<em>x</em>');
	});

	it('discards the server components after a boundary that rebuilt its arm', async () => {
		const s = await hydrate('CaughtLast', { on: false, boom: false }, { on: true, boom: true });

		expect(markup(s.host)).toBe('<em>x</em><p>caught</p>');
		expect(s.host.querySelector('em')).toBe(s.ems[0]);
		expect(s.recoverable).toEqual([expect.stringMatching(STRUCTURAL)]);
		expect(warnings()).toEqual(dev ? [tailReport('CaughtLast', '@if')] : []);
	});

	// Every slot leaves the cursor past the server content it claimed, so the
	// arm knows where its last slot ends, whatever kind of slot that is.
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
		'discards the server content after the last slot of a $name arm and reports it once',
		async ({ name, props, html, tail }) => {
			const s = await hydrate(name, { ...props, on: false }, { ...props, on: true });

			expect(markup(s.host)).toBe(html);
			expect([...s.host.querySelectorAll('*')]).toEqual(
				s.nodes.filter((node) => node.textContent !== 'tail'),
			);
			expect(s.recoverable).toEqual([expect.stringMatching(STRUCTURAL)]);
			expect(warnings()).toEqual(
				dev ? [tailReport(name, '@if', tail === 'tail' ? 'text "tail"' : '<b>')] : [],
			);

			s.render({ ...props, on: false });
			expect(markup(s.host)).toBe(html + tail);
			s.render({ ...props, on: true });
			expect(markup(s.host)).toBe(html);
		},
	);

	it.each([
		{ name: 'TryThenHost', tail: '<b>' },
		{ name: 'TryThenText', tail: 'text "tail"' },
		{ name: 'BoundaryThenHost', tail: '<b>' },
	])(
		'discards the server content after a $name boundary that caught a client error',
		async ({ name, tail }) => {
			const s = await hydrate(name, { on: false, boom: false }, { on: true, boom: true });

			expect(markup(s.host)).toBe('<em>x</em><p>caught</p>');
			expect(s.host.querySelector('em')).toBe(s.ems[0]);
			expect(s.recoverable).toEqual([expect.stringMatching(STRUCTURAL)]);
			expect(warnings()).toEqual(dev ? [tailReport(name, '@if', tail)] : []);
		},
	);

	it('discards the server content after a boundary that waits on the server arm', async () => {
		const ready = Object.assign(Promise.resolve('v'), { status: 'fulfilled', value: 'v' });
		let resolve!: (value: string) => void;
		const value = new Promise<string>((accept) => (resolve = accept));
		const s = await hydrate('PendingThenHost', { on: false, value: ready }, { on: true, value });

		// The boundary keeps the server's arm on screen while its body loads.
		expect(markup(s.host)).toBe('<em>x</em><u>v</u>');
		const [em, u] = s.nodes.filter((node) => node.matches('em, u'));
		expect([...s.host.querySelectorAll('em, u')]).toEqual([em, u]);
		expect(s.recoverable).toEqual([expect.stringMatching(STRUCTURAL)]);
		expect(warnings()).toEqual(dev ? [tailReport('PendingThenHost', '@if', '<b>')] : []);

		await act(async () => resolve('v'));
		expect(markup(s.host)).toBe('<em>x</em><u>v</u>');
		expect(s.host.querySelector('em')).toBe(em);
		expect(s.recoverable).toHaveLength(1);
	});

	// The cursor rests on the elements and text that a template adopts, so the
	// arm records where its own template's roots end.
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
		'discards the server content after the roots a $name arm adopts and reports it once',
		async ({ name, directive, from, to, html, swapped, server: described }) => {
			const s = await hydrate(name, from, to);
			const kept = s.nodes.slice(0, html.split('</').length - 1);

			expect(container.querySelector('#r')).toBe(s.host);
			expect(markup(s.host)).toBe(html);
			expect([...s.host.querySelectorAll('*')]).toEqual(kept);
			expect(s.recoverable).toEqual([expect.stringMatching(STRUCTURAL)]);
			expect(warnings()).toEqual(dev ? [tailReport(name, directive, described)] : []);

			s.render(from);
			expect(markup(s.host)).toBe(swapped);
			s.render(to);
			expect(markup(s.host)).toBe(html);
		},
	);

	it('keeps the roots of its own template when a component in a hole adopts in place', async () => {
		const s = await hydrate('HoleWithoutRange', { on: false }, { on: true });

		expect(markup(s.host)).toBe('<em>x</em><b>b</b>');
		expect([...s.host.querySelectorAll('*')]).toEqual(s.nodes);
		expect(s.recoverable).toEqual([]);
		expect(warnings()).toEqual([]);

		s.render({ on: false });
		expect(markup(s.host)).toBe('<em>x</em><b>b</b>');
		s.render({ on: true });
		expect(markup(s.host)).toBe('<em>x</em><b>b</b>');
	});

	it('builds the components a longer client arm adds and reports it once', async () => {
		const s = await hydrate('SwitchComponents', { k: 'one' }, { k: 'two' });

		expect(markup(s.host)).toBe('<em>x</em><em>z</em>');
		expect(s.host.querySelector('em')).toBe(s.ems[0]);
		expect(s.recoverable).toEqual([expect.stringMatching(STRUCTURAL)]);
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
			expect([...s.host.querySelectorAll('*')]).toEqual(s.nodes);
			expect(s.recoverable).toEqual([]);
			expect(warnings()).toEqual([]);
		},
	);

	// A client arm that renders nothing claims nothing of the server's other
	// arm, so the server's whole range is stale. It is discarded and reported as
	// an empty branch, the same as when the client's @if has no arm to render.
	it.each([
		{ name: 'EmptyArm', props: { on: false } },
		{ name: 'NoElseArm', props: { on: false } },
	])(
		'discards the server arm under a client $name that renders nothing and reports it once',
		async ({ name, props }) => {
			const s = await hydrate(name, { ...props, on: true }, props);

			expect(container.querySelector('#r')).toBe(s.host);
			expect(markup(s.host)).toBe('');
			expect(s.recoverable).toEqual([expect.stringMatching(STRUCTURAL)]);
			expect(warnings()).toEqual(dev ? [emptyReport(name)] : []);

			s.render({ ...props, on: true });
			expect(markup(s.host)).toBe('<em>x</em>');
			s.render(props);
			expect(markup(s.host)).toBe('');
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

	it.each([
		{ attempt: 'the root', name: 'IfThenChild', html: '<em>x</em><u>tail</u>' },
		{
			attempt: 'a @try boundary',
			name: 'TryIfThenChild',
			html: '<section><em>x</em><u>tail</u></section>',
		},
	])('reports the discard once when a pending sibling replays $attempt', async ({ name, html }) => {
		container.innerHTML = ServerRT.renderToString(server[name], {
			on: false,
			Child: server.Tail,
		}).html;
		const host = container.querySelector('#r')!;
		const em = container.querySelector('em')!;
		const recoverable: string[] = [];
		let deliver!: (module: { default: ComponentBody }) => void;
		const Child = lazy(
			() => new Promise<{ default: ComponentBody }>((accept) => (deliver = accept)),
		);
		await act(() => {
			root = hydrateRoot(
				container,
				client[name],
				{ on: true, Child },
				{ onRecoverableError: (error: unknown) => recoverable.push((error as Error).message) },
			);
		});
		await act(async () => deliver({ default: client.Tail }));

		expect(markup(host)).toBe(html);
		expect(container.querySelector('em')).toBe(em);
		expect(recoverable).toEqual([expect.stringMatching(STRUCTURAL)]);
		expect(warnings()).toEqual(dev ? [tailReport(name, '@if')] : []);
	});

	it('reports the empty-arm discard once when a pending sibling replays the root', async () => {
		container.innerHTML = ServerRT.renderToString(server.EmptyArmThenChild, {
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
				client.EmptyArmThenChild,
				{ on: false, Child },
				{ onRecoverableError: (error: unknown) => recoverable.push((error as Error).message) },
			);
		});
		await act(async () => deliver({ default: client.Tail }));

		expect(markup(host)).toBe('<u>tail</u>');
		expect(container.querySelector('u')).toBe(tail);
		expect(recoverable).toEqual([expect.stringMatching(STRUCTURAL)]);
		expect(warnings()).toEqual(dev ? [emptyReport('EmptyArmThenChild')] : []);
	});

	// Captures that changed before a dormant boundary activated legitimately
	// differ from the server's: discard the other arm's content, but report
	// nothing.
	it('discards silently in a dormant boundary whose branch changed before activation', async () => {
		const serverProps = { on: false, when: condition(false) };
		container.innerHTML = ServerRT.renderToString(server.DormantIf, serverProps).html;
		const section = container.querySelector('section')!;
		const em = container.querySelector('em')!;
		const recoverable: string[] = [];
		const active = hydrateRoot(container, client.DormantIf, serverProps, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
		});
		root = active;
		flushSync(() => {});
		expect(markup(section)).toBe('<em>x</em><em>z</em>');

		await act(() => active.render(client.DormantIf, { on: true, when: load() }));
		await act(async () => {});

		expect(container.querySelector('section')).toBe(section);
		expect(markup(section)).toBe('<em>x</em>');
		expect(container.querySelector('em')).toBe(em);
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);
	});
});

// The production runtime adopts compiled templates straight from their source,
// without parsing them. NODE_ENV is read at call time, so stubbing it around
// hydrateRoot exercises those branches. A fragment arm then takes its root count
// from the compiler, and still never parses a template to find where it ends.
describe('hydrateRoot — a branch arm shorter than the server arm (production runtime)', () => {
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
		'discards the server content after the roots of a $name fragment arm',
		async ({ name, from, to, html }) => {
			const s = await hydrate(name, from, to);

			expect(markup(s.host)).toBe(html);
			expect([...s.host.querySelectorAll('*')]).toEqual(s.nodes.slice(0, 2));
			// The production runtime reports the structural mismatch by its code.
			expect(s.recoverable).toEqual([expect.stringMatching(/errors\/51\b/)]);
			expect(s.parsed).toBe(0);
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
		expect([...s.host.querySelectorAll('*')]).toEqual(s.nodes);
		expect(s.recoverable).toEqual([]);
		expect(s.parsed).toBe(0);
	});
});
