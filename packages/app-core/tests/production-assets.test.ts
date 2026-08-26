// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { OCTANE_NONCE_STATE_KEY } from '../src/constants.js';
import { RenderRoute } from '../src/routes.js';
import { createHandler } from '../src/server/production.js';

type ServerManifest = Parameters<typeof createHandler>[0];
type HandlerOptions = Parameters<typeof createHandler>[1];
type RenderMode = NonNullable<ServerManifest['render']>;
type Body = (props: Record<string, any>, scope?: unknown) => string;

const PENDING = Symbol('pending render');
const TEMPLATE = `<!doctype html>
<html><head><base href="/docs/"><!--ssr-head--></head><body><div id="root"><!--ssr-body--></div>
<script type="module" data-octane-hydrate src="/assets/hydrate.js"></script></body></html>`;

function streamOf(text: string): ReadableStream<Uint8Array> {
	return new ReadableStream({
		start(controller) {
			controller.enqueue(new TextEncoder().encode(text));
			controller.close();
		},
	});
}

function Page(props: { params: Record<string, string> }) {
	if (props.params.phase === 'pending') throw PENDING;
	if (props.params.phase === 'error') throw new Error('route failed');
	return '<main class="page">page</main>';
}

function Layout(props: { children: Body }, scope?: unknown) {
	return (
		'<section class="layout"><button class="layout-island">island</button>' +
		props.children({}, scope) +
		'</section>'
	);
}

const Pending = () => '<p class="pending">pending</p>';
const Catch = () => '<p class="catch">caught</p>';
const Other = () => '<main class="other">other</main>';

// These renderer stubs exercise app-core's real route/boundary composition and
// HTML assembly. Compiler-generated Hydrate assets are covered by the bundler
// integration tests; their already-resolved CSS belongs in the same asset map.
const renderOptions: HandlerOptions = {
	htmlTemplate: TEMPLATE,
	prerender: async (component) => ({ html: component({}, undefined), css: '' }),
	renderToReadableStream: async (component) => streamOf(component({}, undefined)),
	executeServerFunction: async () => '',
	createElement:
		(component: Body, props: Record<string, any>) => (_props: unknown, scope?: unknown) =>
			component(props, scope),
	Suspense(props, scope) {
		try {
			return props.children({}, scope);
		} catch (error) {
			if (error !== PENDING) throw error;
			return props.fallback({}, scope);
		}
	},
	ErrorBoundary(props, scope) {
		try {
			return props.children({}, scope);
		} catch (error) {
			if (error === PENDING) throw error;
			return props.fallback(error, () => {})({}, scope);
		}
	},
};

function makeManifest(render: RenderMode): ServerManifest {
	return {
		routes: [
			new RenderRoute({
				path: '/selected/:phase',
				entry: ['Page', '/src/Page.tsrx'],
				layout: '/src/Layout.tsrx',
			}),
			new RenderRoute({ path: '/other', entry: ['Other', '/src/Other.tsrx'] }),
		],
		components: {
			'/src/Page.tsrx': { Page },
			'/src/Other.tsrx': { Other },
		},
		layouts: { '/src/Layout.tsrx': { Layout } },
		middlewares: [
			(context, next) => {
				context.state.set(OCTANE_NONCE_STATE_KEY, 'asset-nonce');
				return next();
			},
		],
		render,
		rootBoundary: { pending: Pending, catch: Catch },
		rootBoundaryEntries: {
			pending: { path: '/src/Pending.tsrx', exportName: null },
			catch: { path: '/src/Catch.tsrx', exportName: null },
		},
		clientAssets: {
			'/src/Page.tsrx': {
				js: 'assets/page.js',
				css: ['assets/shared.css', 'assets/page.css', 'assets/page-island.css'],
			},
			'/src/Layout.tsrx': {
				js: 'assets/layout.js',
				css: ['assets/shared.css', 'assets/layout.css', 'assets/layout-island.css'],
			},
			'/src/Pending.tsrx': {
				js: 'assets/pending.js',
				css: ['assets/shared.css', 'assets/pending.css'],
			},
			'/src/Catch.tsrx': {
				js: 'assets/catch.js',
				css: ['assets/shared.css', 'assets/catch.css'],
			},
			'/src/Other.tsrx': { js: 'assets/other.js', css: ['assets/other.css'] },
		},
	};
}

