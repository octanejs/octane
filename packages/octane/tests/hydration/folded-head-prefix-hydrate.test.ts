// A body-only render folds its hoisted metadata AHEAD of the body markup (the
// default `headChannel: 'fold'`, React 19's resource-hoisting shape), so the
// obvious host, `container.innerHTML = html`, hands hydrateRoot a container
// that begins with `<!--rnh-…--><title>…</title><!--/rnh-…-->`. React 19 adopts
// that container cleanly. Octane used to claim the body root against the
// leading ownership comment, report a recoverable mismatch, and rebuild the
// whole root, whether or not the hoisted element carried a spread.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hydrateRoot, flushSync, resetFloatResourceState } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, type CompiledFixtureModule } from '../_server-fixture.js';
import { activateStreamedMarkup, deferred, resetStreamRuntimeGlobals } from '../_server-stream.js';

interface TitleModule extends CompiledFixtureModule {
	Title: (props: { a: string; rest: Record<string, unknown> }) => unknown;
}

interface PageModule extends CompiledFixtureModule {
	Page: (props: { label: string }) => unknown;
}

interface StreamedModule extends CompiledFixtureModule {
	Streamed: (props: {
		a: string;
		rest: Record<string, unknown>;
		value: Promise<string>;
	}) => unknown;
}

const TITLE_SOURCES = {
	spread: `
export function Title(props: any) @{
	<div><title {...props.rest}>{props.a}</title></div>
}
`,
	plain: `
export function Title(props: any) @{
	<div><title>{props.a}</title></div>
}
`,
};

const PAGE_SOURCE = `
export function Page(props: { label: string }) @{
	<main class="page">
		<meta name="viewport" content="width=device-width" />
		<link rel="stylesheet" href="/folded-prefix.css" precedence="default" />
		<title>{props.label as string}</title>
		<meta name="description" content={props.label} />
		<p class="label">{props.label as string}</p>
		<style>
			.label { color: red; }
		</style>
	</main>
}
`;

const STREAMED_SOURCE = `
import { use } from 'octane';

export function Streamed(props: any) @{
	<div>
		<title {...props.rest}>{props.a}</title>
		@try {
			<Resolved value={props.value} />
		} @pending {
			<i>pending</i>
		}
	</div>
}

function Resolved(props: { value: Promise<string> }) @{
	<b>{use(props.value)}</b>
}
`;

function load<T extends CompiledFixtureModule>(
	source: string,
	id: string,
	mode: 'client' | 'server',
	dev: boolean,
): T {
	return loadCompiledFixtureSource<T>(source, { id, mode, compileOptions: { dev } });
}

let container: HTMLElement;
let errSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
	errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
	errSpy.mockRestore();
	container.remove();
	document.head.innerHTML = '';
	resetFloatResourceState();
	resetStreamRuntimeGlobals();
});

