// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { createTempProject, type TempProject } from '../../octane/tests/_temp-project.js';
import { loadOctaneConfig, loadOctaneConfigWithMetadata } from '../src/config-loader.js';

// The loader resolves, caches, and watches real paths, so each case gets its
// own throwaway project rather than a mocked filesystem.
let project: TempProject;
let fixtureRoot: string;

function write(relative: string, source: string) {
	const filename = path.join(fixtureRoot, relative);
	fs.mkdirSync(path.dirname(filename), { recursive: true });
	fs.writeFileSync(filename, source);
}

beforeEach(() => {
	project = createTempProject('octane-app-config');
	fixtureRoot = project.root;
});

afterEach(() => {
	project.dispose();
});

describe('loadOctaneConfig', () => {
	it('evaluates TypeScript and returns cache/watch dependencies', async () => {
		write('settings.ts', `export const output = 'build-output';\n`);
		write(
			'octane.config.ts',
			`import { output } from './settings.ts';\nexport default { build: { outDir: output } };\n`,
		);

		const loaded = await loadOctaneConfigWithMetadata(fixtureRoot, {
			cacheDir: '.cache/config',
		});
		expect(loaded.config.build.outDir).toBe('build-output');
		expect(loaded.dependencies).toContain(path.join(fixtureRoot, 'octane.config.ts'));
		expect(loaded.dependencies).toContain(path.join(fixtureRoot, 'settings.ts'));
		expect(loaded.missingDependencies).toEqual([]);
	});

	it('uses an injected integration module runner without esbuild', async () => {
		write('octane.config.ts', `export default {};\n`);
		const dependency = path.join(fixtureRoot, 'config-helper.ts');
		const loadModule = async (id: string) => ({
			default: { platform: { env: { loadedFrom: id } } },
		});
		const config = await loadOctaneConfig(fixtureRoot, {
			moduleRunner: { loadModule, getDependencies: () => [dependency] },
		});
		expect(config.platform.env.loadedFrom).toBe(path.join(fixtureRoot, 'octane.config.ts'));

		const metadata = await loadOctaneConfigWithMetadata(fixtureRoot, {
			moduleRunner: { loadModule, getDependencies: () => [dependency] },
		});
		expect(metadata.dependencies).toContain(dependency);
	});

	it('server-compiles TSRX imported by the config evaluator', async () => {
		// Config evaluation externalizes packages like a real application's Node
		// process. Give the isolated project the current server runtime: compiled
		// TSRX can import helpers even when its authored source has no imports.
		write(
			'node_modules/octane/package.json',
			JSON.stringify({
				name: 'octane',
				type: 'module',
				exports: { './server': './server.mjs' },
			}),
		);
		await build({
			entryPoints: [path.resolve(import.meta.dirname, '../../octane/src/server/index.ts')],
			outfile: path.join(fixtureRoot, 'node_modules/octane/server.mjs'),
			bundle: true,
			format: 'esm',
			platform: 'node',
			target: 'node22',
		});
		write('ConfigMarker.tsrx', `export function ConfigMarker() @{ <span>ready</span> }\n`);
		write(
			'octane.config.ts',
			`import { ConfigMarker } from './ConfigMarker.tsrx';
import { renderToString } from 'octane/server';
export default { platform: { env: { marker: typeof ConfigMarker, html: (await renderToString(ConfigMarker)).html } } };
`,
		);

		const loaded = await loadOctaneConfigWithMetadata(fixtureRoot);
		expect(loaded.config.platform.env.marker).toBe('function');
		expect(loaded.config.platform.env.html).toBe('<span>ready</span>');
		expect(loaded.dependencies).toContain(path.join(fixtureRoot, 'ConfigMarker.tsrx'));
		expect(loaded.dependencies).toContain(path.join(fixtureRoot, 'node_modules/octane/server.mjs'));
		expect(loaded.missingDependencies).toEqual([]);
	});

	it('attaches missing dependencies to config evaluation failures', async () => {
		write(
			'octane.config.ts',
			`import { value } from './missing-config-helper.ts';\nexport default { build: { outDir: value } };\n`,
		);

		await expect(loadOctaneConfig(fixtureRoot)).rejects.toMatchObject({
			missingDependencies: [path.join(fixtureRoot, 'missing-config-helper.ts')],
		});
	});

	it('preserves lazy app imports without traversing renderer-only assets', async () => {
		write('lazy-app.ts', `import './renderer-asset.svg';\nexport const warm = () => {};\n`);
		write('renderer-asset.svg', `<svg></svg>\n`);
		write(
			'octane.config.ts',
			`const middleware = async (_context, next) => { await import('./lazy-app.ts'); return next(); };\nexport default { middlewares: [middleware] };\n`,
		);

		const loaded = await loadOctaneConfigWithMetadata(fixtureRoot);
		expect(loaded.config.middlewares).toHaveLength(1);
		expect(loaded.dependencies).toContain(path.join(fixtureRoot, 'lazy-app.ts'));
	});
});
