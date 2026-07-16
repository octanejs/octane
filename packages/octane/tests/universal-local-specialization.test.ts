import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compile } from '../src/compiler/compile.js';
import { decodeMappings } from '../src/compiler/compile-universal.js';
import { normalizeRendererConfig } from '../src/compiler/renderers.js';
import {
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	defineUniversalComponent,
	universalPlan,
	universalValue,
} from '../src/universal.js';
import { mount } from './_helpers.js';
import { LocalSpecializationApp } from './_fixtures/universal-local-specialization.tsrx';

const CANVAS_MODULE = '/packages/octane/tests/_fixtures/universal-renderer-boundaries.tsrx';
const HTML_MODULE = '/packages/octane/tests/_fixtures/universal-renderer-boundaries.object.tsrx';
const rendererConfig = normalizeRendererConfig({
	registry: { object: { module: 'octane/universal', text: 'host' } },
	boundaries: {
		[CANVAS_MODULE]: {
			Canvas: { ownerRenderer: 'dom', childRenderer: 'object', prop: 'children' },
		},
		[HTML_MODULE]: {
			Html: { ownerRenderer: 'object', childRenderer: 'dom', prop: 'children' },
		},
	},
});

const shadowPlan = universalPlan('object', {
	kind: 'host',
	type: 'dynamic-shadow',
	bindings: [['label', 0]],
});
const DynamicShadow = defineUniversalComponent('object', (props: { label: string }) =>
	universalValue(shadowPlan, [props.label]),
);

function fulfilled<T>(value: T): PromiseLike<T> & { status: 'fulfilled'; value: T } {
	return {
		status: 'fulfilled',
		value,
		then() {
			return this;
		},
	};
}

function objectRoot() {
	const container = createObjectContainer();
	const root = createUniversalRoot(container, createObjectDriver());
	return { container, root };
}

async function flushUniversalWork() {
	await Promise.resolve();
	await Promise.resolve();
}

