import { describe, expect, it } from 'vitest';
import { parseModule } from '@tsrx/core';
import { compile } from '../src/compiler/compile.js';
import { prepareServerRendererBoundaryRegions } from '../src/compiler/compile-renderer-boundaries.js';
import { decodeMappings } from '../src/compiler/compile-universal.js';
import {
	analyzeRendererBoundaries,
	assertRendererBoundaryAnalysis,
} from '../src/compiler/renderer-boundaries.js';
import { normalizeRendererConfig } from '../src/compiler/renderers.js';

const rendererConfig = normalizeRendererConfig({
	registry: { three: '@octanejs/three/renderer' },
	boundaries: {
		'@scene/bridge': {
			default: {
				ownerRenderer: 'dom',
				childRenderer: 'three',
				prop: 'content',
			},
			Canvas: {
				ownerRenderer: 'dom',
				childRenderer: 'three',
				prop: 'children',
			},
			Html: {
				ownerRenderer: 'three',
				childRenderer: 'dom',
				prop: 'children',
			},
		},
	},
});
const boundaries = rendererConfig.boundaries;
const rendererRegistry = rendererConfig.registry;
const threeRenderer = { id: 'three', ...rendererRegistry.three };
const clientOnlyRendererConfig = normalizeRendererConfig({
	registry: {
		object: {
			module: '/src/object-renderer.js',
			server: 'client-only',
		},
	},
	boundaries: {
		'@scene/client': {
			Canvas: {
				ownerRenderer: 'dom',
				childRenderer: 'object',
				prop: 'children',
				server: 'omit-child',
			},
		},
	},
});
const clientOnlyImports = [
	{
		request: './Scene.object.tsrx',
		resolvedId: '/src/Scene.object.tsrx',
		reference: {
			id: 'octane-client-reference-v1:object:/src/Scene.object.tsrx',
			moduleId: '/src/Scene.object.tsrx',
			renderer: 'object',
		},
	},
];

function slice(source: string, range: readonly number[]) {
	return source.slice(range[0], range[1]);
}

function positionOf(source: string, needle: string) {
	const offset = source.indexOf(needle);
	expect(offset, `expected ${JSON.stringify(needle)} in generated source`).toBeGreaterThanOrEqual(
		0,
	);
	const lines = source.slice(0, offset).split('\n');
	return { line: lines.length, column: lines[lines.length - 1].length };
}

function originalPositionFor(map: any, generated: { line: number; column: number }) {
	const segments = decodeMappings(map.mappings)[generated.line - 1] ?? [];
	let traced: number[] | null = null;
	for (const segment of segments) {
		if (segment[0] > generated.column) break;
		traced = segment;
	}
	if (traced === null || traced.length === 1) return { source: null, line: null, column: null };
	return {
		source: map.sources[traced[1]],
		line: traced[2] + 1,
		column: traced[3],
	};
}

function expectAuthoredTrace(
	result: { code: string; map: any },
	source: string,
	generatedNeedle: string,
	authoredNeedle: string,
) {
	const generated = positionOf(result.code, generatedNeedle);
	const authored = positionOf(source, authoredNeedle);
	const original = originalPositionFor(result.map, generated);
	expect(original.source).toMatch(/\.tsrx$/);
	expect(original.line).toBe(authored.line);
	expect(Math.abs((original.column as number) - authored.column)).toBeLessThanOrEqual(1);
}

