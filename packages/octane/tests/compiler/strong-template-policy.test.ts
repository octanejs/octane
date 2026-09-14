import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';
import { slotHooks } from '../../src/compiler/slot-hooks.js';
import { compileToVolarMappings } from '../../src/compiler/volar.js';

const strong = (source: string) => `"use strong";\n${source}`;

describe('Strong template authoring checks', () => {
	it('keeps the mapped snapshot fixture in compatibility mode and rejects Strong opt-in', () => {
		const filename = 'packages/octane/tests/_fixtures/for-snapshot-compat.tsx';
		const source = readFileSync(filename, 'utf8');
		for (const mode of ['client', 'server'] as const) {
			expect(() => compile(source, filename, { mode })).not.toThrow();
			expect(() => compile(source, filename, { mode, strong: true })).toThrow(
				'OCTANE_STRONG_MAP_JSX',
			);
		}
	});
	it.each([
		['inline JSX', 'props.items.map(item => <li>{item.name as string}</li>)'],
		['computed map', 'props.items["map"](item => <li />)'],
		['conditional output', 'props.items.map(item => item.show ? <li /> : null)'],
		['block return', 'props.items.map(item => { return <li />; })'],
		['fragment output', 'props.items.map(item => <><li /></>)'],
	])('rejects .map returning %s', (_label, expression) => {
		const source = `export function App(props) @{ <ul>{${expression}}</ul> }`;
		expect(() => compile(source, 'App.tsrx')).not.toThrow();
		for (const mode of ['client', 'server'] as const) {
			expect(() => compile(strong(source), 'App.tsrx', { mode })).toThrow('OCTANE_STRONG_MAP_JSX');
		}
	});
	it('resolves a named JSX mapper and its alias', () => {
		const source = `export function App(props) @{
			const renderItem = item => <li>{item.name as string}</li>;
			const render = renderItem;
			<ul>{props.items.map(render)}</ul>
		}`;
		expect(() => compile(strong(source), 'App.tsrx')).toThrow('OCTANE_STRONG_MAP_JSX');
	});
	it('allows data mapping, unused nested JSX functions, and keyed @for', () => {
		const source = `export function App(props) @{
			const values = props.items.map(item => item.id);
			const flags = props.items.map(item => { const component = () => <li />; return item.show; });
			<ul>@for (const item of props.items; index position; key item.id) { <li>{position as string}</li> }</ul>
		}`;
		expect(() => compile(strong(source), 'App.tsrx')).not.toThrow();
	});
	it.each(['position', 'position + 1', '`row-${position}`', 'item.id + position'])(
		'rejects index key %s',
		(key) => {
			const source = `export function App(props) @{ <ul>@for (const item of props.items; index position; key ${key}) { <li /> }</ul> }`;
			expect(() => compile(source, 'App.tsrx')).not.toThrow();
			expect(() => compile(strong(source), 'App.tsrx')).toThrow('OCTANE_STRONG_INDEX_KEY');
		},
	);
	it('distinguishes an item property from the index binding', () => {
		const source = `export function App(props) @{ <ul>@for (const item of props.items; index index; key item.index) { <li /> }</ul> }`;
		expect(() => compile(strong(source), 'App.tsrx')).not.toThrow();
	});
	it.each(['suppressHydrationWarning', 'suppressNativeChangeWarning'])(
		'rejects intrinsic %s including false and object spreads',
		(prop) => {
			for (const attribute of [prop, `${prop}={false}`, `{...{ ${prop}: true }}`]) {
				const source = `export function App() @{ <div ${attribute} /> }`;
				expect(() => compile(source, 'App.tsrx')).not.toThrow();
				expect(() => compile(strong(source), 'App.tsrx')).toThrow('OCTANE_STRONG_SUPPRESSION_PROP');
			}
		},
	);
	it('preserves custom component suppression-named props', () => {
		const source = `import { Widget } from './widget'; export function App() @{ <Widget suppressHydrationWarning suppressNativeChangeWarning /> }`;
		expect(() => compile(strong(source), 'App.tsrx')).not.toThrow();
	});
	it.each(['<input onChange={() => {}} />', '<textarea onChangeCapture={() => {}} />'])(
		'promotes native text change warning for %s',
		(host) => {
			const source = `export function App() @{ ${host} }`;
			expect(compile(source, 'App.tsrx').diagnostics).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ code: 'OCTANE_NATIVE_TEXT_ONCHANGE', severity: 'warning' }),
				]),
			);
			for (const mode of ['client', 'server'] as const) {
				expect(() => compile(strong(source), 'App.tsrx', { mode })).toThrow(
					'OCTANE_NATIVE_TEXT_ONCHANGE',
				);
			}
			const result = compileToVolarMappings(strong(source), 'App.tsrx');
			expect(result.diagnostics).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ code: 'OCTANE_NATIVE_TEXT_ONCHANGE', severity: 'error' }),
				]),
			);
		},
	);
	it.each([
		'<input type="checkbox" onChange={() => {}} />',
		'<select onChange={() => {}} />',
		'<input onInput={() => {}} />',
		'<input readOnly onChange={() => {}} />',
	])('allows native event semantics for %s', (host) => {
		expect(() => compile(strong(`export function App() @{ ${host} }`), 'App.tsrx')).not.toThrow();
	});
	it.each(['flushSync', 'unstable_batchedUpdates', 'StrictMode'])(
		'rejects compatibility import %s even when aliased or unused',
		(name) => {
			const source = `import { ${name} as compat } from 'octane'; export function App() @{ <div /> }`;
			expect(() => compile(source, 'App.tsrx')).not.toThrow();
			expect(() => compile(strong(source), 'App.tsrx')).toThrow('OCTANE_STRONG_COMPAT_IMPORT');
			expect(() => slotHooks(strong(source), 'App.tsrx')).toThrow('OCTANE_STRONG_COMPAT_IMPORT');
		},
	);
	it('rejects namespace compatibility access and preserves unrelated names', () => {
		const bad = `import * as Octane from 'octane'; const batch = Octane['flushSync']; export function App() @{ <div /> }`;
		expect(() => compile(strong(bad), 'App.tsrx')).toThrow('OCTANE_STRONG_COMPAT_IMPORT');
		const good = `import { flushSync } from './adapter'; import * as Octane from 'octane'; function helper(Octane) { return Octane.flushSync; } export function App() @{ <div /> }`;
		expect(() => compile(strong(good), 'App.tsrx')).not.toThrow();
	});
	it('reuses the parsed module for renderer regions in editor analysis', () => {
		// The tolerant editor parser accepts shapes a second strict parse rejects;
		// region analysis must report diagnostics for them rather than throw.
		for (const source of [
			`export function App(props) @{
  const h0 = () => {};
  <div>@{ <button onClick={h0}>first</button><button onClick={h0}>last</button> }</div>
}`,
			`import { useState } from 'octane';
export function App(props) @{
  const [count] = useState(0);
  <div>@{
    if (props.ready) { var count = 1; }
    <span>{count as string}</span>
  }</div>
}`,
		]) {
			expect(() => compileToVolarMappings(strong(source), 'App.tsrx')).not.toThrow();
		}
	});
	it('provides source locations for editor errors and supports strong:true', () => {
		const source = `export function App(props) @{ <ul>{props.items.map(item => <li />)}</ul> }`;
		expect(() => compile(source, 'App.tsrx', { strong: true })).toThrow('OCTANE_STRONG_MAP_JSX');
		const authored = strong(source);
		const diagnostic = compileToVolarMappings(authored, 'App.tsrx').diagnostics.find(
			(item) => item.code === 'OCTANE_STRONG_MAP_JSX',
		);
		expect(diagnostic).toMatchObject({ severity: 'error', start: { line: 2 } });
		expect(authored.slice(diagnostic!.start.offset, diagnostic!.end.offset)).toContain('.map');
	});
});

