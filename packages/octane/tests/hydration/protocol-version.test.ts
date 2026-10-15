import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, hydrateRoot, type Root } from '../../src/index.js';
import * as Server from 'octane/server';
import { loadCompiledFixtureSource } from '../_server-fixture.js';

// Every hydratable root's server output opens with a comment naming the range
// protocol its server spoke (hydration-protocol.ts). A server and client from
// different Octane versions may not agree on what the ranges mean, so a root
// whose output names another version, or none, renders on the client and
// reports why instead of adopting ranges it would misread. The comment needs no
// `use()` seeds: a root that seeds nothing is checked too.

const SOURCE = `
function Item(props) @{
	<li>{props.label as string}</li>
}

export function App(props) @{
	<main>
		<h1>{props.title as string}</h1>
		<ul>
			@for (const label of props.items; key label) {
				<Item label={label} />
			}
		</ul>
	</main>
}

export function Page() @{
	<html>
		<head>
			<title>{'page'}</title>
		</head>
		<body>
			<p>{'body'}</p>
		</body>
	</html>
}
`;

const server = loadCompiledFixtureSource<any>(SOURCE, {
	id: 'protocol-version.tsrx',
	mode: 'server',
});
const client = loadCompiledFixtureSource<any>(SOURCE, {
	id: 'protocol-version.tsrx',
	mode: 'client',
});

const PROPS = { title: 'list', items: ['a', 'b'] };
const MARK = '<!--3-->';

let container: HTMLElement;
let root: Root | undefined;
beforeEach(() => {
	container = document.createElement('div');
	document.body.append(container);
});
afterEach(() => {
	root?.unmount();
	root = undefined;
	container.remove();
});

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let html = '';
	for (;;) {
		const { done, value } = await reader.read();
		if (done) return html + decoder.decode();
		html += decoder.decode(value, { stream: true });
	}
}

describe('the hydration protocol version', () => {
	it('opens every hydratable root, and nothing else', async () => {
		const { html } = Server.renderToString(server.App, PROPS);
		expect(html.startsWith(MARK + '<main>')).toBe(true);
		expect(html.indexOf(MARK, 1)).toBe(-1);
		// Nothing seeded, so only the comment names the version.
		expect(html).not.toContain('<script');
		expect(Server.renderToStaticMarkup(server.App, PROPS).html).not.toContain(MARK);
		const streamed = await readStream(await Server.renderToReadableStream(server.App, PROPS));
		expect(streamed.startsWith(MARK + '<main>')).toBe(true);
	});

	it('leads a document root before its html element', async () => {
		const { html } = Server.renderToString(server.Page, {});
		expect(html).toMatch(/^<!--3-->(?:<!--\[-->)*<html>/);
		expect(html).toContain('<title>page</title>');
		const streamed = await readStream(await Server.renderToReadableStream(server.Page, {}));
		expect(streamed).toMatch(/^<!DOCTYPE html><!--3-->(?:<!--\[-->)*<html>/);
	});

	it('lets a root without seeds adopt the server DOM when it matches', async () => {
		const { html } = Server.renderToString(server.App, PROPS);
		container.innerHTML = html;
		const main = container.querySelector('main');
		const recoverable: unknown[] = [];
		await act(async () => {
			root = hydrateRoot(container, client.App, PROPS, {
				onRecoverableError: (error) => recoverable.push(error),
			});
		});
		expect(container.querySelector('main')).toBe(main);
		expect(recoverable).toEqual([]);
		// Like a range's comments, the version stays where the server put it.
		expect(container.innerHTML).toBe(html);
	});

	// A shell renders the whole document, and the client hydrates only its app
	// container (tanstack-start's #__app). The version opened the document's
	// output, so the parser kept it before <html>, or moved it into <head> when
	// head metadata was folded in before it.
	it.each(['document', 'head'] as const)(
		'lets an app container find the version in the served %s',
		async (where) => {
			const { html } = Server.renderToString(server.App, PROPS);
			container.innerHTML = html.slice(MARK.length);
			const main = container.querySelector('main');
			const recoverable: unknown[] = [];
			const hydrate = async () => {
				await act(async () => {
					root = hydrateRoot(container, client.App, PROPS, {
						onRecoverableError: (error) => recoverable.push(error),
					});
				});
			};
			const mark = document.createComment('3');
			if (where === 'head') document.head.append(mark);
			else document.insertBefore(mark, document.documentElement);
			try {
				await hydrate();
			} finally {
				mark.remove();
			}
			expect(container.querySelector('main')).toBe(main);
			expect(recoverable).toEqual([]);
		},
	);

	it('client-renders an app container whose document names no version', async () => {
		container.innerHTML = Server.renderToString(server.App, PROPS).html.slice(MARK.length);
		const main = container.querySelector('main');
		const recoverable: unknown[] = [];
		await act(async () => {
			root = hydrateRoot(container, client.App, PROPS, {
				onRecoverableError: (error) => recoverable.push(error),
			});
		});
		expect(container.querySelector('main')).not.toBe(main);
		expect(recoverable).toHaveLength(1);
	});

	it('rejects an incompatible root even when the document version matches', async () => {
		container.innerHTML = Server.renderToString(server.App, PROPS).html.replace(MARK, '<!--2-->');
		const main = container.querySelector('main');
		const recoverable: unknown[] = [];
		const documentMark = document.createComment('3');
		document.insertBefore(documentMark, document.documentElement);
		try {
			await act(async () => {
				root = hydrateRoot(container, client.App, PROPS, {
					onRecoverableError: (error) => recoverable.push(error),
				});
			});
			expect(container.querySelector('main')).not.toBe(main);
			expect(recoverable).toEqual([
				expect.objectContaining({ message: expect.stringContaining('hydration protocol') }),
			]);
		} finally {
			documentMark.remove();
		}
	});

	it.each([
		['an older server', ''],
		['a version 2 server', '<!--2-->'],
		['a newer server', '<!--4-->'],
	])(
		'client-renders a root without seeds that %s rendered, and reports it',
		async (_label, mark) => {
			container.innerHTML = Server.renderToString(server.App, PROPS).html.replace(MARK, mark);
			const main = container.querySelector('main');
			const recoverable: unknown[] = [];
			await act(async () => {
				root = hydrateRoot(container, client.App, PROPS, {
					onRecoverableError: (error) => recoverable.push(error),
				});
			});
			expect(container.querySelector('main')).not.toBe(main);
			expect(container.querySelector('main')!.textContent).toBe('listab');
			expect(container.querySelectorAll('main')).toHaveLength(1);
			expect(recoverable).toEqual([
				expect.objectContaining({ message: expect.stringContaining('hydration protocol') }),
			]);
		},
	);
});
