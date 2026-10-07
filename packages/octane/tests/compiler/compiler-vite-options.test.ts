// @vitest-environment node

import { parseModule } from '@tsrx/core';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Plugin } from 'vite';
import { octane } from 'octane/compiler/vite';
import { compile } from 'octane/compiler';
import { createTextTypeFixture } from '../_text-type-project.js';
import {
	INDEPENDENT_HYDRATION_MANIFEST_FILENAME,
	findDescriptorChildrenExports,
	findDescriptorChildrenImports,
	findVoidComponentImports,
} from '../../src/compiler/bundler.js';
import { findStaticRuntimeImportRequests } from '../../src/compiler/client-only-server.js';
import { findCssModuleImportRequests } from '../../src/compiler/css-module-imports.js';

const ROOT = '/project';
const SOURCE = "export function App() @{ <main>{'configured'}</main> }\n";
const STATEFUL_SOURCE =
	"import { useState } from 'octane';\n" +
	'export function App() @{\n' +
	'\tconst [count] = useState(0);\n' +
	'\t<main>{count as string}</main>\n' +
	'}\n';

const RENDER_STATE_UPDATE =
	"import { useState } from 'octane';\n" +
	'export function App(props) @{\n' +
	'\tconst [count, setCount] = useState(props.count);\n' +
	'\tif (count !== props.count) setCount(props.count);\n' +
	'\t<main>{count as string}</main>\n' +
	'}\n';

function deepFreeze(value: unknown, seen = new WeakSet<object>()): void {
	if (value === null || typeof value !== 'object' || seen.has(value)) return;
	seen.add(value);
	for (const child of Object.values(value)) {
		if (Array.isArray(child)) {
			for (const item of child) deepFreeze(item, seen);
		} else {
			deepFreeze(child, seen);
		}
	}
	Object.freeze(value);
}

function configure(plugin: Plugin, command: 'serve' | 'build', build: { ssr?: boolean } = {}) {
	(plugin.config as (config: { root: string }) => unknown)({ root: ROOT });
	(plugin.configResolved as (config: unknown) => void)({
		root: ROOT,
		command,
		build,
		define: {},
	});
}

async function transform(
	plugin: Plugin,
	source = SOURCE,
	id = `${ROOT}/src/App.tsrx`,
	options?: { ssr?: boolean },
) {
	return (
		plugin.transform as (source: string, id: string, options?: { ssr?: boolean }) => unknown
	).call({}, source, id, options) as Promise<{ code: string } | null> | { code: string } | null;
}

function componentChildren(code: string, component: string): unknown {
	const ast = parseModule(code, 'compiled.js');
	const factories = new Set<string>();
	const componentSlots = new Set<string>();
	for (const statement of ast.body) {
		if (statement.type !== 'ImportDeclaration') continue;
		if (statement.source?.value !== 'octane' && statement.source?.value !== 'octane/server')
			continue;
		for (const specifier of statement.specifiers) {
			if (
				specifier.type === 'ImportSpecifier' &&
				['createElement', 'createScopedElement'].includes(specifier.imported?.name)
			)
				factories.add(specifier.local.name);
			if (
				specifier.type === 'ImportSpecifier' &&
				['componentSlot', 'componentSlotVoid', 'ssrComponent'].includes(specifier.imported?.name)
			)
				componentSlots.add(specifier.local.name);
		}
	}
	let children: unknown;
	const seen = new WeakSet<object>();
	const visit = (node: any) => {
		if (node === null || typeof node !== 'object' || seen.has(node)) return;
		seen.add(node);
		if (
			node.type === 'CallExpression' &&
			factories.has(node.callee?.name) &&
			node.arguments[0]?.name === component
		) {
			const props = node.arguments[1];
			children = props?.properties?.find(
				(property: any) => property.key?.name === 'children' || property.key?.value === 'children',
			)?.value;
		}
		if (
			node.type === 'CallExpression' &&
			componentSlots.has(node.callee?.name) &&
			node.arguments[3]?.name === component
		) {
			const props = node.arguments[4];
			children = props?.properties?.find(
				(property: any) => property.key?.name === 'children' || property.key?.value === 'children',
			)?.value;
		}
		if (
			node.type === 'CallExpression' &&
			componentSlots.has(node.callee?.name) &&
			node.arguments[1]?.name === component
		) {
			const props = node.arguments[2];
			children = props?.properties?.find(
				(property: any) => property.key?.name === 'children' || property.key?.value === 'children',
			)?.value;
		}
		for (const [key, value] of Object.entries(node)) {
			if (key === 'loc' || key === 'metadata') continue;
			if (Array.isArray(value)) value.forEach(visit);
			else visit(value);
		}
	};
	visit(ast);
	return children;
}

function isChildrenBlock(code: string, value: any): boolean {
	const ast = parseModule(code, 'compiled.js');
	const factories = new Set<string>();
	for (const statement of ast.body) {
		if (statement.type !== 'ImportDeclaration') continue;
		if (statement.source?.value !== 'octane' && statement.source?.value !== 'octane/server')
			continue;
		for (const specifier of statement.specifiers) {
			if (
				specifier.type === 'ImportSpecifier' &&
				specifier.imported?.name === 'markChildrenBlock'
			) {
				factories.add(specifier.local.name);
			}
		}
	}
	return value?.type === 'CallExpression' && factories.has(value.callee?.name);
}

