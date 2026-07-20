// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRsbuild } from '@rsbuild/core';
import { pluginOctane } from '@octanejs/rsbuild-plugin';
import { Miniflare } from 'miniflare';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const repoRoot = resolve(packageRoot, '../..');
const fixtureRoot = join(packageRoot, 'tests/_fixtures/rsbuild-app');

function linkPackage(root: string, name: string, target: string) {
	const destination = join(root, 'node_modules', ...name.split('/'));
	mkdirSync(dirname(destination), { recursive: true });
	symlinkSync(target, destination, 'dir');
}

let root: string;
let worker: Miniflare;

beforeAll(async () => {
	// Keep the module graph below the process working directory: workerd rejects
	// module paths that escape its configured filesystem root.
	root = mkdtempSync(join(packageRoot, '.tmp-rsbuild-'));
	cpSync(fixtureRoot, root, { recursive: true });
	linkPackage(root, 'octane', join(repoRoot, 'packages/octane'));
	linkPackage(root, '@octanejs/rsbuild-plugin', join(repoRoot, 'packages/rsbuild-plugin-octane'));
	linkPackage(root, '@octanejs/adapter-cloudflare', packageRoot);

	const rsbuild = await createRsbuild({
		cwd: root,
		rsbuildConfig: { plugins: [pluginOctane({ hmr: false })] },
	});
	await rsbuild.build();

	worker = new Miniflare({
		modules: true,
		scriptPath: join(root, 'dist/server/worker.js'),
		modulesRules: [{ type: 'ESModule', include: ['**/*.js'], fallthrough: true }],
		compatibilityDate: '2026-07-14',
		compatibilityFlags: ['nodejs_compat'],
		bindings: { MARKER: 'rsbuild-binding' },
	});
}, 180_000);

afterAll(async () => {
	await worker?.dispose();
	rmSync(root, { recursive: true, force: true });
});

describe('Cloudflare Rsbuild production output', { timeout: 30_000 }, () => {
	it('keeps compatibility modules as native ESM and starts in workerd', async () => {
		const page = await worker.dispatchFetch('https://example.test/');
		expect(page.status).toBe(200);
		expect(await page.text()).toContain('Cloudflare Rsbuild fixture');
	});

	it('forwards bindings from the Rsbuild Worker', async () => {
		const response = await worker.dispatchFetch('https://example.test/binding');
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('rsbuild-binding');
	});

	it('preserves a named dynamic import without colliding with the generated Worker entry', async () => {
		const response = await worker.dispatchFetch('https://example.test/chunk');
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('async-worker-chunk');
		expect(existsSync(join(root, 'dist/server/worker.js'))).toBe(true);
	});
});
