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

	const tailReport = (component: string, directive: string) =>
		`Octane hydration mismatch at ${FILE}:${siteLoc(`function ${component}(`, directive)}: ` +
		'the client expected the end of the branch but the server rendered a control-flow ' +
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
	])(
		'adopts every node of a matching $name arm without a report',
		async ({ name, props, html }) => {
			const s = await hydrate(name, props, props);

			expect(markup(s.host)).toBe(html);
			expect([...s.host.querySelectorAll('*')]).toEqual(s.nodes);
			expect(s.recoverable).toEqual([]);
			expect(warnings()).toEqual([]);
		},
	);

	// The tail check measures from what the arm claimed. An empty client arm
	// claims nothing, so the server's whole range is the other arm, not a tail
	// after this one, and it is left to the existing empty-arm handling.
	it('does not report a client arm that renders nothing over the server arm', async () => {
		const s = await hydrate('EmptyArm', { on: true }, { on: false });

		expect(s.recoverable).toEqual([]);
		expect(warnings()).toEqual([]);

		s.render({ on: true });
		expect(markup(s.host)).toBe('<em>x</em>');
		s.render({ on: false });
		expect(markup(s.host)).toBe('');
	});

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
