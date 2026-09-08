// @vitest-environment node

import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import rspack, { type RuleSetRule } from '@rspack/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OctaneRspackPluginOptions } from '../types/index.js';
import {
	buildFixture,
	createFixture,
	cssRule,
	renderClient,
	serverModule,
	write,
	type Build,
	type CssProvider,
	type CssProviderInput,
} from './_css-module-build.js';

const requireFixture = createRequire(import.meta.url);
const immutableMeta = 'fixture:immutable-css-constants';
const roots: string[] = [];

function fixture(files: Record<string, string>) {
	const root = createFixture(files);
	roots.push(root);
	return root;
}

function ownershipFixture() {
	return fixture({
		'used.module.css': '.root{color:red}.label{color:blue}.tail{color:green}',
		'unused.module.css': '.unusedRoot{color:purple}.unusedLabel{color:orange}',
		'Components.tsrx': `import { root, label } from './used.module.css';
import * as classes from './used.module.css';
import { unusedRoot, unusedLabel } from './unused.module.css';
export function Used() @{ <main class={root}><span class={label}>live</span><i class={classes.tail} /></main> }
export function Unused() @{ <aside class={unusedRoot}><b class={unusedLabel}>unused</b></aside> }
export function Plain() @{ <p>plain</p> }`,
		'used.js': `export { Used } from './Components.tsrx';`,
		'unused.js': `export { Plain } from './Components.tsrx';`,
		'lazy.js': `export { Used } from './Components.tsrx';`,
		'entry.js': `export const load = () => import('./lazy.js');`,
	});
}

function expectOwnership(used: Build, unused: Build, lazy: Build) {
	expect(used.cssSource).toContain('.mapped_root');
	expect(used.cssSource).toContain('.mapped_label');
	expect(used.cssSource).not.toContain('.mapped_unusedRoot');
	expect(used.initialCss.length).toBeGreaterThan(0);
	expect(unused.cssSource).toBe('');
	expect(unused.initialCss).toEqual([]);
	expect(lazy.cssSource).toContain('.mapped_root');
	expect(lazy.cssSource).not.toContain('.mapped_unusedRoot');
	expect(lazy.initialCss).toEqual([]);
	expect(lazy.lazyCss.length).toBeGreaterThan(0);
}

function immutableProviderRules(root: string, finalLabel = 'provided_label'): RuleSetRule[] {
	const loader = write(
		root,
		'provider-loader.cjs',
		`module.exports = function () {
  const named = { root: 'provided_root', label: 'provided_label', tail: 'provided_tail' };
  this._module.buildInfo[${JSON.stringify(immutableMeta)}] = { named, default: named };
  return ${JSON.stringify(`import './provider.css';
export const root = 'provided_root';
export const label = ${JSON.stringify(finalLabel)};
export const tail = 'provided_tail';
export default Object.freeze({ root, label, tail });`)};
};`,
	);
	return [
		{
			test: /\.css$/,
			oneOf: [
				{
					test: /virtual\.module\.css$/,
					type: 'javascript/auto',
					sideEffects: false,
					use: [loader],
				},
				{
					type: 'javascript/auto',
					sideEffects: true,
					use: [
						rspack.CssExtractRspackPlugin.loader,
						{ loader: requireFixture.resolve('css-loader'), options: { modules: false } },
					],
				},
			],
		},
	];
}

