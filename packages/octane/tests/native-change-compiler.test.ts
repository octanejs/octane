import { describe, expect, it, vi } from 'vitest';
import { compile } from '../src/compiler/compile.js';
import { createOctaneCompiler } from '../src/compiler/bundler.js';
import { octane } from '../src/compiler/vite.js';
import { compileToVolarMappings } from '../src/compiler/volar.js';
import { normalizeRendererConfig } from '../src/compiler/renderers.js';

const CODE = 'OCTANE_NATIVE_TEXT_ONCHANGE';

function component(host: string, setup = '') {
	return `export function App(props) @{ ${setup}${host} }`;
}

function diagnostics(source: string, options: Record<string, unknown> = {}) {
	return compile(source, '/src/App.tsrx', options as any).diagnostics as any[];
}

describe('native text onChange compiler diagnostic', () => {
	it('publishes a stable warning range and phase-preserving suggestions', () => {
		const source = component(
			'<input value={props.value} onChange={() => {}} onChangeCapture={() => {}} />',
		);
		const result = diagnostics(source);

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			code: CODE,
			severity: 'warning',
			filename: '/src/App.tsrx',
			start: {
				offset: source.indexOf('onChange='),
				line: 1,
				column: source.indexOf('onChange='),
			},
			suggestions: [{ attribute: 'onInput' }, { attribute: 'onInputCapture' }],
		});
		expect(result[0].end.offset).toBe(source.indexOf('onChange=') + 'onChange'.length);
		expect(result[0].message).toContain('native commit event');
		expect(result[0].message).toContain('also has `value`');
	});

	it('warns for every statically text-entry input state and textarea', () => {
		const textTypes = [
			null,
			'',
			'text',
			'SEARCH',
			'url',
			'tel',
			'password',
			'email',
			'number',
			'not-a-real-input-state',
		];
		for (const type of textTypes) {
			const typeAttribute = type === null ? '' : ` type=${JSON.stringify(type)}`;
			expect(
				diagnostics(component(`<input${typeAttribute} onChange={() => {}} />`)),
				`input type ${String(type)}`,
			).toHaveLength(1);
		}
		expect(diagnostics(component('<input type onChange={() => {}} />'))).toHaveLength(1);
		expect(diagnostics(component('<input type={42} onChange={() => {}} />'))).toHaveLength(1);
		expect(diagnostics(component('<textarea onChange={() => {}} />'))).toHaveLength(1);
	});

	it('keeps known non-text controls and non-host callback props quiet', () => {
		const nonTextTypes = [
			'button',
			'checkbox',
			'color',
			'date',
			'datetime-local',
			'file',
			'hidden',
			'image',
			'month',
			'radio',
			'range',
			'reset',
			'submit',
			'time',
			'week',
		];
		for (const type of nonTextTypes) {
			expect(
				diagnostics(component(`<input type=${JSON.stringify(type)} onChange={() => {}} />`)),
				type,
			).toEqual([]);
		}
		expect(
			diagnostics(`
function Field() @{ <div /> }
export function App() @{
  <>
    <select onChange={() => {}} />
    <custom-input onChange={() => {}} />
    <Field onChange={() => {}} />
    <div contentEditable onChange={() => {}} />
  </>
}`),
		).toEqual([]);
	});

	it('recognizes per-edit handlers, static editability, and explicit native intent', () => {
		const source = `
export function App() @{
  const handleInput = () => {};
  <>
    <input onChange={() => {}} onInput={() => {}} />
    <input onChange={() => {}} onInputCapture={handleInput} />
    <input onChange={() => {}} readOnly />
    <textarea onChange={() => {}} disabled={true} />
    <input onChange={() => {}} suppressNativeChangeWarning />
  </>
}`;
		expect(diagnostics(source)).toEqual([]);
		expect(diagnostics(component('<input onChange={null} />'))).toEqual([]);
		expect(diagnostics(component('<input onChange={false} />'))).toEqual([]);
		expect(diagnostics(component('<input onChange={props.onChange} />'))).toHaveLength(1);
		expect(
			diagnostics(component('<input onChange={() => {}} suppressNativeChangeWarning={false} />')),
		).toHaveLength(1);
		expect(
			diagnostics(component('<input onChange={() => {}} readOnly={false} disabled={false} />')),
		).toHaveLength(1);
		expect(diagnostics(component('<input onChange={() => {}} disabled="" />'))).toHaveLength(1);
		expect(diagnostics(component('<input onChange={() => {}} disabled={0} />'))).toHaveLength(1);
		expect(diagnostics(component('<input onChange={() => {}} readOnly="" />'))).toHaveLength(1);
		expect(diagnostics(component('<input onChange={() => {}} disabled="disabled" />'))).toEqual([]);
	});

	it('defers dynamic and spread-owned decisions instead of issuing false static warnings', () => {
		expect(
			diagnostics(`
import { importedInput } from './handlers.js';
export function App(props) @{
  <>
    <input type={props.type} onChange={() => {}} />
    <input {...props.inputProps} />
    <textarea onChange={() => {}} onInput={importedInput} />
    <input onChange={() => {}} readOnly={props.readOnly} />
    <input onChange={() => {}} suppressNativeChangeWarning={props.commitOnly} />
  </>
}`),
		).toEqual([]);
	});

	it('handles concise functions whose expression body is another function', () => {
		const source = `
const subscribe = () => () => {};
export function App() @{ <input onChange={() => {}} /> }
`;
		expect(diagnostics(source)).toHaveLength(1);
	});

	it('defers writable handler bindings to final-props validation', () => {
		const source = `
export function App(props) @{
  let handleInput = () => {};
  if (props.removeInput) handleInput = null;
  <input onChange={() => {}} onInput={handleInput} />
}`;
		expect(diagnostics(source)).toEqual([]);
	});

	it('uses the compiler namespace walk, including foreignObject transitions', () => {
		const source = component(`
<>
  <svg>
    <input onChange={() => {}} />
    <foreignObject><input onChange={() => {}} /></foreignObject>
  </svg>
  <math><input onChange={() => {}} /></math>
</>`);
		const result = diagnostics(source);
		expect(result).toHaveLength(1);
		expect(result[0].start.offset).toBe(
			source.indexOf('onChange', source.indexOf('foreignObject')),
		);
	});

	it('does not diagnose an input intrinsic owned by a universal renderer', () => {
		const source = component('<input onChange={() => {}} />');
		const result = compile(source, '/src/Scene.object.tsrx', {
			hmr: false,
			renderer: {
				id: 'object',
				module: 'octane/universal',
				target: 'universal',
			},
		});
		expect(result.diagnostics).toEqual([]);
	});

	it('follows nested renderer-boundary ownership in both directions', () => {
		const config = normalizeRendererConfig({
			registry: { object: 'octane/universal' },
			boundaries: {
				'@scene/bridge': {
					Canvas: {
						ownerRenderer: 'dom',
						childRenderer: 'object',
						prop: 'children',
					},
					Html: {
						ownerRenderer: 'object',
						childRenderer: 'dom',
						prop: 'children',
					},
				},
			},
		});
		const domSource = `
import { Canvas } from '@scene/bridge';
export function App() @{ <Canvas><input onChange={() => {}} /></Canvas> }
`;
		expect(
			compile(domSource, '/src/App.tsrx', {
				rendererBoundaries: config.boundaries,
				rendererRegistry: config.registry,
			}).diagnostics,
		).toEqual([]);

		const universalSource = `
import { Html } from '@scene/bridge';
export function Scene() @{ <Html><input onChange={() => {}} /></Html> }
`;
		expect(
			compile(universalSource, '/src/Scene.object.tsrx', {
				renderer: { id: 'object', ...config.registry.object },
				rendererBoundaries: config.boundaries,
				rendererRegistry: config.registry,
			}).diagnostics,
		).toHaveLength(1);
	});

	it('returns the same authored diagnostic from client, server, value JSX, and Hydrate prep', () => {
		const ordinary = component('<input onChange={() => {}} />');
		expect(diagnostics(ordinary, { mode: 'client' })).toEqual(
			diagnostics(ordinary, { mode: 'server' }),
		);

		const valueSource = `
export function App(props) {
  if (props.none) return null;
  return [<span />, <input onChange={() => {}} />];
}`;
		expect(diagnostics(valueSource)).toHaveLength(1);

		const hydrateSource = `
import { Hydrate } from 'octane';
export function App(props) @{
  <Hydrate when={props.when}><input onChange={() => {}} /></Hydrate>
}`;
		expect(diagnostics(hydrateSource)).toHaveLength(1);
	});

	it('adds warnings to Volar without treating them as compile errors', () => {
		const source = component('<textarea onChangeCapture={() => {}} />');
		const result = compileToVolarMappings(source, '/src/App.tsrx') as any;
		expect(result.errors).toEqual([]);
		expect(result.diagnostics).toHaveLength(1);
		expect(result.diagnostics[0]).toMatchObject({
			code: CODE,
			severity: 'warning',
			start: { offset: source.indexOf('onChangeCapture') },
			suggestions: [{ attribute: 'onInputCapture' }],
		});
	});

	it('forwards one warning per build generation across client and server transforms', () => {
		const warn = vi.fn();
		const compiler = createOctaneCompiler({ root: '/project', warn });
		const source = component('<input onChange={() => {}} />');
		const id = '/project/src/App.tsrx';

		const client = compiler.transform(source, id, { environment: 'client' });
		const server = compiler.transform(source, id, { environment: 'server' });
		expect(client?.diagnostics).toHaveLength(1);
		expect(server?.diagnostics).toHaveLength(1);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('/src/App.tsrx:1:'));
		expect(warn).toHaveBeenCalledWith(expect.stringContaining(CODE));

		compiler.invalidate(id);
		compiler.transform(source, id, { environment: 'client' });
		expect(warn).toHaveBeenCalledTimes(2);
	});

	it("delivers the warning through Vite's configured logger", () => {
		const warning = vi.fn();
		const plugin = octane({ hmr: false });
		(plugin.configResolved as any)({
			root: '/project',
			command: 'build',
			build: {},
			define: {},
			logger: { warn: warning },
		});
		const source = component('<input onChange={() => {}} />');
		(plugin.transform as any).call({}, source, '/project/src/App.tsrx', { ssr: false });

		expect(warning).toHaveBeenCalledTimes(1);
		expect(warning).toHaveBeenCalledWith(expect.stringContaining(CODE));
	});
});
