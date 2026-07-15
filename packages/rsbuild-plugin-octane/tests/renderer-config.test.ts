import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRsbuild } from '@rsbuild/core';
import { OctaneRspackPlugin } from '@octanejs/rspack-plugin';
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

function writeProject(root: string, withRoute: boolean) {
	write(root, 'package.json', JSON.stringify({ private: true, type: 'module' }) + '\n');
	write(root, 'index.html', '<body><div id="root"><!--ssr-body--></div></body>\n');
	write(root, 'src/Page.tsrx', 'export function Page() @{ <main>ready</main> }\n');
	write(
		root,
		'octane.config.ts',
		`import { defineConfig, RenderRoute } from '@octanejs/rsbuild-plugin';

export default defineConfig({
	compiler: {
		renderers: {
			registry: { object: '/src/object-renderer.js' },
			rules: [{ include: 'src/**/*.object.tsrx', renderer: 'object' }],
		},
	},
	router: { routes: ${withRoute ? "[new RenderRoute({ path: '/', entry: '/src/Page.tsrx' })]" : '[]'} },
});
`,
	);
	link(root, 'octane', join(repositoryRoot, 'packages/octane'));
	link(root, '@octanejs/rsbuild-plugin', join(repositoryRoot, 'packages/rsbuild-plugin-octane'));
}

describe('Rsbuild renderer configuration', () => {
	let root: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'octane-rsbuild-renderers-'));
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it.each([
		['compiler-only', false],
		['routed app', true],
	] as const)(
		'forwards shared config to every Rspack compiler in %s mode',
		async (_mode, withRoute) => {
			writeProject(root, withRoute);
			const instance = await createRsbuild({
				cwd: root,
				rsbuildConfig: { plugins: [pluginOctane({ hmr: false })] },
			});
			const configs = await instance.initConfigs({ action: 'build' });
			const plugins = configs
				.flatMap((config) => config.plugins ?? [])
				.filter((plugin): plugin is OctaneRspackPlugin => plugin instanceof OctaneRspackPlugin);

			expect(plugins).toHaveLength(withRoute ? 2 : 1);
			for (const plugin of plugins) {
				expect(plugin.options.renderers).toMatchObject({
					default: 'dom',
					registry: {
						object: { module: '/src/object-renderer.js', target: 'universal' },
					},
					rules: [{ include: ['src/**/*.object.tsrx'], renderer: 'object' }],
				});
			}
		},
	);
});
