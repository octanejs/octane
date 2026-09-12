// @vitest-environment node

import { parseModule } from '@tsrx/core';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { compile } from '../../src/compiler/compile.js';
import { slotHooks } from '../../src/compiler/slot-hooks.js';

const FILENAME = '/src/signals/site.tsrx';

function compiledCalls(source: string, mode: 'client' | 'server' = 'client') {
	const ast = parseModule(compile(source, FILENAME, { mode }).code, FILENAME);
	const calls: Array<{ callee: string; site: unknown }> = [];
	const visit = (node: any) => {
		if (node === null || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (node.type === 'CallExpression') {
			const callee =
				node.callee?.type === 'Identifier'
					? node.callee.name
					: node.callee?.type === 'MemberExpression' && node.callee.property?.name;
			if (typeof callee === 'string' && /^_?\$?__(?:signal|derived|query)At/.test(callee)) {
				calls.push({ callee, site: node.arguments?.[0]?.value });
			}
		}
		for (const [key, child] of Object.entries(node)) {
			if (key !== 'loc' && key !== 'start' && key !== 'end') visit(child);
		}
	};
	visit(ast);
	return calls;
}

describe('compiler-owned signal declaration sites', () => {
	it('reports signal usage as metadata without marking ordinary or shadowed code', () => {
		const signal = `import { signal$ } from 'octane/signals'; export const draft$ = signal$(''); export function App() @{ <p /> }`;
		const ordinary = `export function App() @{ <p>ordinary</p> }`;
		const shadowed = `function signal$(value) { return value; } export function App() @{ const result = signal$('plain'); <p>{result as string}</p> }`;
		for (const mode of ['client', 'server'] as const) {
			expect(compile(signal, FILENAME, { mode }).streamedSignals).toBe(true);
			expect(compile(ordinary, FILENAME, { mode }).streamedSignals).toBeUndefined();
			expect(compile(shadowed, FILENAME, { mode }).streamedSignals).toBeUndefined();
			expect(
				compile('export function App(props) @{ <input value={props.value} /> }', FILENAME, { mode })
					.streamedSignals,
			).toBeUndefined();
			expect(
				compile('export function App(props) @{ <div {...props} /> }', FILENAME, { mode })
					.streamedSignals,
			).toBeUndefined();
			expect(
				slotHooks(
					`import { signal$ } from 'octane/signals'; export const draft$ = signal$('');`,
					'/src/state.ts',
					{ environment: mode },
				)?.streamedSignals,
			).toBe(true);
		}
	});

	it('assigns distinct stable sites to named and namespace facade calls', () => {
		const source = `import { signal$, derived$ as derive$ } from 'octane/signals';
import * as signals from 'octane/signals';
const count$ = signal$(0);
const doubled$ = derive$(() => count$.get() * 2);
export function App() @{ const selected$ = signals.query$(() => count$.get(), load); <p /> }`;
		const first = compiledCalls(source);
		const second = compiledCalls(source);
		expect(first).toEqual(second);
		expect(first).toHaveLength(3);
		expect(new Set(first.map((call) => call.site)).size).toBe(3);
		expect(first.map((call) => String(call.site).slice(0, 2))).toEqual(['g:', 'g:', 'i:']);
	});

	it('uses the same authored sites for client and server compilation', () => {
		const source = `import { signal$, derived$ } from 'octane/signals';
const count$ = signal$(0);
export function App() @{ const doubled$ = derived$(() => count$.get() * 2); <p>{String(doubled$.get())}</p> }`;
		expect(compiledCalls(source, 'client').map((call) => call.site)).toEqual(
			compiledCalls(source, 'server').map((call) => call.site),
		);
	});

	it('assigns the same stable sites in ordinary TypeScript modules', async () => {
		const source = `import { signal$, derived$ } from 'octane/signals';
export const count$ = signal$(0);
export const initial = count$.get();
export function makeDouble$() { return derived$(() => count$.get() * 2); }`;
		const client = slotHooks(source, '/src/state.ts', { environment: 'client' })!.code;
		const server = slotHooks(source, '/src/state.ts', { environment: 'server' })!.code;
		const sites = (code: string) =>
			[...code.matchAll(/"([gi]:[a-f0-9]+)"/g)].map((match) => match[1]);
		expect(sites(client)).toEqual(sites(server));
		expect(sites(client).map((site) => site.slice(0, 2))).toEqual(['g:', 'i:']);
		expect(client).toContain('__signalAt as');
		expect(
			parseModule(client, '/src/state.ts')
				.body.filter((node: any) => node.type === 'ImportDeclaration')
				.map((node: any) => node.source.value),
		).not.toContain('octane/internal/client');
		expect(server).toContain('enableServerSignalBindings as');
		const bundled = await build({
			stdin: {
				contents: client,
				loader: 'ts',
				resolveDir: resolve(import.meta.dirname, '../..'),
				sourcefile: 'state.ts',
			},
			bundle: true,
			format: 'esm',
			platform: 'browser',
			write: false,
			define: { 'process.env.NODE_ENV': JSON.stringify('production') },
		});
		vi.stubGlobal('document', new JSDOM('<main></main>').window.document);
		try {
			const module = await import(
				`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString('base64')}`
			);
			expect(module.initial).toBe(0);
			module.count$.set(3);
			expect(module.count$.get()).toBe(3);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('assigns compiler-owned sites in ordinary JavaScript modules', () => {
		const source = `import * as signals from 'octane/signals';
export const selected$ = signals.signal$('first');`;
		const client = slotHooks(source, '/src/state.js', { environment: 'client' })!.code;
		const server = slotHooks(source, '/src/state.js', { environment: 'server' })!.code;
		const site = (code: string) => code.match(/"(g:[a-f0-9]+)"/)?.[1];
		expect(site(client)).toBeDefined();
		expect(site(client)).toBe(site(server));
		expect(client).toContain('signals.__signalAt');
		expect(
			parseModule(client, '/src/state.js')
				.body.filter((node: any) => node.type === 'ImportDeclaration')
				.map((node: any) => node.source.value),
		).not.toContain('octane/internal/client');
		expect(server).toContain('enableServerSignalBindings as');
	});

	it('does not rewrite explicit scopes, foreign factories, or shadowed imports', () => {
		const source = `import { createScope, signal$ } from 'octane/signals';
const scope = createScope({ scopeKey: 'explicit' });
const explicit$ = scope.signal$('value', 1);
function local(signal$) { return signal$(2); }
const foreign = { signal$(value) { return value; } };
export function App() @{ const localValue = local((value) => value); const plain = foreign.signal$(3); <p>{String(explicit$.get() + localValue + plain)}</p> }`;
		expect(compiledCalls(source)).toHaveLength(0);
	});

	it('applies capability naming diagnostics to the owner facade', () => {
		const source = `import { signal$ } from 'octane/signals';
const count = signal$(0);
export function App() @{ <p /> }`;
		expect(() => compile(source, FILENAME, {})).toThrow('OCTANE_NATIVE_SIGNAL_NAME');
	});
});
