import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot, type Root } from '../../src/index.js';
import { renderToString } from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture.js';

// Third-party scripts and browser extensions add nodes to the root container
// and to `<html>`, `<head>` and `<body>`. As React 19 does there, hydration
// skips a comment, and a server element of another tag, and leaves both in
// place: the client's nodes adopt the server's that follow them, and nothing
// is reported. A text node is not skipped, as React does not skip one: the
// root renders on the client and reports once. (react-dom 19.2.7: the same
// cases hydrate with no recoverable error, and the text cases fall back.)

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/foreign-root-nodes.tsrx',
);
type Fixture = typeof import('./_fixtures/foreign-root-nodes.tsrx');

const server = loadServerFixture<Fixture>(FIXTURE, { id: 'foreign-root-nodes.tsrx' });

function aside(): HTMLElement {
	const node = document.createElement('aside');
	node.textContent = 'ad';
	return node;
}

/** Every element and text node under `root`, in document order. */
function contentNodes(root: Node): Node[] {
	const nodes: Node[] = [];
	const owner = root.nodeType === 9 ? (root as Document) : root.ownerDocument!;
	const walker = owner.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
	while (walker.nextNode()) nodes.push(walker.currentNode);
	return nodes;
}

/** `actual` holds exactly `expected`'s nodes, by identity, in order. */
function expectSameNodes(actual: Node[], expected: Node[]): void {
	expect(actual).toHaveLength(expected.length);
	actual.forEach((node, index) => expect(node).toBe(expected[index]));
}

let root: Root | undefined;
let error: MockInstance<typeof console.error>;
beforeEach(() => {
	error = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
	root?.unmount();
	root = undefined;
	error.mockRestore();
});

