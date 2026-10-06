import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot, lazy } from '../../src/index.js';
import type { ComponentBody } from '../../src/index.js';
import { condition, load } from 'octane/hydration';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// When the server rendered an @for with items and the client has none, the
// server HTML does not match, as in React: nothing is rebuilt in place. The
// nearest fallback owner, the root or a @try/@pending arm, discards its server
// DOM and renders on the client. That reports one recoverable error in every
// compile, and one diagnostic in development, even when a pending sibling
// replays the attempt. A dormant boundary whose captures changed before it
// activated renders on the client without a report.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/mismatch-populated-list.tsrx',
);
const FILE = 'mismatch-populated-list.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');
const LINES = SOURCE.split('\n');

/** `line:column` of the first `@for` after the line containing `text`. */
function forLoc(text: string): string {
	const from = LINES.findIndex((line) => line.includes(text));
	if (from < 0) throw new Error(`fixture has no line containing ${text}`);
	const index = LINES.findIndex((line, i) => i > from && line.includes('@for'));
	return `${index + 1}:${LINES[index].indexOf('@for')}`;
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

const MISMATCH = /^Hydration failed because the server rendered HTML didn't match the client\./;

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — server rendered list items the client does not have ($name)', ({ dev }) => {
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

	const report = (component: string) =>
		`Octane hydration mismatch at ${FILE}:${forLoc(`function ${component}(`)}: the client ` +
		`expected an empty list (@empty) but the server rendered <s>. The nearest ` +
		`Suspense or Hydrate boundary, or the root, will be regenerated on the client.`;

	function serve(items: string[]): void {
		container.innerHTML = ServerRT.renderToString(server.EmptyArmLabel, { items }).html;
	}

	async function hydrate(): Promise<string[]> {
		const recoverable: string[] = [];
		root = hydrateRoot(
			container,
			client.EmptyArmLabel,
			{ items: [] },
			{ onRecoverableError: (error: unknown) => recoverable.push((error as Error).message) },
		);
		flushSync(() => {});
		// Recoverable reports are delivered after the hydration burst.
		await act(async () => {});
		return recoverable;
	}

	it('renders the root on the client over the server items and reports it once', async () => {
		serve(['x']);
		const served = [...container.querySelectorAll('*')];
		const recoverable = await hydrate();

		expect(markup(container.firstElementChild!)).toBe('<i><b>none</b>ok</i>');
		expect(served.filter((node) => node.isConnected)).toEqual([]);
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
		expect(warnings()).toEqual(dev ? [report('EmptyArmLabel')] : []);
	});

	it('adopts the server @empty arm without a report', async () => {
		serve([]);
		const empty = container.querySelector('b')!;
		const recoverable = await hydrate();

		expect(markup(container.firstElementChild!)).toBe('<i><b>none</b>ok</i>');
		expect(container.querySelector('b')).toBe(empty);
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);
	});

	it.each([
		{
			attempt: 'the root',
			name: 'EmptyArmThenChild',
			tail: '<i><b>none</b>ok</i><u>tail</u>',
			kept: false,
		},
		{
			attempt: 'a @try boundary',
			name: 'TryEmptyArmThenChild',
			tail: '<section><i><b>none</b>ok</i><u>tail</u></section>',
			kept: true,
		},
	])(
		'reports the list once when a pending sibling holds $attempt',
		async ({ name, tail, kept }) => {
			container.innerHTML = ServerRT.renderToString(server[name], {
				items: ['x'],
				Child: server.Tail,
			}).html;
			const div = container.firstElementChild!;
			const host = container.querySelector('i')!;
			const recoverable: string[] = [];
			let deliver!: (module: { default: ComponentBody }) => void;
			const Child = lazy(
				() => new Promise<{ default: ComponentBody }>((accept) => (deliver = accept)),
			);
			await act(() => {
				root = hydrateRoot(
					container,
					client[name],
					{ items: [], Child },
					{ onRecoverableError: (error: unknown) => recoverable.push((error as Error).message) },
				);
			});
			await act(async () => deliver({ default: client.Tail }));

			expect(markup(container.firstElementChild!)).toBe(tail);
			expect(host.isConnected).toBe(false);
			// A @try arm renders on the client alone; without one, the whole root does.
			expect(container.firstElementChild === div).toBe(kept);
			expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
			expect(warnings()).toEqual(dev ? [report(name)] : []);
		},
	);

	// Captures that changed before a dormant boundary activated legitimately
	// differ from the server's, and a dormant boundary never renders its stale
	// captures to compare them. As React does for an update that reaches a
	// dehydrated boundary it cannot hydrate, the boundary renders on the client
	// and reports nothing.
	it('renders a dormant boundary whose list emptied before activation on the client without reporting', async () => {
		const serverProps = { items: ['x'], when: condition(false) };
		container.innerHTML = ServerRT.renderToString(server.DormantEmptyArm, serverProps).html;
		const div = container.firstElementChild!;
		const host = container.querySelector('i')!;
		const recoverable: string[] = [];
		const active = hydrateRoot(container, client.DormantEmptyArm, serverProps, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
		});
		root = active;
		flushSync(() => {});
		expect(markup(host.parentElement!)).toBe('<i><s>x</s>ok</i>');

		await act(() => active.render(client.DormantEmptyArm, { items: [], when: load() }));
		await act(async () => {});

		expect(container.firstElementChild).toBe(div);
		expect(host.isConnected).toBe(false);
		expect(markup(container.querySelector('i')!.parentElement!)).toBe('<i><b>none</b>ok</i>');
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);
	});
});
