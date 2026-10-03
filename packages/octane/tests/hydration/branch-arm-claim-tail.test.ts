import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot, lazy } from '../../src/index.js';
import type { ComponentBody } from '../../src/index.js';
import { condition, load } from 'octane/hydration';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// The server rendered a branch arm that holds more than the arm the client
// adopts its range for. Every component the client's arm renders claims its
// framed server range, and each claim parks the hydration cursor past it, so
// the server content after the last claim is content no client node claims.
// Hydration discards it and reports the mismatch once, keeping every node the
// client adopted. Content the client did adopt after a claim (its template's
// trailing host, or a component's root) stays.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/branch-arm-claim-tail.tsrx',
);
const FILE = 'branch-arm-claim-tail.tsrx';
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

/** The elements the client adopted, without the server's trailing `<u>`. */
function withoutTail(adopted: Element[]): Element[] {
	return adopted.filter((element) => element.localName !== 'u');
}

/** `actual` holds exactly the `expected` nodes: the same objects, in order. */
function expectSame(actual: ArrayLike<Node>, expected: readonly Node[]): void {
	expect(actual).toHaveLength(expected.length);
	Array.from(actual).forEach((node, i) => expect(node).toBe(expected[i]));
}

const DISCARDED =
	'Hydration mismatch: the server-rendered node did not match the client render; ' +
	'the mismatched subtree was rebuilt on the client.';

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — server content after an adopted arm’s last claim ($name)', ({ dev }) => {
	const server = loadServerFixture(FIXTURE, { id: FILE });
	const client = loadCompiledFixtureSource(SOURCE, {
		id: FILE,
		mode: 'client',
		compileOptions: { dev },
	});
	let container: HTMLElement;
	let root: { render(component: unknown, props?: unknown): void; unmount(): void } | null;
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

	const report = (component: string, directive = '@if', actual = '<u>') =>
		`Octane hydration mismatch at ${FILE}:${siteLoc(`function ${component}(`, directive)}: ` +
		`the client expected the end of the branch but the server rendered ${actual}. The ` +
		`mismatched subtree was rebuilt on the client.`;

	async function hydrate(name: string, serverProps: object, clientProps: object) {
		container.innerHTML = ServerRT.renderToString(server[name], serverProps).html;
		const div = container.firstElementChild!;
		const adopted = Array.from(div.querySelectorAll('*'));
		const recoverable: string[] = [];
		root = hydrateRoot(container, client[name], clientProps, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
		});
		flushSync(() => {});
		// Recoverable reports are delivered after the hydration burst.
		await act(async () => {});
		return { div, adopted, recoverable };
	}

	it.each([
		{ shape: 'hookless components', name: 'Y', kept: '<s>s</s><b>a</b>' },
		{ shape: 'a sole component', name: 'SoleComponent', kept: '<s>s</s>' },
		{ shape: 'a component with hooks', name: 'HookedArm', kept: '<s>s</s><em>h</em>' },
	])('discards the server tail after $shape and reports it once', async ({ name, kept }) => {
		const { div, adopted, recoverable } = await hydrate(name, { server: true }, {});

		expect(markup(div)).toBe(kept);
		expect(Array.from(div.children)).toEqual(withoutTail(adopted));
		expect(recoverable).toEqual([DISCARDED]);
		expect(warnings()).toEqual(dev ? [report(name)] : []);
	});

	it('discards the server tail of a @switch case', async () => {
		const { div, adopted, recoverable } = await hydrate('Switched', { k: 'server' }, { k: 'x' });

		expect(markup(div)).toBe('<s>s</s><b>a</b>');
		expect(Array.from(div.children)).toEqual(withoutTail(adopted));
		expect(recoverable).toEqual([DISCARDED]);
		expect(warnings()).toEqual(dev ? [report('Switched', '@switch')] : []);
	});

	it('discards the server tail after a nested branch', async () => {
		const { div, adopted, recoverable } = await hydrate(
			'NestedBranch',
			{ server: true, inner: true },
			{ inner: true },
		);

		expect(markup(div)).toBe('<s>s</s><b>a</b>');
		expect(Array.from(div.children)).toEqual(withoutTail(adopted));
		expect(recoverable).toEqual([DISCARDED]);
		expect(warnings()).toEqual(dev ? [report('NestedBranch')] : []);
	});

	it('adopts the arm the server rendered without a report', async () => {
		const { div, adopted, recoverable } = await hydrate('Y', {}, {});

		expect(markup(div)).toBe('<s>s</s><b>a</b>');
		expect(Array.from(div.children)).toEqual(adopted);
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);
	});

	it.each([
		{
			shape: 'a host its template adopted after its last component',
			name: 'SameContent',
			kept: '<s>s</s><b>a</b><u>tail</u>',
		},
		{
			shape: 'a component root adopted after a claim',
			name: 'AdoptedAfterClaim',
			kept: '<s>s</s><i>u</i>',
		},
	])('keeps $shape', async ({ name, kept }) => {
		const { div, adopted, recoverable } = await hydrate(name, { server: true }, {});

		expect(markup(div)).toBe(kept);
		expect(Array.from(div.children)).toEqual(adopted);
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);
	});

	// A branch the server rendered no range for ends after every root its
	// template adopted in place, not after the first: the arm keeps them all,
	// and the branch owns them.
	it.each([
		{ branch: 'an @if', name: 'MarkerlessArm' },
		{ branch: 'a @switch', name: 'MarkerlessSwitch' },
		{ branch: 'an @if inside another', name: 'MarkerlessNested' },
	])(
		'discards only the server tail after the roots of $branch with no server range',
		async ({ name }) => {
			const { div, adopted, recoverable } = await hydrate(name, { server: true }, { inner: true });

			expect(markup(div)).toBe('<s>s</s><b>a</b>');
			expectSame(div.children, withoutTail(adopted));
			expect(recoverable).toEqual([DISCARDED]);
			expect(warnings()).toEqual(dev ? [report(name)] : []);

			flushSync(() => root!.render(client[name], { inner: false }));
			expect(markup(div)).toBe('');
			flushSync(() => root!.render(client[name], { inner: true }));
			expect(markup(div)).toBe('<s>s</s><b>a</b>');
		},
	);

	it('keeps every root of a branch with no server range when the server rendered no more', async () => {
		const { div, adopted, recoverable } = await hydrate(
			'MarkerlessSameArm',
			{ server: true },
			{ inner: true },
		);

		expect(markup(div)).toBe('<s>s</s><b>a</b>');
		expectSame(div.children, adopted);
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);

		flushSync(() => root!.render(client.MarkerlessSameArm, { inner: false }));
		expect(markup(div)).toBe('');
	});

	// Its roots outnumber what the server rendered before the arm's end, so
	// the branch is built on the client in place of the server's content.
	it('rebuilds a branch with no server range whose roots the server’s arm ends before', async () => {
		const { div, recoverable } = await hydrate(
			'MarkerlessShortArm',
			{ server: true },
			{ inner: true },
		);

		expect(markup(div)).toBe('<s>s</s><b>a</b>');
		expect(recoverable).toEqual([DISCARDED]);

		flushSync(() => root!.render(client.MarkerlessShortArm, { inner: false }));
		expect(markup(div)).toBe('');
	});

	it('keeps a root that recovery rebuilt in the arm while discarding the tail', async () => {
		const { div, adopted, recoverable } = await hydrate('RebuiltBeforeClaim', { server: true }, {});
		const claimed = adopted.find((element) => element.localName === 's');

		// Where the rebuilt root goes relative to adopted siblings is a separate
		// contract; this one is that it survives and the tail does not.
		expect(div.querySelector('s')).toBe(claimed);
		expect(div.querySelector('em')?.textContent).toBe('e');
		expect(div.querySelector('u')).toBeNull();
		expect(div.querySelector('i')).toBeNull();
		expect(div.children).toHaveLength(2);
		// One root reports its recoverable mismatches once per hydration burst.
		expect(recoverable).toHaveLength(1);
		if (dev) expect(warnings()).toContain(report('RebuiltBeforeClaim'));
		else expect(warnings()).toEqual([]);
	});

	it.each([
		{ attempt: 'the root', name: 'TailThenChild', wrap: (html: string) => html },
		{
			attempt: 'a @try boundary',
			name: 'TryTailThenChild',
			wrap: (html: string) => `<section>${html}</section>`,
		},
	])('reports the tail once when a pending sibling replays $attempt', async ({ name, wrap }) => {
		container.innerHTML = ServerRT.renderToString(server[name], {
			server: true,
			Child: server.Tail,
		}).html;
		const kept = Array.from(container.querySelectorAll('s, b'));
		const recoverable: string[] = [];
		let deliver!: (module: { default: ComponentBody }) => void;
		const Child = lazy(
			() => new Promise<{ default: ComponentBody }>((accept) => (deliver = accept)),
		);
		await act(() => {
			root = hydrateRoot(
				container,
				client[name],
				{ Child },
				{ onRecoverableError: (error: unknown) => recoverable.push((error as Error).message) },
			);
		});
		await act(async () => deliver({ default: client.Tail }));

		expect(markup(container.firstElementChild!)).toBe(wrap('<s>s</s><b>a</b><p>child</p>'));
		expect(Array.from(container.querySelectorAll('s, b'))).toEqual(kept);
		expect(recoverable).toEqual([DISCARDED]);
		expect(warnings()).toEqual(dev ? [report(name)] : []);
	});

	it.each([
		{ attempt: 'the root', name: 'PendingInArm', wrap: (html: string) => html },
		{
			attempt: 'a @try boundary',
			name: 'TryPendingInArm',
			wrap: (html: string) => `<section>${html}</section>`,
		},
	])(
		'discards the tail once when the arm’s last component suspends $attempt',
		async ({ name, wrap }) => {
			container.innerHTML = ServerRT.renderToString(server[name], {
				server: true,
				Child: server.Tail,
			}).html;
			const kept = Array.from(container.querySelectorAll('s, p'));
			const recoverable: string[] = [];
			let deliver!: (module: { default: ComponentBody }) => void;
			const Child = lazy(
				() => new Promise<{ default: ComponentBody }>((accept) => (deliver = accept)),
			);
			await act(() => {
				root = hydrateRoot(
					container,
					client[name],
					{ Child },
					{ onRecoverableError: (error: unknown) => recoverable.push((error as Error).message) },
				);
			});
			await act(async () => deliver({ default: client.Tail }));

			expect(markup(container.firstElementChild!)).toBe(wrap('<s>s</s><p>child</p>'));
			expect(Array.from(container.querySelectorAll('s, p'))).toEqual(kept);
			expect(recoverable).toEqual([DISCARDED]);
			expect(warnings()).toEqual(dev ? [report(name)] : []);
		},
	);

	// Captures that changed before a dormant boundary activated legitimately
	// differ from the server's: discard the tail, but report nothing.
	it('discards a dormant boundary’s tail without reporting when its captures changed', async () => {
		const serverProps = { server: true, when: condition(false) };
		container.innerHTML = ServerRT.renderToString(server.DormantTail, serverProps).html;
		const section = container.querySelector('section')!;
		const kept = Array.from(section.children).slice(0, 2);
		const recoverable: string[] = [];
		const active = hydrateRoot(container, client.DormantTail, serverProps, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
		});
		root = active;
		flushSync(() => {});
		expect(markup(section)).toBe('<s>s</s><b>a</b><u>tail</u>');

		await act(() => active.render(client.DormantTail, { when: load() }));
		await act(async () => {});

		expect(container.querySelector('section')).toBe(section);
		expect(markup(section)).toBe('<s>s</s><b>a</b>');
		expect(Array.from(section.children)).toEqual(kept);
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);
	});
});