const provideImmutable: CssProvider = ({ meta }) => meta[immutableMeta] as ReturnType<CssProvider>;

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('CSS-module constants in Rspack production builds', () => {
	it.each([
		['main-thread compilation', false],
		['worker compilation', { maxWorkers: 2 }],
	] satisfies Array<[string, OctaneRspackPluginOptions['parallel']]>)(
		'preserves used, unused, and lazy CSS with %s',
		async (_name, parallel) => {
			const root = ownershipFixture();
			const controls: Build[] = [];
			const proven: Build[] = [];
			for (const entry of ['used.js', 'unused.js', 'entry.js']) {
				controls.push(
					await buildFixture(root, `./${entry}`, { parallel, cssModuleConstants: false }),
				);
				proven.push(await buildFixture(root, `./${entry}`, { parallel }));
			}
			expectOwnership(controls[0], controls[1], controls[2]);
			expectOwnership(proven[0], proven[1], proven[2]);
			for (let index = 0; index < controls.length; index++) {
				expect(proven[index].css).toEqual(controls[index].css);
				expect(proven[index].initialCss).toEqual(controls[index].initialCss);
				expect(proven[index].lazyCss).toEqual(controls[index].lazyCss);
			}
		},
		30_000,
	);

	it('renders the same client and server classes from extracted named exports', async () => {
		const root = ownershipFixture();
		write(
			root,
			'client.js',
			`import { createRoot } from 'octane';
import { Used } from './Components.tsrx';
export function render(container) { const root = createRoot(container); root.render(Used); return () => root.unmount(); }`,
		);
		write(
			root,
			'server.js',
			`import { renderToStaticMarkup } from 'octane/server';
import { Used } from './Components.tsrx';
export function render() { return renderToStaticMarkup(Used).html; }`,
		);
		const expected =
			'<main class="mapped_root"><span class="mapped_label">live</span><i class="mapped_tail"></i></main>';
		for (const cssModuleConstants of [false, true]) {
			const client = await buildFixture(root, './client.js', {
				externalRuntime: false,
				cssModuleConstants,
			});
			const server = await buildFixture(root, './server.js', { server: true, cssModuleConstants });
			expect(renderClient(client)).toBe(expected);
			expect(serverModule(server).render()).toBe(expected);
			expect(client.cssSource).toContain('.mapped_tail');
			expect(server.cssSource).toContain('.mapped_tail');
		}
	}, 30_000);

	it('keeps native CSS modules on their normal Rspack path', async () => {
		const root = ownershipFixture();
		const provider = vi.fn<CssProvider>(() => ({
			named: { root: 'incorrect', label: 'incorrect' },
		}));
		const control = await buildFixture(root, './used.js', {
			cssMode: 'native',
			cssModuleConstants: false,
		});
		const enabled = await buildFixture(root, './used.js', {
			cssMode: 'native',
			cssModuleConstants: provider,
		});
		expect(enabled.css).toEqual(control.css);
		expect(enabled.cssSource).toContain('.mapped_label');
		expect(enabled.initialCss).toEqual(control.initialCss);
		expect(provider).not.toHaveBeenCalled();
	});

	it('leaves production CSS live when Rspack HMR is enabled', async () => {
		const root = ownershipFixture();
		write(
			root,
			'client.js',
			`import { createRoot } from 'octane';
import { Used } from './Components.tsrx';
export function render(container) { const root = createRoot(container); root.render(Used); return () => root.unmount(); }`,
		);
		const provider = vi.fn<CssProvider>(() => ({
			named: { root: 'incorrect', label: 'incorrect' },
		}));
		const output = await buildFixture(root, './client.js', {
			externalRuntime: false,
			cssModuleConstants: provider,
			configuration: { plugins: [new rspack.HotModuleReplacementPlugin()] },
		});
		expect(provider).not.toHaveBeenCalled();
		expect(output.cssSource).toContain('.mapped_label');
		expect(renderClient(output)).toBe(
			'<main class="mapped_root"><span class="mapped_label">live</span><i class="mapped_tail"></i></main>',
		);
	}, 30_000);

	it('does not freeze the ordinary mutable default class map', async () => {
		const root = fixture({
			'styles.module.css': '.root{color:red}.label{color:blue}',
			'App.tsrx': `import styles from './styles.module.css';
export function App() @{ <main class={styles.root}><span class={styles.label}>live</span></main> }`,
			'entry.js': `import styles from './styles.module.css';
import { App } from './App.tsrx';
import { renderToStaticMarkup } from 'octane/server';
export function render() { return renderToStaticMarkup(App).html; }
export function mutate() { styles.root = 'changed_root'; styles.label = 'changed_label'; }`,
		});
		const api = serverModule(
			await buildFixture(root, './entry.js', { server: true, cssMode: 'default' }),
		);
		expect(api.render()).toBe(
			'<main class="mapped_root"><span class="mapped_label">live</span></main>',
		);
		api.mutate();
		expect(api.render()).toBe(
			'<main class="changed_root"><span class="changed_label">live</span></main>',
		);
	});

	it('authenticates immutable provider maps without making their stylesheet eager', async () => {
		const root = fixture({
			'virtual.module.css': '',
			'provider.css':
				'.provided_root{color:red}.provided_label{color:blue}.provided_tail{color:green}',
			'App.tsrx': `import styles from './virtual.module.css';
export function App() @{ <main class={styles.root}><span class={styles.label}>provided</span><i class={styles.tail} /></main> }
export function Plain() @{ <p>plain</p> }`,
			'used.js': `export { App } from './App.tsrx';`,
			'unused.js': `export { Plain } from './App.tsrx';`,
			'lazy.js': `export { App } from './App.tsrx';`,
			'entry.js': `export const load = () => import('./lazy.js');`,
			'server.js': `import { App } from './App.tsrx';
import { renderToStaticMarkup } from 'octane/server';
export function render() { return renderToStaticMarkup(App).html; }`,
		});
		const provider = vi.fn(provideImmutable);
		const options = {
			rules: immutableProviderRules(root),
			cssModuleConstants: provider,
			parallel: { maxWorkers: 2 },
		};
		const used = await buildFixture(root, './used.js', options);
		const unused = await buildFixture(root, './unused.js', options);
		const lazy = await buildFixture(root, './entry.js', options);
		expect(used.cssSource).toContain('.provided_label');
		expect(unused.cssSource).toBe('');
		expect(lazy.cssSource).toContain('.provided_label');
		expect(lazy.initialCss).toEqual([]);
		expect(lazy.lazyCss.length).toBeGreaterThan(0);
		const server = await buildFixture(root, './server.js', { ...options, server: true });
		expect(serverModule(server).render()).toBe(
			'<main class="provided_root"><span class="provided_label">provided</span><i class="provided_tail"></i></main>',
		);
		expect(provider.mock.calls.some(([input]) => input.environment === 'client')).toBe(true);
		expect(provider.mock.calls.some(([input]) => input.environment === 'server')).toBe(true);
		for (const [input] of provider.mock.calls) {
			expect(input.resource).toBe(join(root, 'virtual.module.css'));
			expect(input.id).toContain(input.resource);
			expect(input.code).toContain('Object.freeze');
			expect(input.meta[immutableMeta]).toBeDefined();
		}
	}, 30_000);

	it('rejects provider claims that disagree with the completed loader output', async () => {
		const root = fixture({
			'virtual.module.css': '',
			'provider.css': '.provided_root{color:red}',
			'App.tsrx': `import styles from './virtual.module.css';
export function App() @{ <main class={styles.root}><span class={styles.label}>provided</span></main> }`,
			'entry.js': `export { App } from './App.tsrx';`,
		});
		await expect(
			buildFixture(root, './entry.js', {
				rules: immutableProviderRules(root, 'changed_by_loader'),
				cssModuleConstants: provideImmutable,
			}),
		).rejects.toThrow(/cssModuleConstants.*label.*final module/);
	});

	it('uses the completed module for each issuer, resource query, and layer', async () => {
		const root = fixture({
			'styles.module.css': '.root{color:red}.label{color:blue}.tail{color:green}',
			'IssuerA.tsrx': `import { root, label, tail } from './styles.module.css?theme=one';
export function App() @{ <main class={root}><span class={label}>A</span><i class={tail} /></main> }`,
			'IssuerB.tsrx': `import { root, label, tail } from './styles.module.css?theme=two';
export function App() @{ <main class={root}><span class={label}>B</span><i class={tail} /></main> }`,
			'alpha.js': `import { App as A } from './IssuerA.tsrx'; import { App as B } from './IssuerB.tsrx';
import { renderToStaticMarkup } from 'octane/server';
export function render() { return [renderToStaticMarkup(A).html, renderToStaticMarkup(B).html]; }`,
			'beta.js': `import { App } from './IssuerA.tsrx'; import { renderToStaticMarkup } from 'octane/server';
export function render() { return renderToStaticMarkup(App).html; }`,
		});
		const inputs: CssProviderInput[] = [];
		const provider: CssProvider = (input) => {
			inputs.push(input);
			return undefined;
		};
		const output = await buildFixture(
			root,
			{
				alpha: { import: './alpha.js', layer: 'alpha' },
				beta: { import: './beta.js', layer: 'beta' },
			},
			{
				server: true,
				cssModuleConstants: provider,
				rules: [
					{
						test: /\.module\.css$/,
						oneOf: [
							{
								issuerLayer: 'beta',
								resourceQuery: /theme=one/,
								...cssRule('named', 'beta_[local]'),
							},
							{
								issuer: /IssuerA\.tsrx$/,
								resourceQuery: /theme=one/,
								...cssRule('named', 'issuer_a_[local]'),
							},
							{
								issuer: /IssuerB\.tsrx$/,
								resourceQuery: /theme=two/,
								...cssRule('named', 'issuer_b_[local]'),
							},
							cssRule('named', 'fallback_[local]'),
						],
					},
				],
				configuration: { optimization: { concatenateModules: false } },
			},
		);
		const html = (prefix: string, label: string) =>
			`<main class="${prefix}_root"><span class="${prefix}_label">${label}</span><i class="${prefix}_tail"></i></main>`;
		expect(serverModule(output, 'alpha').render()).toEqual([
			html('issuer_a', 'A'),
			html('issuer_b', 'B'),
		]);
		expect(serverModule(output, 'beta').render()).toBe(html('beta', 'A'));
		const modules = new Map(output.cssModules.map((module) => [module.id, module]));
		expect(inputs.length).toBeGreaterThanOrEqual(3);
		for (const input of inputs) {
			const module = modules.get(input.id);
			if (module === undefined) {
				throw new Error(`Missing CSS provider NormalModule: ${input.id}`);
			}
			expect(input.resource).toBe(module.resource);
			expect(input.layer).toBe(module.layer);
			expect(input.type).toBe(module.type);
			expect(input.code).toBe(module.code);
			expect(input.environment).toBe('server');
		}
		expect(
			inputs.some(
				(input) =>
					input.layer === 'alpha' &&
					input.resource.endsWith('?theme=one') &&
					input.code.includes('issuer_a_label'),
			),
		).toBe(true);
		expect(
			inputs.some(
				(input) =>
					input.layer === 'alpha' &&
					input.resource.endsWith('?theme=two') &&
					input.code.includes('issuer_b_label'),
			),
		).toBe(true);
		expect(
			inputs.some(
				(input) =>
					input.layer === 'beta' &&
					input.resource.endsWith('?theme=one') &&
					input.code.includes('beta_label'),
			),
		).toBe(true);
	}, 30_000);
});
