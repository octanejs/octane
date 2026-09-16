import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createRsbuild } from '@rsbuild/core';
import type { Compiler } from '@rspack/core';
import { describe, expect, it } from 'vitest';
import { pluginOctane } from '../src/index.js';

const repositoryRoot = resolve(import.meta.dirname, '../../..');

function write(root: string, file: string, source: string) {
	mkdirSync(dirname(join(root, file)), { recursive: true });
	writeFileSync(join(root, file), source);
}

describe('Rsbuild early hydration entry ownership', () => {
	it.each([
		'default',
		'disabled splitting',
		'split runtime',
		'initial shared chunk',
		'root shared chunks',
		'client shared chunks',
		'merged entry',
	])(
		'validates native hydration entry ownership (%s)',
		async (kind) => {
			const root = realpathSync(mkdtempSync(join(tmpdir(), 'octane-rsbuild-bootstrap-')));
			try {
				write(root, 'package.json', JSON.stringify({ private: true, type: 'module' }));
				write(
					root,
					'index.html',
					'<html><head><!--ssr-head--></head><body><div id="root"><!--ssr-body--></div></body></html>',
				);
				write(root, 'src/Page.tsrx', 'export function Page() @{ <main>bootstrap</main> }');
				write(root, 'src/other.js', 'globalThis.__octane_unrelated_entry = document.readyState;');
				write(
					root,
					'octane.config.ts',
					`import { defineConfig, RenderRoute } from '@octanejs/rsbuild-plugin';
export default defineConfig({ build: { minify: false }, router: { routes: [new RenderRoute({ path: '/', entry: '/src/Page.tsrx' })] } });`,
				);
				for (const [name, target] of [
					['octane', join(repositoryRoot, 'packages/octane')],
					['@octanejs/rsbuild-plugin', join(repositoryRoot, 'packages/rsbuild-plugin-octane')],
				]) {
					const link = join(root, 'node_modules', name);
					mkdirSync(dirname(link), { recursive: true });
					symlinkSync(target, link, 'dir');
				}
				let initialFiles: string[] = [];
				let errors: string[] = [];
				const forcedSplit = {
					chunks: 'all' as const,
					cacheGroups: {
						bootstrapVendor: {
							test: /[\\/]runtime\.ts$/,
							name: 'bootstrap-vendor',
							enforce: true,
						},
					},
				};
				const rsbuild = await createRsbuild({
					cwd: root,
					rsbuildConfig: {
						mode: 'production',
						plugins: [pluginOctane({ hmr: false })],
						...(kind === 'disabled splitting'
							? { splitChunks: false as const }
							: kind === 'root shared chunks'
								? { splitChunks: forcedSplit }
								: {}),
						environments: {
							web: {
								...(kind === 'client shared chunks' ? { splitChunks: forcedSplit } : {}),
								source: {
									entry: { other: { import: './src/other.js', html: false } },
									preEntry: kind === 'merged entry' ? ['./src/other.js'] : [],
								},
							},
						},
						tools: {
							rspack(config, context) {
								config.resolve ??= {};
								config.resolve.extensionAlias = { '.js': ['.ts', '.js'] };
								if (context.environment.name !== 'web') return;
								config.optimization ??= {};
								if (kind === 'split runtime') config.optimization.runtimeChunk = 'single';
								if (kind === 'initial shared chunk') {
									config.optimization.splitChunks = {
										cacheGroups: {
											bootstrapVendor: {
												test: /[\\/]runtime\.ts$/,
												name: 'bootstrap-vendor',
												chunks: 'all',
												enforce: true,
											},
										},
									};
								}
								config.plugins ??= [];
								config.plugins.push({
									apply(compiler: Compiler) {
										compiler.hooks.done.tap('ObserveHydrationEntry', (stats) => {
											initialFiles = stats.compilation.entrypoints
												.get('index')!
												.getFiles()
												.filter((file) => /\.js$/.test(file));
											errors = stats.compilation.errors.map((error) => String(error));
										});
									},
								});
							},
						},
					},
				});
				if (kind !== 'default' && kind !== 'disabled splitting') {
					await expect(rsbuild.build()).rejects.toThrow();
					expect(errors.some((error) => error.includes('Octane early hydration'))).toBe(true);
					return;
				}
				await rsbuild.build();
				expect(initialFiles).toHaveLength(1);
				const html = readFileSync(join(root, 'dist/server/index.html'), 'utf8');
				expect(html).toMatch(
					/<script[^>]*\bdefer\b[^>]*data-octane-hydrate|<script[^>]*data-octane-hydrate[^>]*\bdefer\b/,
				);
				expect(readFileSync(join(root, 'dist/client', initialFiles[0]), 'utf8')).not.toContain(
					'__octane_unrelated_entry',
				);
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		},
		60_000,
	);
});
