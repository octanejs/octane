import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import octaneLoader from '../src/loader.js';

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
}: {
	root: string;
	resourcePath: string;
	source: string;
	target?: unknown;
	hot?: boolean;
	mode?: string;
}) {
	const dependencies: string[] = [];
	const missingDependencies: string[] = [];
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
			getOptions: () => ({}),
			addDependency: (dependency: string) => dependencies.push(dependency),
			addMissingDependency: (dependency: string) => missingDependencies.push(dependency),
			callback: (error: Error | null, content?: string | Buffer, map?: unknown) => {
				output = { error, content, map };
			},
		},
		source,
	);
	if (!output) throw new Error('Octane loader did not invoke its callback.');
	if (output.error) throw output.error;
	return { ...output, dependencies, missingDependencies, module };
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

	it('marks module-server owners in server build metadata', () => {
		const source = `module server {
	export async function save(value: string) { return value; }
}\n`;
		const resourcePath = write(root, 'src/actions.tsrx', source);
		const result = transform({ root, resourcePath, source, target: 'node22' });

		expect(String(result.content)).toContain('export const _$_server_$_');
		expect(result.module.buildInfo.octane).toMatchObject({ serverRpc: true });
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
		expect(String(result.content)).toContain('_$template("<span>raw</span>")');
		expect(result.dependencies).toContain(join(packageRoot, 'package.json'));
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
		expect(skipped.dependencies).toContain(manifest);
		expect(skipped.module.buildInfo).not.toHaveProperty('octane');

		writeFileSync(manifest, '{"name":"nested","octane":{"hookSlots":{"manual":[]}}}\n');
		const compiled = transform({ root, resourcePath, source });
		expect(String(compiled.content)).toContain('useState(1, _h$0)');
		expect(String(compiled.content)).toContain('const _h$0 = Symbol(');
		expect(compiled.dependencies).toContain(manifest);
		expect(compiled.module.buildInfo.octane).toMatchObject({ transformKind: 'slots' });
	});
});
