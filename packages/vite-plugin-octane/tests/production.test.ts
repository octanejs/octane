// Production SSR build — end-to-end over the fixture app (tests/_fixtures/app):
// `vite build` must produce BOTH bundles (dist/client assets + the
// self-contained dist/server/entry.js), and the server bundle's handler must
// render a route with hydratable output whose body region and #__octane_data
// payload BYTE-MATCH dev SSR for the same request — that is the contract that
// lets hydrateRoot adopt production responses exactly like dev ones.
//
// The fixture has no installed node_modules (it is not a workspace package);
// the setup symlinks the workspace's octane / @octanejs/vite-plugin / vite in,
// which is exactly what a pnpm install would produce.
//
// The build runs against a throwaway copy of the fixture, never the tracked
// sources: `vite build` and the symlinked node_modules would otherwise leave
// debris under `tests/_fixtures/app` whenever a run is interrupted, and two
// concurrent runs would build into the same directory.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { EventEmitter, once } from 'node:events';
import { createServer as createHttpServer, type IncomingMessage, type Server } from 'node:http';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build, createServer, type ViteDevServer } from 'vite';
import { createTempProject } from '../../octane/tests/_temp-project.js';
import { createNodeServer } from '../../app-core/src/server/node-http.js';

const fixtureSource = fileURLToPath(new URL('./_fixtures/app', import.meta.url));
const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const repoRoot = path.resolve(packageRoot, '../..');
const project = createTempProject('octane-vite-prod');
const fixtureRoot = project.root;
const distDir = path.join(fixtureRoot, 'dist');
const sceneFile = path.join(fixtureRoot, 'src/Scene.object.tsrx');
const clientReferenceId = 'octane-client-reference-v1:object:/src/Scene.object.tsrx';

function linkPackage(name: string, target: string) {
	const dest = path.join(fixtureRoot, 'node_modules', name);
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	fs.rmSync(dest, { recursive: true, force: true });
	fs.symlinkSync(target, dest, 'dir');
}

/** The authored root HTML, preserving its original bytes and hydration markers. */
function bodyRegionOf(html: string): string {
	const dom = new JSDOM(html, { includeNodeLocations: true });
	try {
		const root = dom.window.document.getElementById('root');
		expect(root).not.toBeNull();
		expect(root!.firstChild).not.toBeNull();
		const start = dom.nodeLocation(root!.firstChild!)!.startOffset;
		const end = dom.nodeLocation(root!.lastChild!)!.endOffset;
		let body = html.slice(start, end);
		// hydrateRoot removes only direct renderer transport scripts before
		// adoption. Their presence depends on the build's early-hydration
		// capability; browser and CSP tests exercise their execution separately.
		for (const child of Array.from(root!.children).reverse()) {
			if (child.localName !== 'script' || !child.hasAttribute('data-octane-stream')) continue;
			const script = dom.nodeLocation(child)!;
			body = body.slice(0, script.startOffset - start) + body.slice(script.endOffset - start);
		}
		return body;
	} finally {
		dom.window.close();
	}
}

function dataScriptOf(html: string): string {
	const match = html.match(
		/<script id="__octane_data" type="application\/json"[^>]*>(.*?)<\/script>/s,
	);
	expect(match).not.toBeNull();
	return match![1];
}

function listFiles(root: string, current = root): string[] {
	return fs.readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
		const file = path.join(current, entry.name);
		return entry.isDirectory() ? listFiles(root, file) : [path.relative(root, file)];
	});
}

function findBuiltAsset(root: string, extension: '.css' | '.js', contents: string) {
	return listFiles(root).find(
		(file) =>
			file.endsWith(extension) && fs.readFileSync(path.join(root, file), 'utf8').includes(contents),
	);
}

async function startBrowserProbeOrigin(): Promise<{ server: Server; origin: string }> {
	const server = createHttpServer((_request, response) => {
		response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
		response.end('<!doctype html><html><body>RPC CORS probe</body></html>');
	});
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	const address = server.address();
	if (!address || typeof address !== 'object') {
		throw new Error('browser probe server has no address');
	}
	return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function closeNodeServer(server: Server | null): Promise<void> {
	if (server === null) return;
	await new Promise<void>((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()));
	});
}

let devServer: ViteDevServer | null = null;
let devOrigin = '';
let productionServer: Server | null = null;
let productionOrigin = '';
let trustedBrowserOriginServer: Server | null = null;
let trustedBrowserOrigin = '';
let hostileBrowserOriginServer: Server | null = null;
let hostileBrowserOrigin = '';
const previousTrustedRpcOrigin = process.env.OCTANE_TEST_TRUSTED_RPC_ORIGIN;

beforeAll(async () => {
	fs.cpSync(fixtureSource, fixtureRoot, { recursive: true });
	linkPackage('octane', path.join(repoRoot, 'packages/octane'));
	linkPackage('@octanejs/vite-plugin', packageRoot);
	linkPackage('vite', path.join(packageRoot, 'node_modules/vite'));

	const trustedProbe = await startBrowserProbeOrigin();
	trustedBrowserOriginServer = trustedProbe.server;
	trustedBrowserOrigin = trustedProbe.origin;
	const hostileProbe = await startBrowserProbeOrigin();
	hostileBrowserOriginServer = hostileProbe.server;
	hostileBrowserOrigin = hostileProbe.origin;
	process.env.OCTANE_TEST_TRUSTED_RPC_ORIGIN = trustedBrowserOrigin;

	// The production build: client bundle, then (closeBundle) the server bundle.
	await build({ root: fixtureRoot, logLevel: 'silent' });

	// A dev server on a random port — the byte-compat oracle.
	devServer = await createServer({
		root: fixtureRoot,
		logLevel: 'silent',
		server: { cors: false, host: '127.0.0.1', port: 0 },
	});
	await devServer.listen();
	const address = devServer.httpServer?.address();
	if (!address || typeof address !== 'object') throw new Error('dev server has no address');
	devOrigin = `http://127.0.0.1:${address.port}`;

	const { handler } = await import(pathToFileURL(path.join(distDir, 'server/entry.js')).href);
	productionServer = createNodeServer(handler, {
		staticDir: path.join(distDir, 'client'),
	}).listen(0);
	await once(productionServer, 'listening');
	const productionAddress = productionServer.address();
	if (!productionAddress || typeof productionAddress !== 'object') {
		throw new Error('production server has no address');
	}
	productionOrigin = `http://127.0.0.1:${productionAddress.port}`;
}, 180_000);