describe.each([true, false])('foreign nodes where a root hydrates (dev=%s)', (dev) => {
	const client = loadCompiledFixtureSource<Fixture>(readFileSync(FIXTURE, 'utf8'), {
		id: 'foreign-root-nodes.tsrx',
		mode: 'client',
		compileOptions: { dev },
	});

	describe('in the root container', () => {
		let container: HTMLElement;
		beforeEach(() => {
			container = document.createElement('div');
			document.body.append(container);
		});
		afterEach(() => container.remove());

		function hydrate(component: 'Root' | 'Other', recoverable: unknown[]): void {
			root = hydrateRoot(
				container,
				client[component],
				{ label: 'x' },
				{ onRecoverableError: (reason) => recoverable.push(reason) },
			);
			flushSync(() => {});
		}

		it.each([
			{ name: 'a comment', insert: () => [document.createComment(' ad ')] },
			{
				name: 'an element and a comment',
				insert: () => [aside(), document.createComment(' ad ')],
			},
			{
				name: 'elements around a comment',
				insert: () => [aside(), document.createComment(' ad '), document.createElement('nav')],
			},
		])('adopts the root after $name before it', async ({ insert }) => {
			container.innerHTML = renderToString(server.Root, { label: 'x' }).html;
			const foreign = insert();
			container.prepend(...foreign);
			const served = contentNodes(container);
			const paragraph = container.querySelector('p')!;
			const recoverable: unknown[] = [];
			hydrate('Root', recoverable);
			await act(() => {});

			expectSameNodes(contentNodes(container), served);
			for (const node of foreign) expect(node.parentNode).toBe(container);
			expect(recoverable).toEqual([]);
			expect(error).not.toHaveBeenCalled();

			// The adopted root is live.
			await act(() => root!.render(client.Root, { label: 'y' }));
			expect(container.querySelector('p')).toBe(paragraph);
			expect(paragraph.textContent).toBe('y');
			expect(recoverable).toEqual([]);
			expect(error).not.toHaveBeenCalled();
		});

		// A skipped comment does not hide a mismatch after it.
		it('falls back for a root of another tag after a comment', async () => {
			container.innerHTML = renderToString(server.Root, { label: 'x' }).html;
			container.prepend(document.createComment(' ad '));
			const served = container.querySelector('main')!;
			const recoverable: unknown[] = [];
			hydrate('Other', recoverable);
			await act(() => {});

			expect(served.isConnected).toBe(false);
			expect(container.querySelector('section')!.textContent).toBe('x');
			expect(recoverable).toHaveLength(1);
		});

		// Range markers are the hydration protocol's, as React's Suspense markers
		// are React's, so the search ends at one: the server rendered other
		// content there.
		it('falls back for a root after a server range', async () => {
			container.innerHTML = renderToString(server.Ranged, { label: 'x' }).html;
			container.prepend(document.createComment(' ad '));
			const served = container.querySelector('main')!;
			const recoverable: unknown[] = [];
			hydrate('Root', recoverable);
			await act(() => {});

			expect(served.isConnected).toBe(false);
			expect(container.querySelector('aside')).toBeNull();
			expect(container.querySelector('p')!.textContent).toBe('x');
			expect(recoverable).toHaveLength(1);
		});

		it.each([
			{ name: 'whitespace', insert: () => [document.createTextNode('\n  ')] },
			{
				name: 'an element and whitespace',
				insert: () => [aside(), document.createTextNode('\n  ')],
			},
		])('falls back for $name before the root', async ({ insert }) => {
			container.innerHTML = renderToString(server.Root, { label: 'x' }).html;
			container.prepend(...insert());
			const served = container.querySelector('main')!;
			const recoverable: unknown[] = [];
			hydrate('Root', recoverable);
			await act(() => {});

			expect(served.isConnected).toBe(false);
			expect(container.querySelector('p')!.textContent).toBe('x');
			expect(recoverable).toHaveLength(1);
		});
	});

	describe('in a document', () => {
		function serve(): Document {
			const html = renderToString(server.Doc, { label: 'x' }).html;
			return new DOMParser().parseFromString('<!DOCTYPE html>' + html, 'text/html');
		}

		function hydrate(doc: Document, recoverable: unknown[]): void {
			root = hydrateRoot(
				doc,
				client.Doc,
				{ label: 'x' },
				{ onRecoverableError: (reason) => recoverable.push(reason) },
			);
			flushSync(() => {});
		}

		it.each([
			{
				name: 'a comment first in <body>',
				insert: (doc: Document) => {
					const comment = doc.createComment(' ext ');
					doc.body.prepend(comment);
					return [comment];
				},
			},
			{
				name: 'an element and a comment first in <body>',
				insert: (doc: Document) => {
					const nodes = [doc.createElement('div'), doc.createComment(' ext ')];
					doc.body.prepend(...nodes);
					return nodes;
				},
			},
			{
				name: 'an element and a comment between <body> children',
				insert: (doc: Document) => {
					const nodes = [doc.createElement('div'), doc.createComment(' ext ')];
					doc.querySelector('i')!.before(...nodes);
					return nodes;
				},
			},
			{
				name: 'a comment between <head> and <body>',
				insert: (doc: Document) => {
					const comment = doc.createComment(' ext ');
					doc.body.before(comment);
					return [comment];
				},
			},
		])('adopts the document after $name', async ({ insert }) => {
			const doc = serve();
			const foreign = insert(doc);
			const parents = foreign.map((node) => node.parentNode);
			const served = contentNodes(doc);
			const italic = doc.querySelector('i')!;
			const recoverable: unknown[] = [];
			hydrate(doc, recoverable);
			await act(() => {});

			expectSameNodes(contentNodes(doc), served);
			foreign.forEach((node, index) => expect(node.parentNode).toBe(parents[index]));
			expect(recoverable).toEqual([]);
			expect(error).not.toHaveBeenCalled();

			await act(() => root!.render(client.Doc, { label: 'y' }));
			expect(doc.querySelector('i')).toBe(italic);
			expect(italic.textContent).toBe('y');
			expect(recoverable).toEqual([]);
			expect(error).not.toHaveBeenCalled();
		});

		it('falls back for whitespace first in <body>', async () => {
			const doc = serve();
			doc.body.prepend(doc.createTextNode('\n  '));
			const served = doc.querySelector('p')!;
			const recoverable: unknown[] = [];
			hydrate(doc, recoverable);
			await act(() => {});

			expect(served.isConnected).toBe(false);
			expect(doc.querySelector('i')!.textContent).toBe('x');
			expect(recoverable).toHaveLength(1);
		});
	});
});
