// @vitest-environment node

import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { build, type Plugin, type Rolldown } from 'vite';
import { createOctaneCompiler } from '../../src/compiler/bundler.js';
import {
	octane,
	type OctaneCssModuleConstants,
	type OctaneVitePluginOptions,
} from '../../src/compiler/vite.js';

const PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const IMMUTABLE_META = 'fixture:immutable-css-constants';
const MOCK_ROOT = '/project';
const roots: string[] = [];
type Output = Rolldown.OutputChunk | Rolldown.OutputAsset;

function fixture(files: Record<string, string>) {
	const root = realpathSync(mkdtempSync(join(tmpdir(), 'octane-css-module-vite-')));
	roots.push(root);
	mkdirSync(join(root, 'node_modules'));
	symlinkSync(PACKAGE_ROOT, join(root, 'node_modules/octane'), 'dir');
	writeFileSync(
		join(root, 'package.json'),
		JSON.stringify({ type: 'module', dependencies: { octane: '0.0.0' } }),
	);
	for (const [file, source] of Object.entries(files)) {
		const filename = join(root, file);
		mkdirSync(dirname(filename), { recursive: true });
		writeFileSync(filename, source);
	}
	return root;
}

async function buildFixture(
	root: string,
	entry: string,
	options: {
		server?: boolean;
		plugins?: Plugin[];
		compiler?: OctaneVitePluginOptions;
	} = {},
): Promise<Output[]> {
	const result = await build({
		root,
		configFile: false,
		logLevel: 'silent',
		css: { modules: { generateScopedName: 'mapped_[local]' } },
		...(options.server ? { ssr: { noExternal: true } } : {}),
		plugins: [...(options.plugins ?? []), octane({ hmr: false, ...options.compiler })],
		build: {
			write: false,
			minify: true,
			cssMinify: false,
			manifest: true,
			...(options.server ? { ssr: join(root, entry) } : {}),
			rolldownOptions: {
				input: join(root, entry),
				...(options.server
					? {}
					: { external: (id: string) => id === 'octane' || id.startsWith('octane/') }),
			},
		},
	});
	const outputs = Array.isArray(result) ? result : [result];
	return outputs.flatMap((output) => {
		if (!('output' in output)) throw new Error('Expected a one-shot Vite build.');
		return output.output;
	});
}

function cssSource(output: Output[]) {
	return output
		.filter(
			(item): item is Rolldown.OutputAsset =>
				item.type === 'asset' && item.fileName.endsWith('.css'),
		)
		.map((item) => String(item.source))
		.join('\n');
}

function initialCss(output: Output[]) {
	const chunks = new Map(
		output
			.filter((item): item is Rolldown.OutputChunk => item.type === 'chunk')
			.map((chunk) => [chunk.fileName, chunk]),
	);
	const visited = new Set<string>();
	const css = new Set<string>();
	const visit = (filename: string) => {
		if (visited.has(filename)) return;
		visited.add(filename);
		const chunk = chunks.get(filename);
		if (chunk === undefined) return;
		for (const stylesheet of chunk.viteMetadata?.importedCss ?? []) css.add(stylesheet);
		for (const dependency of chunk.imports) visit(dependency);
	};
	for (const chunk of chunks.values()) if (chunk.isEntry) visit(chunk.fileName);
	return [...css];
}

let evaluatedModule = 0;
async function serverModule(output: Output[]): Promise<Record<string, any>> {
	const entry = output.find(
		(item): item is Rolldown.OutputChunk => item.type === 'chunk' && item.isEntry,
	);
	if (entry === undefined) throw new Error('Missing server entry.');
	return import(
		`data:text/javascript;base64,${Buffer.from(entry.code).toString('base64')}#css-vite-${evaluatedModule++}`
	);
}