describe('octane/compiler/vite public options', () => {
	it('keeps fixed child facts opt-in and shared across compiler resets', async () => {
		const source = `import { FixedChild } from './FixedChild.tsrx';
export function Pair(props) @{ 'use dom bindings'; <section>
 <FixedChild variant="ghost" radius="full" label="First" title={props.title} />
 <FixedChild variant="ghost" radius="full" label="Second" title={props.title} />
</section> }`;
		const keys = ['variant', 'radius', 'label', 'title'];
		for (const domBindingFixedProps of [undefined, ['variant', 'radius']]) {
			const plugin = octane({ hmr: false, domBindingFixedProps });
			for (const command of [null, 'build', 'serve'] as const) {
				if (command !== null) configure(plugin, command);
				const output = await transform(
					plugin,
					source,
					`${ROOT}/src/Pair.tsrx?octane-bindings=Pair`,
				);
				const requests = parseModule(output!.code, 'Pair.js').body.filter(
					(node) =>
						node.type === 'ImportDeclaration' && node.source.value.startsWith('./FixedChild.tsrx?'),
				);
				expect(requests).toHaveLength(1);
				const shape = JSON.parse(
					new URL(requests[0].source.value, 'https://fixture.test/').searchParams.get(
						'octane-props',
					)!,
				);
				expect(shape).toEqual(
					domBindingFixedProps === undefined
						? [1, keys]
						: [
								2,
								keys,
								[
									['variant', 'ghost'],
									['radius', 'full'],
								],
							],
				);
			}
		}
	});

	it('emits independent hydration entries with their complete activation CSS closure', () => {
		const plugin = octane({ hmr: false });
		const emitted: any[] = [];
		const sourceId = '/project/src/App.tsrx';
		const activationId = `${sourceId}?octane-hydrate=0`;
		const template = {
			version: 1,
			boundaryId: 'w:1234',
			moduleId: '/src/App.tsrx',
			exportName: 'default',
			request: './App.tsrx?octane-hydrate=0',
			captureSchema: [{ name: 'props', type: 'json' }],
			hookSeed: 12,
			idSeed: 34,
			signalSites: ['i:signal'],
			styles: [],
			parentDependencies: false,
		};
		const moduleInfo = new Map([
			[sourceId, { meta: { 'octane:independent-widgets': [template] } }],
			[activationId, { meta: {} }],
		]);
		const bundle = {
			'assets/island.js': {
				type: 'chunk',
				fileName: 'assets/island.js',
				modules: { [activationId]: {} },
				imports: ['assets/shared.js'],
				dynamicImports: ['assets/lazy.js'],
				viteMetadata: { importedCss: new Set(['assets/island.css']) },
			},
			'assets/shared.js': {
				type: 'chunk',
				fileName: 'assets/shared.js',
				modules: {},
				imports: [],
				dynamicImports: [],
				viteMetadata: { importedCss: new Set(['assets/shared.css']) },
			},
			'assets/lazy.js': {
				type: 'chunk',
				fileName: 'assets/lazy.js',
				modules: {},
				imports: [],
				dynamicImports: [],
				viteMetadata: { importedCss: new Set(['assets/lazy.css']) },
			},
			'assets/root.js': {
				type: 'chunk',
				fileName: 'assets/root.js',
				modules: { [sourceId]: {} },
				imports: [],
				dynamicImports: ['assets/island.js'],
				viteMetadata: { importedCss: new Set() },
			},
		};

		(plugin.generateBundle as any).call(
			{
				emitFile(value: unknown) {
					emitted.push(value);
				},
				getModuleInfo(id: string) {
					return moduleInfo.get(id) ?? null;
				},
			},
			{},
			bundle,
		);

		const asset = emitted.find(
			(value) => value.fileName === INDEPENDENT_HYDRATION_MANIFEST_FILENAME,
		);
		expect(asset).toBeDefined();
		const manifest = JSON.parse(asset.source);
		expect(manifest).toMatchObject({ version: 1, buildId: expect.any(String) });
		expect(manifest.widgets['w:1234']).toEqual({
			version: 1,
			boundaryId: 'w:1234',
			moduleId: 'assets/island.js',
			exportName: 'default',
			captureSchema: [{ name: 'props', type: 'json' }],
			hookSeed: 12,
			idSeed: 34,
			signalSites: ['i:signal'],
			styles: ['assets/island.css', 'assets/lazy.css', 'assets/shared.css'],
			parentDependencies: false,
		});
	});

	it('requires an explicit nonempty tsconfig path for typed text', () => {
		expect(() => octane({ textTypes: { tsconfig: ' tsconfig.json ' } })).toThrow(
			'`textTypes` requires { tsconfig: string }.',
		);
	});

	it('uses one opted-in TypeScript text proof for client and server production transforms', async () => {
		const source = `import type { Label } from './model';
export function App(props: { label: Label }) @{ <p>{props.label}</p> }`;
		const consumer = createTextTypeFixture({
			'App.tsrx': source,
			'model.ts': 'export type Label = string;',
		});
		const plugin = octane({ hmr: false, textTypes: { tsconfig: consumer.tsconfig } });
		const filename = consumer.file('App.tsrx');
		try {
			await (plugin.config as any)({ root: consumer.directory }, { command: 'build' });
			await (plugin.configResolved as any)({
				root: consumer.directory,
				command: 'build',
				build: {},
				define: {},
			});
			const facts = consumer.project.snapshot(filename, source);
			const canonical = '/App.tsrx';
			for (const ssr of [false, true]) {
				const result = await transform(plugin, source, filename, { ssr });
				const mode = ssr ? ('server' as const) : ('client' as const);
				const options = { hmr: false, mode, textTypeFacts: { ...facts, filename: canonical } };
				expect(result?.code).toBe(compile(source, canonical, options).code);
				expect(result?.code).not.toBe(compile(source, canonical, { hmr: false, mode }).code);
				// Vite can close one environment before beginning the other.
				if (!ssr) await (plugin.closeBundle as any)?.();
			}
		} finally {
			await (plugin.closeBundle as any)?.();
			consumer.dispose();
		}
	});
	it('fails if an imported type changes between production targets', async () => {
		const source = `import type { Label } from './model';
export function App(props: { label: Label }) @{ <p>{props.label}</p> }`;
		const consumer = createTextTypeFixture({
			'App.tsrx': source,
			'model.ts': 'export type Label = string;',
		});
		const plugin = octane({ hmr: false, textTypes: { tsconfig: consumer.tsconfig } });
		const filename = consumer.file('App.tsrx');
		try {
			await (plugin.config as any)({ root: consumer.directory }, { command: 'build' });
			await (plugin.configResolved as any)({
				root: consumer.directory,
				command: 'build',
				build: {},
				define: {},
			});
			await transform(plugin, source, filename, { ssr: false });
			consumer.write('model.ts', 'export type Label = number;');
			(plugin.watchChange as any)?.(consumer.file('model.ts'));
			await expect(
				Promise.resolve().then(() => transform(plugin, source, filename, { ssr: true })),
			).rejects.toThrow(/text types changed during the client\/server build/);
		} finally {
			await (plugin.closeBundle as any)?.();
			consumer.dispose();
		}
	});

	it('keeps the optional checker out of watched production builds', async () => {
		const plugin = octane({ hmr: false, textTypes: { tsconfig: 'absent.json' } });
		await (plugin.config as any)({ root: ROOT }, { command: 'build' });
		await (plugin.configResolved as any)({
			root: ROOT,
			command: 'build',
			build: { watch: {} },
			define: {},
		});
		const code = (await transform(plugin))?.code;
		expect(code).toBe(compile(SOURCE, '/src/App.tsrx', { hmr: false }).code);
		await (plugin.closeBundle as any)?.();
	});

	it('keeps the optional checker out of development transforms', async () => {
		const plugin = octane({ hmr: false, textTypes: { tsconfig: 'absent.json' } });
		await (plugin.config as any)({ root: ROOT }, { command: 'serve' });
		await (plugin.configResolved as any)({
			root: ROOT,
			command: 'serve',
			build: {},
			define: {},
		});
		const code = (await transform(plugin))?.code;
		expect(code).toBe(compile(SOURCE, '/src/App.tsrx', { hmr: false }).code);
		await (plugin.closeBundle as any)?.();
	});

	it('skips TypeScript analysis of host-owned project TSX modules', async () => {
		const source = 'export function App() { return <p>host-owned</p>; }';
		const consumer = createTextTypeFixture({ 'App.tsx': source });
		const plugin = octane({
			hmr: false,
			requireDirective: true,
			textTypes: { tsconfig: 'absent.json' },
		});
		try {
			await (plugin.config as any)({ root: consumer.directory }, { command: 'build' });
			await (plugin.configResolved as any)({
				root: consumer.directory,
				command: 'build',
				build: {},
				define: {},
			});
			expect(await transform(plugin, source, consumer.file('App.tsx'))).toBeNull();
		} finally {
			await (plugin.closeBundle as any)?.();
			consumer.dispose();
		}
	});

	it('classifies one immutable authored AST the same as the source string', () => {
		const id = `${ROOT}/src/App.tsrx`;
		const source = `
			import { descriptorChildren } from 'octane';
			import VoidLeaf from './VoidLeaf.tsrx';
			import Slot from './Slot.tsrx';
			import styles from './App.module.css';
			function Impl(props) { return props.children; }
			export const Marked = descriptorChildren(Impl);
			export function App() @{ <main class={styles.root}><VoidLeaf /><Slot /></main> }
		`;
		const ast = parseModule(source, id);
		deepFreeze(ast);

		for (const classify of [
			findVoidComponentImports,
			findDescriptorChildrenImports,
			findDescriptorChildrenExports,
			findStaticRuntimeImportRequests,
			findCssModuleImportRequests,
		]) {
			expect(classify(ast, id), classify.name).toEqual(classify(source, id));
		}
	});

	it('leaves parser-disagreement syntax to authoritative compilation', async () => {
		const plugin = octane({ hmr: false });
		configure(plugin, 'build');
		const result = await transform(
			plugin,
			`using resource = acquire();
			export function App() @{ <main>{resource.label as string}</main> }`,
		);

		expect(result).not.toBeNull();
		expect(result?.code).toContain('using resource = acquire()');
	});

	it('keeps authoritative syntax diagnostics after preflight failure', async () => {
		const plugin = octane({ hmr: false });
		configure(plugin, 'build');

		await expect(
			Promise.resolve(transform(plugin, 'export function App( @{ <main /> }')),
		).rejects.toThrow();
	});

	it('keeps every environment of a shared plugin byte-identical to a fresh transform', async () => {
		const leafId = `${ROOT}/src/Leaf.tsrx`;
		const slotId = `${ROOT}/src/Slot.tsrx`;
		const appId = `${ROOT}/src/App.tsrx`;
		const helperId = `${ROOT}/src/helper.ts`;
		const leafSource = 'export default function Leaf() @{ <i>leaf</i> }';
		const slotSource = `
			import { descriptorChildren } from 'octane';
			function Impl(props) { return props.children; }
			export const Slot = descriptorChildren(Impl);`;
		// The marked app needs graph facts the plain app never asks for, so a
		// summary reused across a source edit or environment changes its output.
		const markedApp = `
			import Leaf from './Leaf.tsrx';
			import { Slot } from './Slot.tsrx';
			export function App() @{ <main><Leaf /><Slot><b>slotted</b></Slot></main> }`;
		const plainApp = 'export function App() @{ <main>plain</main> }';
		// The adapter parser rejects source-phase imports, so its failed preflight
		// is reused while the authoritative compiler still compiles the module.
		const unparsedApp = `
			import source wasm from './module.wasm';
			export function App() @{ <main>{wasm.name as string}</main> }`;
		const helperSource = 'export function compute(value: number): number { return value + 1; }';
		const environments = {
			server: { name: 'ssr', config: { consumer: 'server' } },
			client: { name: 'client', config: { consumer: 'client' } },
			worker: { name: 'worker', config: { consumer: 'client' } },
		} as const;
		type EnvironmentName = keyof typeof environments;
		const createPlugin = () => {
			const plugin = octane({ hmr: false, requireDirective: true });
			configure(plugin, 'build');
			return plugin;
		};
		const graphs = new Map<string, Map<string, { code: string; meta?: object }>>();
		for (const consumer of ['client', 'server'] as const) {
			const graph = new Map();
			for (const [id, source] of [
				[leafId, leafSource],
				[slotId, slotSource],
			]) {
				const result = await (createPlugin().transform as any).call(
					{ environment: { name: consumer, config: { consumer } } },
					source,
					id,
				);
				graph.set(id, { id, code: result.code, meta: result.meta });
			}
			graphs.set(consumer, graph);
		}
		const transformIn = (
			plugin: Plugin,
			environmentName: EnvironmentName,
			source: string,
			id: string,
			withGraph = true,
		) => {
			const environment = environments[environmentName];
			const graph = graphs.get(environment.config.consumer)!;
			const requests: Record<string, string> = { './Leaf.tsrx': leafId, './Slot.tsrx': slotId };
			const context = withGraph
				? {
						environment,
						resolve: async (request: string) =>
							requests[request] === undefined ? null : { id: requests[request] },
						load: async ({ id: requested }: { id: string }) => graph.get(requested) ?? null,
						getModuleInfo: (requested: string) => graph.get(requested) ?? null,
					}
				: { environment };
			return Promise.resolve((plugin.transform as any).call(context, source, id));
		};

		// Semantic control: the marked app compiles differently once its imported
		// void and descriptor-children facts resolve through the graph.
		const clientMarked = await transformIn(createPlugin(), 'client', markedApp, appId);
		expect(isChildrenBlock(clientMarked.code, componentChildren(clientMarked.code, 'Slot'))).toBe(
			false,
		);
		expect(clientMarked.code).not.toBe(
			(await transformIn(createPlugin(), 'client', markedApp, appId, false)).code,
		);

		// Each source edit or environment switch below would inherit missing graph
		// facts from the previous summary if the shared plugin reused it.
		const shared = createPlugin();
		for (const [environmentName, source, id] of [
			['client', plainApp, appId],
			['worker', markedApp, appId],
			['server', plainApp, appId],
			['server', markedApp, appId],
			['client', markedApp, appId],
			['worker', markedApp, appId],
			['server', markedApp, appId],
			['client', unparsedApp, appId],
			['worker', unparsedApp, appId],
			['client', helperSource, helperId],
			['worker', helperSource, helperId],
			['server', helperSource, helperId],
		] as const) {
			const label = `${environmentName} ${id} ${
				source === plainApp ? 'plain' : source === unparsedApp ? 'unparsed' : 'marked'
			}`;
			expect(JSON.stringify(await transformIn(shared, environmentName, source, id)), label).toBe(
				JSON.stringify(await transformIn(createPlugin(), environmentName, source, id)),
			);
		}
	});

	it('still rejects a client-only import on the server after a shared development client transform', async () => {
		// Development leaves both void-root and CSS-module specialization off, so
		// the environment alone keeps client facts from replacing the server-only
		// import facts behind this diagnostic.
		const sceneId = `${ROOT}/src/Scene.object.tsrx`;
		const appId = `${ROOT}/src/App.tsrx`;
		const appSource = `
			import Scene from './Scene.object.tsrx';
			export function App() @{ <main><Scene /></main> }`;
		const createPlugin = () => {
			const plugin = octane({
				renderers: {
					registry: { object: { module: '/src/object-renderer.js', server: 'client-only' } },
					rules: [{ include: 'src/**/*.object.tsrx', renderer: 'object' }],
				},
			});
			configure(plugin, 'serve');
			return plugin;
		};
		const transformIn = (plugin: Plugin, consumer: 'client' | 'server', withGraph = true) =>
			Promise.resolve(
				(plugin.transform as any).call(
					{
						environment: { name: consumer === 'server' ? 'ssr' : 'client', config: { consumer } },
						...(withGraph
							? {
									resolve: async (request: string) =>
										request === './Scene.object.tsrx' ? { id: sceneId } : null,
								}
							: null),
					},
					appSource,
					appId,
				),
			);

		const leaked = /Client-only export "default".*is used by server code/;
		// Semantic control: the diagnostic depends on resolving the client-only
		// import that only server preflight collects.
		await expect(transformIn(createPlugin(), 'server')).rejects.toThrow(leaked);
		expect(await transformIn(createPlugin(), 'server', false)).not.toBeNull();

		const shared = createPlugin();
		const freshClient = JSON.stringify(await transformIn(createPlugin(), 'client'));
		expect(JSON.stringify(await transformIn(shared, 'client'))).toBe(freshClient);
		await expect(transformIn(shared, 'server')).rejects.toThrow(leaked);
		expect(JSON.stringify(await transformIn(shared, 'client'))).toBe(freshClient);
		await expect(transformIn(shared, 'server')).rejects.toThrow(leaked);
	});

	it("checks a rebundled server chunk's imports, not the code samples in its strings", async () => {
		// Nitro feeds the SSR build's chunks back through the plugin. Their static
		// imports still face the client-only check; module syntax quoted inside a
		// string is data.
		const root = mkdtempSync(join(tmpdir(), 'octane-vite-chunk-'));
		try {
			writeFileSync(
				join(root, 'package.json'),
				JSON.stringify({ name: 'app', private: true, dependencies: { octane: '*' } }),
			);
			const assets = join(root, 'node_modules/.nitro/vite/services/ssr/assets');
			mkdirSync(assets, { recursive: true });
			const chunkId = join(assets, 'docs-Dx1.js');
			const sceneId = join(root, 'src/Scene.object.tsrx');
			const sample =
				"import Leak from './Leak.object.tsrx';\n" +
				"import { useState } from 'octane';\n" +
				'export const leak = Leak;';
			const chunk = (live: boolean) =>
				[
					'import { t as useState } from "./runtime.server-Dx2.js";',
					live ? 'import Scene from "../../../../../../src/Scene.object.tsrx";' : '',
					`export const sample = ${JSON.stringify(sample)};`,
					'export function useCount() { return useState(0); }',
					live ? 'export const live = Scene;' : '',
				].join('\n');
			writeFileSync(chunkId, chunk(false));
			const plugin = octane({
				renderers: {
					registry: { object: { module: '/src/object-renderer.js', server: 'client-only' } },
					rules: [{ include: 'src/**/*.object.tsrx', renderer: 'object' }],
				},
			});
			(plugin.config as any)({ root }, { command: 'build' });
			(plugin.configResolved as any)({ root, command: 'build', build: {}, define: {} });
			const resolve = vi.fn(async (request: string) => ({
				id: request.endsWith('.object.tsrx') ? sceneId : join(assets, request),
			}));
			const transformChunk = (source: string) =>
				Promise.resolve(
					(plugin.transform as any).call(
						{ environment: { name: 'nitro', config: { consumer: 'server' } }, resolve },
						source,
						chunkId,
					),
				);

			expect(await transformChunk(chunk(false))).toBeNull();
			expect(resolve.mock.calls.map(([request]) => request)).toEqual(['./runtime.server-Dx2.js']);
			await expect(transformChunk(chunk(true))).rejects.toThrow(
				/Client-only export "default".*is used by server code/,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('carries descriptor-children export metadata through the Vite module graph', async () => {
		const childId = `${ROOT}/src/Slot.tsrx`;
		const barrelId = `${ROOT}/src/index.ts`;
		const defaultBarrelId = `${ROOT}/src/default-barrel.ts`;
		const childSource = `
			import { Children, cloneElement, descriptorChildren } from 'octane';
			function Impl(props) { return cloneElement(Children.only(props.children), { class: 'cloned' }); }
			export const Slottable = descriptorChildren(Impl);
			export default descriptorChildren(Impl);
			export function Ordinary(props) @{ <section>{props.children}</section> }`;
		const barrelSource = `export { Slottable as BarrelSlot } from './Slot.tsrx';`;
		const defaultBarrelSource = `import { Slottable } from './Slot.tsrx'; export default Slottable;`;
		const consumerSource = `
			import DefaultSlot, { Slottable as Alias, Ordinary } from './Slot.tsrx';
			import { BarrelSlot } from './index.ts';
			import BarrelDefault from './default-barrel.ts';
			export function App() @{
				<main>
					<Alias><button>marked</button></Alias>
					<DefaultSlot><button>default</button></DefaultSlot>
					<BarrelSlot><button>barrel</button></BarrelSlot>
					<BarrelDefault><button>default barrel</button></BarrelDefault>
					<Ordinary><i>ordinary</i></Ordinary>
				</main>
			}`;

		for (const ssr of [false, true]) {
			const plugin = octane({ hmr: false });
			configure(plugin, 'build', { ssr });
			const child = (await (plugin.transform as any).call({}, childSource, childId, {
				ssr,
			})) as { code: string; meta: Record<string, unknown> };
			const barrelLoad = vi.fn(async () => ({ code: child.code, meta: child.meta }));
			const barrel = (await (plugin.transform as any).call(
				{
					resolve: async (request: string) => (request === './Slot.tsrx' ? { id: childId } : null),
					load: barrelLoad,
				},
				barrelSource,
				barrelId,
				{ ssr },
			)) as { code: string; meta: Record<string, unknown> };
			const defaultBarrel = (await (plugin.transform as any).call(
				{
					resolve: async (request: string) => (request === './Slot.tsrx' ? { id: childId } : null),
					load: async () => ({ code: child.code, meta: child.meta }),
				},
				defaultBarrelSource,
				defaultBarrelId,
				{ ssr },
			)) as { code: string; meta: Record<string, unknown> };
			const consumerLoad = vi.fn(async ({ id }: { id: string }) =>
				id === childId
					? { code: child.code, meta: child.meta }
					: id === barrelId
						? { code: barrel.code, meta: barrel.meta }
						: { code: defaultBarrel.code, meta: defaultBarrel.meta },
			);
			const consumer = (await (plugin.transform as any).call(
				{
					resolve: async (request: string) =>
						request === './Slot.tsrx'
							? { id: childId }
							: request === './index.ts'
								? { id: barrelId }
								: request === './default-barrel.ts'
									? { id: defaultBarrelId }
									: null,
					load: consumerLoad,
				},
				consumerSource,
				`${ROOT}/src/App.tsrx`,
				{ ssr },
			)) as { code: string };
			expect(barrelLoad).toHaveBeenCalledTimes(1);
			// Descriptor metadata is loaded once per resolved virtual module and is
			// retained across transforms. The client pass also loads void-component metadata.
			expect(consumerLoad).toHaveBeenCalledTimes(ssr ? 2 : 5);
			for (const component of ['Alias', 'DefaultSlot', 'BarrelSlot', 'BarrelDefault']) {
				const children = componentChildren(consumer.code, component);
				expect(children, component).toBeDefined();
				expect(isChildrenBlock(consumer.code, children)).toBe(false);
			}
			expect(isChildrenBlock(consumer.code, componentChildren(consumer.code, 'Ordinary'))).toBe(
				true,
			);
		}
	});

	it('does not load descriptor metadata for unrelated value imports', async () => {
		const plugin = octane({ hmr: false });
		configure(plugin, 'build');
		const resolve = vi.fn();
		const load = vi.fn();
		await (plugin.transform as any).call(
			{ resolve, load },
			"import { helper } from './utils'; export function App() @{ <main>ok</main> }",
			`${ROOT}/src/App.tsrx`,
		);
		expect(resolve).not.toHaveBeenCalled();
		expect(load).not.toHaveBeenCalled();
	});

	it('discovers imported marked bindings used as TSRX Element tags', async () => {
		const { findDescriptorChildrenImports } = await import('octane/compiler/bundler');
		const jsxSource =
			"import Slot from './Slot.tsrx';\n" + 'export function App() @{ <Slot><b>x</b></Slot> }\n';
		expect(findDescriptorChildrenImports(jsxSource, `${ROOT}/src/App.tsrx`)).toEqual([
			{ request: './Slot.tsrx', imported: 'default', local: 'Slot' },
		]);
		const defaultBarrel = "import { Marked as Local } from './Slot.tsrx'; export default Local;";
		const expectedBarrel = [{ request: './Slot.tsrx', imported: 'Marked', exported: 'default' }];
		expect(findDescriptorChildrenImports(defaultBarrel, `${ROOT}/src/barrel.ts`)).toEqual(
			expectedBarrel,
		);
		const barrelAst = parseModule(defaultBarrel, `${ROOT}/src/barrel.ts`);
		deepFreeze(barrelAst);
		expect(findDescriptorChildrenImports(barrelAst, `${ROOT}/src/barrel.ts`)).toEqual(
			expectedBarrel,
		);

		// Legacy/compiler Element nodes expose the tag as Identifier `id`, not
		// JSXOpeningElement/JSXIdentifier — the same shape void-import scanning covers.
		const elementAst = {
			type: 'Program',
			body: [
				{
					type: 'ImportDeclaration',
					source: { value: './Slot.tsrx' },
					specifiers: [
						{
							type: 'ImportDefaultSpecifier',
							local: { type: 'Identifier', name: 'Slot' },
						},
					],
				},
				{
					type: 'ExportNamedDeclaration',
					declaration: {
						type: 'FunctionDeclaration',
						id: { type: 'Identifier', name: 'App' },
						params: [],
						body: {
							type: 'BlockStatement',
							body: [
								{
									type: 'ReturnStatement',
									argument: {
										type: 'Element',
										id: { type: 'Identifier', name: 'Slot' },
										children: [],
									},
								},
							],
						},
					},
				},
			],
		};
		expect(findDescriptorChildrenImports(elementAst, `${ROOT}/src/App.tsrx`)).toEqual([
			{ request: './Slot.tsrx', imported: 'default', local: 'Slot' },
		]);
	});

	it('reads descriptor metadata from the live graph after loading a dependency', async () => {
		const plugin = octane({ hmr: false });
		configure(plugin, 'build', { ssr: true });
		const source =
			"import Slot from './Slot.tsrx'; export function App() @{ <Slot><b>x</b></Slot> }";
		const metadata = {
			'octane:descriptor-children-exports': {
				exports: ['default'],
			},
		};
		const result = (await (plugin.transform as any).call(
			{
				resolve: async () => ({ id: `${ROOT}/src/Slot.tsrx` }),
				load: async () => ({ meta: {} }),
				getModuleInfo: () => ({ meta: metadata }),
			},
			source,
			`${ROOT}/src/App.tsrx`,
			{ ssr: true },
		)) as { code: string };
		expect(isChildrenBlock(result.code, componentChildren(result.code, 'Slot'))).toBe(false);
	});

	it('does not recursively load unresolved virtual component modules during dev transforms', async () => {
		const plugin = octane({ hmr: false });
		configure(plugin, 'serve', { ssr: true });
		const source =
			"import Slot from 'virtual:slot'; export function App() @{ <Slot><b>x</b></Slot> }";
		const load = vi.fn(async () => {
			throw new Error('a dev transform must not recursively load its unresolved dependency');
		});
		const result = (await (plugin.transform as any).call(
			{
				resolve: async () => ({ id: '\0virtual:slot' }),
				load,
				getModuleInfo: () => ({ meta: {} }),
			},
			source,
			`${ROOT}/src/App.tsrx`,
			{ ssr: true },
		)) as { code: string };

		expect(load).not.toHaveBeenCalled();
		expect(isChildrenBlock(result.code, componentChildren(result.code, 'Slot'))).toBe(true);
	});

	it('classifies a direct filesystem marker when load returns a pre-transform snapshot', async () => {
		const plugin = octane({ hmr: false });
		configure(plugin, 'build', { ssr: true });
		const source =
			"import Slot from './Slot.tsrx'; export function App() @{ <Slot><b>x</b></Slot> }";
		const slotId = `${process.cwd()}/packages/octane/tests/compiler/_fixtures/descriptor-children-direct.tsrx`;
		const load = vi.fn(async () => ({ meta: {} }));
		const result = (await (plugin.transform as any).call(
			{
				resolve: async () => ({ id: slotId }),
				load,
				getModuleInfo: () => null,
			},
			source,
			`${ROOT}/src/App.tsrx`,
			{ ssr: true },
		)) as { code: string };
		expect(load).not.toHaveBeenCalled();
		expect(isChildrenBlock(result.code, componentChildren(result.code, 'Slot'))).toBe(false);
	});

	it('classifies an ordinary filesystem component without loading its Vite graph', async () => {
		const plugin = octane({ hmr: false });
		configure(plugin, 'build', { ssr: true });
		const source =
			"import { Ordinary } from './descriptor-children-ordinary.ts'; " +
			'export function App() @{ <Ordinary><b>x</b></Ordinary> }';
		const ordinaryId = `${process.cwd()}/packages/octane/tests/compiler/_fixtures/descriptor-children-ordinary.ts`;
		const load = vi.fn(async () => {
			throw new Error('filesystem descriptor classification must not load the Vite graph');
		});
		const result = (await (plugin.transform as any).call(
			{
				resolve: async () => ({ id: ordinaryId }),
				load,
			},
			source,
			`${ROOT}/src/App.tsrx`,
			{ ssr: true },
		)) as { code: string };

		expect(load).not.toHaveBeenCalled();
		expect(isChildrenBlock(result.code, componentChildren(result.code, 'Ordinary'))).toBe(true);
	});

	it('follows only the requested export through a filesystem barrel', async () => {
		const plugin = octane({ hmr: false });
		configure(plugin, 'build', { ssr: true });
		const fixtureRoot = `${process.cwd()}/packages/octane/tests/compiler/_fixtures`;
		const barrelId = `${fixtureRoot}/descriptor-children-barrel.ts`;
		const markedId = `${fixtureRoot}/descriptor-children-direct.tsrx`;
		const resolve = vi.fn(async (request: string, importer: string) => {
			if (request === './descriptor-children-barrel.ts') return { id: barrelId };
			if (request === './descriptor-children-direct.tsrx' && importer === barrelId) {
				return { id: markedId };
			}
			throw new Error(`Unexpected descriptor resolution: ${request} from ${importer}`);
		});
		const load = vi.fn(async () => {
			throw new Error('filesystem descriptor classification must not load the Vite graph');
		});
		const source =
			"import { Marked } from './descriptor-children-barrel.ts'; " +
			'export function App() @{ <Marked><b>x</b></Marked> }';
		const result = (await (plugin.transform as any).call(
			{ resolve, load },
			source,
			`${ROOT}/src/App.tsrx`,
			{ ssr: true },
		)) as { code: string };

		expect(load).not.toHaveBeenCalled();
		expect(resolve).not.toHaveBeenCalledWith(
			'./descriptor-children-ordinary.js',
			barrelId,
			expect.anything(),
		);
		expect(isChildrenBlock(result.code, componentChildren(result.code, 'Marked'))).toBe(false);
	});

	it('fails loudly when descriptor metadata cannot be loaded', async () => {
		const plugin = octane({ hmr: false });
		configure(plugin, 'build');
		const source =
			"import { Slot } from './Slot.tsrx'; export function App() @{ <Slot><b>x</b></Slot> }";
		await expect(
			(plugin.transform as any).call(
				{
					resolve: async () => ({ id: `${ROOT}/src/Slot.tsrx` }),
					load: async () => {
						throw new Error('graph unavailable');
					},
				},
				source,
				`${ROOT}/src/App.tsrx`,
			),
		).rejects.toThrow(/Failed to load descriptor-children metadata.*\.\/Slot\.tsrx/);
	});

	it('fails loudly when descriptor metadata is malformed', async () => {
		const plugin = octane({ hmr: false });
		configure(plugin, 'build');
		const source =
			"import { Slot } from './Slot.tsrx'; export function App() @{ <Slot><b>x</b></Slot> }";
		await expect(
			(plugin.transform as any).call(
				{
					resolve: async () => ({ id: `${ROOT}/src/Slot.tsrx` }),
					load: async () => ({
						meta: {
							'octane:descriptor-children-exports': {
								exports: ['Slot', null],
							},
						},
					}),
				},
				source,
				`${ROOT}/src/App.tsrx`,
			),
		).rejects.toThrow(/Invalid descriptor-children metadata.*\.\/Slot\.tsrx/);
	});

	it('enforces public static compiler options for both client and server transforms', async () => {
		for (const ssr of [false, true]) {
			const plugin = octane({
				hmr: false,
				strong: true,
				knownAttributeSpreads: [
					{ source: '@stylexjs/stylex', imported: 'attrs', fields: ['class', 'style'] },
					{
						source: '@stylexjs/stylex',
						imported: 'props',
						fields: ['className', 'style'],
						style: 'object',
					},
				],
			});
			configure(plugin, 'build', { ssr });

			await expect(
				Promise.resolve(transform(plugin, RENDER_STATE_UPDATE, `${ROOT}/src/App.tsrx`, { ssr })),
			).rejects.toThrow(/OCTANE_STRONG_RENDER_STATE_UPDATE|useLinkedState/);
			const source = `import { attrs as nativeAttrs } from '@stylexjs/stylex';
export function Styled(props) @{ 'use dom bindings'; <div {...nativeAttrs(props.styles)} /> }`;
			expect(await transform(plugin, source, `${ROOT}/src/Styled.tsrx`, { ssr })).not.toBeNull();
			if (!ssr)
				expect(
					await transform(plugin, source, `${ROOT}/src/Styled.tsrx?octane-bindings=Styled`, {
						ssr,
					}),
				).not.toBeNull();
			const objectSource = source.replace('attrs as nativeAttrs', 'props as nativeAttrs');
			expect(
				await transform(plugin, objectSource, `${ROOT}/src/StyleProps.tsrx`, { ssr }),
			).not.toBeNull();
			if (!ssr) {
				const selected = await transform(
					plugin,
					objectSource,
					`${ROOT}/src/StyleProps.tsrx?octane-bindings=Styled`,
					{ ssr },
				);
				expect(selected?.code).toContain('octane/dom-binding-styles');
				expect(selected?.code).not.toContain('octane/internal/client');
			}
			await (plugin.closeBundle as any)?.();
			if (!ssr)
				expect(
					await transform(plugin, source, `${ROOT}/src/Styled.tsrx?octane-bindings=Styled`, {
						ssr,
					}),
				).not.toBeNull();
		}
	});

	it('keeps Strong mode opt-in when its public option is disabled', async () => {
		const plugin = octane({ hmr: false, strong: false });
		configure(plugin, 'build');

		expect(await transform(plugin, RENDER_STATE_UPDATE)).not.toBeNull();
		await expect(
			Promise.resolve(transform(plugin, `'use strong';\n${RENDER_STATE_UPDATE}`)),
		).rejects.toThrow(/OCTANE_STRONG_RENDER_STATE_UPDATE|useLinkedState/);
	});

	it('changes emitted hot-update support for both hmr values', async () => {
		const enabled = octane({ hmr: true });
		const disabled = octane({ hmr: false });
		configure(enabled, 'serve');
		configure(disabled, 'serve');

		const enabledOutput = await transform(enabled);
		const disabledOutput = await transform(disabled);

		expect(enabledOutput?.code).toContain('import.meta.hot');
		expect(disabledOutput?.code).not.toContain('import.meta.hot');
	});

	it('forces server output despite a client transform signal', async () => {
		const plugin = octane({ hmr: false, ssr: true });
		configure(plugin, 'build', { ssr: false });

		const output = await transform(plugin, STATEFUL_SOURCE, `${ROOT}/src/App.tsrx`, {
			ssr: false,
		});

		expect(output?.code).toMatch(/from ["']octane\/server["']/);
	});

	it('forces client output despite a server transform signal', async () => {
		const plugin = octane({ hmr: false, ssr: false });
		configure(plugin, 'build', { ssr: true });

		const output = await transform(plugin, STATEFUL_SOURCE, `${ROOT}/src/App.tsrx`, {
			ssr: true,
		});

		expect(output?.code).not.toMatch(/from ["']octane\/server["']/);
	});

	it('changes ownership of an unmarked project TSX module for both directive values', async () => {
		const source = "export function App() @{ <main>{'owned'}</main> }\n";
		for (const ssr of [false, true]) {
			for (const options of [{}, { requireDirective: false }] as const) {
				const plugin = octane({ hmr: false, ...options });
				configure(plugin, 'build', { ssr });
				expect(await transform(plugin, source, `${ROOT}/src/App.tsx`, { ssr })).not.toBeNull();
			}

			const gated = octane({ hmr: false, requireDirective: true });
			configure(gated, 'build', { ssr });
			expect(await transform(gated, source, `${ROOT}/src/App.tsx`, { ssr })).toBeNull();
		}
	});
});
