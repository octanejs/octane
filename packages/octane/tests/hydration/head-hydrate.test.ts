import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { compile } from 'octane/compiler';
import { hydrateRoot, flushSync, delegateEvents } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import {
	loadCompiledFixtureSource,
	loadServerFixture,
	type CompiledFixtureModule,
} from '../_server-fixture.js';
import { activateStreamedMarkup, deferred, resetStreamRuntimeGlobals } from '../_server-stream.js';
import { Page } from './_fixtures/head.tsrx';

// Hoisted document metadata (React-19 model): inline `<title>`/`<meta>` are
// routed out of the body, so the remaining single body root takes the
// single-root path (no <octane-frag>) and the metadata folds into render().html
// (server, via ssrHeadEl → folded into html) / document.head (client, via headBlock). On hydrateRoot,
// headBlock ADOPTS the server-rendered element (matched by its `<!--key-->`
// marker) rather than appending a duplicate, and removes it on unmount.

delegateEvents(['click']);

const FIXTURE = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/head.tsrx');
// octane/compiler/vite normalizes modules inside Vite's root to root-relative
// ids so client/server builds (and installed symlink layouts) hash the same
// logical module path. Mirror that id for this manually evaluated server copy.
const VITE_FILENAME = '/' + relative(process.cwd(), FIXTURE).split(sep).join('/');
// Compile with the SAME root-relative module id the client gets from the Vite
// plugin, so CSS and head ownership hashes match both sides.
const server = loadServerFixture(FIXTURE, { id: VITE_FILENAME });

interface OwnershipModule extends CompiledFixtureModule {
	Page: (props: { label: string }) => unknown;
}

interface StreamedHeadModule extends CompiledFixtureModule {
	Page: (props: { value: Promise<string> }) => unknown;
}

const OWNERSHIP_SOURCE = `
export function Page(props: { label: string }) @{
	<>
		<title>{props.label as string}</title>
		<main data-label={props.label}>{props.label as string}</main>
	</>
}
`;

const STREAMED_BOUNDARY_HEAD_SOURCE = `
import { use } from 'octane';

export function Page(props: { value: Promise<string> }) @{
	<section id="streamed-boundary-head">
		@try {
			<BoundaryContent value={props.value} />
		} @pending {
			<main data-state="pending">pending</main>
		}
	</section>
}

function BoundaryContent(props: { value: Promise<string> }) @{
	<>
		<title>streamed boundary title</title>
		<main data-state="ready">{use(props.value) as string}</main>
	</>
}
`;

function ownershipModule(id: string, mode: 'client' | 'server'): OwnershipModule {
	return loadCompiledFixtureSource<OwnershipModule>(OWNERSHIP_SOURCE, { id, mode });
}

function compilerHeadKey(source: string, id: string, mode: 'client' | 'server'): string {
	const { code } = compile(source, id, { mode });
	const match = code.match(/["'](rnh-[a-z0-9-]+)["']/);
	if (match === null) throw new Error(`No compiler-emitted head key in ${id} (${mode})`);
	return match[1];
}

let container: HTMLElement;
let extraContainers: HTMLElement[];
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
	extraContainers = [];
});
afterEach(() => {
	container.remove();
	for (const extra of extraContainers) extra.remove();
	// Reset the document head between tests (title + any adopted/mounted nodes).
	document.head.innerHTML = '';
	resetStreamRuntimeGlobals();
});

function appendRoot(
	serverPage: OwnershipModule['Page'],
	label: string,
	options?: ServerRT.RenderOptions,
): { container: HTMLElement; title: HTMLTitleElement } {
	const { html } = ServerRT.renderToString(serverPage, { label }, options);
	return appendRenderedRoot(html);
}

function appendRenderedRoot(html: string): {
	container: HTMLElement;
	title: HTMLTitleElement;
} {
	const target = document.createElement('div');
	document.body.appendChild(target);
	extraContainers.push(target);
	const bodyStart = html.indexOf('<main');
	if (bodyStart === -1) throw new Error('Expected ownership fixture body markup');
	document.head.insertAdjacentHTML('beforeend', html.slice(0, bodyStart));
	target.innerHTML = html.slice(bodyStart);
	const title = document.head.lastElementChild;
	if (!(title instanceof HTMLTitleElement))
		throw new Error('Expected server title in document.head');
	return { container: target, title };
}

