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
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRsbuild } from '@rsbuild/core';
import { afterEach, describe, expect, it } from 'vitest';
import { pluginOctane } from '../src/index.js';

const repositoryRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const roots: string[] = [];

function write(root: string, relative: string, source: string) {
	const file = join(root, relative);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, source);
}

function link(root: string, name: string, target: string) {
	const destination = join(root, 'node_modules', ...name.split('/'));
	mkdirSync(dirname(destination), { recursive: true });
	symlinkSync(target, destination, 'dir');
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Rsbuild CSS-module constants', () => {
	it('keeps extracted route styles and server class names aligned', async () => {
		const root = realpathSync(mkdtempSync(join(tmpdir(), 'octane-rsbuild-css-constants-')));
		roots.push(root);
		write(root, 'package.json', JSON.stringify({ private: true, type: 'module' }));
		write(
			root,
			'index.html',
			'<!doctype html><html><head><!--ssr-head--></head><body><div id="root"><!--ssr-body--></div></body></html>',
		);
		write(root, 'src/page.module.css', '.root{color:red}.label{color:blue}.tail{color:green}');
		write(
			root,
			'src/Page.tsrx',
			`import { root, label, tail } from './page.module.css';
export function Page() @{
	<main class={root}><span class={label}>Ready</span><i class={tail} /></main>
}
`,
		);
		write(
			root,
			'octane.config.ts',
			`import { defineConfig, RenderRoute } from '@octanejs/rsbuild-plugin';
export default defineConfig({
	build: { outDir: 'dist', minify: false },
	router: { routes: [new RenderRoute({ path: '/', entry: '/src/Page.tsrx' })] },
});
`,
		);
		link(root, 'octane', join(repositoryRoot, 'packages/octane'));
		link(root, '@octanejs/rsbuild-plugin', join(repositoryRoot, 'packages/rsbuild-plugin-octane'));
		const environments = new Set<string>();
		const instance = await createRsbuild({
			cwd: root,
			rsbuildConfig: {
				mode: 'production',
				plugins: [
					pluginOctane({
						parallel: false,
						cssModuleConstants(module) {
							if (module.resource === join(root, 'src/page.module.css')) {
								environments.add(module.environment);
							}
							return undefined;
						},
					}),
				],
				output: {
					cssModules: { namedExport: true, localIdentName: 'mapped_[local]' },
				},
				tools: {
					rspack(config) {
						config.resolve ??= {};
						config.resolve.extensionAlias = { '.js': ['.ts', '.js'] };
					},
				},
			},
		});
		const build = await instance.build();
		try {
			expect([...environments].sort()).toEqual(['client', 'server']);
			const serverRoot = join(root, 'dist/server');
			const clientRoot = join(root, 'dist/client');
			const assets = JSON.parse(
				readFileSync(join(serverRoot, 'octane-client-assets.json'), 'utf8'),
			) as Record<string, { css: string[] }>;
			const stylesheets = assets['/src/Page.tsrx'].css;
			expect(stylesheets.length).toBeGreaterThan(0);
			const css = stylesheets
				.map((file) => readFileSync(join(clientRoot, file), 'utf8'))
				.join('\n');
			for (const name of ['root', 'label', 'tail']) expect(css).toContain(`.mapped_${name}`);

			const server = (await import(pathToFileURL(join(serverRoot, 'entry.js')).href)) as {
				handler(request: Request): Promise<Response>;
			};
			const response = await server.handler(new Request('https://fixture.test/'));
			const html = await response.text();
			expect(response.status).toBe(200);
			expect(html).toContain('<main class="mapped_root">');
			expect(html).toContain('<span class="mapped_label">Ready</span>');
			expect(html).toContain('<i class="mapped_tail"></i>');
			for (const file of stylesheets) expect(html).toContain(file);
		} finally {
			await build.close();
		}
	}, 30_000);
});
