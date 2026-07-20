import {
	existsSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';
import { describe, expect, it } from 'vitest';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const repositoryRoot = resolve(packageRoot, '../..');

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

describe('Vite webworker server target', () => {
	it('builds an importable worker factory without Node-only generated entry dependencies', async () => {
		const root = realpathSync(mkdtempSync(join(tmpdir(), 'octane-vite-webworker-')));
		try {
			write(root, 'package.json', JSON.stringify({ private: true, type: 'module' }) + '\n');
			write(
				root,
				'index.html',
				'<head><!--ssr-head--></head><body><div id="root"><!--ssr-body--></div></body>\n',
			);
			write(root, 'src/Page.tsrx', 'export function Page() @{ <main>worker target</main> }\n');
			write(
				root,
				'vite.config.ts',
				`import { defineConfig } from 'vite';
import { octane } from '@octanejs/vite-plugin';

export default defineConfig({
	plugins: [
		{
			name: 'assert-octane-worker-target',
			configResolved(config) {
				if (config.build.ssr && config.ssr.target !== 'webworker') {
					throw new Error('expected the Octane server sub-build to target webworker');
				}
			},
		},
		octane({ hmr: false }),
	],
});
`,
			);
			write(
				root,
				'octane.config.ts',
				`import { defineConfig, RenderRoute } from '@octanejs/vite-plugin';

export default defineConfig({
	adapter: {
		name: 'fixture-webworker',
		serverTarget: 'webworker',
		runtime: {
			hash: () => '00000000',
			createAsyncContext: () => ({ run: (_store, fn) => fn(), getStore: () => undefined }),
		},
	},
	build: { minify: false },
	router: { routes: [new RenderRoute({ path: '/', entry: '/src/Page.tsrx' })] },
});
`,
			);
			link(root, 'octane', join(repositoryRoot, 'packages/octane'));
			link(root, '@octanejs/vite-plugin', packageRoot);
			link(root, 'vite', join(packageRoot, 'node_modules/vite'));

			await build({ root, logLevel: 'silent' });

			const entryFile = join(root, 'dist/server/entry.js');
			expect(existsSync(entryFile)).toBe(true);
			const entry = readFileSync(entryFile, 'utf8');
			expect(entry).not.toContain('node:');
			const worker = (await import(`${pathToFileURL(entryFile).href}?test=${Date.now()}`)) as {
				createWebWorkerHandler?: unknown;
			};
			expect(worker.createWebWorkerHandler).toBeTypeOf('function');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}, 120_000);
});
