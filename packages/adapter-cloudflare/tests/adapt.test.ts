// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { adapt, cloudflare } from '../src/index.js';

const roots: string[] = [];

function createBuild() {
	const root = mkdtempSync(join(tmpdir(), 'octane-cloudflare-adapter-'));
	roots.push(root);
	const clientDir = join(root, 'dist/client');
	const serverDir = join(root, 'dist/server');
	mkdirSync(join(clientDir, 'assets'), { recursive: true });
	mkdirSync(serverDir, { recursive: true });
	writeFileSync(join(clientDir, 'assets/app.js'), 'client');
	writeFileSync(
		join(serverDir, 'entry.js'),
		`let factoryCalls = 0;
export function createWebWorkerHandler(options) {
		factoryCalls++;
		return async (request, platform) => new Response(JSON.stringify({
			url: request.url,
			marker: platform.env.MARKER,
			factoryCalls,
			template: options.htmlTemplate,
			assets: options.clientAssets ?? null,
		}));
	}
`,
	);
	writeFileSync(
		join(serverDir, 'index.html'),
		'<!doctype html><div id="root"><!--ssr-body--></div>',
	);
	return { root, clientDir, serverDir };
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('cloudflare()', () => {
	it('selects the web-worker server build with compatible runtime primitives', () => {
		const adapter = cloudflare();
		const runtime = adapter.runtime!;
		expect(adapter).toMatchObject({
			name: 'cloudflare',
			serverTarget: 'webworker',
			runtime,
			adapt,
		});
		expect(runtime.hash('octane')).toMatch(/^[0-9a-f]{8}$/);
		const context = runtime.createAsyncContext<string>();
		expect(context.run('request', () => context.getStore())).toBe('request');
	});
});

describe('adapt()', () => {
	it('emits a streaming module Worker that forwards Cloudflare platform bindings', async () => {
		const build = createBuild();
		writeFileSync(
			join(build.serverDir, 'octane-client-assets.json'),
			JSON.stringify({ '/src/Page.tsrx': { js: 'assets/app.js', css: [] } }),
		);
		const log = vi.fn();

		await adapt({ ...build, outDir: 'dist', log });

		const workerPath = join(build.serverDir, 'worker.js');
		expect(log).toHaveBeenCalledWith(
			'[@octanejs/adapter-cloudflare] Worker entry written to dist/server/worker.js',
		);

		const worker = (await import(pathToFileURL(workerPath).href)).default;
		const body = await (
			await worker.fetch(
				new Request('https://example.test/binding'),
				{ MARKER: 'bound' },
				{ waitUntil() {}, passThroughOnException() {} },
			)
		).json();
		expect(body).toEqual({
			url: 'https://example.test/binding',
			marker: 'bound',
			factoryCalls: 1,
			template: '<!doctype html><div id="root"><!--ssr-body--></div>',
			assets: { '/src/Page.tsrx': { js: 'assets/app.js', css: [] } },
		});

		const secondBody = await (
			await worker.fetch(new Request('https://example.test/second'), { MARKER: 'again' }, {})
		).json();
		expect(secondBody).toMatchObject({ marker: 'again', factoryCalls: 1 });
	});

	it('refuses to overwrite an unrelated server chunk named worker.js', async () => {
		const build = createBuild();
		const workerPath = join(build.serverDir, 'worker.js');
		writeFileSync(workerPath, 'export const chunk = true;\n');

		await expect(adapt({ ...build, outDir: 'dist', log: () => {} })).rejects.toThrow(
			'already emitted worker.js',
		);
		expect(readFileSync(workerPath, 'utf-8')).toBe('export const chunk = true;\n');
	});

	it.each([
		['client build output', (build: ReturnType<typeof createBuild>) => build.clientDir],
		['server entry', (build: ReturnType<typeof createBuild>) => join(build.serverDir, 'entry.js')],
		[
			'server HTML template',
			(build: ReturnType<typeof createBuild>) => join(build.serverDir, 'index.html'),
		],
	])('rejects a missing %s before replacing an existing worker', async (_name, missingPath) => {
		const build = createBuild();
		const workerPath = join(build.serverDir, 'worker.js');
		writeFileSync(workerPath, 'keep-me');
		rmSync(missingPath(build), { recursive: true, force: true });

		await expect(adapt({ ...build, outDir: 'dist', log: () => {} })).rejects.toThrow();
		expect(readFileSync(workerPath, 'utf-8')).toBe('keep-me');
	});

	it('turns an uncaught handler failure into a plain 500 response', async () => {
		const build = createBuild();
		writeFileSync(
			join(build.serverDir, 'entry.js'),
			'export function createWebWorkerHandler() { return async () => { throw new Error("boom"); }; }\n',
		);
		await adapt({ ...build, outDir: 'dist', log: () => {} });
		const worker = (await import(pathToFileURL(join(build.serverDir, 'worker.js')).href)).default;
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});

		const response = await worker.fetch(new Request('https://example.test/'), {}, {});

		expect(response.status).toBe(500);
		expect(await response.text()).toBe('Internal Server Error');
		expect(error).toHaveBeenCalledWith(
			'[octane] Cloudflare Worker handler error:',
			expect.any(Error),
		);
		error.mockRestore();
	});
});
