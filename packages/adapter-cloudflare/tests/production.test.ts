// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cpSync, existsSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { build } from 'vite';
import { createTempProject } from '../../octane/tests/_temp-project.js';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const repoRoot = resolve(packageRoot, '../..');
const fixtureSource = join(packageRoot, 'tests/_fixtures/app');

let projectRoot: string;
let distDir: string;
let disposeProject: () => void;
let worker: Miniflare;

function linkPackage(name: string, target: string) {
	const destination = join(projectRoot, 'node_modules', name);
	mkdirSync(dirname(destination), { recursive: true });
	rmSync(destination, { recursive: true, force: true });
	symlinkSync(target, destination, 'dir');
}

beforeAll(async () => {
	// `insideWorkspace`: this fixture boots in workerd, which cannot load modules
	// from an `os.tmpdir()` root. See createTempProject.
	({ root: projectRoot, dispose: disposeProject } = createTempProject('cloudflare-vite', {
		insideWorkspace: true,
	}));
	distDir = join(projectRoot, 'dist');
	cpSync(fixtureSource, projectRoot, { recursive: true });

	linkPackage('octane', join(repoRoot, 'packages/octane'));
	linkPackage('@octanejs/app-core', join(repoRoot, 'packages/app-core'));
	linkPackage('@octanejs/vite-plugin', join(repoRoot, 'packages/vite-plugin-octane'));
	linkPackage('@octanejs/adapter-cloudflare', packageRoot);
	linkPackage('vite', join(repoRoot, 'packages/vite-plugin-octane/node_modules/vite'));

	await build({ root: projectRoot, logLevel: 'silent' });

	worker = new Miniflare({
		modules: true,
		scriptPath: join(distDir, 'server/worker.js'),
		modulesRules: [{ type: 'ESModule', include: ['**/*.js'], fallthrough: true }],
		compatibilityDate: '2026-07-14',
		compatibilityFlags: ['nodejs_compat'],
		bindings: { MARKER: 'binding-from-workerd' },
	});
}, 180_000);

afterAll(async () => {
	await worker?.dispose();
	disposeProject?.();
});

describe('Cloudflare production build', { timeout: 30_000 }, () => {
	it('emits private template metadata, public client assets, and a module Worker', () => {
		const entryPath = join(distDir, 'server/entry.js');
		expect(existsSync(entryPath)).toBe(true);
		expect(existsSync(join(distDir, 'server/index.html'))).toBe(true);
		expect(existsSync(join(distDir, 'server/worker.js'))).toBe(true);
		expect(existsSync(join(distDir, 'client/index.html'))).toBe(false);
	});

	it('renders SSR and preserves route status inside workerd', async () => {
		const page = await worker.dispatchFetch('https://example.test/');
		expect(page.status).toBe(200);
		expect(page.headers.get('content-type')).toBe('text/html; charset=utf-8');
		expect(await page.text()).toContain('Cloudflare Worker fixture');

		const missing = await worker.dispatchFetch('https://example.test/missing');
		expect(missing.status).toBe(404);
		expect(await missing.text()).toContain('Cloudflare Worker fixture');
	});

	it('forwards Worker bindings and execution context to ServerRoutes', async () => {
		const response = await worker.dispatchFetch('https://example.test/binding');
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('binding-from-workerd');
	});

	it('preserves application Node compatibility imports for workerd', async () => {
		const response = await worker.dispatchFetch('https://example.test/node-compat');
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('bm9kZS1jb21wYXQ=');
	});
});
