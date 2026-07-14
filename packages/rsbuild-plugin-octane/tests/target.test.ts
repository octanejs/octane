import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRsbuild } from '@rsbuild/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pluginOctane } from '../src/index.js';

const repositoryRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));

function write(root: string, relativePath: string, content: string) {
	const file = join(root, relativePath);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, content);
}

function link(root: string, packageName: string, target: string) {
	const destination = join(root, 'node_modules', ...packageName.split('/'));
	mkdirSync(dirname(destination), { recursive: true });
	symlinkSync(target, destination, 'dir');
}

function writeApp(root: string, target: string) {
	write(root, 'package.json', JSON.stringify({ private: true, type: 'module' }) + '\n');
	write(
		root,
		'tsconfig.json',
		JSON.stringify({ compilerOptions: { allowJs: true, moduleResolution: 'Bundler' } }) + '\n',
	);
	write(
		root,
		'index.html',
		'<head><!--ssr-head--></head><body><div id="root"><!--ssr-body--></div></body>\n',
	);
	write(root, 'src/Page.tsrx', 'export function Page() @{ <main>target</main> }\n');
	write(
		root,
		'octane.config.ts',
		`import { defineConfig, RenderRoute } from '@octanejs/rsbuild-plugin';
export default defineConfig({
	build: { target: ${target} },
	router: { routes: [new RenderRoute({ path: '/', entry: '/src/Page.tsrx' })] },
});
`,
	);
	link(root, 'octane', join(repositoryRoot, 'packages/octane'));
	link(root, '@octanejs/rsbuild-plugin', join(repositoryRoot, 'packages/rsbuild-plugin-octane'));
}

describe('Rsbuild build.target mapping', () => {
	let root: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'octane-rsbuild-target-'));
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('applies an ES target to both client/server Rspack runtimes and only preserves generated import.meta', async () => {
		writeApp(root, JSON.stringify('es5'));
		const instance = await createRsbuild({
			cwd: root,
			rsbuildConfig: { plugins: [pluginOctane({ hmr: false })] },
		});
		const configs = await instance.initConfigs({ action: 'build' });

		expect(configs.map((config) => config.target)).toEqual(
			expect.arrayContaining([
				['web', 'es5'],
				['node', 'es5'],
			]),
		);
		const serverConfig = configs.find((config) =>
			Array.isArray(config.target) ? config.target.includes('node') : config.target === 'node',
		)!;
		expect(serverConfig.module?.parser?.javascript?.importMeta).not.toBe(false);
		expect(serverConfig.module?.rules).toEqual(
			expect.arrayContaining([expect.objectContaining({ parser: { importMeta: false } })]),
		);
		await instance.build();
	});

	it('converts esbuild-style browser targets for SWC and Rspack runtime generation', async () => {
		writeApp(root, JSON.stringify(['chrome100', 'firefox100']));
		const instance = await createRsbuild({
			cwd: root,
			rsbuildConfig: { plugins: [pluginOctane({ hmr: false })] },
		});
		const inspected = await instance.inspectConfig();

		expect(inspected.origin.environmentConfigs.web.output.overrideBrowserslist).toEqual([
			'chrome >= 100',
			'firefox >= 100',
		]);
		expect(inspected.origin.bundlerConfigs.map((config) => config.target)).toEqual(
			expect.arrayContaining([
				['web', 'browserslist:chrome >= 100,firefox >= 100'],
				['node', 'browserslist:chrome >= 100,firefox >= 100'],
			]),
		);
	});

	it('rejects ambiguous mixed ES and browser target arrays', async () => {
		writeApp(root, JSON.stringify(['es2018', 'chrome100']));
		const instance = await createRsbuild({
			cwd: root,
			rsbuildConfig: { plugins: [pluginOctane({ hmr: false })] },
		});
		await expect(instance.initConfigs({ action: 'build' })).rejects.toThrow(
			'cannot mix ES levels and browser targets',
		);
	});

	it('rejects app routing beneath an unsupported Rsbuild base', async () => {
		writeApp(root, JSON.stringify('es2022'));
		const instance = await createRsbuild({
			cwd: root,
			rsbuildConfig: {
				plugins: [pluginOctane({ hmr: false })],
				server: { base: '/docs' },
			},
		});
		await expect(instance.initConfigs({ action: 'build' })).rejects.toThrow(
			'currently requires server.base to be "/"',
		);
	});
});