describe('Strong template policy lexical boundaries', () => {
	it.each([
		`import * as Octane from 'octane'; export function App() { return <Octane.StrictMode><div /></Octane.StrictMode>; }`,
		`import * as Octane from 'octane'; const { flushSync: batch } = Octane; export function App() { return <div />; }`,
		`import * as Octane from 'octane'; export function App() { const { ['StrictMode']: Boundary } = Octane; return <Boundary><div /></Boundary>; }`,
	])('rejects namespace compatibility JSX and destructuring', (source) => {
		expect(() => compile(source, 'App.tsx')).not.toThrow();
		expect(() => compile(strong(source), 'App.tsx')).toThrow('OCTANE_STRONG_COMPAT_IMPORT');
	});

	it('respects shadowed namespaces in JSX and destructuring', () => {
		const source = `import * as Octane from 'octane'; export function App(Octane) { const { StrictMode } = Octane; return <Octane.StrictMode><StrictMode /></Octane.StrictMode>; }`;
		expect(() => compile(strong(source), 'App.tsx')).not.toThrow();
	});

	it.each([
		`item => { const node = <li />; return node; }`,
		`item => { const node = <li />; const alias = node; return item.show ? alias : null; }`,
		`item => { { const node = <li />; return node; } }`,
	])('rejects a JSX mapper returning a local constant alias', (mapper) => {
		const source = `export function App(props) { return <ul>{props.items.map(${mapper})}</ul>; }`;
		expect(() => compile(strong(source), 'App.tsx')).toThrow('OCTANE_STRONG_MAP_JSX');
	});

	it.each([
		`item => { const node = <li />; { const node = item.id; return node; } }`,
		`item => { const node = <li />; return item.id; }`,
		`item => { const first = second; const second = first; return first; }`,
	])('preserves non-JSX returns and bounded cyclic aliases', (mapper) => {
		const source = `export function App(props) { return <ul>{props.items.map(${mapper})}</ul>; }`;
		expect(() => compile(strong(source), 'App.tsx')).not.toThrow();
	});
});
