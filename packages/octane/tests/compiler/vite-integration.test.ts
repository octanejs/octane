// @vitest-environment node

import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { build, createServer, parseAst, type InlineConfig, type ViteDevServer } from 'vite';
import { octane } from '../../src/compiler/vite.js';

const OCTANE_PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url));

describe('octane/compiler/vite integration', () => {
	let server: ViteDevServer | null = null;
	let fixtureRoot: string | null = null;

	afterEach(async () => {
		await server?.close();
		server = null;
		if (fixtureRoot !== null) rmSync(fixtureRoot, { recursive: true, force: true });
		fixtureRoot = null;
	});

	for (const output of [undefined, 'ts'] as const) {
		for (const hmr of [false, true]) {
			it(`serves typed components and renders environment attributes (output=${output ?? 'default JS'}, hmr=${hmr})`, async () => {
				fixtureRoot = mkdtempSync(join(tmpdir(), 'octane-vite-import-meta-'));
				mkdirSync(join(fixtureRoot, 'node_modules'));
				symlinkSync(OCTANE_PACKAGE_ROOT, join(fixtureRoot, 'node_modules/octane'), 'dir');
				writeFileSync(join(fixtureRoot, 'package.json'), JSON.stringify({ type: 'module' }));
				const source = `type Attributes = { method?: string; action?: string };
				function Form(props: { attributes: Attributes }) @{ <form {...props.attributes} /> }
				export function App(props: { attributes: Attributes; action: string }) @{
					<Form attributes={{
						...Object.assign({}, props.attributes),
						...(import.meta.env.SSR ? { action: props.action } : {}),
					}} />
				}`;
				writeFileSync(join(fixtureRoot, 'Form.tsrx'), source);
				writeFileSync(
					join(fixtureRoot, 'entry.ts'),
					`import { renderToStaticMarkup } from 'octane/server';
				import { App } from './Form.tsrx';
				export const render = (action) => renderToStaticMarkup(App, {
					action, attributes: { method: 'post' },
				}).html;`,
				);
				server = await createServer({
					root: fixtureRoot,
					configFile: false,
					logLevel: 'silent',
					appType: 'custom',
					plugins: [octane({ output, hmr, strong: true })],
					server: { middlewareMode: true },
				});
				const loaded = await server.ssrLoadModule('/entry.ts');
				expect(loaded.render('/first')).toBe('<form method="post" action="/first"></form>');
				expect(loaded.render('/second')).toBe('<form method="post" action="/second"></form>');
				const client = await server.transformRequest('/Form.tsrx');
				expect(client).not.toBeNull();
				expect(() => parseAst(client!.code)).not.toThrow();
				expect(client!.map).toHaveProperty('sourcesContent', expect.arrayContaining([source]));
			});
		}
	}

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

	it('resolves tsconfig paths from the .tsrx files a tsconfig include owns', async () => {
		fixtureRoot = realpathSync(mkdtempSync(join(tmpdir(), 'octane-vite-tsconfig-paths-')));
		mkdirSync(join(fixtureRoot, 'node_modules'));
		mkdirSync(join(fixtureRoot, 'src/lib'), { recursive: true });
		mkdirSync(join(fixtureRoot, 'other'));
		symlinkSync(OCTANE_PACKAGE_ROOT, join(fixtureRoot, 'node_modules/octane'), 'dir');
		writeFileSync(join(fixtureRoot, 'package.json'), JSON.stringify({ type: 'module' }));
		// TypeScript expands `src` to its own extensions, so Vite's matcher never
		// sees `src/App.tsrx` as included; Octane's TypeScript service does.
		writeFileSync(
			join(fixtureRoot, 'tsconfig.json'),
			JSON.stringify({ compilerOptions: { paths: { '~/*': ['./src/*'] } }, include: ['src'] }),
		);
		writeFileSync(
			join(fixtureRoot, 'src/lib/label.ts'),
			"export const label = (text: string): string => 'label:' + text;\n",
		);
		writeFileSync(
			join(fixtureRoot, 'src/App.tsrx'),
			"import { label } from '~/lib/label';\nexport function App() @{ <p>{label('tsrx')}</p> }\n",
		);
		writeFileSync(
			join(fixtureRoot, 'src/entry.ts'),
			"import { renderToStaticMarkup } from 'octane/server';\nimport { App } from './App.tsrx';\n" +
				'export const render = () => renderToStaticMarkup(App).html;\n',
		);
		// Outside the include, a .ts file gets no paths, and neither does a .tsrx.
		writeFileSync(
			join(fixtureRoot, 'other/Outside.tsrx'),
			"import { label } from '~/lib/label';\nexport function Outside() @{ <p>{label('x')}</p> }\n",
		);
		const config: InlineConfig = {
			root: fixtureRoot,
			configFile: false,
			logLevel: 'silent',
			resolve: { tsconfigPaths: true },
			plugins: [octane({ hmr: false })],
		};

		server = await createServer({
			...config,
			appType: 'custom',
			server: { middlewareMode: true },
		});
		const loaded = (await server.ssrLoadModule('/src/entry.ts')) as { render(): string };
		expect(loaded.render()).toBe('<p>label:tsrx</p>');
		await server.transformRequest('/src/App.tsrx');
		const app = await server.environments.client.moduleGraph.getModuleByUrl('/src/App.tsrx');
		expect([...app!.importedModules].map((module) => module.url)).toContain('/src/lib/label.ts');
		await expect(server.transformRequest('/other/Outside.tsrx')).rejects.toThrow(
			'Failed to resolve import "~/lib/label"',
		);

		const output = await build({
			...config,
			build: {
				write: false,
				lib: { entry: 'src/App.tsrx', formats: ['es'] },
				rolldownOptions: { external: [/^octane/] },
			},
		});
		const [bundle] = Array.isArray(output) ? output : [output];
		expect('output' in bundle && bundle.output[0].code).toContain('label:');
	});

	it('prebundles the dependencies of an installed source package that reach CommonJS', async () => {
		fixtureRoot = realpathSync(mkdtempSync(join(tmpdir(), 'octane-vite-installed-source-')));
		const writePackage = (dir: string, manifest: object, files: Record<string, string> = {}) => {
			mkdirSync(join(fixtureRoot!, dir, 'src'), { recursive: true });
			writeFileSync(
				join(fixtureRoot!, dir, 'package.json'),
				JSON.stringify({ version: '1.0.0', ...manifest }),
			);
			for (const [file, source] of Object.entries(files)) {
				writeFileSync(join(fixtureRoot!, dir, file), source);
			}
		};
		const sourcePackage = (name: string, dependencies: object) => ({
			name,
			type: 'module',
			exports: './src/index.ts',
			peerDependencies: { octane: '*' },
			dependencies,
		});
		writePackage('.', {
			name: 'app',
			type: 'module',
			dependencies: { octane: '*', 'outer-source': '1', 'esm-source': '1' },
		});
		mkdirSync(join(fixtureRoot, 'node_modules'));
		symlinkSync(OCTANE_PACKAGE_ROOT, join(fixtureRoot, 'node_modules/octane'), 'dir');
		// Installed below another source package, as package managers nest it.
		const innerSource = '/node_modules/outer-source/node_modules/inner-source';
		writePackage(
			'node_modules/outer-source',
			sourcePackage('outer-source', { 'inner-source': '1' }),
			{
				'src/index.ts': "export * from 'inner-source';\n",
			},
		);
		writePackage(innerSource, sourcePackage('inner-source', { wrapper: '1', 'esm-part': '1' }), {
			'src/index.ts': "export { Read } from './Read.tsrx';\n",
			'src/Read.tsrx':
				"import { wrapped } from 'wrapper';\nimport { part } from 'esm-part/part';\n" +
				'export function Read() @{ <p>{(wrapped() + part) as string}</p> }\n',
		});
		// ESM itself, over a CommonJS dependency the browser cannot import raw.
		writePackage(
			'node_modules/wrapper',
			{ name: 'wrapper', type: 'module', exports: './index.js', dependencies: { 'cjs-leaf': '1' } },
			{
				'index.js':
					"import leaf from 'cjs-leaf';\nexport const wrapped = () => 'wrapped ' + leaf();\n",
			},
		);
		writePackage(
			'node_modules/cjs-leaf',
			{ name: 'cjs-leaf', main: 'index.js' },
			{ 'index.js': "module.exports = function leaf() { return 'cjs leaf'; };\n" },
		);
		writePackage(
			'node_modules/esm-part',
			{ name: 'esm-part', type: 'module', exports: { './part': './part.js' } },
			{ 'part.js': "export const part = 'part';\n" },
		);
		// A source package whose dependencies are ESM throughout.
		writePackage('node_modules/esm-source', sourcePackage('esm-source', { 'esm-only': '1' }), {
			'src/index.ts': "export { esm } from 'esm-only';\n",
		});
		writePackage(
			'node_modules/esm-only',
			{ name: 'esm-only', type: 'module', exports: './index.js' },
			{ 'index.js': "export const esm = 'esm';\n" },
		);

		server = await createServer({
			root: fixtureRoot,
			configFile: false,
			logLevel: 'silent',
			appType: 'custom',
			plugins: [octane({ hmr: false })],
			server: { middlewareMode: true },
		});
		const client = server.environments.client;
		const importedFiles = async (url: string) => {
			await client.transformRequest(url);
			const module = await client.moduleGraph.getModuleByUrl(url);
			return [...module!.importedModules]
				.map((imported) => imported.file!)
				.filter((file) => !file.startsWith(OCTANE_PACKAGE_ROOT));
		};
		const [wrapper, part] = await importedFiles(`${innerSource}/src/Read.tsrx`);
		// Every dependency the package imports comes from one prebundle run, so
		// none of them mixes with a raw copy of a module another one bundled.
		expect(wrapper.startsWith(client.config.cacheDir)).toBe(true);
		expect(part.startsWith(client.config.cacheDir)).toBe(true);
		await client.pluginContainer.load(wrapper);
		const prebundled = await import(pathToFileURL(wrapper).href);
		expect(prebundled.wrapped()).toBe('wrapped cjs leaf');

		expect(await importedFiles('/node_modules/esm-source/src/index.ts')).toEqual([
			join(fixtureRoot, 'node_modules/esm-only/index.js'),
		]);
	});

	it("drops the bundler's 'use client' directive warning and passes other logs on", () => {
		// Rolldown 1.2.16+ (Vite 8.3) warns once for every module that opens with a
		// directive; ported React libraries such as Base UI start hundreds of parts
		// with `'use client'`. Octane has no Server Components, so that one has
		// nothing to preserve. The log below is the shape Rolldown emits.
		const directive = (name: string) => ({
			code: 'MODULE_LEVEL_DIRECTIVE',
			message: `[MODULE_LEVEL_DIRECTIVE] The semantics of the module level directive "${name}" in "src/Part.tsrx" may not be preserved when bundling.`,
		});
		const onLog = octane({ hmr: false }).onLog as (
			level: 'warn',
			log: ReturnType<typeof directive>,
		) => boolean | void;

		expect(onLog('warn', directive('use client'))).toBe(false);
		expect(onLog('warn', directive('use custom'))).not.toBe(false);
	});
});
