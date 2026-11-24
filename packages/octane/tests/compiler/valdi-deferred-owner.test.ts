// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';

const renderer = {
	id: 'native',
	module: '@test/writer',
	target: 'valdi',
	server: 'unsupported',
	text: 'host',
	capabilities: ['host-text-site', 'component-runtime'],
} as const;

describe('Valdi deferred child ownership', () => {
	it.each([
		[
			'component children',
			'import { useState } from "octane";',
			'<Child><label value={useState(0)[0]} /></Child>',
		],
		[
			'JSX-valued props',
			'import { useContext as read } from "octane";',
			'<Child fallback={<label value={read(ctx)} />} />',
		],
		[
			'block prop setup',
			'import { useContext as read } from "octane";',
			'<Child fallback={@{ const value = read(ctx); <label value={value} /> }} />',
		],
		[
			'custom hooks',
			'function useValue() { return 1; }',
			'<Child><label value={useValue()} /></Child>',
		],
		[
			'synchronously invoked closures',
			'import { useState } from "octane";',
			'<Child><label value={(() => useState(0)[0])()} /></Child>',
		],
		[
			'context hook members',
			'const hooks = { useContext: () => 1 };',
			'<Child><label value={hooks.useContext()} /></Child>',
		],
	])('rejects parent hooks inside deferred %s', (_, setup, jsx) => {
		const source = `${setup} import { Child } from './child'; export function Scene({ctx}) @{ ${jsx} }`;
		expect(() => compile(source, '/src/Scene.tsrx', { renderer, hmr: false })).toThrow(
			/hooks inside deferred children/,
		);
	});

	it('keeps parent hooks evaluated before creating children', () => {
		const source = `import { useState } from 'octane'; import { Child } from './child';
		export function Scene() @{ const [value] = useState(0); <Child><label value={value} /></Child> }`;
		expect(compile(source, '/src/Scene.tsrx', { renderer, hmr: false }).diagnostics).toEqual([]);
	});

	it.each([
		[
			'hooks',
			'function row() { const [n] = useState(0); return <label value={n}/>; }',
			'row()',
			/hooks inside/,
		],
		[
			'hooks in defaults',
			'function row(n = useState(0)[0]) { return <label value={n}/>; }',
			'row()',
			/hooks inside/,
		],
		['async helpers', 'async function row() { return <label />; }', 'row()', /synchronous/],
		['missing arguments', 'const row = (n) => <label value={n} />;', 'row', /arguments/],
		['reassignment', 'function row() { return <label/>; } row = null;', 'row', /reassigned/],
		['mutable bindings', 'let row = () => <label/>;', 'row', /const/],
		[
			'nested self tags',
			'const row = function Self() { return <Self/>; };',
			'row()',
			/nested component/,
		],
	])('diagnoses %s in local JSX helpers', (_, declaration, call, error) => {
		const source = `import { useState } from 'octane'; export function Scene() @{ ${declaration} <view>{${call}}</view> }`;
		expect(() => compile(source, '/Scene.tsrx', { renderer, hmr: false })).toThrow(error);
	});

	it('rejects a nested helper used as a tag through a const alias', () => {
		const source =
			'export function Scene() @{ const row = () => <label/>; const Local = row; <Local/> }';
		expect(() => compile(source, '/Scene.tsrx', { renderer, hmr: false })).toThrow(
			/nested component declarations/,
		);
	});

	it('rejects calling a tagged descriptor through a const alias', () => {
		const source = `function row() { return <label/>; }
			const Row = row;
			export function Scene() @{ <view><Row/>{row()}</view> }`;
		expect(() => compile(source, '/Scene.tsrx', { renderer, hmr: false })).toThrow(/descriptor/);
	});

	it('retains the earlier writer restriction without component-runtime', () => {
		const source = 'export function Scene() @{ const row = () => <label/>; <view>{row()}</view> }';
		expect(() =>
			compile(source, '/Scene.tsrx', {
				renderer: { ...renderer, capabilities: ['host-text-site'] },
				hmr: false,
			}),
		).toThrow(/JSX in JavaScript setup/);
	});

	it('does not classify ordinary runtime APIs as hooks', () => {
		const source = `import { flushSync } from 'octane'; import { Child } from './child';
		export function Scene() @{ <Child><label value={flushSync(() => 1)} /></Child> }`;
		expect(compile(source, '/src/Scene.tsrx', { renderer, hmr: false }).diagnostics).toEqual([]);
	});

	it('keeps aliased context reads exempt from slot restrictions in keyed loops', () => {
		const source = `import { useContext as useTheme } from 'octane';
		export function Scene({ctx, items}) @{ @for (const item of items; key item.id) { <label value={useTheme(ctx)} /> } }`;
		expect(compile(source, '/src/Scene.tsrx', { renderer, hmr: false }).diagnostics).toEqual([]);
	});
});
