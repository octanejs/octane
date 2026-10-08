// @vitest-environment node

import { resolve, sep } from 'node:path';
import { build, type Plugin } from 'esbuild';
import { JSDOM } from 'jsdom';
import { createScope } from 'octane/signals';
import { describe, expect, it } from 'vitest';
import { createOctaneCompiler } from '../src/compiler/bundler.js';
import type { BindingMountTarget } from '../src/dom-binding-program.js';
import type { BindingHandle, BindingSource } from '../src/dom-bindings.js';

async function bundleConsumer(contents: string, plugins: Plugin[] = []) {
	const result = await build({
		stdin: {
			contents,
			loader: 'ts',
			resolveDir: resolve(import.meta.dirname, '..'),
			sourcefile: 'behavior-consumer.ts',
		},
		plugins,
		bundle: true,
		define: { 'process.env.NODE_ENV': JSON.stringify('production') },
		format: 'esm',
		logLevel: 'silent',
		metafile: true,
		minify: true,
		platform: 'browser',
		target: 'esnext',
		treeShaking: true,
		write: false,
	});

	return {
		contents: result.outputFiles[0].contents,
		resolvedInputs: Object.keys(result.metafile.inputs).map((input) => input.split(sep).join('/')),
		inputs: Object.entries(Object.values(result.metafile.outputs)[0].inputs)
			.filter(([, metadata]) => metadata.bytesInOutput > 0)
			.map(([input]) => input.split(sep).join('/')),
	};
}