function positionOf(source: string, needle: string, from = 0) {
	const offset = source.indexOf(needle, from);
	expect(offset, `expected ${JSON.stringify(needle)} in generated source`).toBeGreaterThanOrEqual(
		0,
	);
	const lines = source.slice(0, offset).split('\n');
	return { offset, line: lines.length, column: lines.at(-1)!.length };
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

function expectTrace(
	result: { code: string; map: any },
	source: string,
	generatedNeedle: string,
	authoredNeedle: string,
	from = 0,
) {
	const generated = positionOf(result.code, generatedNeedle, from);
	const authored = positionOf(source, authoredNeedle);
	const original = originalPositionFor(result.map, generated);
	expect(original.source).toMatch(/universal-local-specialization\.tsrx$/);
	expect(original.line).toBe(authored.line);
	expect(Math.abs((original.column as number) - authored.column)).toBeLessThanOrEqual(2);
}

function compileDomBoundary(source: string, options: Record<string, unknown> = {}) {
	return compile(source, '/src/universal-local-specialization.tsrx', {
		...options,
		rendererBoundaries: rendererConfig.boundaries,
		rendererRegistry: rendererConfig.registry,
	});
}

function executeUniversalDisposeMerges(code: string) {
	const assignments = [
		...code.matchAll(
			/data\.__octaneUniversalComponents\s*=\s*\{\s*\.\.\.data\.__octaneUniversalComponents,([\s\S]*?)\};/g,
		),
	];
	const data: { __octaneUniversalComponents: Record<string, unknown> } = {
		__octaneUniversalComponents: { retained: 'old' },
	};
	for (const [, bindingsSource] of assignments) {
		const names = bindingsSource.match(/[$A-Z_a-z][$\w]*/g) ?? [];
		const values = names.map((name) => ({ name }));
		const execute = new Function(
			'data',
			...names,
			`data.__octaneUniversalComponents = { ...data.__octaneUniversalComponents, ${names.join(', ')} };`,
		);
		execute(data, ...values);
	}
	return { assignments, data };
}

describe('local universal renderer specialization', () => {
	it('executes a cloned local graph with hooks, context, events, memo, text, and keyed identity', async () => {
		const { container, root } = objectRoot();
		const log: string[] = [];
		const first = fulfilled('first-value');
		const second = fulfilled('second-value');
		const props = {
			root,
			tone: 'dark',
			items: [{ id: 'a' }, { id: 'b' }],
			caption: 'one',
			log: (entry: string) => log.push(entry),
			shadow: DynamicShadow,
			initial: 7,
			first,
			second,
		};
		const mounted = mount(LocalSpecializationApp, props);

		expect(mounted.find('.dom-specialization scene-local')).toBeTruthy();
		expect(mounted.container.querySelector('wrong-shadow')).toBeNull();
		expect(container.children.map((child) => child.type)).toEqual(['scene-local', 'entry-hooks']);
		const scene = container.children[0];
		const entry = container.children[1];
		const [itemA, itemB, caption, shadow] = scene.children;
		expect(scene.children.map((child) => child.type)).toEqual([
			'mesh-item',
			'mesh-item',
			'scene-caption',
			'dynamic-shadow',
		]);
		expect(itemA.props).toMatchObject({ itemId: 'a', tone: 'dark', count: 0 });
		expect(itemB.props).toMatchObject({ itemId: 'b', tone: 'dark', count: 0 });
		expect(caption.children.map((child) => child.type)).toEqual(['#text', '#text']);
		expect(caption.children.map((child) => child.props.value).join(' ')).toBe('caption: one');
		expect(shadow.props).toEqual({ label: 'one' });
		expect(entry.props).toEqual({
			state: 7,
			tone: 'dark',
			first: 'first-value',
			second: 'second-value',
		});
		expect(container.commits).toHaveLength(1);
		expect(log).toEqual(['item-layout:a:0', 'item-layout:b:0']);

		container.dispatchEvent(itemB, 'select', { delta: 2 });
		await flushUniversalWork();
		expect(itemB.props.count).toBe(2);
		expect(container.commits).toHaveLength(2);

		mounted.update(LocalSpecializationApp, {
			...props,
			tone: 'light',
			items: [{ id: 'b' }, { id: 'a' }],
			caption: 'two',
			initial: 99,
		});
		await flushUniversalWork();
		expect(container.children[0]).toBe(scene);
		expect(scene.children[0]).toBe(itemB);
		expect(scene.children[1]).toBe(itemA);
		expect(itemB.props).toMatchObject({ itemId: 'b', tone: 'light', count: 2 });
		expect(itemA.props).toMatchObject({ itemId: 'a', tone: 'light', count: 0 });
		expect(container.children[1]).toBe(entry);
		expect(entry.props.state).toBe(7);
		expect(entry.props.tone).toBe('light');
		expect(scene.children[2]).toBe(caption);
		expect(scene.children[2].children.map((child) => child.props.value).join(' ')).toBe(
			'caption: two',
		);
		expect(container.commits).toHaveLength(3);

		mounted.unmount();
		expect(container.children).toEqual([]);
		expect(container.instanceCount).toBe(0);
		expect(container.commits).toHaveLength(4);
		expect(() => container.dispatchEvent(itemB, 'select', { delta: 1 })).toThrow(
			/unknown event target/,
		);
		expect(log).toContain('item-cleanup:b:2');
		expect(log).toContain('item-cleanup:a:0');
	});

	it('emits child-runtime hook machinery, binding-aware clones, and authored maps', () => {
		const source = readFileSync(
			resolve('packages/octane/tests/_fixtures/universal-local-specialization.tsrx'),
			'utf8',
		);
		const result = compileDomBoundary(source, { hmr: 'webpack', profile: true });

		expect(result.code).toContain('function LocalScene');
		expect(result.code).toContain('function __octaneRendererRegion0LocalScene');
		expect(result.code).toContain('useOctaneRendererRegion0LocalState');
		expect(result.code).toContain('__octaneRendererRegion0WithSlot');
		expect(result.code).toContain('__octaneRendererRegion0UseStateWithGetter');
		expect(result.code).toContain('__octaneRendererRegion0UseMemo');
		expect(result.code).toContain('__octaneRendererRegion0UseBatch');
		expect(result.code).toContain('memo$__octaneRendererRegion0(');
		expect(result.code).toContain('__octaneRendererRegion0Component("object", LocalShadow,');
		expect(result.code).not.toContain('__octaneRendererRegion0LocalShadow');
		expect(result.code).not.toContain('props.render()');
		expect(result.code).toMatch(
			/data\.__octaneUniversalComponents = \{\s*\.\.\.data\.__octaneUniversalComponents,/,
		);

		const cloneOffset = result.code.indexOf('function __octaneRendererRegion0LocalItem');
		expectTrace(result, source, 'function __octaneRendererRegion0LocalItem', 'function LocalItem');
		expectTrace(
			result,
			source,
			'useLayoutEffect$__octaneRendererRegion0',
			'useLayoutEffect(',
			cloneOffset,
		);
		const localItemLine = positionOf(source, 'function LocalItem').line;
		expect(result.code).toContain(`#${'__octaneRendererRegion0LocalItem'}@${localItemLine}:0`);
	});

	it('retargets an auto-imported hook in a cloned local custom hook', () => {
		const result = compileDomBoundary(`
import { Canvas } from '${CANVAS_MODULE}';
function useBareState(initial) { return useState(initial); }
function Scene() @{ const [value] = useBareState(1); <mesh value={value} /> }
export function App() @{ <Canvas><Scene /></Canvas> }
`);
		const helperStart = result.code.indexOf('export function useOctaneRendererRegion0BareState');
		const helperEnd = result.code.indexOf('\n}', helperStart);
		const helper = result.code.slice(helperStart, helperEnd);
		expect(helper).toContain('__octaneRendererRegion0UseStateWithGetter');
		expect(helper).not.toContain('_$__useStateWithGetter');
		expect(result.code).toContain('__octaneRendererRegion0WithSlot');
	});

	it('merges every boundary and main universal Webpack handoff in execution order', () => {
		const source = `
import { Canvas } from '${CANVAS_MODULE}';
import { Html } from '${HTML_MODULE}';
export function Scene(props) @{
  <group>
    <Html>
      <Canvas root={props.root}><mesh /></Canvas>
    </Html>
  </group>
}
`;
		const result = compile(source, '/src/alternating.object.tsrx', {
			hmr: 'webpack',
			renderer: {
				id: 'object',
				module: 'octane/universal',
				target: 'universal',
				text: 'host',
			},
			rendererBoundaries: rendererConfig.boundaries,
			rendererRegistry: rendererConfig.registry,
		});
		const { assignments, data } = executeUniversalDisposeMerges(result.code);
		expect(assignments.length).toBeGreaterThanOrEqual(2);
		expect(data.__octaneUniversalComponents.retained).toBe('old');
		expect(Object.keys(data.__octaneUniversalComponents)).toEqual(
			expect.arrayContaining(['__octaneRendererRegion0Body', 'Scene']),
		);
	});

	it('leaves unrelated DOM compilation byte-identical when renderer metadata is present', () => {
		const source = `export function App(props) @{ <main>{props.label as string}</main> }`;
		const plain = compile(source, '/src/plain.tsrx');
		const configured = compileDomBoundary(source);
		expect(configured.code).toBe(plain.code);
	});
});
