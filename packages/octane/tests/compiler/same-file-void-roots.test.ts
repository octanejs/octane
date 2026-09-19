import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { decodeMappings } from '../_source-map.js';
import { compile } from '../../src/compiler/compile.js';

const PREFIX = "import {createRoot} from 'octane';\nfunction View() @{ <main>first</main> }\n";
const BODY =
	'export function mount(el) { const root=createRoot(el); root.render(View); root.unmount(); }';

describe('same-file void root compiler ownership', () => {
	const previous = process.env.OCTANE_COMPILE_FROZEN_AST;
	beforeAll(() => {
		process.env.OCTANE_COMPILE_FROZEN_AST = '1';
	});
	afterAll(() => {
		if (previous === undefined) delete process.env.OCTANE_COMPILE_FROZEN_AST;
		else process.env.OCTANE_COMPILE_FROZEN_AST = previous;
	});

	it('keeps the COW factory replacement mapped to its authored call', () => {
		const source = PREFIX + BODY;
		const result = compile(source, 'same-file-root.tsrx', { hmr: false, dev: false });
		const match = /const root = (\w+)/.exec(result.code);
		expect(match).not.toBeNull();
		expect(result.code).toContain('__createVoidRoot as');
		const offset = result.code.indexOf(match![1], match!.index);
		const lines = result.code.slice(0, offset).split('\n');
		const segments = decodeMappings(result.map.mappings)[lines.length - 1];
		expect(segments).toContainEqual([lines.at(-1)!.length, 0, 2, BODY.indexOf('createRoot')]);
		expect(result.map.sourcesContent).toEqual([source]);
	});

	it.each([
		['module const root', 'const root=createRoot(el); root.render(View); root.unmount();'],
		[
			'namespace root',
			'namespace N { export const root=createRoot(el); root.render(View); root.unmount(); }',
		],
		[
			'static block',
			'class C { static { const root=createRoot(el); root.render(View); root.unmount(); } }',
		],
		[
			'escaping root',
			'export function mount(el) { const root=createRoot(el); root.render(View); return root; }',
		],
		[
			'later unknown target',
			'export function mount(el, unknown) { const root=createRoot(el); root.render(View); root.render(unknown); }',
		],
		[
			'closure use',
			'export function mount(el) { const root=createRoot(el); root.render(View); return () => root.unmount(); }',
		],
		[
			'computed method',
			'export function mount(el) { const root=createRoot(el); root["render"](View); root.unmount(); }',
		],
		[
			'eval access',
			'export function mount(el) { const root=createRoot(el); root.render(View); eval("root.render(1)"); }',
		],
		[
			'nested component owner',
			'function Outer() { function mount(el) { const root=createRoot(el); root.render(View); root.unmount(); } return <section/>; }',
		],
	])('declines %s before emitting the module once', (_name, body) => {
		expect(
			compile(PREFIX + body, 'declined-root.tsrx', { hmr: false, dev: false }).code,
		).not.toContain('__createVoidRoot as');
	});

	it.each([
		'const View=()=> @{ <main>first</main> };',
		'let View=()=> @{ <main>first</main> };',
		'function View() { return <main>first</main>; }',
		'function View() @{ return "ordinary"; <main>first</main> }',
		'function View(props) @{ if(!props.ready) return null; <main>first</main> }',
	])('does not manufacture authored definition proof through normalization', (definition) => {
		const source = "import {createRoot} from 'octane';\n" + definition + '\n' + BODY;
		expect(compile(source, 'normalized-root.tsrx', { hmr: false, dev: false }).code).not.toContain(
			'__createVoidRoot as',
		);
	});

	it.each([
		{ dev: true },
		{ hmr: 'vite' },
		{ hmr: 'webpack' },
		{ profile: true },
		{ mode: 'server' },
		{ renderer: { id: 'dom', module: 'octane', target: 'dom' } },
		{ rendererBoundaries: { rules: [] } },
	])('preserves generic factory admission outside ordinary production DOM', (options) => {
		expect(
			compile(PREFIX + BODY, 'mode-root.tsrx', { hmr: false, dev: false, ...options }).code,
		).not.toContain('__createVoidRoot as');
	});

	it('allows unrelated writes to a shadow with the same component name', () => {
		const source = PREFIX + 'function unrelated(View) {View=()=>1;}\n' + BODY;
		expect(compile(source, 'shadow-root.tsrx', { hmr: false, dev: false }).code).toContain(
			'__createVoidRoot as',
		);
	});

	it('fails closed when runtime namespace writes cannot certify the module component', () => {
		const source =
			PREFIX +
			'namespace N { function mount(el) {const root=createRoot(el);root.render(View);root.unmount();} }';
		expect(
			compile(source, 'namespace-private-root.tsrx', { hmr: false, dev: false }).code,
		).not.toContain('__createVoidRoot as');
	});
});
