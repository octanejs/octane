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
import { EventEmitter } from 'node:events';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build, createServer, type ViteDevServer } from 'vite';

const fixtureRoot = fileURLToPath(new URL('./_fixtures/app', import.meta.url));
const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const repoRoot = path.resolve(packageRoot, '../..');
const distDir = path.join(fixtureRoot, 'dist');

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

let devServer: ViteDevServer | null = null;
let devOrigin = '';

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
}, 180_000);

afterAll(async () => {
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

	it('renders a route through the built handler, byte-matching dev SSR', async () => {
		const { handler } = await import(pathToFileURL(path.join(distDir, 'server/entry.js')).href);

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
		}
	});

	it('returns 404 for unmatched routes (no catch-all in the fixture)', async () => {
		const { handler } = await import(pathToFileURL(path.join(distDir, 'server/entry.js')).href);
		const response = await handler(new Request('http://localhost/nope/nothing'));
		expect(response.status).toBe(404);
	});

	it('loads and renders the configured root catch boundary in production', async () => {
		const { handler } = await import(pathToFileURL(path.join(distDir, 'server/entry.js')).href);
		const response = await handler(new Request('http://localhost/pages/error'));
		expect(response.status).toBe(200);
		expect(await response.text()).toContain('Fixture failed: Error: fixture root boundary');
	});

	it('applies the middleware CSP nonce in dev and production', async () => {
		const { handler } = await import(pathToFileURL(path.join(distDir, 'server/entry.js')).href);
		const prodHtml = await (await handler(new Request('http://localhost/'))).text();
		const devHtml = await (await fetch(devOrigin + '/')).text();
		for (const html of [prodHtml, devHtml]) {
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