function assetHrefs(html: string, rel: 'stylesheet' | 'modulepreload') {
	const head = html.slice(0, html.indexOf('</head>'));
	return [...head.matchAll(/<link\b[^>]*>/g)]
		.filter(([tag]) => tag.match(/\brel="([^"]*)"/)?.[1] === rel)
		.map(([tag]) => tag.match(/\bhref="([^"]*)"/)?.[1]);
}

describe.each(['buffered', 'streaming'] as const)('%s production route assets', (render) => {
	it.each([
		['ready', 'class="layout-island"'],
		['pending', 'class="pending"'],
		['error', 'class="catch"'],
	])('styles the %s response before client hydration', async (phase, content) => {
		const handler = createHandler(makeManifest(render), renderOptions);
		const response = await handler(new Request(`https://octane.test/selected/${phase}`));
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain(content);
		expect(assetHrefs(html, 'stylesheet')).toEqual([
			'/assets/shared.css',
			'/assets/page.css',
			'/assets/page-island.css',
			'/assets/layout.css',
			'/assets/layout-island.css',
			'/assets/pending.css',
			'/assets/catch.css',
		]);
		// CSS is needed by inert server HTML; only the already-eager page JS gets
		// a preload. Neither layout/boundary nor deferred island JS is promoted.
		expect(assetHrefs(html, 'modulepreload')).toEqual(['/assets/page.js']);
		expect(html).toContain('<base href="/docs/">');
		expect(html).toContain(
			'<script id="__octane_data" type="application/json" nonce="asset-nonce">',
		);
		expect(html).toMatch(/<script(?=[^>]*data-octane-hydrate)(?=[^>]*nonce="asset-nonce")[^>]*>/);
	});

	it('keeps matched page assets isolated across concurrent and subsequent requests', async () => {
		const handler = createHandler(makeManifest(render), renderOptions);
		const selectedRequest = new Request('https://octane.test/selected/ready');
		const [firstSelectedResponse, otherResponse] = await Promise.all([
			handler(selectedRequest),
			handler(new Request('https://octane.test/other')),
		]);
		const [firstSelected, other] = await Promise.all([
			firstSelectedResponse.text(),
			otherResponse.text(),
		]);
		const secondSelected = await (await handler(selectedRequest)).text();

		expect(otherResponse.status).toBe(200);
		expect(other).toContain('class="other"');
		expect(assetHrefs(other, 'stylesheet')).toEqual([
			'/assets/other.css',
			'/assets/shared.css',
			'/assets/pending.css',
			'/assets/catch.css',
		]);
		expect(assetHrefs(other, 'modulepreload')).toEqual(['/assets/other.js']);
		expect(assetHrefs(secondSelected, 'stylesheet')).toEqual(
			assetHrefs(firstSelected, 'stylesheet'),
		);
		expect(assetHrefs(secondSelected, 'modulepreload')).toEqual(
			assetHrefs(firstSelected, 'modulepreload'),
		);
	});

	it('keeps layout and boundary CSS when the page has no asset record', async () => {
		const manifest = makeManifest(render);
		delete manifest.clientAssets!['/src/Page.tsrx'];
		const handler = createHandler(manifest, renderOptions);
		const response = await handler(new Request('https://octane.test/selected/ready'));
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(assetHrefs(html, 'stylesheet')).toEqual([
			'/assets/shared.css',
			'/assets/layout.css',
			'/assets/layout-island.css',
			'/assets/pending.css',
			'/assets/catch.css',
		]);
		expect(assetHrefs(html, 'modulepreload')).toEqual([]);
	});

	it('ignores missing asset maps and boundaries that do not wrap the route', async () => {
		const manifest = makeManifest(render);
		manifest.rootBoundary = {};
		const handler = createHandler(manifest, renderOptions);
		const html = await (await handler(new Request('https://octane.test/other'))).text();
		expect(assetHrefs(html, 'stylesheet')).toEqual(['/assets/other.css']);

		delete manifest.clientAssets;
		const withoutAssets = createHandler(manifest, renderOptions);
		const unstyled = await (await withoutAssets(new Request('https://octane.test/other'))).text();
		expect(assetHrefs(unstyled, 'stylesheet')).toEqual([]);
		expect(assetHrefs(unstyled, 'modulepreload')).toEqual([]);
	});
});