function immutableProvider(root: string, finalLabel = 'provided_label'): Plugin {
	const id = '\0fixture:styles.module.css.js?immutable=1';
	const constants: OctaneCssModuleConstants = {
		named: { root: 'provided_root', label: 'provided_label', tail: 'provided_tail' },
		default: { root: 'provided_root', label: 'provided_label', tail: 'provided_tail' },
	};
	return {
		name: 'fixture-immutable-css-provider',
		enforce: 'pre',
		resolveId(request) {
			return request === './virtual.module.css' ? id : null;
		},
		load(request) {
			if (request !== id) return null;
			return {
				code: `import ${JSON.stringify(join(root, 'provider.css'))};
export const root = 'provided_root';
export const label = ${JSON.stringify(finalLabel)};
export const tail = 'provided_tail';
export default Object.freeze({ root, label, tail });`,
				meta: { [IMMUTABLE_META]: constants },
				// This provider deliberately lets a dead exported value take its
				// stylesheet with it. Octane must preserve that ownership policy.
				moduleSideEffects: false,
			};
		},
	};
}

const provideImmutableConstants: NonNullable<OctaneVitePluginOptions['cssModuleConstants']> = ({
	meta,
}) => meta[IMMUTABLE_META] as OctaneCssModuleConstants | undefined;

function configuredPlugin(
	options: OctaneVitePluginOptions = {},
	command: 'serve' | 'build' = 'build',
	buildOptions: { watch?: object } = {},
) {
	const plugin = octane({ hmr: false, ...options });
	(plugin.config as any)({ root: MOCK_ROOT }, { command, mode: 'production' });
	(plugin.configResolved as any)({
		root: MOCK_ROOT,
		command,
		build: buildOptions,
		define: {},
	});
	return plugin;
}

function moduleContext(source: string, id = `${MOCK_ROOT}/styles.module.css`) {
	const module = { id, code: source, meta: {}, moduleSideEffects: false };
	return {
		module,
		context: {
			resolve: vi.fn(async () => ({ id })),
			load: vi.fn(async () => module),
			getModuleInfo: vi.fn((request: string) => (request === id ? module : null)),
		},
	};
}

