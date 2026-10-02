import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot, lazy } from '../../src/index.js';
import type { ComponentBody } from '../../src/index.js';
import { condition, load } from 'octane/hydration';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// When the server rendered an @for with no items and the client has items,
// hydration rebuilds the list on the client and reports that one mismatch once,
// at the list's own site. The report names the @empty arm only when the server
// rendered one; a list without that arm rendered an empty list, nothing more.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/mismatch-empty-list.tsrx',
);
const FILE = 'mismatch-empty-list.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');
const LINES = SOURCE.split('\n');

/** `line:column` of the first `@for` after the line containing `text`. */
function forLoc(text: string): string {
	const from = LINES.findIndex((line) => line.includes(text));
	if (from < 0) throw new Error(`fixture has no line containing ${text}`);
	const index = LINES.findIndex((line, i) => i > from && line.includes('@for'));
	return `${index + 1}:${LINES[index].indexOf('@for')}`;
}

/** `line:column` of the first `<i>` after the line containing `text`. */
function hostLoc(text: string): string {
	const from = LINES.findIndex((line) => line.includes(text));
	if (from < 0) throw new Error(`fixture has no line containing ${text}`);
	const index = LINES.findIndex((line, i) => i > from && line.includes('<i>'));
	return `${index + 1}:${LINES[index].indexOf('<i>')}`;
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
])('hydrateRoot — server rendered fewer list items than the client ($name)', ({ dev }) => {
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

	const mismatch = (loc: string, expected: string, actual: string) =>
		`Octane hydration mismatch at ${FILE}:${loc}: the client expected ${expected} but the ` +
		`server rendered ${actual}. The mismatched subtree was rebuilt on the client.`;

	it.each([
		{
			list: 'a list without @empty that the server rendered empty',
			name: 'ListLabel',
			serverItems: [] as string[],
			report: () => mismatch(forLoc('function ListLabel('), 'a populated list', 'an empty list'),
		},
		{
			list: 'a list whose server render took its @empty arm',
			name: 'EmptyArmLabel',
			serverItems: [] as string[],
			report: () =>
				mismatch(forLoc('function EmptyArmLabel('), 'a populated list', 'an empty list (@empty)'),
		},
		{
			list: 'a list the server rendered with fewer items',
			name: 'ListLabel',
			serverItems: ['x'],
			report: () => mismatch(hostLoc('function ListLabel('), 'another list item', 'nothing'),
		},
	])('rebuilds $list and reports it once', async ({ name, serverItems, report }) => {
		container.innerHTML = ServerRT.renderToString(server[name], { items: serverItems }).html;
		const host = container.querySelector('i')!;
		const recoverable: string[] = [];
		root = hydrateRoot(
			container,
			client[name],
			{ items: ['x', 'y'] },
			{ onRecoverableError: (error: unknown) => recoverable.push((error as Error).message) },
		);
		flushSync(() => {});
		// Recoverable reports are delivered after the hydration burst.
		await act(async () => {});

		expect(markup(container.firstElementChild!)).toBe('<i><s>x</s><s>y</s>ok</i>');
		expect(container.querySelector('i')).toBe(host);
		expect(recoverable).toEqual([expect.stringMatching(STRUCTURAL)]);
		expect(warnings()).toEqual(dev ? [report()] : []);
	});

	it.each([
		{ attempt: 'the root', name: 'ListThenChild', tail: '<i><s>x</s><s>y</s>ok</i><u>tail</u>' },
		{
			attempt: 'a @try boundary',
			name: 'TryListThenChild',
			tail: '<section><i><s>x</s><s>y</s>ok</i><u>tail</u></section>',
		},
	])('reports the list once when a pending sibling replays $attempt', async ({ name, tail }) => {
		container.innerHTML = ServerRT.renderToString(server[name], {
			items: [],
			Child: server.Tail,
		}).html;
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
				{ items: ['x', 'y'], Child },
				{ onRecoverableError: (error: unknown) => recoverable.push((error as Error).message) },
			);
		});
		await act(async () => deliver({ default: client.Tail }));

		expect(markup(container.firstElementChild!)).toBe(tail);
		expect(container.querySelector('i')).toBe(host);
		expect(recoverable).toEqual([expect.stringMatching(STRUCTURAL)]);
		expect(warnings()).toEqual(
			dev ? [mismatch(forLoc(`function ${name}(`), 'a populated list', 'an empty list')] : [],
		);
	});

	// Captures that changed before a dormant boundary activated legitimately
	// differ from the server's: rebuild the list, but report nothing.
	it('rebuilds a dormant boundary whose list filled before activation without reporting', async () => {
		const serverProps = { items: [] as string[], when: condition(false) };
		container.innerHTML = ServerRT.renderToString(server.DormantList, serverProps).html;
		const host = container.querySelector('i')!;
		const recoverable: string[] = [];
		const active = hydrateRoot(container, client.DormantList, serverProps, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
		});
		root = active;
		flushSync(() => {});
		expect(markup(host.parentElement!)).toBe('<i>ok</i>');

		await act(() => active.render(client.DormantList, { items: ['x', 'y'], when: load() }));
		await act(async () => {});

		expect(container.querySelector('i')).toBe(host);
		expect(markup(host.parentElement!)).toBe('<i><s>x</s><s>y</s>ok</i>');
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);
	});
});
