import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import octaneLoader from '../src/loader.js';
import { getOctaneRspackBuildInfo } from '../src/shared.js';

interface LoaderOutput {
	error: Error | null;
	content?: string | Buffer;
	map?: unknown;
}

function write(root: string, relativePath: string, content: string) {
	const file = join(root, relativePath);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, content);
	return file;
}

function transform({
	root,
	resourcePath,
	source,
	target = 'web',
	hot = false,
	mode = 'development',
	options = {},
}: {
	root: string;
	resourcePath: string;
	source: string;
	target?: unknown;
	hot?: boolean;
	mode?: string;
	options?: Record<string, unknown>;
}) {
	const dependencies: string[] = [];
	const missingDependencies: string[] = [];
	const warnings: Error[] = [];
	const module = { buildInfo: {} as Record<string, unknown> };
	let output: LoaderOutput | undefined;
	octaneLoader.call(
		{
			rootContext: root,
			resource: resourcePath,
			resourcePath,
			target,
			hot,
			mode,
			sourceMap: true,
			_module: module,
			cacheable() {},
			getOptions: () => options,
			addDependency: (dependency: string) => dependencies.push(dependency),
			addMissingDependency: (dependency: string) => missingDependencies.push(dependency),
			emitWarning: (warning: Error) => warnings.push(warning),
			callback: (error: Error | null, content?: string | Buffer, map?: unknown) => {
				output = { error, content, map };
			},
		},
		source,
	);
	if (!output) throw new Error('Octane loader did not invoke its callback.');
	if (output.error) throw output.error;
	return { ...output, dependencies, missingDependencies, warnings, module };
}

