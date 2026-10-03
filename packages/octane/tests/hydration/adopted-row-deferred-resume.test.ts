import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// A deferred boundary whose retry suspends inside a component keeps that
// attempt's blocks and later resumes the suspended one first. Here the parent
// opens a row the boundary adopted from the server while the boundary is
// pending, so the retry builds the row's @if arm and suspends in it. The next
// retry must resume that arm's component, not a hookless sibling whose scope
// has no Block of its own. The server HTML predates the captures, so nothing
// is reported, and every server node the boundary adopted keeps its identity.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/adopted-row-deferred-resume.tsrx',
);
const FILE = 'adopted-row-deferred-resume.tsrx';
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

function pending(): { promise: Promise<string>; resolve: (value: string) => void } {
	let resolve!: (value: string) => void;
	const promise = new Promise<string>((done) => (resolve = done));
	return { promise, resolve };
}

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — a deferred retry resumes inside an adopted row ($name)', ({ dev }) => {
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

	function expectNoDiagnostics(): void {
		expect(recoverable).toEqual([]);
		expect(errSpy.mock.calls.map((call: unknown[]) => String(call[0]))).toEqual([]);
	}

	it.each([
		{ title: 'after a row was inserted after it', probe: 'RowProbe', items: ['x', 'q'] },
		{ title: 'after a row was inserted before it', probe: 'RowProbe', items: ['q', 'x'] },
		{ title: 'with its rows unchanged', probe: 'RowProbe', items: ['x'] },
		{
			title: 'after a row was inserted after it, suspending in a use() declaration',
			probe: 'BatchedRowProbe',
			items: ['x', 'q'],
		},
		{
			title: 'with its rows unchanged, suspending in a use() declaration',
			probe: 'BatchedRowProbe',
			items: ['x'],
		},
	])('opens the server row $title', async ({ probe, items }) => {
		container.innerHTML = ServerRT.renderToString(server[probe], {
			server: true,
			leaf: Promise.resolve('x'),
			gate: Promise.resolve('g'),
			slow: Promise.resolve('S'),
			items: ['x'],
		}).html;
		const section = container.querySelector('section')!;
		const html = markup(section);
		const row = section.querySelector('s');
		const u = section.querySelector('u');
		const q = section.querySelector('q');
		const em = section.querySelector('em');
		const leaf = pending();
		const gate = pending();
		const slow = pending();
		const promises = { leaf: leaf.promise, gate: gate.promise, slow: slow.promise };
		root = hydrateRoot(
			container,
			client[probe],
			{ ...promises, items: ['x'] },
			{ onRecoverableError: (error: unknown) => recoverable.push((error as Error).message) },
		);
		flushSync(() => {});
		await act(async () => {});
		// The first attempt suspends at Pend and leaves the server HTML on screen.
		expect(markup(section)).toBe(html);

		flushSync(() => root!.render(client[probe], { ...promises, items }));
		// That retry suspends at Gate.
		await act(async () => leaf.resolve('x'));
		flushSync(() => root!.render(client[probe], { ...promises, items, open: 'x' }));
		// That retry builds the row's arm, whose Slow suspends.
		await act(async () => gate.resolve('g'));
		expectNoDiagnostics();
		// The next retry resumes Slow and completes the boundary.
		await act(async () => slow.resolve('S'));

		const rows = items.map((item) => (item === 'x' ? '<s>x<i>S</i></s>' : `<s>${item}</s>`));
		expect(markup(section)).toBe(`${rows.join('')}<u>x</u><q>g</q><em>e</em>`);
		expect(section.querySelector('i')!.parentNode).toBe(row);
		expect(section.querySelector('u')).toBe(u);
		expect(section.querySelector('q')).toBe(q);
		expect(section.querySelector('em')).toBe(em);
		expectNoDiagnostics();

		// The hydrated boundary keeps updating the nodes it adopted.
		await act(async () => root!.render(client[probe], { ...promises, items: ['x'] }));
		expect(markup(section)).toBe('<s>x</s><u>x</u><q>g</q><em>e</em>');
		expect(section.querySelector('s')).toBe(row);
		expect(section.querySelector('em')).toBe(em);
		expectNoDiagnostics();
	});
});