function openingMarkerFor(title: HTMLTitleElement): Comment {
	const marker = title.previousSibling;
	if (!(marker instanceof Comment)) throw new Error('Expected title ownership opening marker');
	return marker;
}

function closingMarkerFor(title: HTMLTitleElement): Comment {
	const marker = title.nextSibling;
	if (!(marker instanceof Comment)) throw new Error('Expected title ownership closing marker');
	return marker;
}

describe('hoisted document metadata — compile', () => {
	it('client: single-root body template (no <octane-frag>) + headBlock', () => {
		const { code } = compile(readFileSync(FIXTURE, 'utf8'), 'head.tsrx', { mode: 'client' });
		expect(code).not.toContain('octane-frag');
		expect(code).toContain('headBlock(__s,');
		expect(code).toMatch(/import \{[^}]*\bheadBlock\b/);
	});

	it('server: ssrHeadEl with a key byte-identical to the client headBlock', () => {
		const { code: clientCode } = compile(readFileSync(FIXTURE, 'utf8'), 'head.tsrx', {
			mode: 'client',
		});
		const { code: serverCode } = compile(readFileSync(FIXTURE, 'utf8'), 'head.tsrx', {
			mode: 'server',
		});
		// The first head element is the <title>; its content key (3rd arg, after the
		// scope slot index) must match the server `ssrHeadEl` key across modes.
		const key = clientCode.match(/headBlock\(__s, \d+, ["'](rnh-[a-z0-9]+)["']/)?.[1];
		expect(key).toBeTruthy();
		expect(
			serverCode.includes(`ssrHeadEl("${key}"`) || serverCode.includes(`ssrHeadEl('${key}'`),
		).toBe(true);
	});

	it('emits fixed-size module/tag-aware keys with query-insensitive client/server parity', () => {
		const titleSource = `export function Page() @{ <title>same position</title> }`;
		const metaSource = `export function Page() @{ <meta content="same position" /> }`;
		const titleA = compilerHeadKey(titleSource, '/workspace/src/a.tsrx', 'client');
		const titleAServer = compilerHeadKey(titleSource, '/workspace/src/a.tsrx', 'server');
		const titleAQuery = compilerHeadKey(
			titleSource,
			'/workspace/src/a.tsrx?client=1#fragment',
			'client',
		);
		const titleB = compilerHeadKey(titleSource, '/workspace/src/b.tsrx', 'client');
		const metaA = compilerHeadKey(metaSource, '/workspace/src/a.tsrx', 'client');

		expect(titleA).toMatch(/^rnh-[0-9a-f]{8}$/);
		expect(titleAServer).toBe(titleA);
		expect(titleAQuery).toBe(titleA);
		expect(titleB).not.toBe(titleA);
		expect(metaA).not.toBe(titleA);
		expect(titleA).not.toContain('workspace');
	});
});

describe('hoisted document metadata — SSR', () => {
	it('folds the title and meta before a single-root body', () => {
		const { html, css } = ServerRT.renderToString(server.Page, { params: {} });
		expect(html).toContain('<title>TSRX Page</title>');
		expect(html).toContain('name="description"');
		expect(html).toContain('content="A test page"');
		// A body-only render has no <head> to splice into, so metadata folds to
		// the front while preserving the authored body as a single root.
		expect(html.indexOf('<title')).toBeLessThan(html.indexOf('<section'));
		// Body is the single <section>, NOT a <octane-frag> multi-root.
		expect(html).toContain('<section id="body"');
		expect(html).not.toContain('octane-frag');
		// The <style> still routes to CSS.
		expect(css).toContain('rebeccapurple');
	});

	it('keeps streamed head ownership byte-compatible with client hydration', async () => {
		const client = ownershipModule('/src/streamed-head.tsrx', 'client');
		const serverModule = ownershipModule('/src/streamed-head.tsrx', 'server');
		const stream = await ServerRT.renderToReadableStream(
			serverModule.Page,
			{ label: 'streamed' },
			{ identifierPrefix: 'stream-' },
		);
		const page = appendRenderedRoot(await new Response(stream).text());
		const root = hydrateRoot(
			page.container,
			client.Page,
			{ label: 'streamed' },
			{ identifierPrefix: 'stream-' },
		);
		flushSync(() => {});

		expect(document.head.querySelector('title')).toBe(page.title);
		expect(page.title.textContent).toBe('streamed');
		root.unmount();
		expect(page.title.isConnected).toBe(false);
	});

	it('uses the root namespace for a head entry emitted before a streamed boundary suspends', async () => {
		const client = loadCompiledFixtureSource<StreamedHeadModule>(STREAMED_BOUNDARY_HEAD_SOURCE, {
			id: '/src/streamed-boundary-head.tsrx',
			mode: 'client',
		});
		const serverModule = loadCompiledFixtureSource<StreamedHeadModule>(
			STREAMED_BOUNDARY_HEAD_SOURCE,
			{
				id: '/src/streamed-boundary-head.tsrx',
				mode: 'server',
			},
		);
		const value = deferred<string>();
		const stream = await ServerRT.renderToReadableStream(
			serverModule.Page,
			{ value: value.promise },
			{ identifierPrefix: 'stream-root-' },
		);
		const htmlPromise = new Response(stream).text();
		value.resolve('ready');
		const html = await htmlPromise;
		const bodyStart = html.indexOf('<section id="streamed-boundary-head"');
		if (bodyStart === -1) throw new Error('Expected authored streamed-boundary root');
		document.head.innerHTML = html.slice(0, bodyStart);
		container.innerHTML = html.slice(bodyStart);
		activateStreamedMarkup(container);
		const title = document.head.querySelector('title')!;
		const ready = container.querySelector('[data-state="ready"]');
		expect(ready?.textContent).toBe('ready');

		const root = hydrateRoot(
			container,
			client.Page,
			{ value: new Promise<string>(() => {}) },
			{ identifierPrefix: 'stream-root-' },
		);
		flushSync(() => {});

		expect(document.head.querySelector('title')).toBe(title);
		expect(document.head.querySelectorAll('title')).toHaveLength(1);
		expect(container.querySelector('[data-state="ready"]')).toBe(ready);
		root.unmount();
		expect(title.isConnected).toBe(false);
	});
});

describe('hoisted document metadata — hydration', () => {
	it('adopts the server head and single-root body, then removes owned nodes on unmount', () => {
		const { html } = ServerRT.renderToString(server.Page, { params: {} });
		// html folds head metadata to the front + body after. A document places the
		// head part in <head> and the body part in the app container — split there.
		const bodyStart = html.indexOf('<section');
		const head = html.slice(0, bodyStart);
		const body = html.slice(bodyStart);
		document.head.innerHTML = head;
		expect(document.head.querySelectorAll('title').length).toBe(1);
		expect(document.title).toBe('TSRX Page');

		container.innerHTML = body;
		const section = container.querySelector('#body') as HTMLElement;
		const btn = container.querySelector('#bump') as HTMLButtonElement;

		const root = hydrateRoot(container, Page, { params: {} });
		flushSync(() => {});

		// Head: title + meta ADOPTED without duplication.
		expect(document.title).toBe('TSRX Page');
		expect(document.head.querySelectorAll('title').length).toBe(1);
		expect(document.head.querySelectorAll('meta[name="description"]').length).toBe(1);

		// Body: single-root <section> ADOPTED (same node), no <octane-frag>, interactive.
		expect(container.querySelector('#body')).toBe(section);
		expect(container.querySelector('octane-frag')).toBeNull();
		flushSync(() => btn.click());
		expect(btn.textContent).toBe('n:1');

		// Lifecycle: unmounting the page removes its hoisted head elements.
		root.unmount();
		expect(document.head.querySelectorAll('title').length).toBe(0);
		expect(document.head.querySelectorAll('meta[name="description"]').length).toBe(0);
	});

	it.each([
		{
			form: 'TSRX template',
			id: '/src/inline-resource-events.tsrx',
			wrap: (element: string) =>
				`export function Page(props: Record<string, () => void>) @{ ${element} }`,
		},
		{
			form: 'TSX returned JSX',
			id: '/src/inline-resource-events.tsx',
			wrap: (element: string) =>
				`/** @jsxImportSource octane */\nfunction ResourcePage(props: Record<string, () => void>) { return (${element}); }\nexport const Page = ResourcePage;`,
		},
	])(
		'keeps $form resource handlers inline through server rendering and hydration',
		({ id, wrap }) => {
			interface ResourceModule extends CompiledFixtureModule {
				Page: (props: Record<string, () => void>) => unknown;
			}

			const source = wrap(`
<section onLoad={props.onAncestorLoad} onError={props.onAncestorError}>
	<link
		rel="stylesheet"
		href="/inline-resource.css"
		onLoad={props.onLoad}
		onError={props.onError}
	/>
	<span>hydrated resource</span>
</section>
`);
			const client = loadCompiledFixtureSource<ResourceModule>(source, { id, mode: 'client' });
			const serverModule = loadCompiledFixtureSource<ResourceModule>(source, {
				id,
				mode: 'server',
			});
			const calls: string[] = [];
			const props = {
				onLoad: () => calls.push('target:load'),
				onError: () => calls.push('target:error'),
				onAncestorLoad: () => calls.push('ancestor:load'),
				onAncestorError: () => calls.push('ancestor:error'),
			};
			const { html } = ServerRT.renderToString(serverModule.Page, props);
			expect(html).not.toMatch(/on(?:load|error)/i);
			container.innerHTML = html;
			const section = container.querySelector('section')!;
			const link = section.querySelector('link[href="/inline-resource.css"]')!;
			const span = section.querySelector('span')!;
			expect(link).not.toBeNull();
			expect(document.head.querySelector('link[href="/inline-resource.css"]')).toBeNull();

			const root = hydrateRoot(container, client.Page, props);
			flushSync(() => {});

			expect(container.querySelector('section')).toBe(section);
			expect(section.querySelector('link[href="/inline-resource.css"]')).toBe(link);
			expect(section.querySelector('span')).toBe(span);
			expect(document.head.querySelector('link[href="/inline-resource.css"]')).toBeNull();

			link.dispatchEvent(new Event('load', { bubbles: false }));
			link.dispatchEvent(new Event('error', { bubbles: false }));
			expect(calls).toEqual(['target:load', 'ancestor:load', 'target:error', 'ancestor:error']);
			root.unmount();
		},
	);

	it('adopts a server-rendered resource and keeps load/error handlers current through unmount', () => {
		interface ResourceModule extends CompiledFixtureModule {
			Page: (props: { handlers: Record<string, () => void> }) => unknown;
		}

		const source = `
export function Page(props: { handlers: Record<string, () => void> }) @{
	<>
		<link rel="stylesheet" href="/hydrated-resource.css" {...props.handlers} />
		<main>hydrated</main>
	</>
}
`;
		const id = '/src/hydrated-resource-events.tsrx';
		const client = loadCompiledFixtureSource<ResourceModule>(source, { id, mode: 'client' });
		const serverModule = loadCompiledFixtureSource<ResourceModule>(source, { id, mode: 'server' });
		const calls: string[] = [];
		const handlers = (version: string) => ({
			onLoad: () => calls.push(`${version}:load:bubble`),
			onLoadCapture: () => calls.push(`${version}:load:capture`),
			onError: () => calls.push(`${version}:error:bubble`),
			onErrorCapture: () => calls.push(`${version}:error:capture`),
		});
		const expected = (version: string) => [
			`${version}:load:capture`,
			`${version}:load:bubble`,
			`${version}:error:capture`,
			`${version}:error:bubble`,
		];
		const initial = handlers('initial');
		const { html } = ServerRT.renderToString(serverModule.Page, { handlers: initial });
		const bodyStart = html.indexOf('<main');
		if (bodyStart === -1) throw new Error('Expected hydrated resource body markup');
		document.head.innerHTML = html.slice(0, bodyStart);
		container.innerHTML = html.slice(bodyStart);
		const link = document.head.querySelector('link[href="/hydrated-resource.css"]')!;
		const body = container.querySelector('main')!;
		const dispatch = () => {
			link.dispatchEvent(new Event('load'));
			link.dispatchEvent(new Event('error'));
		};
		const root = hydrateRoot(container, client.Page, { handlers: initial });
		flushSync(() => {});

		expect(document.head.querySelector('link[href="/hydrated-resource.css"]')).toBe(link);
		expect(container.querySelector('main')).toBe(body);
		dispatch();
		expect(calls).toEqual(expected('initial'));

		flushSync(() => root.render(client.Page, { handlers: handlers('updated') }));
		dispatch();
		expect(calls).toEqual([...expected('initial'), ...expected('updated')]);

		flushSync(() => root.render(client.Page, { handlers: {} }));
		dispatch();
		expect(calls).toEqual([...expected('initial'), ...expected('updated')]);

		flushSync(() => root.render(client.Page, { handlers: handlers('retained') }));
		dispatch();
		const beforeUnmount = [...expected('initial'), ...expected('updated'), ...expected('retained')];
		expect(calls).toEqual(beforeUnmount);

		root.unmount();
		expect(link.isConnected).toBe(false);
		dispatch();
		expect(calls).toEqual(beforeUnmount);
	});

	it('skips an interposed foreign element and adopts the intended head element', () => {
		const { html } = ServerRT.renderToString(server.Page, { params: {} });
		const bodyStart = html.indexOf('<section');
		document.head.innerHTML = html.slice(0, bodyStart);
		container.innerHTML = html.slice(bodyStart);

		const title = document.head.querySelector('title')!;
		const meta = document.head.querySelector('meta[name="description"]')!;
		const foreign = document.createElement('script');
		foreign.type = 'application/json';
		foreign.textContent = '{"foreign":true}';
		// The title marker remains immediately before this foreign node. A head
		// claimant must validate the expected tag instead of owning the next element.
		document.head.insertBefore(foreign, title);

		const root = hydrateRoot(container, Page, { params: {} });
		flushSync(() => {});

		expect(foreign.isConnected).toBe(true);
		expect(foreign.textContent).toBe('{"foreign":true}');
		expect(document.head.querySelector('title')).toBe(title);
		expect(document.head.querySelector('meta[name="description"]')).toBe(meta);
		expect(document.head.querySelectorAll('title')).toHaveLength(1);
		expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);

		root.unmount();
		expect(foreign.isConnected).toBe(true);
		expect(title.isConnected).toBe(false);
		expect(meta.isConnected).toBe(false);
	});

	it('creates a missing expected head element without claiming a wrong-tag neighbor', () => {
		const { html } = ServerRT.renderToString(server.Page, { params: {} });
		const bodyStart = html.indexOf('<section');
		document.head.innerHTML = html.slice(0, bodyStart);
		container.innerHTML = html.slice(bodyStart);

		const missingTitle = document.head.querySelector('title')!;
		const meta = document.head.querySelector('meta[name="description"]')!;
		const foreign = document.createElement('script');
		foreign.type = 'application/json';
		foreign.textContent = '{"foreign":true}';
		document.head.insertBefore(foreign, missingTitle);
		missingTitle.remove();

		const root = hydrateRoot(container, Page, { params: {} });
		flushSync(() => {});

		const createdTitle = document.head.querySelector('title')!;
		expect(createdTitle).not.toBe(missingTitle);
		expect(createdTitle.textContent).toBe('TSRX Page');
		expect(document.head.querySelectorAll('title')).toHaveLength(1);
		expect(document.head.querySelector('meta[name="description"]')).toBe(meta);
		expect(foreign.isConnected).toBe(true);
		expect(foreign.textContent).toBe('{"foreign":true}');

		root.unmount();
		expect(createdTitle.isConnected).toBe(false);
		expect(meta.isConnected).toBe(false);
		expect(foreign.isConnected).toBe(true);
	});

	it('keeps cross-module same-tag ownership stable when roots hydrate out of order', () => {
		const clientA = ownershipModule('/src/head-a.tsrx', 'client');
		const serverA = ownershipModule('/src/head-a.tsrx', 'server');
		const clientB = ownershipModule('/src/head-b.tsrx', 'client');
		const serverB = ownershipModule('/src/head-b.tsrx', 'server');
		const a = appendRoot(serverA.Page, 'module-a');
		const b = appendRoot(serverB.Page, 'module-b');

		const rootB = hydrateRoot(b.container, clientB.Page, { label: 'module-b' });
		const rootA = hydrateRoot(a.container, clientA.Page, { label: 'module-a' });
		flushSync(() => {});

		expect(a.title.textContent).toBe('module-a');
		expect(b.title.textContent).toBe('module-b');
		expect(a.title.isConnected).toBe(true);
		expect(b.title.isConnected).toBe(true);

		rootB.unmount();
		expect(a.title.isConnected).toBe(true);
		expect(b.title.isConnected).toBe(false);
		rootA.unmount();
		expect(a.title.isConnected).toBe(false);
	});

	it('uses existing identifierPrefix semantics to isolate same-module sibling roots', () => {
		const client = ownershipModule('/src/repeated-head.tsrx', 'client');
		const serverModule = ownershipModule('/src/repeated-head.tsrx', 'server');
		// These distinct prefixes collide under the former single-lane djb2 hash.
		const a = appendRoot(serverModule.Page, 'root-a', { identifierPrefix: 'ar' });
		const b = appendRoot(serverModule.Page, 'root-b', { identifierPrefix: 'c0' });

		const rootB = hydrateRoot(
			b.container,
			client.Page,
			{ label: 'root-b' },
			{ identifierPrefix: 'c0' },
		);
		const rootA = hydrateRoot(
			a.container,
			client.Page,
			{ label: 'root-a' },
			{ identifierPrefix: 'ar' },
		);
		flushSync(() => {});

		expect(a.title.textContent).toBe('root-a');
		expect(b.title.textContent).toBe('root-b');
		rootB.unmount();
		expect(a.title.isConnected).toBe(true);
		expect(b.title.isConnected).toBe(false);
		rootA.unmount();
	});

	it.each(['opening', 'closing'])(
		'does not claim or delete a server title when its %s ownership marker is missing',
		(missing) => {
			const client = ownershipModule('/src/missing-marker.tsrx', 'client');
			const serverModule = ownershipModule('/src/missing-marker.tsrx', 'server');
			const page = appendRoot(serverModule.Page, 'server-title');
			(missing === 'opening'
				? openingMarkerFor(page.title)
				: closingMarkerFor(page.title)
			).remove();

			const root = hydrateRoot(page.container, client.Page, { label: 'client-title' });
			flushSync(() => {});

			const createdTitle = Array.from(document.head.querySelectorAll('title')).find(
				(title) => title !== page.title,
			);
			expect(createdTitle?.textContent).toBe('client-title');
			expect(page.title.textContent).toBe('server-title');
			expect(page.title.isConnected).toBe(true);

			root.unmount();
			expect(createdTitle?.isConnected).toBe(false);
			expect(page.title.isConnected).toBe(true);
		},
	);

	it('treats a duplicate ownership marker as ambiguous instead of claiming a server title', () => {
		const client = ownershipModule('/src/duplicate-marker.tsrx', 'client');
		const serverModule = ownershipModule('/src/duplicate-marker.tsrx', 'server');
		const page = appendRoot(serverModule.Page, 'server-title');
		const marker = openingMarkerFor(page.title);
		document.head.insertBefore(marker.cloneNode(), marker);

		const root = hydrateRoot(page.container, client.Page, { label: 'client-title' });
		flushSync(() => {});

		const createdTitle = Array.from(document.head.querySelectorAll('title')).find(
			(title) => title !== page.title,
		);
		expect(createdTitle?.textContent).toBe('client-title');
		expect(page.title.textContent).toBe('server-title');
		expect(page.title.isConnected).toBe(true);

		root.unmount();
		expect(createdTitle?.isConnected).toBe(false);
		expect(page.title.isConnected).toBe(true);
	});

	it('contains reordered ownership markers without cross-claiming same-tag server entries', () => {
		const clientA = ownershipModule('/src/reordered-a.tsrx', 'client');
		const serverA = ownershipModule('/src/reordered-a.tsrx', 'server');
		const clientB = ownershipModule('/src/reordered-b.tsrx', 'client');
		const serverB = ownershipModule('/src/reordered-b.tsrx', 'server');
		const a = appendRoot(serverA.Page, 'server-a');
		const b = appendRoot(serverB.Page, 'server-b');
		const markerA = openingMarkerFor(a.title);
		const markerB = openingMarkerFor(b.title);
		const markerAData = markerA.data;
		markerA.data = markerB.data;
		markerB.data = markerAData;

		const rootB = hydrateRoot(b.container, clientB.Page, { label: 'client-b' });
		const rootA = hydrateRoot(a.container, clientA.Page, { label: 'client-a' });
		flushSync(() => {});

		const createdTitles = Array.from(document.head.querySelectorAll('title')).filter(
			(title) => title !== a.title && title !== b.title,
		);
		expect(createdTitles.map((title) => title.textContent).sort()).toEqual([
			'client-a',
			'client-b',
		]);
		expect(a.title.textContent).toBe('server-a');
		expect(b.title.textContent).toBe('server-b');
		expect(a.title.isConnected).toBe(true);
		expect(b.title.isConnected).toBe(true);

		rootB.unmount();
		rootA.unmount();
		expect(createdTitles.every((title) => !title.isConnected)).toBe(true);
		expect(a.title.isConnected).toBe(true);
		expect(b.title.isConnected).toBe(true);
	});
});
