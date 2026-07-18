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
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { EventEmitter, once } from 'node:events';
import type { Server } from 'node:http';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build, createServer, type ViteDevServer } from 'vite';
import { createNodeServer } from '../../app-core/src/server/node-http.js';

const fixtureRoot = fileURLToPath(new URL('./_fixtures/app', import.meta.url));
const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const repoRoot = path.resolve(packageRoot, '../..');
const distDir = path.join(fixtureRoot, 'dist');
const sceneFile = path.join(fixtureRoot, 'src/Scene.object.tsrx');
const clientReferenceId = 'octane-client-reference-v1:object:/src/Scene.object.tsrx';

function linkPackage(name: string, target: string) {
	const dest = path.join(fixtureRoot, 'node_modules', name);
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	fs.rmSync(dest, { recursive: true, force: true });
	fs.symlinkSync(target, dest, 'dir');
}

/** The rendered body region: everything streamed into `<div id="root">`. */
function bodyRegionOf(html: string): string {
	const open = '<div id="root">';
	const start = html.indexOf(open);
	const end = html.lastIndexOf('</div>');
	expect(start).toBeGreaterThan(-1);
	expect(end).toBeGreaterThan(start);
	return html.slice(start + open.length, end);
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

let devServer: ViteDevServer | null = null;
let devOrigin = '';
let productionServer: Server | null = null;
let productionOrigin = '';

beforeAll(async () => {
	linkPackage('octane', path.join(repoRoot, 'packages/octane'));
	linkPackage('@octanejs/vite-plugin', packageRoot);
	linkPackage('vite', path.join(packageRoot, 'node_modules/vite'));

	fs.rmSync(distDir, { recursive: true, force: true });

	// The production build: client bundle, then (closeBundle) the server bundle.
	await build({ root: fixtureRoot, logLevel: 'silent' });

	// A dev server on a random port — the byte-compat oracle.
	devServer = await createServer({
		root: fixtureRoot,
		logLevel: 'silent',
		server: { port: 0 },
	});
	await devServer.listen();
	const address = devServer.httpServer?.address();
	if (!address || typeof address !== 'object') throw new Error('dev server has no address');
	devOrigin = `http://localhost:${address.port}`;

	const { handler } = await import(pathToFileURL(path.join(distDir, 'server/entry.js')).href);
	productionServer = createNodeServer(handler, {
		staticDir: path.join(distDir, 'client'),
	}).listen(0);
	await once(productionServer, 'listening');
	const productionAddress = productionServer.address();
	if (!productionAddress || typeof productionAddress !== 'object') {
		throw new Error('production server has no address');
	}
	productionOrigin = `http://localhost:${productionAddress.port}`;
}, 180_000);

afterAll(async () => {
	if (productionServer !== null) {
		await new Promise<void>((resolve, reject) => {
			productionServer!.close((error) => (error ? reject(error) : resolve()));
		});
	}
	await devServer?.close();
	fs.rmSync(distDir, { recursive: true, force: true });
	fs.rmSync(path.join(fixtureRoot, 'node_modules'), { recursive: true, force: true });
});

describe('production SSR build', () => {
	it('emits both bundles, moves the template to dist/server, and strips build metadata', () => {
		expect(fs.existsSync(path.join(distDir, 'server/entry.js'))).toBe(true);
		expect(fs.existsSync(path.join(distDir, 'server/index.html'))).toBe(true);
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

			// The hydratable body region and the hydration payload are the
			// byte-compat contract between dev and production.
			expect(bodyRegionOf(prodHtml)).toBe(bodyRegionOf(devHtml));
			expect(dataScriptOf(prodHtml)).toBe(dataScriptOf(devHtml));

			// Sanity: it actually rendered the page.
			expect(prodHtml).toContain('fixture-nav');
			expect(prodHtml).toContain(url === '/' ? 'Fixture page home' : 'Fixture page hello');
			expect(prodHtml).toContain(`<p class="url">${url}</p>`);
			expect(prodHtml).toContain(`<link rel="stylesheet" href="/${deferredCss}">`);
			expect(prodHtml).not.toContain(`src="/${deferredJavaScript}"`);
			expect(prodHtml).not.toContain(`<link rel="modulepreload" href="/${deferredJavaScript}">`);
			expect(prodHtml).not.toContain(`src="/${prefetchedJavaScript}"`);
			expect(prodHtml).not.toContain(`<link rel="modulepreload" href="/${prefetchedJavaScript}">`);
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
	});

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
