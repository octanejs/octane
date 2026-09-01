// @vitest-environment node

import { parseModule } from '@tsrx/core';
import { describe, expect, it, vi } from 'vitest';
import type { Plugin } from 'vite';
import { octane } from 'octane/compiler/vite';
import {
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

	it('carries descriptor-children export metadata through the Vite module graph', async () => {
		const childId = `${ROOT}/src/Slot.tsrx`;
		const barrelId = `${ROOT}/src/index.ts`;
		const childSource = `
			import { Children, cloneElement, descriptorChildren } from 'octane';
			function Impl(props) { return cloneElement(Children.only(props.children), { class: 'cloned' }); }
			export const Slottable = descriptorChildren(Impl);
			export default descriptorChildren(Impl);
			export function Ordinary(props) @{ <section>{props.children}</section> }`;
		const barrelSource = `export { Slottable as BarrelSlot } from './Slot.tsrx';`;
		const consumerSource = `
			import DefaultSlot, { Slottable as Alias, Ordinary } from './Slot.tsrx';
			import { BarrelSlot } from './index.ts';
			export function App() @{
				<main>
					<Alias><button>marked</button></Alias>
					<DefaultSlot><button>default</button></DefaultSlot>
					<BarrelSlot><button>barrel</button></BarrelSlot>
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
			const consumerLoad = vi.fn(async ({ id }: { id: string }) =>
				id === childId
					? { code: child.code, meta: child.meta }
					: { code: barrel.code, meta: barrel.meta },
			);
			const consumer = (await (plugin.transform as any).call(
				{
					resolve: async (request: string) =>
						request === './Slot.tsrx'
							? { id: childId }
							: request === './index.ts'
								? { id: barrelId }
								: null,
					load: consumerLoad,
				},
				consumerSource,
				`${ROOT}/src/App.tsrx`,
				{ ssr },
			)) as { code: string };
			expect(barrelLoad).toHaveBeenCalledTimes(1);
			// Descriptor metadata is loaded once per resolved virtual module and is
			// retained across transforms. The client pass performs two additional
			// loads for void-component metadata.
			expect(consumerLoad).toHaveBeenCalledTimes(ssr ? 1 : 3);
			for (const component of ['Alias', 'DefaultSlot', 'BarrelSlot']) {
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

	it('enforces the public Strong option for both client and server transforms', async () => {
		for (const ssr of [false, true]) {
			const plugin = octane({ hmr: false, strong: true });
			configure(plugin, 'build', { ssr });

			await expect(
				Promise.resolve(transform(plugin, RENDER_STATE_UPDATE, `${ROOT}/src/App.tsrx`, { ssr })),
			).rejects.toThrow(/OCTANE_STRONG_RENDER_STATE_UPDATE|useLinkedState/);
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