afterAll(async () => {
	await closeNodeServer(productionServer);
	await devServer?.close();
	await closeNodeServer(trustedBrowserOriginServer);
	await closeNodeServer(hostileBrowserOriginServer);
	if (previousTrustedRpcOrigin === undefined) {
		delete process.env.OCTANE_TEST_TRUSTED_RPC_ORIGIN;
	} else {
		process.env.OCTANE_TEST_TRUSTED_RPC_ORIGIN = previousTrustedRpcOrigin;
	}
	project.dispose();
});

// Dynamic-importing freshly built output legitimately exceeds vitest's 5s
// default when the whole suite runs in parallel (module-graph load competes
// with sibling projects for I/O); the generous budget only matters under
// contention — these tests finish in well under a second on an idle machine.
describe('production SSR build', { timeout: 30_000 }, () => {
	it('emits both bundles, moves the template to dist/server, and strips build metadata', () => {
		expect(fs.existsSync(path.join(distDir, 'server/entry.js'))).toBe(true);
		expect(fs.existsSync(path.join(distDir, 'server/index.html'))).toBe(true);
		expect(
			JSON.parse(fs.readFileSync(path.join(distDir, 'server/octane-client-build.json'), 'utf-8')),
		).toMatchObject({
			version: 1,
			buildId: expect.any(String),
			mode: 'production',
		});
		expect(fs.existsSync(path.join(distDir, 'client/octane-client-build.json'))).toBe(false);
		// The template must NOT stay in the static dir (it would shadow SSR at '/'
		// on filesystem-first hosts) and the manifest must not ship.
		expect(fs.existsSync(path.join(distDir, 'client/index.html'))).toBe(false);
		expect(fs.existsSync(path.join(distDir, 'client/.vite'))).toBe(false);
		// The client build produced hashed assets, including the hydrate entry
		// referenced by the moved template.
		const template = fs.readFileSync(path.join(distDir, 'server/index.html'), 'utf-8');
		const scriptSrc = template.match(/<script type="module"[^>]*src="(\/assets\/[^"]+)"/)?.[1];
		expect(scriptSrc).toBeTruthy();
		expect(fs.existsSync(path.join(distDir, 'client', scriptSrc!))).toBe(true);
		// The SSR placeholders survived the client build untouched.
		expect(template).toContain('<!--ssr-head-->');
		expect(template).toContain('<!--ssr-body-->');
	});

	it('the server bundle is self-contained (imports only node builtins)', () => {
		const entry = fs.readFileSync(path.join(distDir, 'server/entry.js'), 'utf-8');
		// The server build is intentionally unminified by default. Its explicit
		// production define must still let Rollup erase the generated DEV table.
		expect(entry).not.toContain('process.env.NODE_ENV');
		expect(entry).not.toContain('octane SSR: pipe() may only be called once.');
		expect(entry).toContain('https://octanejs.dev/errors/');
		const specifiers = [...entry.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
		expect(specifiers.length).toBeGreaterThan(0);
		for (const spec of specifiers) {
			expect(spec.startsWith('node:'), `unexpected external import: ${spec}`).toBe(true);
		}
	});

	it('maps the server-stub client reference to its emitted browser chunk', async () => {
		const manifestPath = path.join(distDir, 'client/octane-client-references.json');
		const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
		const reference = manifest.references[clientReferenceId];
		expect(manifest.version).toBe(1);
		expect(reference).toEqual({
			moduleId: '/src/Scene.object.tsrx',
			renderer: 'object',
			chunks: [...reference.chunks].sort(),
		});
		expect(reference.chunks.length).toBeGreaterThan(0);
		for (const chunk of reference.chunks) {
			expect(fs.existsSync(path.join(distDir, 'client', chunk))).toBe(true);
		}

		await fetch(devOrigin + '/');
		const graph = devServer!.environments.ssr.moduleGraph;
		const sceneModules = [...(graph.getModulesByFile(sceneFile) ?? [])];
		const stubReference = sceneModules
			.map(
				(module) =>
					module.info?.meta?.['octane:client-reference'] ??
					module.meta?.['octane:client-reference'],
			)
			.find((value) => value?.id === clientReferenceId);
		expect(stubReference).toEqual({
			id: clientReferenceId,
			moduleId: reference.moduleId,
			renderer: reference.renderer,
		});
		expect((globalThis as any).__fixtureAuthoredSceneSetup).toBeUndefined();
	});

	it('renders a route through the built handler, byte-matching dev SSR', async () => {
		const { handler } = await import(pathToFileURL(path.join(distDir, 'server/entry.js')).href);
		const clientRoot = path.join(distDir, 'client');
		const deferredCss = listFiles(clientRoot).find(
			(file) =>
				file.endsWith('.css') &&
				fs
					.readFileSync(path.join(clientRoot, file), 'utf8')
					.includes('.vite-deferred-hydration-proof'),
		);
		const deferredJavaScript = listFiles(clientRoot).find(
			(file) =>
				file.endsWith('.js') &&
				fs
					.readFileSync(path.join(clientRoot, file), 'utf8')
					.includes('vite-deferred-hydration-chunk-proof'),
		);
		const prefetchedJavaScript = listFiles(clientRoot).find(
			(file) =>
				file.endsWith('.js') &&
				fs
					.readFileSync(path.join(clientRoot, file), 'utf8')
					.includes('vite-prefetched-hydration-chunk-proof'),
		);
		expect(deferredCss).toBeTruthy();
		expect(deferredJavaScript).toBeTruthy();
		expect(prefetchedJavaScript).toBeTruthy();

		for (const url of ['/', '/pages/hello']) {
			const prodResponse = await handler(new Request(`http://localhost${url}`));
			expect(prodResponse.status).toBe(200);
			expect(prodResponse.headers.get('content-type')).toBe('text/html; charset=utf-8');
			const prodHtml = await prodResponse.text();

			const devResponse = await fetch(`${devOrigin}${url}`);
			expect(devResponse.status).toBe(200);
			const devHtml = await devResponse.text();

			// Hydratable content and route data agree; deployment identity and the
			// per-response document identity necessarily differ between servers.
			expect(bodyRegionOf(prodHtml)).toBe(bodyRegionOf(devHtml));
			const {
				clientBuild: productionBuild,
				streamedSignals: productionSignals,
				...productionData
			} = JSON.parse(dataScriptOf(prodHtml));
			const {
				clientBuild: developmentBuild,
				streamedSignals: developmentSignals,
				...developmentData
			} = JSON.parse(dataScriptOf(devHtml));
			expect(productionData).toEqual(developmentData);
			expect(productionBuild).toEqual(
				JSON.parse(fs.readFileSync(path.join(distDir, 'server/octane-client-build.json'), 'utf-8')),
			);
			expect(productionSignals.buildId).toBe(productionBuild.buildId);
			expect(developmentBuild.mode).toBe('development');
			expect(developmentSignals.buildId).toBe(developmentBuild.buildId);
			expect(productionSignals.documentId).not.toBe(developmentSignals.documentId);

			// Sanity: it actually rendered the page.
			expect(prodHtml).toContain('fixture-nav');
			expect(prodHtml).toContain(url === '/' ? 'Fixture page home' : 'Fixture page hello');
			expect(prodHtml).toContain(`<p class="url">${url}</p>`);
			// GuardedConst is imported extensionlessly from a .tsrx module. Reaching
			// its rendered output proves both dev and production SSR resolved that edge.
			expect(prodHtml).toContain('class="vite-guarded-const"');
			expect(prodHtml).toContain('vite-guarded-const-proof');
			expect(prodHtml).toContain(`<link rel="stylesheet" href="/${deferredCss}">`);
			expect(prodHtml).not.toContain(`src="/${deferredJavaScript}"`);
			expect(prodHtml).not.toContain(`<link rel="modulepreload" href="/${deferredJavaScript}">`);
			expect(prodHtml).not.toContain(`src="/${prefetchedJavaScript}"`);
			expect(prodHtml).not.toContain(`<link rel="modulepreload" href="/${prefetchedJavaScript}">`);

			// Hoisted metadata belongs in the template's <head>, not in #root. The
			// handler renders the route into `<div id="root">`, so core's default
			// fold would prepend it into the body, where the title loses to the
			// template's and the description is ignored. Asserted on BOTH responses
			// because the splice lives in two files (dev render-route, prod handler).
			for (const html of [prodHtml, devHtml]) {
				const slug = url === '/' ? 'home' : 'hello';
				const headRegion = html.slice(0, html.indexOf('</head>'));
				expect(headRegion).toContain(`<title>Fixture page ${slug}</title>`);
				expect(headRegion).toContain('content="fixture page description"');
				expect(bodyRegionOf(html)).not.toContain('<title>');
				expect(bodyRegionOf(html)).not.toContain('fixture page description');
			}
		}
	});

	it('styles layout-owned deferred content before its JavaScript loads', async () => {
		const { handler } = await import(pathToFileURL(path.join(distDir, 'server/entry.js')).href);
		const clientRoot = path.join(distDir, 'client');
		const stylesheet = findBuiltAsset(clientRoot, '.css', '.vite-layout-deferred-hydration-proof');
		const javascript = findBuiltAsset(
			clientRoot,
			'.js',
			'vite-layout-deferred-hydration-chunk-proof',
		);
		expect(stylesheet).toBeTruthy();
		expect(javascript).toBeTruthy();

		const response = await handler(new Request('http://localhost/layout-assets'));
		const html = await response.text();
		expect(response.status).toBe(200);
		expect(html).toContain('vite-layout-deferred-hydration-chunk-proof: 0');
		expect(html).toContain(`<link rel="stylesheet" href="/${stylesheet}">`);
		expect(html).not.toContain(`src="/${javascript}"`);
		expect(html).not.toContain(`<link rel="modulepreload" href="/${javascript}">`);

		const { chromium } = await import('playwright');
		const browser = await chromium.launch({ headless: true });
		try {
			const context = await browser.newContext({ javaScriptEnabled: false });
			const page = await context.newPage();
			const requests: string[] = [];
			page.on('request', (request) => requests.push(new URL(request.url()).pathname));
			await page.goto(productionOrigin + '/layout-assets', { waitUntil: 'load' });
			expect(
				await page
					.locator('.vite-layout-deferred-hydration-proof')
					.evaluate((element) => getComputedStyle(element).color),
			).toBe('rgb(0, 128, 128)');
			expect(requests).not.toContain('/' + javascript);
			await context.close();
		} finally {
			await browser.close();
		}
	});

	it('hydrates under strict CSP despite a hostile document base', async () => {
		let browser: import('playwright').Browser | undefined;
		try {
			const { chromium } = await import('playwright');
			browser = await chromium.launch({ headless: true });
		} catch (error) {
			throw new Error(
				'[vite-plugin client-only renderer] Chromium is required ' +
					'(run `pnpm exec playwright install chromium`): ' +
					(error instanceof Error ? error.message.split('\n')[0] : String(error)),
			);
		}

		try {
			for (const target of [
				{ name: 'development', origin: devOrigin },
				{ name: 'production', origin: productionOrigin },
			]) {
				const page = await browser.newPage();
				const errors: string[] = [];
				const requests: string[] = [];
				const scriptRequests: string[] = [];
				page.on('request', (request) => {
					requests.push(request.url());
					if (request.resourceType() === 'script') scriptRequests.push(request.url());
				});
				await page.addInitScript(() => {
					const fixture = globalThis as typeof globalThis & {
						__fixtureCspViolations?: string[];
						__fixtureDeferredHydrationClicks?: number;
						__fixtureDeferredHydrationProof?: Element | null;
					};
					fixture.__fixtureCspViolations = [];
					fixture.__fixtureDeferredHydrationClicks = 0;
					const captureDeferredProof = () => {
						const proof = document.querySelector('.vite-deferred-hydration-proof');
						if (proof !== null) {
							fixture.__fixtureDeferredHydrationProof = proof;
							proofObserver.disconnect();
						}
					};
					const proofObserver = new MutationObserver(captureDeferredProof);
					proofObserver.observe(document, { childList: true, subtree: true });
					captureDeferredProof();
					document.addEventListener('securitypolicyviolation', (event) => {
						fixture.__fixtureCspViolations?.push(event.violatedDirective + ': ' + event.blockedURI);
					});
				});
				page.on('console', (message) => {
					if (message.type() === 'error') errors.push(message.text());
				});
				page.on('pageerror', (error) => errors.push('pageerror: ' + String(error)));
				try {
					await page.goto(target.origin + '/', { waitUntil: 'load' });
					expect(await page.evaluate(() => document.baseURI)).toBe(
						'https://hostile-base.invalid/nested/',
					);
					try {
						await page.locator('[data-object-region="ready"]').waitFor({ timeout: 30_000 });
					} catch (error) {
						const browserState = await page.evaluate(() => {
							const fixture = globalThis as typeof globalThis & {
								__fixtureCspViolations?: string[];
							};
							return {
								baseURI: document.baseURI,
								cspViolations: fixture.__fixtureCspViolations,
								resources: performance.getEntriesByType('resource').map((entry) => entry.name),
							};
						});
						throw new Error(
							`Strict-CSP ${target.name} fixture did not hydrate. State: ${JSON.stringify(browserState)}. Browser errors: ${JSON.stringify(errors)}.`,
							{ cause: error },
						);
					}
					await page.evaluate(
						() =>
							new Promise<void>((resolve) =>
								requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
							),
					);
					const isDeferredQueryRequest = (requestUrl: string) => {
						const request = new URL(requestUrl);
						if (target.name === 'development') {
							return (
								request.pathname === '/src/Page.tsrx' &&
								request.searchParams.get('octane-hydrate') === '0'
							);
						}
						return (
							request.pathname.startsWith('/assets/') &&
							request.pathname.endsWith('.js') &&
							fs
								.readFileSync(path.join(distDir, 'client', request.pathname), 'utf8')
								.includes('vite-deferred-hydration-chunk-proof')
						);
					};
					const isPrefetchedChunkRequest = (requestUrl: string) => {
						const request = new URL(requestUrl);
						if (target.name === 'development') {
							return request.pathname === '/src/prefetched-hydration.tsrx';
						}
						return (
							request.pathname.startsWith('/assets/') &&
							request.pathname.endsWith('.js') &&
							fs
								.readFileSync(path.join(distDir, 'client', request.pathname), 'utf8')
								.includes('vite-prefetched-hydration-chunk-proof')
						);
					};
					await expect.poll(() => requests.some(isPrefetchedChunkRequest)).toBe(true);
					const prefetchedProof = page.locator('.vite-prefetched-hydration-proof');
					const prefetchedServerNode = await prefetchedProof.elementHandle();
					expect(prefetchedServerNode).not.toBeNull();
					expect(
						await prefetchedProof.evaluate((element) => ({
							active: element.getAttribute('data-active'),
							clicks: element.getAttribute('data-clicks'),
							text: element.textContent?.trim(),
						})),
					).toEqual({
						active: 'false',
						clicks: '0',
						text: 'vite-prefetched-hydration-chunk-proof',
					});
					await prefetchedProof.click();
					expect(await prefetchedProof.getAttribute('data-active')).toBe('false');
					expect(await prefetchedProof.getAttribute('data-clicks')).toBe('0');
					const prefetchedChunkRequestsBeforeActivation = requests.filter(isPrefetchedChunkRequest);
					await page.setViewportSize({ width: 2050, height: 720 });
					await expect
						.poll(async () => {
							return {
								active: await prefetchedProof.getAttribute('data-active'),
								sameNode: await prefetchedServerNode!.evaluate(
									(node) => node === document.querySelector('.vite-prefetched-hydration-proof'),
								),
							};
						})
						.toEqual({ active: 'true', sameNode: true });
					await prefetchedProof.click();
					await expect.poll(() => prefetchedProof.getAttribute('data-clicks')).toBe('1');
					expect(requests.filter(isPrefetchedChunkRequest)).toEqual(
						prefetchedChunkRequestsBeforeActivation,
					);
					const unsplitProof = page.locator('.vite-unsplit-hydration-proof');
					const unsplitServerNode = await unsplitProof.elementHandle();
					expect(unsplitServerNode).not.toBeNull();
					expect(await unsplitProof.getAttribute('data-active')).toBe('false');
					expect(await unsplitProof.getAttribute('data-clicks')).toBe('0');
					await unsplitProof.click();
					expect(await unsplitProof.getAttribute('data-active')).toBe('false');
					expect(await unsplitProof.getAttribute('data-clicks')).toBe('0');
					const scriptRequestsBeforeUnsplitActivation = [...scriptRequests];
					await page.setViewportSize({ width: 2200, height: 720 });
					await expect
						.poll(async () => ({
							active: await unsplitProof.getAttribute('data-active'),
							sameNode: await unsplitServerNode!.evaluate(
								(node) => node === document.querySelector('.vite-unsplit-hydration-proof'),
							),
						}))
						.toEqual({ active: 'true', sameNode: true });
					await page.evaluate(
						() =>
							new Promise<void>((resolve) =>
								requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
							),
					);
					expect(scriptRequests).toEqual(scriptRequestsBeforeUnsplitActivation);
					await unsplitProof.click();
					await expect.poll(() => unsplitProof.getAttribute('data-clicks')).toBe('1');
					const deferredBefore = await page.evaluate(() => {
						const fixture = globalThis as typeof globalThis & {
							__fixtureDeferredHydrationClicks?: number;
							__fixtureDeferredHydrationProof?: Element | null;
						};
						const proof = document.querySelector('.vite-deferred-hydration-proof');
						return {
							clicks: fixture.__fixtureDeferredHydrationClicks,
							dormant: proof?.parentElement?.getAttribute('data-octane-hydrate-when'),
							sameNode: fixture.__fixtureDeferredHydrationProof === proof,
						};
					});
					expect(deferredBefore).toEqual({
						clicks: 0,
						dormant: 'interaction',
						sameNode: true,
					});
					expect(requests.some(isDeferredQueryRequest)).toBe(false);
					const proof = await page.evaluate(() => {
						const fixture = globalThis as typeof globalThis & {
							__fixtureAuthoredSceneSetup?: number;
							__fixtureObjectContainer?: {
								children: Array<{ type: string; children: Array<{ type: string }> }>;
								commits: unknown[];
							};
							__fixtureObjectRegionCount?: number;
							__fixtureObjectRootCount?: number;
							__fixtureSsrCanvasShell?: Element | null;
							__fixtureCspViolations?: string[];
						};
						const shell = document.querySelector('[data-object-canvas-shell]');
						return {
							adoptedServerShell: fixture.__fixtureSsrCanvasShell === shell,
							authoredSceneSetup: fixture.__fixtureAuthoredSceneSetup,
							commits: fixture.__fixtureObjectContainer?.commits.length,
							regionCount: fixture.__fixtureObjectRegionCount,
							rootCount: fixture.__fixtureObjectRootCount,
							cspViolations: fixture.__fixtureCspViolations,
							scene: fixture.__fixtureObjectContainer?.children.map((child) => ({
								type: child.type,
								children: child.children.map((nested) => nested.type),
							})),
							shellCount: document.querySelectorAll('[data-object-canvas-shell]').length,
						};
					});

					expect(proof).toEqual({
						adoptedServerShell: true,
						authoredSceneSetup: 1,
						commits: 1,
						cspViolations: [],
						regionCount: 1,
						rootCount: 1,
						scene: [{ type: 'scene', children: ['mesh'] }],
						shellCount: 1,
					});
					await page.locator('.vite-deferred-hydration-proof').click();
					await expect
						.poll(async () => {
							const state = await page.evaluate(() => {
								const fixture = globalThis as typeof globalThis & {
									__fixtureDeferredHydrationClicks?: number;
									__fixtureDeferredHydrationProof?: Element | null;
								};
								const proof = document.querySelector('.vite-deferred-hydration-proof');
								return {
									clicks: fixture.__fixtureDeferredHydrationClicks,
									dormant: proof?.parentElement?.hasAttribute('data-octane-hydrate-when'),
									sameNode: fixture.__fixtureDeferredHydrationProof === proof,
								};
							});
							return { ...state, queryLoaded: requests.some(isDeferredQueryRequest) };
						})
						.toEqual({ clicks: 1, dormant: false, queryLoaded: true, sameNode: true });
					await page.getByRole('button', { name: 'Increment fixture' }).click();
					await expect.poll(() => page.locator('.count').textContent()).toBe('Count: 2');
					const guardedConst = page.locator('.vite-guarded-const');
					expect(await guardedConst.getAttribute('data-fixture-kind')).toBe('guarded');
					expect(await guardedConst.textContent()).toBe('vite-guarded-const-proof');
					await page.getByRole('button', { name: 'Toggle guarded const' }).click();
					await expect.poll(() => guardedConst.count()).toBe(0);
					await page.getByRole('button', { name: 'Toggle guarded const' }).click();
					await expect.poll(() => guardedConst.textContent()).toBe('vite-guarded-const-proof');
					await page.getByRole('button', { name: 'Check hydration module identity' }).click();
					await expect
						.poll(() => page.locator('[data-hydration-module-identity]').textContent())
						.toBe('page shared; pre-hydrate shared');
					expect(errors, `${target.name} browser errors`).toEqual([]);
				} finally {
					await page.close();
				}
			}
		} finally {
			await browser.close();
		}
	}, 120_000);

	it('returns 404 for unmatched routes (no catch-all in the fixture)', async () => {
		const { handler } = await import(pathToFileURL(path.join(distDir, 'server/entry.js')).href);
		const response = await handler(new Request('http://localhost/nope/nothing'));
		expect(response.status).toBe(404);
	});

	it('loads and renders the configured root catch boundary in production', async () => {
		const { handler } = await import(pathToFileURL(path.join(distDir, 'server/entry.js')).href);
		const response = await handler(new Request('http://localhost/pages/error'));
		expect(response.status).toBe(200);
		const prodHtml = await response.text();
		expect(prodHtml).toContain('Fixture failed: Error: fixture root boundary');
		const stylesheet = findBuiltAsset(path.join(distDir, 'client'), '.css', '.root-catch');
		expect(stylesheet).toBeTruthy();
		expect(prodHtml).toContain(`<link rel="stylesheet" href="/${stylesheet}">`);

		const devResponse = await fetch(devOrigin + '/pages/error');
		expect(devResponse.status).toBe(200);
		expect(bodyRegionOf(await devResponse.text())).toBe(bodyRegionOf(prodHtml));

		let browser: import('playwright').Browser | undefined;
		try {
			const { chromium } = await import('playwright');
			browser = await chromium.launch({ headless: true });
		} catch (error) {
			throw new Error(
				'[vite-plugin root boundary] Chromium is required ' +
					'(run `pnpm exec playwright install chromium`): ' +
					(error instanceof Error ? error.message.split('\n')[0] : String(error)),
			);
		}

		const page = await browser.newPage();
		const errors: string[] = [];
		page.on('console', (message) => {
			if (message.type() === 'error') errors.push(message.text());
		});
		page.on('pageerror', (error) => errors.push('pageerror: ' + String(error)));
		try {
			await page.goto(devOrigin + '/pages/error', { waitUntil: 'load' });
			expect(await page.locator('.root-catch').textContent()).toBe(
				'Fixture failed: Error: fixture root boundary',
			);
			expect(errors).toEqual([]);
		} finally {
			await page.close();
			await browser.close();
		}
	});

	it('applies the middleware nonce and strict CSP in dev and production', async () => {
		const { handler } = await import(pathToFileURL(path.join(distDir, 'server/entry.js')).href);
		const responses = [
			await handler(new Request('http://localhost/')),
			await fetch(devOrigin + '/'),
		];
		for (const response of responses) {
			expect(response.headers.get('content-security-policy')).toContain(
				"script-src 'self' 'nonce-fixture-nonce'",
			);
			const html = await response.text();
			expect(html).toMatch(/<script[^>]*id="__octane_data"[^>]*nonce="fixture-nonce"/);
			expect(html).toMatch(
				/<script(?=[^>]*data-octane-hydrate)(?=[^>]*nonce="fixture-nonce")[^>]*>/,
			);
		}
	});

	it('loads and streams the configured root pending boundary in production', async () => {
		const { handler } = await import(pathToFileURL(path.join(distDir, 'server/entry.js')).href);
		const response = await handler(new Request('http://localhost/pages/pending'));
		expect(response.status).toBe(200);
		const html = await response.text();
		expect(html).toContain('Loading fixture…');
		expect(html).toContain('Fixture page pending');
		const stylesheet = findBuiltAsset(path.join(distDir, 'client'), '.css', '.root-pending');
		expect(stylesheet).toBeTruthy();
		expect(html).toContain(`<link rel="stylesheet" href="/${stylesheet}">`);
	});

	for (const engine of ['chromium', 'webkit'] as const) {
		it(`preserves early composer input through independent activation and conversation navigation in ${engine}`, async () => {
			const playwright = await import('playwright');
			const browser = await playwright[engine].launch({ headless: true });
			try {
				const parentAsset = findBuiltAsset(
					path.join(distDir, 'client'),
					'.js',
					'Streaming conversations',
				);
				expect(parentAsset).toBeTruthy();
				const page = await browser.newPage({ extraHTTPHeaders: { 'x-fixture-viewer': engine } });
				const errors: string[] = [];
				page.on('pageerror', (error) => errors.push(String(error)));
				let releaseParent!: () => void;
				const parentGate = new Promise<void>((resolve) => {
					releaseParent = resolve;
				});
				const blockedParents: string[] = [];
				await page.route('**/' + parentAsset, async (route) => {
					blockedParents.push(route.request().url());
					await parentGate;
					await route.continue();
				});
				try {
					// Holding the parent module must not prevent its SSR input or the
					// independent widget's activation closure from becoming usable.
					await page.goto(productionOrigin + '/conversations', { waitUntil: 'commit' });
					const input = page.getByRole('textbox', { name: 'Message' });
					await input.waitFor();
					const original = await input.elementHandle();
					// WebKit's locator stability wait can await document completion;
					// this response intentionally retains its live result channel.
					const bounds = await input.boundingBox();
					expect(bounds).not.toBeNull();
					await page.mouse.click(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
					await input.fill('draft typed before the parent');
					await expect.poll(() => input.inputValue()).toBe('draft typed before the parent');
					// A derived read proves that code adopted the early
					// cell; retaining only an uncontrolled DOM string would not pass.
					await expect.poll(() => page.getByText('Characters: 29').count()).toBe(1);
					expect(
						await original!.evaluate((node) => node === document.querySelector('textarea')),
					).toBe(true);
					expect(blockedParents).toHaveLength(1);
					await input.fill('');
					await expect.poll(() => page.getByText('Characters: 0').count()).toBe(1);
					releaseParent();
					// Observe the parent's committed controls, not EOF: a watch query
					// can remain open for the document's lifetime.
					await expect
						.poll(() =>
							page
								.getByRole('group', { name: 'Conversation in this document' })
								.getAttribute('aria-busy'),
						)
						.toBe('false');
					expect(
						await original!.evaluate((node) => node === document.querySelector('textarea')),
					).toBe(true);
					expect(await input.inputValue()).toBe('');
					expect(await input.evaluate((node) => document.activeElement === node)).toBe(true);

					const startHash = createHash('sha256')
						.update('/src/conversation/Calls.tsrx#startConversation')
						.digest('hex')
						.slice(0, 8);
					const starts: string[] = [];
					const batches: string[] = [];
					page.on('request', (request) => {
						if (request.method() === 'POST' && request.url().endsWith('/' + startHash))
							starts.push(request.url());
						if (request.headers()['accept'] === 'application/x-octane-rpc-batch+ndjson')
							batches.push(request.url());
					});
					await input.fill('one accepted operation');
					await page.getByRole('button', { name: 'Send message' }).click();
					await expect
						.poll(() => page.getByText('Message accepted.', { exact: true }).count())
						.toBe(1);
					await input.fill('next draft for A');
					await page.getByRole('button', { name: 'Conversation B', exact: true }).click();
					await expect.poll(() => input.inputValue()).toBe('');
					await input.fill('separate draft for B');
					await page.getByRole('button', { name: 'Conversation A', exact: true }).click();
					await expect.poll(() => input.inputValue()).toBe('next draft for A');
					await expect
						.poll(() =>
							page.getByText('Completed: one accepted operation', { exact: true }).count(),
						)
						.toBe(1);
					expect(await page.locator('[data-conversation="A"] [data-turn]').count()).toBe(1);
					await page.getByRole('button', { name: 'Check last operation' }).click();
					await expect
						.poll(() => page.getByRole('status').textContent())
						.toMatch(/^Operation complete,/);
					expect(batches).toHaveLength(1);
					expect(starts).toHaveLength(1);
					expect(errors).toEqual([]);
				} finally {
					releaseParent();
					await page.close();
				}
			} finally {
				await browser.close();
			}
		}, 60_000);
	}

	it('places fetched SSR, adopts URL receipts, and pages completed history in webkit', async () => {
		const { webkit } = await import('playwright');
		const browser = await webkit.launch({ headless: true });
		try {
			const page = await browser.newPage({
				extraHTTPHeaders: { 'x-fixture-viewer': 'fetched-history-webkit' },
			});
			const errors: string[] = [];
			const posts: string[] = [];
			page.on('pageerror', (error) => errors.push(String(error)));
			page.on('request', (request) => {
				if (request.method() === 'POST') posts.push(request.url());
			});
			const warmDocument = await page.request.get(productionOrigin + '/conversation-history');
			const warmData = JSON.parse(dataScriptOf(await warmDocument.text()));
			const warmQuery = new URLSearchParams({
				build: warmData.clientBuild.buildId,
				document: warmData.streamedSignals.documentId,
				conversation: 'A',
				generation: '1',
			});
			const denied = await page.request.get(
				productionOrigin + '/conversation-history/frames?' + warmQuery,
				{ headers: { 'x-fixture-rpc-authorization': 'deny' } },
			);
			expect(denied.status()).toBe(401);
			const wrongBuild = await page.request.get(
				productionOrigin +
					'/conversation-history/frames?' +
					new URLSearchParams({
						...Object.fromEntries(warmQuery),
						build: 'not-the-executing-build',
					}),
			);
			expect(wrongBuild.status()).toBe(409);
			// Warm only an authorized input cache. The browser below receives a
			// new document identity and fresh SSR of this older empty snapshot.
			const warmHistory = await page.request.get(
				productionOrigin + '/conversation-history/frames?' + warmQuery,
			);
			expect(warmHistory.headers()['cache-control']).toBe('private, no-store');
			const warmFrames = (await warmHistory.text())
				.trim()
				.split('\n')
				.map((line) => JSON.parse(line));
			expect(
				warmFrames.some(
					(frame) => frame.channel === 'placement' && frame.html.includes('data-history="A"'),
				),
			).toBe(true);
			for (let index = 1; index <= 3; index++) {
				const response = await page.request.get(
					productionOrigin + `/conversation-history?q=history-${index}&operation=history-${index}`,
				);
				expect(response.status()).toBe(200);
				await response.body();
			}
			await page.goto(productionOrigin + '/conversation-history?q=history-4&operation=history-4');
			const input = page.getByRole('textbox', { name: 'History draft' });
			await page.locator('[data-history="A"][data-source="cached"][data-revision="0"]').waitFor();
			expect(
				await page.locator('[data-history="A"]').evaluate((node) => getComputedStyle(node).color),
			).toBe('rgb(12, 54, 87)');
			await input.fill('draft A survives server history');
			await page.getByRole('button', { name: 'Select B', exact: true }).click();
			await expect.poll(() => page.locator('[data-history="B"]').count()).toBe(1);
			await expect.poll(() => input.inputValue()).toBe('');
			await input.fill('draft B');
			await page.getByRole('button', { name: 'Select A', exact: true }).click();
			await expect.poll(() => page.locator('[data-history="A"]').count()).toBe(1);
			await expect.poll(() => input.inputValue()).toBe('draft A survives server history');
			await expect
				.poll(() => page.getByText('Completed: history-4', { exact: true }).count())
				.toBe(1);
			await expect.poll(() => page.getByRole('status').textContent()).toBe('History complete');
			expect(await page.locator('[data-history="A"] [data-turn]').count()).toBe(2);
			expect(await page.locator('[data-receipt="history-4"]').textContent()).toBe(
				'Accepted operation: complete',
			);
			const original = await page.locator('[data-history="A"]').elementHandle();
			await page.getByRole('button', { name: 'Activate history', exact: true }).click();
			await expect.poll(() => page.getByRole('status').textContent()).toBe('History active');
			expect(
				await original!.evaluate((node) => node === document.querySelector('[data-history]')),
			).toBe(true);
			await page.getByRole('button', { name: 'Select A', exact: true }).click();
			await expect.poll(() => page.getByRole('status').textContent()).toBe('History complete');
			expect(
				await original!.evaluate((node) => node === document.querySelector('[data-history]')),
			).toBe(true);
			await page.getByRole('button', { name: 'Older page', exact: true }).click();
			await expect.poll(() => page.getByRole('status').textContent()).toBe('All history loaded');
			expect(
				await page
					.locator('[data-history="A"] [data-turn]')
					.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-turn'))),
			).toEqual(['history-1', 'history-2', 'history-3', 'history-4']);
			await page.getByRole('button', { name: 'Older page', exact: true }).click();
			expect(await page.locator('[data-turn]').count()).toBe(4);
			expect(await input.inputValue()).toBe('draft A survives server history');
			// The one POST is the explicit finite page read. URL acceptance was
			// server-side and hydration did not resubmit any generation action.
			const pageHash = createHash('sha256')
				.update('/src/conversation/Calls.tsrx#readConversationPage')
				.digest('hex')
				.slice(0, 8);
			expect(posts).toHaveLength(1);
			expect(posts[0]).toMatch(new RegExp('/' + pageHash + '$'));
			expect(errors).toEqual([]);
			await page.close();
		} finally {
			await browser.close();
		}
	}, 60_000);

	it('bundles module-server exports and executes them through production RPC', async () => {
		const { handler } = await import(pathToFileURL(path.join(distDir, 'server/entry.js')).href);
		const hash = createHash('sha256').update('/src/Page.tsrx#fixtureRpc').digest('hex').slice(0, 8);
		const response = await handler(
			new Request(`http://localhost/_$_ripple_rpc_$_/${hash}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				// devalue.stringify(['hello'])
				body: '[[1],"hello"]',
			}),
		);
		expect(response.status).toBe(200);
		const encoded = JSON.parse(await response.text());
		expect(encoded[encoded[0].value]).toBe('rpc:hello');
	});

	it('discovers module-server exports in full-compiled .tsx modules', async () => {
		const { handler } = await import(pathToFileURL(path.join(distDir, 'server/entry.js')).href);
		const hash = createHash('sha256')
			.update('/src/Rpc.tsx#fixtureTsxRpc')
			.digest('hex')
			.slice(0, 8);
		const response = await handler(
			new Request(`http://localhost/_$_ripple_rpc_$_/${hash}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: '[[1],"tsx"]',
			}),
		);
		expect(response.status).toBe(200);
		const encoded = JSON.parse(await response.text());
		expect(encoded[encoded[0].value]).toBe('tsx-rpc:tsx');
	});

	it('registers and executes module-server exports through the dev SSR graph', async () => {
		// Load the route once so its server-compiled module registers into the dev map.
		await fetch(devOrigin + '/');
		const hash = createHash('sha256').update('/src/Page.tsrx#fixtureRpc').digest('hex').slice(0, 8);
		const response = await fetch(`${devOrigin}/_$_ripple_rpc_$_/${hash}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: '[[1],"dev"]',
		});
		expect(response.status).toBe(200);
		const encoded = JSON.parse(await response.text());
		expect(encoded[encoded[0].value]).toBe('rpc:dev');
	});

	it('enforces the same server-function security policy in dev and production', async () => {
		await fetch(devOrigin + '/');
		const { handler } = await import(pathToFileURL(path.join(distDir, 'server/entry.js')).href);
		const hash = createHash('sha256').update('/src/Page.tsrx#fixtureRpc').digest('hex').slice(0, 8);
		const cases: Array<{
			name: string;
			method: string;
			headers: HeadersInit;
			body?: string;
			status: number;
		}> = [
			{
				name: 'non-POST request',
				method: 'GET',
				headers: {},
				status: 405,
			},
			{
				name: 'non-JSON content type',
				method: 'POST',
				headers: { 'Content-Type': 'text/plain' },
				body: '[[1],"invalid"]',
				status: 415,
			},
			{
				name: 'cross-origin request',
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Origin: 'https://attacker.test',
				},
				body: '[[1],"invalid"]',
				status: 403,
			},
			{
				name: 'malformed JSON',
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: '{',
				status: 400,
			},
			{
				name: 'application authorization rejection',
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-fixture-rpc-authorization': 'deny',
				},
				body: '[[1],"unauthorized"]',
				status: 401,
			},
		];

		for (const target of [
			{
				name: 'development',
				origin: devOrigin,
				handle: (request: Request) => fetch(request),
			},
			{
				name: 'production',
				origin: productionOrigin,
				handle: (request: Request) => handler(request),
			},
		]) {
			for (const scenario of cases) {
				const response = await target.handle(
					new Request(`${target.origin}/_$_ripple_rpc_$_/${hash}`, {
						method: scenario.method,
						headers: scenario.headers,
						...(scenario.body === undefined ? {} : { body: scenario.body }),
					}),
				);
				expect(response.status, `${target.name}: ${scenario.name}`).toBe(scenario.status);
				if (scenario.status === 405) {
					expect(response.headers.get('allow'), target.name).toBe('POST');
				}
			}
		}
	});

	it('enforces cross-origin RPC preflights in a real browser in dev and production', async () => {
		await fetch(devOrigin + '/');
		const hash = createHash('sha256').update('/src/Page.tsrx#fixtureRpc').digest('hex').slice(0, 8);

		let browser: import('playwright').Browser | undefined;
		try {
			const { chromium } = await import('playwright');
			browser = await chromium.launch({ headless: true });
		} catch (error) {
			throw new Error(
				'[vite-plugin cross-origin RPC] Chromium is required ' +
					'(run `pnpm exec playwright install chromium`): ' +
					(error instanceof Error ? error.message.split('\n')[0] : String(error)),
			);
		}

		try {
			for (const target of [
				{ name: 'development', origin: devOrigin, server: devServer!.httpServer! },
				{ name: 'production', origin: productionOrigin, server: productionServer! },
			]) {
				const requests: Array<{ method: string; origin: string | undefined }> = [];
				const observe = (request: IncomingMessage) => {
					if (request.url?.startsWith('/_$_ripple_rpc_$_/')) {
						requests.push({ method: request.method ?? '', origin: request.headers.origin });
					}
				};
				target.server.on('request', observe);

				try {
					for (const scenario of [
						{ origin: trustedBrowserOrigin, allowed: true },
						{ origin: hostileBrowserOrigin, allowed: false },
					]) {
						requests.length = 0;
						const page = await browser.newPage();
						try {
							await page.goto(`${scenario.origin}/`);
							const result = await page.evaluate(
								async ({ origin, actionHash }) => {
									try {
										const response = await fetch(`${origin}/_$_ripple_rpc_$_/${actionHash}`, {
											method: 'POST',
											headers: {
												'Content-Type': 'application/json',
												'x-fixture-rpc-authorization': 'allow',
											},
											body: '[[1],"browser"]',
										});
										return { status: response.status, body: await response.json(), error: null };
									} catch (error) {
										return {
											status: null,
											body: null,
											error: error instanceof TypeError ? 'TypeError' : String(error),
										};
									}
								},
								{ origin: target.origin, actionHash: hash },
							);

							if (scenario.allowed) {
								expect(result.status, `${target.name}: allowed origin`).toBe(200);
								expect(result.error, `${target.name}: allowed origin`).toBeNull();
								const encoded = result.body as unknown[];
								const valueIndex = (encoded[0] as { value: number }).value;
								expect(encoded[valueIndex], `${target.name}: allowed action`).toBe('rpc:browser');
							} else {
								expect(result, `${target.name}: rejected origin`).toEqual({
									status: null,
									body: null,
									error: 'TypeError',
								});
							}

							expect(requests, `${target.name}: ${scenario.origin}`).toEqual(
								scenario.allowed
									? [
											{ method: 'OPTIONS', origin: scenario.origin },
											{ method: 'POST', origin: scenario.origin },
										]
									: [{ method: 'OPTIONS', origin: scenario.origin }],
							);
						} finally {
							await page.close();
						}
					}
				} finally {
					target.server.off('request', observe);
				}
			}
		} finally {
			await browser.close();
		}
	}, 120_000);

	it('nodeHandler bridges the same handler for Node-style serverless wrappers', async () => {
		const { nodeHandler } = await import(pathToFileURL(path.join(distDir, 'server/entry.js')).href);
		const chunks: Buffer[] = [];
		const headers: Record<string, unknown> = {};
		const res = Object.assign(new EventEmitter(), {
			statusCode: 0,
			headersSent: false,
			destroyed: false,
			writableEnded: false,
			setHeader(key: string, value: unknown) {
				headers[key.toLowerCase()] = value;
			},
			write(chunk: Uint8Array) {
				chunks.push(Buffer.from(chunk));
				return true;
			},
			end(chunk?: Uint8Array) {
				if (chunk) chunks.push(Buffer.from(chunk));
				this.writableEnded = true;
			},
		});
		const req = Object.assign(new EventEmitter(), {
			method: 'GET',
			url: '/pages/node',
			headers: { host: 'localhost' },
			aborted: false,
			destroyed: false,
			complete: true,
		});
		await nodeHandler(req, res);
		expect(res.statusCode).toBe(200);
		expect(headers['content-type']).toBe('text/html; charset=utf-8');
		expect(Buffer.concat(chunks).toString('utf-8')).toContain('Fixture page node');
	});
});
