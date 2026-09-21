import { describe, expect, it } from 'vitest';
import { compile, compileToVolarMappings, type CompileOptions } from 'octane/compiler';
import { normalizeRendererConfig } from 'octane/compiler/renderers';
import { createOctaneCompiler } from '../../src/compiler/bundler.js';

const CODE = 'OCTANE_FOR_ROOT_KEY';
const FILENAME = '/src/Rows.tsrx';
const SOURCE = `export interface Row { index: number }
export interface Rows { rows: Row[] }

export function Rows(props: Rows) @{
  @for (const row of props.rows) {
    <div key={row.index} data-index={row.index} />
  }
}`;

function warnings(source: string, options: CompileOptions = {}) {
	return compile(source, FILENAME, options).diagnostics.filter(
		(diagnostic) => diagnostic.code === CODE,
	);
}

describe('@for root key diagnostic', () => {
	it.each<CompileOptions>([
		{},
		{ mode: 'client', dev: true, hmr: 'vite' },
		{ mode: 'client', dev: false, hmr: false },
		{ mode: 'server', dev: true },
		{ mode: 'server', dev: false },
		{ strong: true, dev: false, hmr: false },
	])('warns at the authored key attribute in compile mode %j', (options) => {
		const result = warnings(SOURCE, options);
		const offset = SOURCE.indexOf('key=');

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			code: CODE,
			severity: 'warning',
			filename: FILENAME,
			start: { offset, line: 6, column: 9 },
			end: { offset: offset + 3, line: 6, column: 12 },
		});
		expect(result[0].message).toContain('; key expr');
	});

	it('keeps the documented header key quiet', () => {
		const source = SOURCE.replace('of props.rows)', 'of props.rows; key row.index)').replace(
			' key={row.index}',
			'',
		);
		expect(warnings(source)).toEqual([]);
	});

	it('warns when a root key remains alongside the header key or setup statements', () => {
		expect(
			warnings(SOURCE.replace('of props.rows)', 'of props.rows; key row.index)')),
		).toHaveLength(1);
		expect(
			warnings(SOURCE.replace('<div key=', 'const index = row.index;\n    <div key=')),
		).toHaveLength(1);
	});

	it('warns for static or valueless intrinsic root keys', () => {
		for (const attribute of ['key={row.index}', 'key="row"', 'key']) {
			expect(warnings(SOURCE.replace('key={row.index}', attribute)), attribute).toHaveLength(1);
		}
	});

	it('allows a component root key alongside the row header key', () => {
		const source = `function Component() @{ <video /> }
export function App(props) @{
  @for (const item of props.items; key item.k) {
    <Component key={item.k + 'video'} />
  }
}`;
		for (const mode of ['client', 'server'] as const) {
			expect(warnings(source, { mode })).toEqual([]);
		}
		expect(compileToVolarMappings(source, FILENAME).diagnostics).toEqual([]);
	});

	it('keeps component roots quiet without a row header key', () => {
		for (const tag of ['Component', '_Component', '$Component', 'ui.Component', '{Component}']) {
			const source = `function Component() @{ <div /> }
const _Component = Component;
const $Component = Component;
const ui = { Component };
export function App(props) @{
  @for (const item of props.items) { <${tag} key={item.k} /> }
}`;
			expect(warnings(source), tag).toEqual([]);
		}
	});

	it('warns for intrinsic SVG and custom-element roots', () => {
		for (const tag of ['svg', 'my-video']) {
			expect(warnings(SOURCE.replace('<div key=', `<${tag} key=`)), tag).toHaveLength(1);
		}
	});

	it('keeps builtin component spellings and lowercase aliases quiet', () => {
		for (const [imported, local] of [
			['Activity', 'activity'],
			['unstable_Activity', 'activity'],
			['Fragment', 'fragment'],
		]) {
			const source = `import { ${imported} as ${local} } from 'octane';
export function App(props) @{
  @for (const item of props.items; key item.k) {
    <${local} key={item.k}><div /></${local}>
  }
}`;
			expect(warnings(source), imported).toEqual([]);
			expect(compileToVolarMappings(source, FILENAME).diagnostics, imported).toEqual([]);
		}
		const source = `export function App(props) @{
  @for (const item of props.items; key item.k) { <unstable_Activity key={item.k} /> }
}`;
		expect(warnings(source)).toEqual([]);
	});

	it('still warns for intrinsic roots that shadow lowercase builtin aliases', () => {
		const source = `import { Activity as activity } from 'octane';
export function App(props, activity) @{
  @for (const item of props.items; key item.k) { <activity key={item.k} /> }
}`;
		expect(warnings(source)).toHaveLength(1);
		expect(
			warnings(
				source
					.replace('Activity as activity', "'Activity' as activity")
					.replace('props, activity', 'props'),
			),
		).toHaveLength(1);
	});

	it('recognizes escaped key names at their authored source range', () => {
		const source = SOURCE.replace('key={', '\\u006bey={');
		const [diagnostic] = warnings(source);
		expect(diagnostic).toMatchObject({
			start: { offset: source.indexOf('\\u006bey') },
			end: { offset: source.indexOf('\\u006bey') + '\\u006bey'.length },
		});
	});

	it('keeps root keys owned by universal and Valdi renderers quiet', () => {
		const source = `export function App(props) @{
  @for (const row of props.rows; key row.id) { <view key={row.mode} /> }
}`;
		for (const target of ['universal', 'valdi'] as const) {
			const renderer = { id: 'native', module: '@test/native-renderer', target };
			expect(warnings(source, { renderer }), target).toEqual([]);
			expect(
				compileToVolarMappings(source, '/src/Rows.native.tsrx', {
					renderers: {
						default: 'native',
						registry: { native: { module: renderer.module, target } },
					},
				}).diagnostics,
				target,
			).toEqual([]);
		}
	});

	it('follows DOM ownership through nested renderer boundaries', () => {
		const renderers = {
			registry: { object: 'octane/universal' },
			boundaries: {
				'@scene/bridge': {
					Canvas: { ownerRenderer: 'dom', childRenderer: 'object', prop: 'children' },
					Html: { ownerRenderer: 'object', childRenderer: 'dom', prop: 'children' },
				},
			},
		};
		const config = normalizeRendererConfig(renderers);
		const source = `import { Canvas, Html } from '@scene/bridge';
export function App(props) @{
  <Canvas>
    @for (const row of props.rows; key row.id) { <view key={row.mode} /> }
    <Html>@for (const row of props.rows) { <div key={row.id} /> }</Html>
  </Canvas>
}`;
		const expected = warnings(source, {
			rendererBoundaries: config.boundaries,
			rendererRegistry: config.registry,
		});
		expect(expected).toHaveLength(1);
		expect(expected[0].start.offset).toBe(source.indexOf('key={row.id}'));
		expect(compileToVolarMappings(source, FILENAME, { renderers }).diagnostics).toEqual(expected);
	});

	it('keeps descendant keys, empty arms, and ordinary JSX keys quiet', () => {
		for (const source of [
			SOURCE.replace(
				'<div key={row.index} data-index={row.index} />',
				'<div><span key={row.index} /></div>',
			),
			SOURCE.replace(
				'<div key={row.index} data-index={row.index} />',
				'<><span key={row.index} /></>',
			),
			SOURCE.replace('key={row.index}', 'data-key={row.index}'),
			SOURCE.replace(
				'<div key={row.index} data-index={row.index} />',
				'@if (row.index > 0) { <div key={row.index} /> }',
			),
			`export function App(props) @{ @for (const row of props.rows; key row.index) { <div /> } @empty { <div key="empty" /> } }`,
			`export function App(props) { return props.rows.map(row => <div key={row.index} />); }`,
		]) {
			expect(warnings(source), source).toEqual([]);
		}
	});

	it('reports nested loops once each in authored source order', () => {
		const source = `export function App(props) @{
  @for (const group of props.groups) {
    <section key={group.id}>
      @for (const row of group.rows) {
        <div key={row.index} />
      }
    </section>
  }
}`;
		expect(warnings(source).map((diagnostic) => diagnostic.start.offset)).toEqual([
			source.indexOf('key={group.id}'),
			source.indexOf('key={row.index}'),
		]);
	});

	it('keeps the authored warning through deferred hydration preparation', () => {
		const source = `import { Hydrate } from 'octane';
export function App(props) @{
  <Hydrate when={props.visible}>
    @for (const row of props.rows) { <div key={row.index} /> }
  </Hydrate>
}`;
		const client = warnings(source);
		expect(client).toHaveLength(1);
		expect(warnings(source, { mode: 'server' })).toEqual(client);
	});

	it('publishes the same warning through editor mappings and bundler transforms', () => {
		const expected = warnings(SOURCE);
		expect(expected).toHaveLength(1);
		expect(compileToVolarMappings(SOURCE, FILENAME).diagnostics).toEqual(expected);

		const messages: string[] = [];
		const compiler = createOctaneCompiler({
			root: '/project',
			warn: (message: string) => messages.push(message),
		});
		for (const environment of ['client', 'server'] as const) {
			const result = compiler.transform(SOURCE, `/project${FILENAME}`, { environment });
			expect(result && 'diagnostics' in result ? result.diagnostics : []).toEqual(expected);
		}
		expect(messages).toHaveLength(1);
		expect(messages[0]).toContain(CODE);
		expect(messages[0]).toContain(`${FILENAME}:6:10 warning:`);
	});
});