describe('production behavior-root entry points', () => {
	for (const entry of ['octane', 'octane/behavior']) {
		it(`${entry} attaches behavior without retaining a renderer`, async () => {
			const bundle = await bundleConsumer(`export { attachBehaviorRoot } from '${entry}';`);
			const { attachBehaviorRoot } = (await import(
				`data:text/javascript;base64,${Buffer.from(bundle.contents).toString('base64')}`
			)) as typeof import('../src/behavior-root.js');
			const document = new JSDOM('<main><button>Existing</button></main>').window.document;
			const container = document.querySelector('main')!;
			const existing = container.firstElementChild;
			const root = attachBehaviorRoot(container);

			expect(container.firstElementChild).toBe(existing);
			expect(bundle.inputs).toEqual(
				expect.arrayContaining([
					expect.stringMatching(/packages\/octane\/src\/behavior-root\.ts$/),
				]),
			);
			expect(
				bundle.inputs.some((input) =>
					/(?:^|\/)packages\/octane\/src\/(?:runtime(?:\.server)?\.ts|compiler\/|server\/)/.test(
						input,
					),
				),
			).toBe(false);

			root.dispose();
			expect(container.firstElementChild).toBe(existing);
			// Resolved dependencies matter when a later renderer consumer co-locates
			// other exports from the same module in a shared eager chunk.
			const bindings = await bundleConsumer(
				"export { __adoptBindings } from 'octane/dom-bindings';",
			);
			expect(
				bindings.resolvedInputs.filter((input) =>
					/packages\/octane\/src\/(?:css|dom-tables)\.[jt]s$/.test(input),
				),
			).toEqual([]);
		});
	}

	it('activates a recursive binding view without retaining a renderer', async () => {
		const packageRoot = resolve(import.meta.dirname, '..');
		const compiler = createOctaneCompiler({ root: packageRoot, hmr: false, dev: false });
		const view = `type Branch = { key: string; label: string; children: readonly Branch[] };
export function Tree({ node }: { node: Branch }) @{
  'use dom bindings';
  <section data-key={node.key}>
    <span>{node.label as string}</span>
    @for (const child of node.children; key child.key) { <Tree node={child} /> }
  </section>
}`;
		const entry = `import { mountBindings } from 'octane/behavior';
import { Tree } from './RecursiveTree.tsrx';
export function mount(target, source) { return mountBindings(target, Tree, source); }`;
		const tsrx: Plugin = {
			name: 'compiled-recursive-view',
			setup(bundler) {
				bundler.onResolve({ filter: /^\.\/RecursiveTree\.tsrx(?:\?.*)?$/ }, ({ path }) => ({
					path,
					namespace: 'recursive-view',
				}));
				bundler.onLoad({ filter: /.*/, namespace: 'recursive-view' }, ({ path }) => ({
					contents: compiler.transform(
						view,
						resolve(packageRoot, 'RecursiveTree.tsrx') + path.slice('./RecursiveTree.tsrx'.length),
						{ environment: 'client' },
					)!.code,
					loader: 'js',
					resolveDir: packageRoot,
				}));
			},
		};
		const bundle = await bundleConsumer(
			compiler.transform(entry, resolve(packageRoot, 'recursive-entry.tsrx'), {
				environment: 'client',
			})!.code,
			[tsrx],
		);
		expect(
			bundle.resolvedInputs.filter((input) =>
				/(?:^|\/)packages\/octane\/src\/(?:runtime(?:\.server)?\.ts|compiler\/|server\/|internal\/)/.test(
					input,
				),
			),
		).toEqual([]);
		const { mount } = (await import(
			`data:text/javascript;base64,${Buffer.from(bundle.contents).toString('base64')}`
		)) as {
			mount(target: BindingMountTarget, source: BindingSource<unknown>): BindingHandle;
		};
		type Branch = { key: string; label: string; children: Branch[] };
		let snapshot: { node: Branch } = {
			node: { key: 'root', label: 'Root', children: [{ key: 'a', label: 'A', children: [] }] },
		};
		const listeners = new Set<() => void>();
		const document = new JSDOM('<main></main>').window.document;
		const parent = document.querySelector('main')!;
		const handle = mount(
			{ parent },
			{
				getSnapshot: () => snapshot,
				subscribe(notify) {
					listeners.add(notify);
					return () => listeners.delete(notify);
				},
			},
		);
		const labels = () => [...parent.querySelectorAll('span')].map((node) => node.textContent);
		expect(labels()).toEqual(['Root', 'A']);
		const a = parent.querySelector('section[data-key="a"]');
		snapshot = {
			node: {
				key: 'root',
				label: 'Root',
				children: [{ key: 'a', label: 'A', children: [{ key: 'a1', label: 'A1', children: [] }] }],
			},
		};
		for (const notify of listeners) notify();
		expect(labels()).toEqual(['Root', 'A', 'A1']);
		expect(parent.querySelector('section[data-key="a"]')).toBe(a);
		handle.dispose();
		expect(listeners.size).toBe(0);
	});

	it('keeps ordinary roots and standalone signal predicates free of unrelated ownership', async () => {
		const bundle = await bundleConsumer("export { createRoot } from 'octane';");

		expect(bundle.inputs.some((input) => /\/behavior-root\.ts$/.test(input))).toBe(false);

		const predicates = await bundleConsumer(
			"export { isSignalHandle, isWritableSignal } from 'octane/signals';",
		);
		const { isSignalHandle, isWritableSignal } = (await import(
			`data:text/javascript;base64,${Buffer.from(predicates.contents).toString('base64')}`
		)) as typeof import('../src/signals/handle-protocol.js');
		const scope = createScope({ scopeKey: 'standalone-predicates' });
		try {
			const value$ = scope.signal$('value', 1);
			const doubled$ = scope.derived$('doubled', () => value$.get() * 2);
			expect(isSignalHandle(value$)).toBe(true);
			expect(isWritableSignal(value$)).toBe(true);
			expect(isSignalHandle(doubled$)).toBe(true);
			expect(isWritableSignal(doubled$)).toBe(false);
			for (const plain of [null, undefined, false, 1, 'value', {}, () => {}]) {
				expect(isSignalHandle(plain)).toBe(false);
				expect(isWritableSignal(plain)).toBe(false);
			}
		} finally {
			scope.dispose();
		}
		expect(
			predicates.inputs.filter((input) =>
				/(?:^|\/)packages\/octane\/src\/(?:runtime(?:\.server)?\.ts|behavior-root\.ts|signals\/(?:engine|facade|graph|owner-context)\.ts)$/.test(
					input,
				),
			),
		).toEqual([]);
	});
});
