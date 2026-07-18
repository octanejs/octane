// @vitest-environment node

import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { octane } from '../src/compiler/vite.js';

const OCTANE_PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));

describe('octane/compiler/vite integration', () => {
	let server: ViteDevServer | null = null;
	let fixtureRoot: string | null = null;

	afterEach(async () => {
		await server?.close();
		server = null;
		if (fixtureRoot !== null) rmSync(fixtureRoot, { recursive: true, force: true });
		fixtureRoot = null;
	});

	it('discovers a parent package and routes raw dependency imports to the SSR runtime', async () => {
		fixtureRoot = mkdtempSync(join(tmpdir(), 'octane-vite-zero-shim-'));
		const viteRoot = join(fixtureRoot, 'nested-app');
		const dependencyRoot = join(fixtureRoot, 'node_modules/raw-octane-source');
		mkdirSync(join(dependencyRoot, 'src'), { recursive: true });
		mkdirSync(viteRoot, { recursive: true });

		writeFileSync(
			join(fixtureRoot, 'package.json'),
			JSON.stringify({
				name: 'nested-root-consumer',
				private: true,
				type: 'module',
				dependencies: { octane: '0.0.0', 'raw-octane-source': '0.0.0' },
			}),
		);
		writeFileSync(
			join(dependencyRoot, 'package.json'),
			JSON.stringify({
				name: 'raw-octane-source',
				version: '0.0.0',
				type: 'module',
				exports: './src/index.ts',
				peerDependencies: { octane: '*' },
				octane: { hookSlots: { manual: ['src'] } },
			}),
		);
		writeFileSync(
			join(dependencyRoot, 'src/index.ts'),
			"import { renderToStaticMarkup } from 'octane';\n" +
				"import View from './View.tsrx';\n" +
				'export function render() { return renderToStaticMarkup(View).html; }\n',
		);
		writeFileSync(
			join(dependencyRoot, 'src/View.tsrx'),
			"export default function View() @{ <p>{'zero shim'}</p> }\n",
		);
		writeFileSync(join(viteRoot, 'entry.ts'), "export { render } from 'raw-octane-source';\n");
		symlinkSync(OCTANE_PACKAGE_ROOT, join(fixtureRoot, 'node_modules/octane'), 'dir');

		server = await createServer({
			root: viteRoot,
			configFile: false,
			logLevel: 'silent',
			appType: 'custom',
			plugins: [octane({ hmr: false })],
			server: { middlewareMode: true },
		});

		expect(server.config.optimizeDeps.exclude).toContain('raw-octane-source');
		expect(server.config.ssr.noExternal).toContain('raw-octane-source');

		const loaded = await server.ssrLoadModule('/entry.ts');
		expect(loaded.render()).toBe('<p>zero shim</p>');
	});
});