const NAMED_SOURCE = `import { root, label } from './styles.module.css';
export function App() @{ <main class={root}><span class={label}>ready</span></main> }`;
const NAMED_EXPORTS = `export const root = 'mapped_root';
export const label = 'mapped_label';
export default { root, label };`;

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('CSS-module constants in Vite builds', () => {
	it('keeps used CSS, drops unused component CSS, and leaves lazy CSS deferred', async () => {
		const root = fixture({
			'used.module.css': '.root { color: red } .label { color: blue } .tail { color: green }',
			'unused.module.css': '.unusedRoot { color: purple } .unusedLabel { color: orange }',
			'Components.tsrx': `
import { root, label, tail } from './used.module.css';
import * as classes from './used.module.css';
import { unusedRoot, unusedLabel } from './unused.module.css';
export function Used() @{
  <main class={root}><span class={label}>live</span><i class={classes.tail} /></main>
}
export function Unused() @{
  <aside class={unusedRoot}><b class={unusedLabel}>unused</b></aside>
}
export function Plain() @{ <p>plain</p> }
`,
			'used.js': `import { Used } from './Components.tsrx'; globalThis.cssComponent = Used;`,
			'unused.js': `import { Plain } from './Components.tsrx'; globalThis.cssComponent = Plain;`,
			'lazy.js': `export { Used } from './Components.tsrx';`,
			'entry.js': `globalThis.loadCssComponent = () => import('./lazy.js');`,
		});
		const used = await buildFixture(root, 'used.js');
		expect(cssSource(used)).toContain('.mapped_root');
		expect(cssSource(used)).toContain('.mapped_label');
		expect(cssSource(used)).not.toContain('.mapped_unusedRoot');
		expect(initialCss(used).length).toBeGreaterThan(0);

		const unused = await buildFixture(root, 'unused.js');
		expect(cssSource(unused)).toBe('');
		expect(initialCss(unused)).toEqual([]);

		const lazy = await buildFixture(root, 'entry.js');
		expect(cssSource(lazy)).toContain('.mapped_root');
		expect(cssSource(lazy)).not.toContain('.mapped_unusedRoot');
		expect(initialCss(lazy)).toEqual([]);
		expect(
			lazy.some(
				(item) =>
					item.type === 'chunk' &&
					item.isDynamicEntry &&
					(item.viteMetadata?.importedCss.size ?? 0) > 0,
			),
		).toBe(true);
	});

	it('does not treat the ordinary mutable default map as immutable', async () => {
		const root = fixture({
			'styles.module.css': '.root { color: red } .label { color: blue }',
			'App.tsrx': `import styles from './styles.module.css';
export function App() @{ <main class={styles.root}><span class={styles.label}>live</span></main> }`,
			'mutator.js': `import styles from './styles.module.css';
export function mutate() { styles.root = 'changed_root'; styles.label = 'changed_label'; }`,
			'entry.js': `import { App } from './App.tsrx';
import { renderToStaticMarkup } from 'octane/server';
export { mutate } from './mutator.js';
export function render() { return renderToStaticMarkup(App).html; }`,
		});
		const api = await serverModule(await buildFixture(root, 'entry.js', { server: true }));
		expect(api.render()).toBe(
			'<main class="mapped_root"><span class="mapped_label">live</span></main>',
		);
		api.mutate();
		expect(api.render()).toBe(
			'<main class="changed_root"><span class="changed_label">live</span></main>',
		);
	});

	it.each([
		['metadata', '<meta class={root} name="fixture" content="value" />'],
		['preload links', '<link class={root} rel="preload" as="image" href="/fixture.png" />'],
	])('keeps CSS used beside hoisted %s', async (_name, resource) => {
		const root = fixture({
			'styles.module.css': '.root { color: red } .label { color: blue }',
			'App.tsrx': `import { root, label } from './styles.module.css';
export function App() @{ <main>${resource}<span class={label}>live</span></main> }`,
			'entry.js': `import { App } from './App.tsrx'; globalThis.cssComponent = App;`,
		});
		const output = await buildFixture(root, 'entry.js');
		expect(cssSource(output)).toContain('.mapped_label');
		expect(initialCss(output).length).toBeGreaterThan(0);
	});

	it('authenticates virtual immutable maps without changing their stylesheet ownership', async () => {
		const root = fixture({
			'provider.css': '.provided_root { color: red } .provided_label { color: blue }',
			'App.tsrx': `import styles from './virtual.module.css';
export function App() @{
  <main class={styles.root}><span class={styles.label}>provided</span><i class={styles.tail} /></main>
}
export function Plain() @{ <p>plain</p> }`,
			'used.js': `import { App } from './App.tsrx'; globalThis.cssComponent = App;`,
			'unused.js': `import { Plain } from './App.tsrx'; globalThis.cssComponent = Plain;`,
			'entry.js': `import { App } from './App.tsrx';
import { renderToStaticMarkup } from 'octane/server';
export function render() { return renderToStaticMarkup(App).html; }`,
		});
		const provider = vi.fn(provideImmutableConstants);
		const options = {
			plugins: [immutableProvider(root)],
			compiler: { cssModuleConstants: provider },
		};
		expect(cssSource(await buildFixture(root, 'used.js', options))).toContain('.provided_label');
		expect(cssSource(await buildFixture(root, 'unused.js', options))).toBe('');
		const api = await serverModule(
			await buildFixture(root, 'entry.js', { ...options, server: true }),
		);
		expect(api.render()).toBe(
			'<main class="provided_root"><span class="provided_label">provided</span><i class="provided_tail"></i></main>',
		);
		expect(provider.mock.calls.some(([module]) => module.environment === 'client')).toBe(true);
		expect(provider.mock.calls.some(([module]) => module.environment === 'server')).toBe(true);
		for (const [module] of provider.mock.calls) {
			expect(module.id).toBe('\0fixture:styles.module.css.js?immutable=1');
			expect(module.code).toContain('Object.freeze');
		}
	});

	it('rejects provider values that disagree with the final transformed module', async () => {
		const root = fixture({
			'provider.css': '.provided_root { color: red }',
			'App.tsrx': `import styles from './virtual.module.css';
export function App() @{ <main class={styles.root}><span class={styles.label} /></main> }`,
			'entry.js': `import { App } from './App.tsrx'; globalThis.cssComponent = App;`,
		});
		await expect(
			buildFixture(root, 'entry.js', {
				plugins: [immutableProvider(root, 'changed_by_later_transform')],
				compiler: { cssModuleConstants: provideImmutableConstants },
			}),
		).rejects.toThrow(/invalid cssModuleConstants.*label.*final module/);
	});

	it('declines an in-flight CSS proof in a circular virtual provider graph', async () => {
		const root = fixture({
			'provider.css': '.provided_root { color: red } .provided_label { color: blue }',
			'App.tsrx': `import styles from './virtual.module.css';
export function App() @{ <main class={styles.root}><span class={styles.label}>cycle</span></main> }`,
			'entry.js': `import { App } from './App.tsrx'; globalThis.cssComponent = App;`,
		});
		const firstId = '\0fixture:cyclic-first.tsrx';
		const secondId = '\0fixture:cyclic-second.tsrx';
		const provider: Plugin = {
			name: 'fixture-cyclic-css-provider',
			enforce: 'pre',
			resolveId(request) {
				if (request === './virtual.module.css') return firstId;
				if (request === './other.module.css') return secondId;
				return null;
			},
			load(id) {
				if (id === firstId) {
					return {
						code: `import other from './other.module.css';
import ${JSON.stringify(join(root, 'provider.css'))};
export { App } from ${JSON.stringify(join(root, 'App.tsrx'))};
export const root = 'provided_root';
export const label = 'provided_label';
export default Object.freeze({ root, label });`,
						meta: {
							[IMMUTABLE_META]: { default: { root: 'provided_root', label: 'provided_label' } },
						},
						moduleSideEffects: false,
					};
				}
				if (id === secondId) {
					return {
						code: `import first from './virtual.module.css';
export const other = 'provided_other';
export default Object.freeze({ other });`,
						meta: { [IMMUTABLE_META]: { default: { other: 'provided_other' } } },
						moduleSideEffects: false,
					};
				}
				return null;
			},
		};
		const output = await buildFixture(root, 'entry.js', {
			plugins: [provider],
			compiler: { cssModuleConstants: provideImmutableConstants },
		});
		expect(cssSource(output)).toContain('.provided_label');
	}, 10_000);

	it('keeps one-shot proofs out of serve, watch, and host-owned TSX transforms', async () => {
		for (const [command, buildOptions] of [
			['serve', {}],
			['build', { watch: {} }],
		] as const) {
			const provider = vi.fn(provideImmutableConstants);
			const plugin = configuredPlugin({ cssModuleConstants: provider }, command, buildOptions);
			const { context } = moduleContext(NAMED_EXPORTS);
			await (plugin.transform as any).call(context, NAMED_SOURCE, `${MOCK_ROOT}/App.tsrx`);
			expect(context.resolve).not.toHaveBeenCalled();
			expect(context.load).not.toHaveBeenCalled();
			expect(provider).not.toHaveBeenCalled();
		}

		const provider = vi.fn(provideImmutableConstants);
		const plugin = configuredPlugin({ requireDirective: true, cssModuleConstants: provider });
		const { context } = moduleContext(NAMED_EXPORTS);
		await (plugin.transform as any).call(
			context,
			`import { root } from './styles.module.css'; export const App = () => <main className={root} />;`,
			`${MOCK_ROOT}/App.tsx`,
		);
		expect(context.resolve).not.toHaveBeenCalled();
		expect(provider).not.toHaveBeenCalled();
	});

	it.each(['with', 'assert'])('declines CSS imports carrying %s attributes', async (keyword) => {
		const provider = vi.fn(provideImmutableConstants);
		const plugin = configuredPlugin({ cssModuleConstants: provider });
		const { context } = moduleContext(NAMED_EXPORTS);
		const source = NAMED_SOURCE.replace(
			"'./styles.module.css';",
			`'./styles.module.css' ${keyword} { type: 'css' };`,
		);
		const result = await (plugin.transform as any).call(context, source, `${MOCK_ROOT}/App.tsrx`);
		expect(result.code).toContain('styles.module.css');
		expect(result.code).not.toContain('mapped_label');
		expect(context.resolve).not.toHaveBeenCalled();
		expect(provider).not.toHaveBeenCalled();
	});

	it('declines stylesheet proofs outside an exclusively DOM-owned renderer configuration', async () => {
		const source = NAMED_SOURCE.replace('>ready<', '><');
		const registry = { object: '@fixture/object-renderer' };
		const configurations: NonNullable<OctaneVitePluginOptions['renderers']>[] = [
			{ registry, default: 'object' },
			{
				registry,
				boundaries: {
					'@fixture/bridge': {
						Canvas: { ownerRenderer: 'dom', childRenderer: 'object', prop: 'children' },
					},
				},
			},
		];
		for (const renderers of configurations) {
			const provider = vi.fn(provideImmutableConstants);
			const plugin = configuredPlugin({ renderers, cssModuleConstants: provider });
			const { context } = moduleContext(NAMED_EXPORTS);
			await (plugin.transform as any).call(context, source, `${MOCK_ROOT}/App.tsrx`);
			expect(context.resolve).not.toHaveBeenCalled();
			expect(provider).not.toHaveBeenCalled();

			const resolveCssModuleConstant = vi.fn(() => 'unproven_class');
			const compiler = createOctaneCompiler({ root: MOCK_ROOT, hmr: false, renderers });
			const result = compiler.transform(source, `${MOCK_ROOT}/App.tsrx`, {
				resolveCssModuleConstant,
				preserveCssModuleReferences: ['./styles.module.css'],
			});
			expect(result?.code).not.toContain('unproven_class');
			expect(resolveCssModuleConstant).not.toHaveBeenCalled();
		}
	});

	it('validates the exact consumed module again before completing a build', async () => {
		const plugin = configuredPlugin();
		const { context, module } = moduleContext(NAMED_EXPORTS);
		const result = await (plugin.transform as any).call(
			context,
			NAMED_SOURCE,
			`${MOCK_ROOT}/App.tsrx`,
		);
		expect(result.map.sourcesContent).toContain(NAMED_SOURCE);
		expect(module.moduleSideEffects).toBe(false);
		module.code = NAMED_EXPORTS.replace('mapped_label', 'changed_label');
		expect(() => (plugin.buildEnd as any).call(context)).toThrow(
			/CSS-module constant proof changed/,
		);
	});

	it('keeps final-module facts separate between client and server environments', async () => {
		const provider = vi.fn(provideImmutableConstants);
		const plugin = configuredPlugin({ cssModuleConstants: provider });
		const client = moduleContext(NAMED_EXPORTS);
		const server = moduleContext(NAMED_EXPORTS.replaceAll('mapped_', 'server_'));
		const clientContext = { ...client.context, environment: { config: { consumer: 'client' } } };
		const serverContext = { ...server.context, environment: { config: { consumer: 'server' } } };
		const clientResult = await (plugin.transform as any).call(
			clientContext,
			NAMED_SOURCE,
			`${MOCK_ROOT}/App.tsrx`,
		);
		const serverResult = await (plugin.transform as any).call(
			serverContext,
			NAMED_SOURCE,
			`${MOCK_ROOT}/App.tsrx`,
		);
		expect(clientResult.code).toContain('mapped_label');
		expect(serverResult.code).toContain('server_label');
		expect(provider.mock.calls.map(([module]) => module.environment)).toEqual(['client', 'server']);
	});

	it('rejects getters, mutable bindings, spreads, and shadowed freeze helpers as export evidence', async () => {
		const source = `import styles from './styles.module.css';
export function App() @{ <main class={styles.root}><span class={styles.label} /></main> }`;
		const invalidModules = [
			`export default { get root() { return 'mapped_root' }, label: 'mapped_label' };`,
			`export let label = 'mapped_label'; export default { root: 'mapped_root', label };`,
			`const values = { root: 'mapped_root', label: 'mapped_label' }; export default { ...values };`,
			`const Object = { freeze: value => value }; export default Object.freeze({ root: 'mapped_root', label: 'mapped_label' });`,
			`export { default } from './other.js';`,
		];
		for (const module of invalidModules) {
			const plugin = configuredPlugin({
				cssModuleConstants: () => ({
					default: { root: 'mapped_root', label: 'mapped_label' },
				}),
			});
			const { context } = moduleContext(module);
			await expect(
				(plugin.transform as any).call(context, source, `${MOCK_ROOT}/App.tsrx`),
			).rejects.toThrow(/invalid cssModuleConstants.*final module/);
		}
	});
});