describe('loader with the neutral compiler', () => {
	let root: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'octane-rspack-loader-'));
		write(root, 'package.json', '{"name":"loader-fixture","private":true}\n');
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('compiles client TSRX with source maps and webpack HMR', () => {
		const resourcePath = write(
			root,
			'src/App.tsrx',
			`export function App() @{ <button>ready</button> }\n`,
		);
		const source = `export function App() @{ <button>ready</button> }\n`;
		const result = transform({ root, resourcePath, source, hot: true });
		const code = String(result.content);
		expect(code).toContain('import.meta.webpackHot');
		expect(code).toContain('import.meta.webpackHot.dispose');
		expect(code).not.toContain('import.meta.hot');
		expect(result.map).toMatchObject({ version: 3, sources: ['App.tsrx'] });
		expect(result.module.buildInfo.octane).toEqual({
			canonicalId: '/src/App.tsrx',
			transformKind: 'compile',
			serverRpc: false,
		});
	});

	it('selects server codegen from a node target', () => {
		const resourcePath = write(root, 'src/App.tsrx', `export function App() @{ <p>server</p> }\n`);
		const result = transform({
			root,
			resourcePath,
			source: `export function App() @{ <p>server</p> }\n`,
			target: 'node22',
			hot: true,
		});
		const code = String(result.content);
		expect(code).toContain('return "<p>" + "server" + "</p>"');
		expect(code).not.toContain('_$template');
		expect(code).not.toContain('webpackHot');
	});

	it('attaches the same client-reference metadata to client code and its server stub', () => {
		const source = `import './authored-setup.js';\nexport default function Scene() @{ <node /> }\n`;
		const resourcePath = write(root, 'src/Scene.object.tsrx', source);
		const options = {
			renderers: {
				registry: {
					object: {
						module: '@fixture/object-renderer',
						server: 'client-only',
					},
				},
				rules: [{ include: 'src/**/*.object.tsrx', renderer: 'object' }],
			},
		};
		const client = transform({ root, resourcePath, source, options });
		const server = transform({ root, resourcePath, source, target: 'node22', options });

		const clientInfo = getOctaneRspackBuildInfo(client.module)!;
		const serverInfo = getOctaneRspackBuildInfo(server.module)!;
		expect(clientInfo).toMatchObject({
			transformKind: 'compile',
			clientReference: {
				moduleId: '/src/Scene.object.tsrx',
				renderer: 'object',
			},
		});
		expect(serverInfo).toMatchObject({
			transformKind: 'client-only-stub',
			clientReference: clientInfo.clientReference,
		});
		expect(String(server.content)).not.toContain('authored-setup');
	});

	it('marks module-server owners in server build metadata', () => {
		const source = `module server {
	export async function save(value: string) { return value; }
}\n`;
		const resourcePath = write(root, 'src/actions.tsrx', source);
		const result = transform({ root, resourcePath, source, target: 'node22' });

		expect(String(result.content)).toContain('export const _$_server_$_');
		expect(result.module.buildInfo.octane).toMatchObject({ serverRpc: true });
	});

	it('gates ownership behind requireDirective and reports forgotten directives', () => {
		const options = { requireDirective: true };
		// Fixtures exist on disk, as in a real build: the loader realpaths the
		// resource, so project ownership resolves against the realpathed root.
		const reactSource = "import * as React from 'react';\nexport const Host = () => <p/>;\n";
		const islandSource = "'use octane';\nexport function Island() @{ <p>{'island'}</p> }";
		const badSource = 'export function Bad() @{ <p/> }';
		const hookSource =
			"import { useState } from 'octane';\nexport function useCount() { return useState(0); }\n";

		// An undirected project .tsx belongs to the host toolchain: untouched,
		// no Octane build metadata.
		const host = transform({
			root,
			resourcePath: write(root, 'src/Host.tsx', reactSource),
			source: reactSource,
			options,
		});
		expect(host.content).toBe(reactSource);
		expect(getOctaneRspackBuildInfo(host.module)).toBeNull();

		// The directive claims a module for Octane and never ships.
		const island = transform({
			root,
			resourcePath: write(root, 'src/Island.tsrx', islandSource),
			source: islandSource,
			options,
		});
		expect(String(island.content)).not.toContain('use octane');
		expect(getOctaneRspackBuildInfo(island.module)?.transformKind).toBe('compile');

		// An undirected .tsrx has no other compiler — surfaced as a build error.
		expect(() =>
			transform({
				root,
				resourcePath: write(root, 'src/Bad.tsrx', badSource),
				source: badSource,
				options,
			}),
		).toThrow(/has no 'use octane' module directive/);

		// An undirected octane-importing .ts skips slotting and warns through
		// Rspack's module-warning channel.
		const hook = transform({
			root,
			resourcePath: write(root, 'src/useCount.ts', hookSource),
			source: hookSource,
			options,
		});
		expect(String(hook.content)).toContain('useCount');
		expect(getOctaneRspackBuildInfo(hook.module)).toBeNull();
		expect(hook.warnings.some((warning) => warning.message.includes("'use octane'"))).toBe(true);
	});

	it('compiles eligible raw dependency TSX', () => {
		const packageRoot = join(root, 'node_modules/@fixture/raw');
		mkdirSync(packageRoot, { recursive: true });
		writeFileSync(
			join(packageRoot, 'package.json'),
			'{"name":"@fixture/raw","dependencies":{"octane":"*"}}\n',
		);
		const resourcePath = write(
			root,
			'node_modules/@fixture/raw/index.tsx',
			`export function Raw() { return <span>raw</span>; }\n`,
		);
		const result = transform({
			root,
			resourcePath,
			source: `export function Raw() { return <span>raw</span>; }\n`,
		});
		expect(getOctaneRspackBuildInfo(result.module)).toEqual({
			canonicalId: '/node_modules/@fixture/raw/index.tsx',
			transformKind: 'compile',
			serverRpc: false,
		});
		expect(result.dependencies).toContain(realpathSync(join(packageRoot, 'package.json')));
	});

	it('keeps production roots generic when the loader cannot prove resolved module output', () => {
		write(
			root,
			'src/Main.tsrx',
			'export default function Main() @{ <main>disk component</main> }\n',
		);
		const source =
			"import { createRoot } from 'octane';\n" +
			"import Main from './Main.tsrx';\n" +
			'createRoot(document.body).render(Main);\n';
		const resourcePath = write(root, 'src/main.js', source);
		const result = transform({ root, resourcePath, source, mode: 'production' });

		expect(result.content).toBe(source);
		expect(result.dependencies).not.toContain(join(root, 'src/Main.tsrx'));
	});

	it('watches a manual-slot manifest that changes a plain TypeScript decision', () => {
		const manifest = write(
			root,
			'src/pkg/package.json',
			'{"name":"nested","octane":{"hookSlots":{"manual":["hooks"]}}}\n',
		);
		const source = `import { useState } from 'octane';\nexport function useValue(): number { return useState(1)[0]; }\n`;
		const resourcePath = write(root, 'src/pkg/hooks/hook.ts', source);
		const skipped = transform({ root, resourcePath, source });
		expect(skipped.content).toBe(source);
		expect(skipped.dependencies).toContain(realpathSync(manifest));
		expect(skipped.module.buildInfo).not.toHaveProperty('octane');

		writeFileSync(manifest, '{"name":"nested","octane":{"hookSlots":{"manual":[]}}}\n');
		const compiled = transform({ root, resourcePath, source });
		expect(String(compiled.content)).toContain('useState(1, _h$0)');
		expect(String(compiled.content)).toContain('const _h$0 = Symbol(');
		expect(compiled.dependencies).toContain(realpathSync(manifest));
		expect(compiled.module.buildInfo.octane).toMatchObject({ transformKind: 'slots' });
	});
});