describe('renderer-owned JSX regions', () => {
	it('resolves default, named alias, and namespace imports by module/export identity', () => {
		const source = `
import Bridge, { Canvas as SceneCanvas, type Html as HtmlType } from '@scene/bridge';
import * as Scene from '@scene/bridge';
function App() @{
  <>
    <Bridge content={<group />} />
    <SceneCanvas><mesh /></SceneCanvas>
    <Scene.Canvas><light /></Scene.Canvas>
    <HtmlType><div /></HtmlType>
  </>
}`;
		const analysis = analyzeRendererBoundaries(source, {
			filename: '/src/App.tsrx',
			renderer: 'dom',
			rendererBoundaries: boundaries,
		});

		expect(analysis.diagnostics).toEqual([]);
		expect(
			analysis.boundaries.map((boundary) => ({
				exportName: boundary.exportName,
				reference: boundary.reference,
				region: boundary.region.kind,
			})),
		).toEqual([
			{
				exportName: 'default',
				reference: { kind: 'binding', local: 'Bridge' },
				region: 'attribute',
			},
			{
				exportName: 'Canvas',
				reference: { kind: 'binding', local: 'SceneCanvas' },
				region: 'children',
			},
			{
				exportName: 'Canvas',
				reference: { kind: 'namespace', local: 'Scene' },
				region: 'children',
			},
		]);
		expect(slice(source, analysis.boundaries[0].region.valueRange as readonly number[])).toBe(
			'<group />',
		);
		expect(slice(source, analysis.boundaries[1].region.range as readonly number[])).toBe(
			'<mesh />',
		);
		expect(
			analyzeRendererBoundaries(source, {
				filename: '/src/App.tsrx',
				renderer: 'dom',
				rendererBoundaries: boundaries,
			}),
		).toEqual(analysis);
	});

	it('rejects a boundary whose declared owner does not match its semantic region', () => {
		const domSource = `
import { Html } from '@scene/bridge';
export function App() @{ <Html><main /></Html> }
`;
		let domError: any;
		try {
			compile(domSource, '/src/App.tsrx', {
				rendererBoundaries: boundaries,
				rendererRegistry,
			});
		} catch (error) {
			domError = error;
		}
		expect(domError).toMatchObject({
			code: 'OCTANE_RENDERER_BOUNDARY_OWNER_MISMATCH',
			filename: '/src/App.tsrx',
		});
		expect(domError.message).toMatch(/declared for owner "three".*"dom" renderer content/s);

		const universalSource = `
import { Canvas } from '@scene/bridge';
export function Scene() @{ <Canvas><mesh /></Canvas> }
`;
		let universalError: any;
		try {
			compile(universalSource, '/src/Scene.tsrx', {
				renderer: threeRenderer,
				rendererBoundaries: boundaries,
				rendererRegistry,
			});
		} catch (error) {
			universalError = error;
		}
		expect(universalError).toMatchObject({
			code: 'OCTANE_RENDERER_BOUNDARY_OWNER_MISMATCH',
			filename: '/src/Scene.tsrx',
		});
		expect(universalError.message).toMatch(/declared for owner "dom".*"three" renderer content/s);
	});

	it('rejects renderer-owned client regions during server compilation', () => {
		const source = `
import { Canvas, Html } from '@scene/bridge';
export function App() @{
  <Canvas><Html><main /></Html></Canvas>
}
`;
		let serverError: any;
		try {
			compile(source, '/src/App.tsrx', {
				mode: 'server',
				rendererBoundaries: boundaries,
				rendererRegistry,
			});
		} catch (error) {
			serverError = error;
		}
		expect(serverError).toMatchObject({
			code: 'OCTANE_RENDERER_BOUNDARY_SERVER_UNSUPPORTED',
			filename: '/src/App.tsrx',
		});
		expect(serverError.message).toMatch(/@scene\/bridge#Canvas.*server.*serialization/s);
	});

	it('omits declared client-only children during server compilation without shifting authored maps', () => {
		const source = `
import { Canvas } from '@scene/client';
import Scene from './Scene.object.tsrx';
export function App() @{
  <main>
    <Canvas>
      <Scene />
    </Canvas>
    <p data-after="mapped">after</p>
  </main>
}
`;
		const boundaryOptions = {
			rendererBoundaries: clientOnlyRendererConfig.boundaries,
			rendererRegistry: clientOnlyRendererConfig.registry,
		};
		const prepared = prepareServerRendererBoundaryRegions(
			source,
			'/src/App.tsrx',
			{ id: 'dom', ...clientOnlyRendererConfig.registry.dom },
			boundaryOptions,
		)!;
		expect(prepared.source).not.toContain('<Scene />');
		expectAuthoredTrace(
			{ code: prepared.source, map: prepared.map },
			source,
			'data-after',
			'data-after',
		);

		const result = compile(source, '/src/App.tsrx', {
			mode: 'server',
			...boundaryOptions,
			clientOnlyImports,
		});

		expect(result.code).toContain('Canvas');
		expect(result.code).toContain('data-after');
		expect(result.code).not.toContain('Scene(');
		expect(result.map.sources).toEqual(['App.tsrx']);
		expect(result.map.sourcesContent).toEqual([source]);
	});

	it('diagnoses a client-only binding that escapes its omitted boundary region', () => {
		const source = `
import { Canvas } from '@scene/client';
import Scene from './Scene.object.tsrx';
export function App() @{
  const live = Scene as unknown;
  <Canvas><Scene /></Canvas>
}
`;
		let error: any;
		try {
			compile(source, '/src/App.tsrx', {
				mode: 'server',
				rendererBoundaries: clientOnlyRendererConfig.boundaries,
				rendererRegistry: clientOnlyRendererConfig.registry,
				clientOnlyImports,
			});
		} catch (cause) {
			error = cause;
		}

		expect(error).toMatchObject({
			code: 'OCTANE_CLIENT_ONLY_SERVER_USE',
			filename: '/src/App.tsrx',
			loc: { line: 5 },
		});
		expect(error.message).toMatch(/Scene\.object\.tsrx.*server: "omit-child"/s);
	});

	it('does not reserve generated-looking identifiers in boundary modules', () => {
		const domSource = `
import { Canvas, Html } from '@scene/bridge';
const __octaneRendererRegion0Body = 1;
const __octaneRendererRegionDescriptor = 2;
const __octaneDomRendererRegionBody = 3;
const __octaneDomRendererRegionToken = 4;
const __octaneDomRendererRegion0__ = 5;
export function App(props) @{
  <Canvas root={props.root}><Html><main /></Html></Canvas>
}
`;
		const dom = compile(domSource, '/src/App.tsrx', {
			rendererBoundaries: boundaries,
			rendererRegistry,
		});
		expect(() => parseModule(dom.code, '/dist/App.js')).not.toThrow();

		const universalSource = `
import { Html } from '@scene/bridge';
const __octaneRendererRegionDescriptor = 1;
const __octaneDomRendererRegionBody = 2;
const __octaneDomRendererRegionToken = 3;
const __octaneDomRendererRegion0__ = 4;
export function Scene() @{ <Html><main /></Html> }
`;
		const universal = compile(universalSource, '/src/Scene.tsrx', {
			renderer: threeRenderer,
			rendererBoundaries: boundaries,
			rendererRegistry,
		});
		expect(() => parseModule(universal.code, '/dist/Scene.js')).not.toThrow();
	});

	it('composes inline DOM-to-universal host and expression maps into authored TSRX', () => {
		const source = `
import { Canvas } from '@scene/bridge';
export function App(props) @{
  <Canvas root={props.root}>
    <mesh-map intensity={props.sceneIntensity} />
  </Canvas>
}
`;
		const result = compile(source, '/src/InlineBoundaryMap.tsrx', {
			rendererBoundaries: boundaries,
			rendererRegistry,
		});

		expect(result.map.sourcesContent).toEqual([source]);
		expectAuthoredTrace(result, source, '"mesh-map"', 'mesh-map');
		expectAuthoredTrace(result, source, 'props.sceneIntensity', 'props.sceneIntensity');
	});

	it('composes reverse universal-to-DOM section and expression maps into authored TSRX', () => {
		const source = `
import { Html } from '@scene/bridge';
export function Scene(props) @{
  <Html>
    <section data-overlay={props.overlayValue}>{props.overlayLabel as string}</section>
  </Html>
}
`;
		const result = compile(source, '/src/ReverseBoundaryMap.tsrx', {
			renderer: threeRenderer,
			rendererBoundaries: boundaries,
			rendererRegistry,
		});

		expect(result.map.sourcesContent).toEqual([source]);
		expectAuthoredTrace(result, source, "'section'", 'section');
		expectAuthoredTrace(result, source, 'props.overlayValue', 'props.overlayValue');
	});

	it('uses normal JSX precedence for explicit props and child bodies', () => {
		const source = `
import Bridge, { Canvas } from '@scene/bridge';
function App() @{
  <>
    <Bridge {...defaults} content={<Panel />} />
    <Canvas children={<Ignored />}><Scene /><mesh /></Canvas>
    <Bridge title="empty" />
  </>
}`;
		const analysis = analyzeRendererBoundaries(source, {
			filename: '/src/App.tsrx',
			renderer: { id: 'dom' },
			rendererBoundaries: boundaries,
		});

		expect(analysis.diagnostics).toEqual([]);
		const [propBoundary, childrenBoundary, absentBoundary] = analysis.boundaries;
		expect(slice(source, propBoundary.region.valueRange as readonly number[])).toBe('<Panel />');
		expect(slice(source, childrenBoundary.region.range as readonly number[])).toBe(
			'<Scene /><mesh />',
		);
		expect(absentBoundary.region).toMatchObject({ kind: 'absent' });
		expect(slice(source, absentBoundary.region.range as readonly number[])).toBe('');
	});

	it('reports spreads that can hide or replace the designated region', () => {
		const source = `
import Bridge from '@scene/bridge';
function App() @{
  <>
    <Bridge {...unknown} />
    <Bridge content={<Scene />} {...override} />
  </>
}`;
		const analysis = analyzeRendererBoundaries(source, {
			filename: '/src/Ambiguous.tsrx',
			renderer: 'dom',
			rendererBoundaries: boundaries,
		});

		expect(analysis.diagnostics).toHaveLength(2);
		expect(analysis.diagnostics.map((item) => item.message)).toEqual([
			expect.stringMatching(/effective prop may be supplied only by a spread.*content/s),
			expect.stringMatching(/later spread may replace the explicit prop.*content/s),
		]);
		expect(analysis.diagnostics[0]).toMatchObject({
			code: 'OCTANE_RENDERER_BOUNDARY_AMBIGUOUS_SPREAD',
			filename: '/src/Ambiguous.tsrx',
			loc: { line: 5 },
		});
		expect(() => assertRendererBoundaryAnalysis(analysis)).toThrow(
			/Renderer boundary "@scene\/bridge#default".*"content".*Ambiguous\.tsrx:5/s,
		);
	});

	it('selects reverse universal-to-DOM metadata from the current owner renderer', () => {
		const source = `
import { Canvas, Html as Overlay } from '@scene/bridge';
function Scene() @{
  <Canvas><Overlay><section>label</section></Overlay></Canvas>
}`;
		const dom = analyzeRendererBoundaries(source, {
			filename: '/src/Scene.tsrx',
			renderer: 'dom',
			rendererBoundaries: boundaries,
		});
		const three = analyzeRendererBoundaries(source, {
			filename: '/src/Scene.tsrx',
			renderer: 'three',
			rendererBoundaries: boundaries,
		});

		expect(dom.boundaries.map((boundary) => boundary.exportName)).toEqual(['Canvas']);
		expect(three.boundaries.map((boundary) => boundary.exportName)).toEqual(['Html']);
		expect(three.boundaries[0]).toMatchObject({
			ownerRenderer: 'three',
			childRenderer: 'dom',
			prop: 'children',
		});
		expect(slice(source, three.boundaries[0].region.range as readonly number[])).toBe(
			'<section>label</section>',
		);
	});

	it('does not treat lexically shadowed or type-only names as boundary components', () => {
		const source = `
import { Canvas as ImportedCanvas, type Canvas } from '@scene/bridge';
import * as Scene from '@scene/bridge';
function ParamShadow(ImportedCanvas) @{ <ImportedCanvas><mesh /></ImportedCanvas> }
function NamespaceShadow(Scene) @{ <Scene.Canvas><mesh /></Scene.Canvas> }
function LocalShadow() @{
  const ImportedCanvas = LocalCanvas;
  <ImportedCanvas><mesh /></ImportedCanvas>
}
const ClassShadow = class ImportedCanvas {
  render() { return <ImportedCanvas><mesh /></ImportedCanvas>; }
};
function Live() @{
  <><ImportedCanvas><mesh /></ImportedCanvas><Scene.Canvas><light /></Scene.Canvas></>
}`;
		const analysis = analyzeRendererBoundaries(source, {
			filename: '/src/Shadowing.tsrx',
			renderer: 'dom',
			rendererBoundaries: boundaries,
		});

		expect(analysis.diagnostics).toEqual([]);
		expect(analysis.boundaries.map((boundary) => boundary.reference)).toEqual([
			{ kind: 'binding', local: 'ImportedCanvas' },
			{ kind: 'namespace', local: 'Scene' },
		]);
		expect(
			analysis.boundaries.every(
				(boundary) => boundary.elementRange[0] > source.indexOf('function Live'),
			),
		).toBe(true);
	});
});
