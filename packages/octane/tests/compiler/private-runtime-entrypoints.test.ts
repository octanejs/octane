// @vitest-environment node

import { resolve, sep } from 'node:path';
import { parseModule } from '@tsrx/core';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { compile } from '../../src/compiler/index.js';

async function bundleRuntimeEntry(source: string) {
	return build({
		stdin: {
			contents: source,
			loader: 'js',
			resolveDir: resolve(import.meta.dirname, '../..'),
			sourcefile: 'private-runtime-entry.js',
		},
		bundle: true,
		format: 'iife',
		globalName: 'RuntimeFixture',
		logLevel: 'silent',
		metafile: true,
		minify: true,
		platform: 'neutral',
		target: 'esnext',
		treeShaking: true,
		write: false,
	});
}

describe('private compiler-runtime package entries', () => {
	it('keeps eventful explicit DOM targets on the same runtime contract', () => {
		const source = `export function Surface(props) @{ <button onClick={props.click} onScrollCapture={props.scroll} /> }`;
		for (const output of ['js', 'ts'] as const) {
			const options = { dev: false, hmr: false, output };
			const ordinary = compile(source, 'event-target.tsrx', options);
			for (const module of ['octane', 'custom-dom-metadata']) {
				expect(
					compile(source, 'event-target.tsrx', {
						...options,
						renderer: { id: 'dom', module, target: 'dom' },
					}),
				).toEqual(ordinary);
			}
			const nativeReads = compile(source, 'event-target.tsrx', { ...options, nativeReads: true });
			const requests = parseModule(nativeReads.code, 'event-target.ts')
				.body.filter((statement: any) => statement.type === 'ImportDeclaration')
				.map((statement: any) => statement.source.value);
			expect(requests).toContain('octane/internal/client');
			expect(
				requests.every(
					(request: string) => request === 'octane' || request === 'octane/internal/client',
				),
			).toBe(true);
		}
	});

	it('keeps native event props within the selected non-DOM renderer ABI', () => {
		for (const target of ['universal', 'valdi'] as const) {
			const renderer = { id: 'native', module: 'custom-native-runtime', target };
			const { code } = compile(
				'export function Surface(props) @{ <view onTap={props.handle} /> }',
				'event-native.tsrx',
				{ renderer, hmr: false },
			);
			const requests = parseModule(code, 'event-native.js')
				.body.filter((statement: any) => statement.type === 'ImportDeclaration')
				.map((statement: any) => statement.source.value);
			expect(new Set(requests)).toEqual(new Set([renderer.module]));
		}
		const server = compile(
			'export function Surface(props) @{ <button onClick={props.handle} onScrollCapture={props.handle} /> }',
			'event-server.tsrx',
			{ mode: 'server', hmr: false },
		);
		const requests = parseModule(server.code, 'event-server.js')
			.body.filter((statement: any) => statement.type === 'ImportDeclaration')
			.map((statement: any) => statement.source.value);
		expect(
			requests.every(
				(request: string) => request === 'octane/server' || request === 'octane/internal/server',
			),
		).toBe(true);
	});

	it('preserves an explicitly routed registration ABI', () => {
		const options = {
			hmr: false,
			__runtimeImportRoutes: [
				{
					module: 'custom-delegation',
					imported: new Set(['delegateEvents', 'delegateCaptureEvents']),
				},
			],
		};
		const { code } = compile(
			'export function Surface(props) @{ <button onClick={props.handle} onScrollCapture={props.handle} /> }',
			'event-route.tsrx',
			options,
		);
		const routed = parseModule(code, 'event-route.js')
			.body.filter(
				(statement: any) =>
					statement.type === 'ImportDeclaration' && statement.source.value === 'custom-delegation',
			)
			.flatMap((statement: any) =>
				statement.specifiers.map((specifier: any) => specifier.imported.name),
			);
		expect(routed.sort()).toEqual(['delegateCaptureEvents', 'delegateEvents']);
	});

	it('preserves public application imports alongside private generated client imports', () => {
		const { code } = compile(
			`import { useState } from 'octane';
			export function App(props) @{
				const [value] = useState('present');
				<div ref={props.host}>{value as string}</div>
			}`,
			'private-client-runtime.tsrx',
			{ dev: false, hmr: false },
		);
		const imports = parseModule(code, 'private-client-runtime.js').body.filter(
			(statement) => statement.type === 'ImportDeclaration',
		);
		const publicImport = imports.find((statement) => statement.source.value === 'octane');
		const privateImport = imports.find(
			(statement) => statement.source.value === 'octane/internal/client',
		);

		expect(
			publicImport?.specifiers.some(
				(specifier) =>
					specifier.type === 'ImportSpecifier' && specifier.imported.name === 'useState',
			),
		).toBe(true);
		expect(privateImport?.specifiers.length).toBeGreaterThan(0);
	});

	it('bundles client helpers without reaching the server renderer', async () => {
		const result = await bundleRuntimeEntry(
			`import { normalizeClass } from 'octane/internal/client';
			export const value = normalizeClass(['first', { second: true, excluded: false }]);`,
		);
		const value = new Function(`${result.outputFiles[0].text}\nreturn RuntimeFixture.value;`)();
		const inputs = Object.keys(result.metafile.inputs).map((input) => input.split(sep).join('/'));

		expect(value).toBe('first second');
		expect(inputs.some((input) => input.endsWith('/src/runtime.server.ts'))).toBe(false);
		expect(inputs.some((input) => input.endsWith('/src/server-rpc-client.ts'))).toBe(false);
		expect(inputs.some((input) => input.includes('/node_modules/devalue/'))).toBe(false);
	});

	it('preserves public server hooks alongside private generated content imports', () => {
		const { code } = compile(
			`import { useState } from 'octane';
			export function App(props) @{
				const [value] = useState('present');
				<section {...props.attrs} data-value={value} />
			}`,
			'private-server-runtime.tsrx',
			{ mode: 'server', dev: false, hmr: false },
		);
		const imports = parseModule(code, 'private-server-runtime.js').body.filter(
			(statement) => statement.type === 'ImportDeclaration',
		);
		const publicImport = imports.find((statement) => statement.source.value === 'octane/server');
		const privateImport = imports.find(
			(statement) => statement.source.value === 'octane/internal/server',
		);

		expect(
			publicImport?.specifiers.some(
				(specifier) =>
					specifier.type === 'ImportSpecifier' && specifier.imported.name === 'useState',
			),
		).toBe(true);
		expect(privateImport?.specifiers.length).toBeGreaterThan(0);
	});

	it('bundles server helpers without reaching the browser renderer', async () => {
		const result = await bundleRuntimeEntry(
			`import { escapeHtml } from 'octane/internal/server';
			export const value = escapeHtml('<span title="x">');`,
		);
		const value = new Function(`${result.outputFiles[0].text}\nreturn RuntimeFixture.value;`)();
		const inputs = Object.keys(result.metafile.inputs).map((input) => input.split(sep).join('/'));

		expect(value).toBe('&lt;span title="x"&gt;');
		expect(inputs.some((input) => input.endsWith('/src/runtime.ts'))).toBe(false);
	});
});
