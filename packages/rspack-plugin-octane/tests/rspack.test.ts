import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import rspack from '@rspack/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OctaneRspackPlugin } from '../src/index.js';

function write(root: string, relativePath: string, content: string) {
	const file = join(root, relativePath);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, content);
	return file;
}

function runtimeSource(marker: string) {
	return `
globalThis.${marker} = true;
module.exports = new Proxy({}, {
	get(_target, name) {
		if (name === 'template') return (html) => html;
		return (...args) => args[0];
	},
});
`;
}

async function compile(config: Record<string, unknown>) {
	const compiler = rspack(config as any) as any;
	return new Promise<any>((resolve, reject) => {
		compiler.run((error: Error | null, stats: any) => {
			compiler.close((closeError: Error | null) => {
				if (error || closeError) {
					reject(error ?? closeError);
					return;
				}
				if (!stats) {
					reject(new Error('Rspack completed without stats.'));
					return;
				}
				if (stats.hasErrors()) {
					const errors = stats.toJson({ all: false, errors: true }).errors ?? [];
					reject(new Error(errors.map((entry: any) => entry.message ?? String(entry)).join('\n')));
					return;
				}
				resolve(stats);
			});
		});
	});
}

describe('programmatic Rspack integration', () => {
	let root: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'octane-rspack-build-'));
		write(
			root,
			'package.json',
			JSON.stringify({
				name: 'rspack-fixture',
				private: true,
				dependencies: { octane: '*', '@fixture/raw': '*' },
			}) + '\n',
		);
		write(
			root,
			'node_modules/octane/package.json',
			JSON.stringify({
				name: 'octane',
				exports: { '.': './client.cjs', './server': './server.cjs' },
			}) + '\n',
		);
		write(root, 'node_modules/octane/client.cjs', runtimeSource('__octane_client_runtime__'));
		write(root, 'node_modules/octane/server.cjs', runtimeSource('__octane_server_runtime__'));
		write(
			root,
			'node_modules/@fixture/raw/package.json',
			JSON.stringify({
				name: '@fixture/raw',
				exports: './index.tsx',
				dependencies: { octane: '*' },
			}) + '\n',
		);
		write(
			root,
			'node_modules/@fixture/raw/index.tsx',
			`export function Raw() { return <span data-probe="raw-binding-output">raw</span>; }\n`,
		);
		write(
			root,
			'src/App.tsrx',
			`import { useState } from 'octane';

export function App() @{
	const [value] = useState('app');
	<main data-probe="local-tsrx">{value as string}</main>
}
`,
		);
		write(
			root,
			'src/index.js',
			`export { App } from './App.tsrx';\nexport { Raw } from '@fixture/raw';\n`,
		);
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('builds client and server graphs with maps, raw dependencies, and one target runtime', async () => {
		for (const [environment, target, runtimeMarker, absentMarker] of [
			['client', 'web', '__octane_client_runtime__', '__octane_server_runtime__'],
			['server', 'node', '__octane_server_runtime__', '__octane_client_runtime__'],
		] as const) {
			const outputPath = join(root, `dist-${environment}`);
			await compile({
				context: root,
				mode: 'development',
				target,
				entry: './src/index.js',
				devtool: 'source-map',
				optimization: { minimize: false },
				output: { path: outputPath, filename: 'bundle.js' },
				plugins: [new OctaneRspackPlugin()],
			});

			const bundle = readFileSync(join(outputPath, 'bundle.js'), 'utf8');
			expect(bundle).toContain(runtimeMarker);
			expect(bundle).not.toContain(absentMarker);
			expect(bundle).toContain('local-tsrx');
			expect(bundle).toContain('raw-binding-output');
			const map = JSON.parse(readFileSync(join(outputPath, 'bundle.js.map'), 'utf8'));
			expect(map.sources.some((source: string) => source.includes('src/App.tsrx'))).toBe(true);
			expect(map.sources.some((source: string) => source.includes('@fixture/raw/index.tsx'))).toBe(
				true,
			);
		}
	}, 30_000);

	it('emits parseable webpack HMR wiring when Rspack marks the loader context hot', async () => {
		const outputPath = join(root, 'dist-hmr');
		await compile({
			context: root,
			mode: 'development',
			target: 'web',
			entry: './src/index.js',
			optimization: { minimize: false },
			output: { path: outputPath, filename: 'bundle.js' },
			plugins: [new rspack.HotModuleReplacementPlugin(), new OctaneRspackPlugin()],
		});

		const bundle = readFileSync(join(outputPath, 'bundle.js'), 'utf8');
		expect(bundle).toContain('__octaneComponents');
		expect(bundle).toContain('__webpack_require__.hmrD');
	}, 30_000);
});
