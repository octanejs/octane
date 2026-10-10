import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { decodeMappings } from '../_source-map.js';
import { compile } from '../../src/compiler/compile.js';
import { slotHooks } from '../../src/compiler/slot-hooks.js';

const { parseModule } = createRequire(import.meta.url)('@tsrx/core');

function rootCalleeOffset(code: string): number | undefined {
	let offset: number | undefined;
	const seen = new WeakSet();
	const visit = (value: unknown) => {
		if (value === null || typeof value !== 'object' || seen.has(value)) return;
		seen.add(value);
		const node = value as {
			type?: string;
			id?: { name?: string };
			init?: { type?: string; callee?: { type?: string; start?: number } };
		};
		if (
			node.type === 'VariableDeclarator' &&
			node.id?.name === 'root' &&
			node.init?.type === 'CallExpression' &&
			node.init.callee?.type === 'Identifier'
		)
			offset = node.init.callee.start;
		for (const child of Object.values(value)) visit(child);
	};
	visit(parseModule(code, 'compiled.js'));
	return offset;
}

describe('same-file root compiler artifact origins', () => {
	it.each([
		{ dev: true },
		{ hmr: true },
		{ profile: true },
		{ environment: 'server' },
		{ manualSlots: true },
		{ renderer: { id: 'test', module: 'octane/universal', target: 'universal' } },
	] as const)('keeps default-options DOM helpers out of other compile modes (%j)', (options) => {
		const source = `import {createRoot} from 'octane';
import View from './View.tsrx';
const root=createRoot(document.body);root.render(View);root.unmount();`;
		for (const voidComponent of [false, true]) {
			const result = slotHooks(source, '/src/entry.ts', {
				environment: 'client',
				dev: false,
				hmr: false,
				isVoidComponentImport: () => voidComponent,
				...options,
			});
			expect(result?.code ?? source).not.toMatch(/__create(?:Void)?RootDefaultOptions/);
		}
	});

	it('keeps returned-value reconciliation when an imported component has no void proof', () => {
		const source = `import {createRoot as mount} from 'octane';
import View from './View.ts';
import Other from './Other.tsrx';
export function run(host, value) {
 const root=mount(host);root.render(View,{value});root.render(Other);root.unmount();
}`;
		const result = slotHooks(source, '/src/entry.ts', {
			dev: false,
			hmr: false,
			isVoidComponentImport: (request: string) => request === './Other.tsrx',
		});
		expect(result?.code).toContain('__createRootDefaultOptions as');
		expect(result?.code).not.toContain('__createVoidRoot');
		expect(result?.code).toContain('root.render(View,{value});root.render(Other);root.unmount()');
	});

	it.each([
		['explicit undefined', 'const root=createRoot(host,undefined);root.render(View);'],
		['options', 'const root=createRoot(host,options());root.render(View);'],
		['spread', 'const root=createRoot(...[host]);root.render(View);'],
		['extra argument', 'const root=createRoot(host,undefined,extra());root.render(View);'],
		['escaped root', 'const root=createRoot(host);root.render(View);return root;'],
		['unknown render', 'const root=createRoot(host);root.render(View);root.render(value);'],
		['eval', 'const root=createRoot(host);root.render(View);eval("root");'],
		[
			'shadowed factory',
			'function inner(createRoot){createRoot(host).render(View);}inner(factory);',
		],
		['factory alias', 'const factory=createRoot;const root=factory(host);root.render(View);'],
	])('keeps the public root for an unproven component with %s', (_label, body) => {
		const source = `import {createRoot} from 'octane';
import View from './View.ts';
export function run(host,options,extra,value,factory){${body}}`;
		const result = slotHooks(source, '/src/entry.ts', {
			dev: false,
			hmr: false,
			isVoidComponentImport: () => false,
		});
		expect(result?.code ?? source).toBe(source);
	});

	it.each([
		['container', true],
		['container, undefined', false],
		['container, {}', false],
		['container, options()', false],
		['...[container]', false],
		['container, {}, extra()', false],
	])('keeps supplied root arguments for %s', (argumentsSource, defaultOptions) => {
		const source = `import {createRoot} from 'octane';
function View() @{ <main>ready</main> }
export function mount(container, options, extra) {
	const root = createRoot(${argumentsSource});
	root.render(View);
	root.unmount();
}`;
		const { code } = compile(source, 'root-options.tsrx', { hmr: false, dev: false });
		const imported = parseModule(code, 'root-options.js').body.flatMap((node: any) =>
			node.type === 'ImportDeclaration'
				? node.specifiers.map((specifier: any) => specifier.imported?.name)
				: [],
		);
		expect(imported).toContain(
			defaultOptions ? '__createVoidRootDefaultOptions' : '__createVoidRoot',
		);
		expect(imported.includes('__createVoidRootDefaultOptions')).toBe(defaultOptions);
	});

	it.each(['createRoot', 'hydrateRoot'])(
		'preserves COW and the authored %s callee source coordinate',
		(factory) => {
			const previous = process.env.OCTANE_COMPILE_FROZEN_AST;
			try {
				process.env.OCTANE_COMPILE_FROZEN_AST = '1';
				const prefix = `import {${factory}} from 'octane';\nfunction View() @{ <main>first</main> }\n`;
				const body =
					factory === 'createRoot'
						? 'export function mount(el) { const root=createRoot(el); root.render(View); root.unmount(); }'
						: 'export function mount(el) { const root=hydrateRoot(el,View,undefined,{identifierPrefix:"one-"}); root.unmount(); }';
				const source = prefix + body;
				const result = compile(source, 'same-file-root.tsrx', { hmr: false, dev: false });
				const offset = rootCalleeOffset(result.code);
				expect(offset).toBeTypeOf('number');
				const lines = result.code.slice(0, offset).split('\n');
				const segments = decodeMappings(result.map.mappings)[lines.length - 1];
				expect(segments).toContainEqual([lines.at(-1)!.length, 0, 2, body.indexOf(factory)]);
				expect(result.map.sourcesContent).toEqual([source]);
			} finally {
				if (previous === undefined) delete process.env.OCTANE_COMPILE_FROZEN_AST;
				else process.env.OCTANE_COMPILE_FROZEN_AST = previous;
			}
		},
	);
});
