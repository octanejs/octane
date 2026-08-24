// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';
import { normalizeRendererConfig, resolveRendererForFile } from 'octane/compiler/renderers';
import { decodeMappings } from '../_source-map.js';

const { parseModule } = createRequire(new URL('../../package.json', import.meta.url))('@tsrx/core');

const renderer = {
	id: 'native',
	module: '@test/valdi-writer',
	target: 'valdi',
	server: 'unsupported',
	text: 'reject',
} as const;

const source = `export function Scene(props: { label: string }) @{
	<view padding={4}><label value={props.label} /></view>
}`;
const filename = '/src/Scene.tsrx';

function imports(code: string): string[] {
	return parseModule(code, 'Scene.js')
		.body.filter((node: any) => node.type === 'ImportDeclaration')
		.map((node: any) => node.source.value);
}

describe('Valdi compiler option', () => {
	it('selects a configurable external writer adapter', () => {
		const { code, diagnostics } = compile(source, filename, { renderer, hmr: false });
		expect(new Set(imports(code))).toEqual(new Set([renderer.module]));
		expect(diagnostics).toEqual([]);
	});

	it('resolves the opt-in target independently from universal renderer configuration', () => {
		const { id, ...entry } = renderer;
		const config = normalizeRendererConfig({
			registry: { [id]: entry },
			rules: [{ include: '**/*.native.tsrx', renderer: id }],
		});
		expect(resolveRendererForFile(config, '/src/Scene.native.tsrx')).toMatchObject(renderer);
		expect(resolveRendererForFile(config, '/src/App.tsrx').target).toBe('dom');
		expect(config.signature).not.toBe(
			normalizeRendererConfig({
				registry: { [id]: { ...entry, target: 'universal' } },
				rules: config.rules,
			}).signature,
		);
	});

	it.each([false, true])('retains authored expression locations in dev=%s', (dev) => {
		const result = compile(source, filename, { renderer, hmr: false, dev });
		const expression = 'props.label';
		const position = (text: string) => {
			const offset = text.indexOf(expression);
			expect(offset).toBeGreaterThanOrEqual(0);
			const before = text.slice(0, offset);
			return [before.split('\n').length - 1, offset - before.lastIndexOf('\n') - 1];
		};
		const [line, column] = position(result.code);
		const [authoredLine, authoredColumn] = position(source);
		expect(result.map.sourcesContent).toEqual([source]);
		expect(decodeMappings(result.map.mappings)[line]).toContainEqual([
			column,
			0,
			authoredLine,
			authoredColumn,
		]);
	});

	it.each([
		['raw text', 'export function Scene() @{ <label>hello</label> }', /text children/],
		[
			'text expressions',
			'export function Scene(props) @{ <label>{props.label as string}</label> }',
			/render text with a <label value=/,
		],
		['refs', 'export function Scene(props) @{ <view ref={props.ref} /> }', /ref props/],
		[
			'dynamic component tags',
			'export function Scene(props) @{ <props.Child /> }',
			/dynamic component tags/,
		],
		[
			'unstable components',
			'export function Scene({ Child }) @{ <Child /> }',
			/stable imported or module component/,
		],
		[
			'unkeyed loops',
			'export function Scene(props) @{ @for (const item of props.items) { <label value={item} /> } }',
			/@for requires an explicit key/,
		],
		[
			'hooks inside a keyed loop',
			`import { useState } from 'octane';
			 export function Scene(props) @{
				@for (const item of props.items; key item.id) {
					const [value] = useState(item.value);
					<label value={value} />
				}
			 }`,
			/hooks directly inside @for/,
		],
		[
			'unsupported hooks',
			"import { useEffect } from 'octane'; export function Scene() @{ useEffect(() => {}); <view /> }",
			/runtime import "useEffect"/,
		],
		[
			'context hooks',
			"import { useContext } from 'octane'; export function Scene(props) @{ const value = useContext(props.context); <label value={value} /> }",
			/runtime import "useContext"/,
		],
		[
			'template exception regions',
			'export function Scene() @{ @try { <view /> } @catch (error) { <label /> } }',
			/unsupported renderable JSXTryExpression/,
		],
		[
			'template switches',
			'export function Scene(props) @{ @switch (props.value) { @case 1: { <view /> } @default: { <label /> } } }',
			/unsupported renderable JSXSwitchExpression/,
		],
		[
			'server blocks',
			'module server { export function value() { return 1; } } export function Scene() @{ <view /> }',
			/`module server` is not supported/,
		],
		[
			'let component bindings',
			'export let Scene = () => @{ <view /> };',
			/component function bindings must use const/,
		],
		[
			'var component bindings',
			'export var Scene = () => @{ <view /> };',
			/component function bindings must use const/,
		],
		[
			'reassigned component declarations',
			'export function Scene() @{ <view /> } Scene = () => null;',
			/component bindings must not be reassigned/,
		],
	])('reports an explicit diagnostic for %s', (_label, input, diagnostic) => {
		expect(() => compile(input, filename, { renderer, hmr: false })).toThrow(diagnostic);
	});

	it('accepts const arrow components and unrelated shadowed local assignments', () => {
		const result = compile(
			`export const Scene = () => @{ <view /> };
			 function replace(Scene) { Scene = null; return Scene; }`,
			filename,
			{ renderer, hmr: false },
		);
		expect(result.diagnostics).toEqual([]);
		expect(new Set(imports(result.code))).toEqual(new Set([renderer.module]));
	});

	it.each([
		[{ mode: 'server' as const }, /does not provide.*server compilation/],
		[{ hmr: true }, /HMR is not supported/],
		[{ profile: true }, /profiling is not supported/],
	])('rejects an unsupported execution mode: %j', (options, diagnostic) => {
		expect(() => compile(source, filename, { renderer, hmr: false, ...options })).toThrow(
			diagnostic,
		);
	});

	it('rejects a renderer configuration that promises server rendering', () => {
		const { id, ...entry } = renderer;
		expect(() =>
			normalizeRendererConfig({
				registry: { [id]: { ...entry, server: 'render' } },
			}),
		).toThrow(/client-only Valdi writer target/);
	});

	it('applies the configured renderer restrictions without DOM-specific diagnostics', () => {
		expect(() =>
			compile('export function Scene() @{ <label value={document.title} /> }', filename, {
				renderer: { ...renderer, validation: { forbiddenGlobals: ['document'] } },
				hmr: false,
			}),
		).toThrow(/forbids unbound global "document"/);
		const { diagnostics } = compile(
			'export function Scene(props) @{ <input onChange={props.onChange} /> }',
			filename,
			{ renderer, hmr: false, dev: true },
		);
		expect(diagnostics).toEqual([]);
	});

	it('does not change the DOM default or the existing universal target', () => {
		const dom = compile(source, filename, { hmr: false });
		const universalOptions = {
			hmr: false,
			renderer: { ...renderer, target: 'universal' as const },
		};
		const universal = compile(source, filename, universalOptions);
		compile(source, filename, { renderer, hmr: false });
		expect(compile(source, filename, { hmr: false })).toEqual(dom);
		expect(compile(source, filename, universalOptions)).toEqual(universal);
		expect(imports(dom.code)).toContain('octane');
		expect(imports(universal.code)).toContain(renderer.module);
	});
});