// onRecoverableError is queued in a microtask; a macrotask boundary drains it.
async function settleRecoverable(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('hydrateRoot of a folded body-only render (head prefix in the container)', () => {
	for (const [form, source] of Object.entries(TITLE_SOURCES)) {
		for (const dev of [true, false]) {
			it(`adopts <div><title${form === 'spread' ? ' {...rest}' : ''}> with identical props (dev compile: ${dev})`, async () => {
				const id = `folded-title-${form}.tsrx`;
				const server = load<TitleModule>(source, id, 'server', dev);
				const client = load<TitleModule>(source, id, 'client', dev);
				const props = { a: 'Alpha', rest: {} };
				const { html } = ServerRT.renderToString(server.Title, props);
				container.innerHTML = html;
				const serverDiv = container.querySelector('div')!;
				const serverTitle = container.querySelector('title')!;
				// The fold prepends the hoisted title ahead of the body root.
				expect(serverTitle.compareDocumentPosition(serverDiv)).toBe(
					Node.DOCUMENT_POSITION_FOLLOWING,
				);

				const onRecoverableError = vi.fn();
				const root = hydrateRoot(container, client.Title, props, { onRecoverableError });
				flushSync(() => {});
				await settleRecoverable();

				expect(onRecoverableError).not.toHaveBeenCalled();
				expect(errSpy).not.toHaveBeenCalled();
				// The body root and the hoisted title are both ADOPTED, not rebuilt. The
				// title now lives where a client render and a split-head host put it.
				expect(container.querySelector('div')).toBe(serverDiv);
				expect(document.head.querySelector('title')).toBe(serverTitle);
				expect(container.innerHTML).toBe('<div></div>');
				expect(document.querySelectorAll('title')).toHaveLength(1);

				flushSync(() => root.render(client.Title, { a: 'Beta', rest: {} }));
				expect(serverTitle.textContent).toBe('Beta');
				expect(container.querySelector('div')).toBe(serverDiv);
				root.unmount();
				expect(document.querySelector('title')).toBeNull();
			});
		}
	}

	it('adopts every folded entry, keeps the Float sheet in place, and skips leading scoped CSS', async () => {
		const id = 'folded-page.tsrx';
		const server = load<PageModule>(PAGE_SOURCE, id, 'server', true);
		const client = load<PageModule>(PAGE_SOURCE, id, 'client', true);
		const { html, css } = ServerRT.renderToString(server.Page, { label: 'Folded' });
		expect(css).toContain('data-octane');
		// Hosts commonly place the scoped CSS ahead of the markup.
		container.innerHTML = css + html;
		const serverMain = container.querySelector('main')!;
		const serverLabel = container.querySelector('p.label')!;
		const serverTitle = container.querySelector('title')!;
		const serverViewport = container.querySelector('meta[name="viewport"]')!;
		const serverDescription = container.querySelector('meta[name="description"]')!;
		const serverSheet = container.querySelector('link[href="/folded-prefix.css"]')!;
		expect(serverSheet.getAttribute('data-precedence')).toBe('default');
		expect(container.firstElementChild!.localName).toBe('style');

		const onRecoverableError = vi.fn();
		const root = hydrateRoot(container, client.Page, { label: 'Folded' }, { onRecoverableError });
		flushSync(() => {});
		await settleRecoverable();

		expect(onRecoverableError).not.toHaveBeenCalled();
		expect(errSpy).not.toHaveBeenCalled();
		expect(container.querySelector('main')).toBe(serverMain);
		expect(container.querySelector('p.label')).toBe(serverLabel);
		expect(document.head.querySelector('title')).toBe(serverTitle);
		expect(document.head.querySelector('meta[name="viewport"]')).toBe(serverViewport);
		expect(document.head.querySelector('meta[name="description"]')).toBe(serverDescription);
		expect(container.querySelector('title, meta')).toBeNull();
		// A Float resource is global and deduped document-wide: it is neither moved
		// nor duplicated.
		expect(document.querySelectorAll('link[href="/folded-prefix.css"]')).toHaveLength(1);
		expect(container.querySelector('link[href="/folded-prefix.css"]')).toBe(serverSheet);
		expect(container.querySelector('style[data-octane]')).not.toBeNull();

		flushSync(() => root.render(client.Page, { label: 'Updated' }));
		expect(serverTitle.textContent).toBe('Updated');
		expect(serverDescription.getAttribute('content')).toBe('Updated');
		expect(serverLabel.textContent).toBe('Updated');
		root.unmount();
		expect(document.querySelector('title, meta[name="description"]')).toBeNull();
	});

	// A root that falls back clears its element container, the folded Float
	// sheet included, and since the sheet stays counted, the client render does
	// not insert it again. React 19 does the same (react-dom 19.2.7 probe, dev
	// and prod: no stylesheet link remains in the document). The renderer's
	// scoped-CSS sidecar stays, styling the client tree.
	for (const dev of [true, false]) {
		it(`discards the folded Float sheet with the server DOM of a root that falls back, as React does (dev compile: ${dev})`, async () => {
			const id = 'folded-page-fallback.tsrx';
			const server = load<PageModule>(PAGE_SOURCE, id, 'server', dev);
			const client = load<PageModule>(PAGE_SOURCE, id, 'client', dev);
			const { html, css } = ServerRT.renderToString(server.Page, { label: 'Server' });
			container.innerHTML = css + html;
			const serverMain = container.querySelector('main')!;
			const serverSheet = container.querySelector('link[href="/folded-prefix.css"]')!;
			const sidecar = container.querySelector('style[data-octane]')!;

			const onRecoverableError = vi.fn();
			const root = hydrateRoot(container, client.Page, { label: 'Client' }, { onRecoverableError });
			flushSync(() => {});
			await settleRecoverable();

			expect(onRecoverableError).toHaveBeenCalledTimes(1);
			expect(serverMain.isConnected).toBe(false);
			expect(container.querySelector('p.label')!.textContent).toBe('Client');
			expect(serverSheet.isConnected).toBe(false);
			expect(document.querySelector('link[href="/folded-prefix.css"]')).toBeNull();
			expect(sidecar.isConnected).toBe(true);
			root.unmount();
		});
	}

	it('adopts a streamed shell whose folded prefix precedes a resolved boundary', async () => {
		const id = 'folded-streamed.tsrx';
		const server = load<StreamedModule>(STREAMED_SOURCE, id, 'server', true);
		const client = load<StreamedModule>(STREAMED_SOURCE, id, 'client', true);
		const value = deferred<string>();
		const stream = await ServerRT.renderToReadableStream(server.Streamed, {
			a: 'Alpha',
			rest: {},
			value: value.promise,
		});
		const htmlPromise = new Response(stream).text();
		value.resolve('ready');
		const html = await htmlPromise;
		container.innerHTML = html;
		activateStreamedMarkup(container);
		const serverDiv = container.querySelector('div')!;
		const serverResolved = container.querySelector('b')!;
		const serverTitle = container.querySelector('title')!;
		expect(serverResolved.textContent).toBe('ready');
		// The streamed shell also leads with the folded title.
		expect(container.firstElementChild).toBe(serverTitle);

		const onRecoverableError = vi.fn();
		const root = hydrateRoot(
			container,
			client.Streamed,
			{ a: 'Alpha', rest: {}, value: Promise.resolve('ready') },
			{ onRecoverableError },
		);
		flushSync(() => {});
		await settleRecoverable();

		expect(onRecoverableError).not.toHaveBeenCalled();
		expect(errSpy).not.toHaveBeenCalled();
		expect(container.querySelector('div')).toBe(serverDiv);
		expect(container.querySelector('b')).toBe(serverResolved);
		expect(document.head.querySelector('title')).toBe(serverTitle);
		expect(container.querySelector('title')).toBeNull();
		root.unmount();
	});
});
