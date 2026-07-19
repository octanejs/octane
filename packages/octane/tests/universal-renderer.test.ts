import { describe, expect, it, vi } from 'vitest';
import { parseModule } from '@tsrx/core';
import { compile } from '../src/compiler/compile.js';
import { lowerUniversalRendererRegion } from '../src/compiler/compile-universal.js';
import { normalizeRendererConfig } from '../src/compiler/renderers.js';
import * as UniversalRuntime from '../src/universal.js';
import {
	createObjectContainer,
	createObjectDriver,
	createPortal,
	createUniversalRoot,
	defineUniversalComponent,
	universalFor,
	universalKey,
	universalList,
	universalPlan,
	universalProps,
	universalTry,
	universalValue,
	use,
	useContext as useUniversalContext,
	useEffect as useUniversalEffect,
	useInsertionEffect as useUniversalInsertionEffect,
	useLayoutEffect as useUniversalLayoutEffect,
	useState as useUniversalState,
} from '../src/universal.js';
import { mount } from './_helpers.js';
import { UniversalBoundaryFixture, UniversalTheme } from './_fixtures/universal-boundary.tsrx';
import { CompiledUniversalScene } from './_fixtures/compiled-universal.object.tsrx';

const renderer = {
	id: 'object',
	module: 'octane/universal',
	target: 'universal',
	text: 'host',
} as const;

const validationRenderer = {
	...renderer,
	validation: {
		textHosts: ['raw-text'],
		textParents: ['text'],
		forbiddenGlobals: ['document', 'window'],
		forbiddenImports: ['browser-only', 'react-dom'],
		hostProps: {
			'*': ['data-*', 'id'],
			text: ['value'],
			view: ['bind*'],
		},
	},
} as const;

const itemPlan = universalPlan('object', {
	kind: 'range',
	children: [
		{ kind: 'host', type: 'node', bindings: [['value', 0]] },
		{ kind: 'host', type: 'label', children: [{ kind: 'slot', slot: 1 }] },
	],
});

const scenePlan = universalPlan('object', {
	kind: 'host',
	type: 'scene',
	children: [{ kind: 'slot', slot: 0 }],
});

interface Item {
	id: string;
	value: number;
	label: string;
}

const Scene = defineUniversalComponent('object', (props: { items: Item[] }) =>
	universalValue(scenePlan, [
		universalList(props.items, (item) =>
			universalKey(item.id, universalValue(itemPlan, [item.value, item.label])),
		),
	]),
);

function objectRoot(compilerLeafProps = false) {
	const container = createObjectContainer();
	const driver = createObjectDriver();
	const root = createUniversalRoot(
		container,
		compilerLeafProps
			? {
					...driver,
					capabilities: { ...driver.capabilities, compilerLeafProps: true },
				}
			: driver,
	);
	return { container, root };
}

describe('universal compiler target', () => {
	it('leaves the DOM compiler byte-identical when renderer selection stays DOM', () => {
		const source =
			'export function Card({title}) @{ <article><h1>{title as string}</h1></article> }';
		const legacy = compile(source, '/src/Card.tsrx', { hmr: false });
		const explicitDom = compile(source, '/src/Card.tsrx', {
			hmr: false,
			renderer: { id: 'dom', module: 'octane', target: 'dom' },
		});

		expect(explicitDom).toEqual(legacy);
	});

	it('leaves universal output byte-identical when renderer validation is absent', () => {
		const source = 'export function Scene() @{ <view id="root" /> }';
		const baseline = compile(source, '/src/Scene.object.tsrx', { hmr: false, renderer });
		const optionalValidation = compile(source, '/src/Scene.object.tsrx', {
			hmr: false,
			renderer: { ...renderer, validation: undefined },
		});

		expect(optionalValidation).toEqual(baseline);
	});

	it('carries frozen runtime/thread metadata without changing emitted code', () => {
		const source = 'export function Scene() @{ <view id="root" /> }';
		const baseline = compile(source, '/src/Scene.object.tsrx', { hmr: false, renderer });
		const background = compile(source, '/src/Scene.object.tsrx', {
			hmr: false,
			renderer,
			universalRuntime: { runtime: 'object', thread: 'background' },
		});
		const mainThread = compile(source, '/src/Scene.object.tsrx', {
			hmr: false,
			renderer,
			universalRuntime: { runtime: 'object', thread: 'main-thread' },
		});

		expect(background.code).toBe(baseline.code);
		expect(mainThread.code).toBe(baseline.code);
		expect(background.universalRuntime).toEqual({
			runtime: 'object',
			thread: 'background',
		});
		expect(mainThread.universalRuntime).toEqual({
			runtime: 'object',
			thread: 'main-thread',
		});
		expect(Object.isFrozen(background.universalRuntime)).toBe(true);
		expect(() =>
			compile(source, '/src/Scene.object.tsrx', {
				hmr: false,
				renderer,
				universalRuntime: { runtime: 'lynx', thread: 'background' },
			}),
		).toThrow(/universalRuntime\.runtime "lynx" does not match renderer "object"/);
		expect(() =>
			compile(source, '/src/Scene.object.tsrx', {
				mode: 'server',
				renderer,
				universalRuntime: { runtime: 'object', thread: 'background' },
			}),
		).toThrow(/universalRuntime is available only in client mode/);
	});

	it('accepts allowed hosts and props while respecting lexical bindings and property keys', () => {
		const source = `
import { document as importedDocument } from './environment';
export function Scene({ window, rest }) @{
  const document = window;
  const names = { document: importedDocument, window: 'local' };
  <>
    <view id={names.document} data-state={names.window} bindtap={() => document} {...rest} />
    <view key="stable" children={null} />
    <text value={document}>Hello</text>
  </>
}`;

		expect(() =>
			compile(source, '/src/Scene.native.tsrx', {
				hmr: false,
				renderer: validationRenderer,
			}),
		).not.toThrow();
	});

	it('rejects forbidden static module requests and subpaths but not prefix lookalikes', () => {
		const allowed = `
import value from 'browser-only-extra';
export function Scene() @{ <view id={value} /> }
`;
		expect(() =>
			compile(allowed, '/src/Allowed.native.tsrx', {
				hmr: false,
				renderer: validationRenderer,
			}),
		).not.toThrow();
		const reexport = `
export { window as safe } from 'allowed';
export function Scene() @{ <view id="safe" /> }
`;
		expect(() =>
			compile(reexport, '/src/Reexport.native.tsrx', {
				hmr: false,
				renderer: validationRenderer,
			}),
		).not.toThrow();

		const forbidden = `export { value } from 'browser-only/subpath';`;
		expect(() =>
			compile(forbidden, '/src/Import.native.tsrx', {
				hmr: false,
				renderer: validationRenderer,
			}),
		).toThrow(
			'Octane universal compiler: renderer "object" forbids static import "browser-only/subpath" (matched "browser-only"). at /src/Import.native.tsrx:1:22',
		);

		expect(() =>
			compile(`import value = require('browser-only/subpath');`, '/src/ImportEquals.native.ts', {
				hmr: false,
				renderer: validationRenderer,
			}),
		).toThrow(/forbids static import "browser-only\/subpath".*ImportEquals\.native\.ts:1:23/);

		expect(() =>
			compile(`export const runtime = import('browser-only/lazy');`, '/src/Dynamic.native.ts', {
				hmr: false,
				renderer: validationRenderer,
			}),
		).toThrow(/forbids static import "browser-only\/lazy".*Dynamic\.native\.ts:1:30/);

		const commonJs = `export function loadRuntime() {
  return require('react-dom/client');
}`;
		expect(() =>
			compile(commonJs, '/src/CommonJs.native.ts', {
				hmr: false,
				renderer: validationRenderer,
			}),
		).toThrow(
			/forbids static CommonJS require "react-dom\/client" \(matched "react-dom"\).*CommonJs\.native\.ts:2:17/,
		);

		const moduleRequire = `export function loadRuntime() {
  return module.require('browser-only/subpath');
}`;
		expect(() =>
			compile(moduleRequire, '/src/ModuleRequire.native.ts', {
				hmr: false,
				renderer: validationRenderer,
			}),
		).toThrow(
			/forbids static CommonJS require "browser-only\/subpath".*ModuleRequire\.native\.ts:2:24/,
		);

		const allowedCommonJs = `export function loadRuntime(require, module, request) {
  return [
    require('react-dom/client'),
    module.require('browser-only/subpath'),
    globalThis.require(request),
  ];
}
export const lookalike = require('react-dom-extra');
export const dynamic = require(request);`;
		expect(() =>
			compile(allowedCommonJs, '/src/AllowedCommonJs.native.ts', {
				hmr: false,
				renderer: validationRenderer,
			}),
		).not.toThrow();
	});

	it('rejects unbound forbidden globals without treating property names as references', () => {
		const propertyNames = `
export function Scene() @{
  const names = { document: 'document', window: 'window' };
  <view id={names.document} />
}`;
		expect(() =>
			compile(propertyNames, '/src/Properties.native.tsrx', {
				hmr: false,
				renderer: validationRenderer,
			}),
		).not.toThrow();

		const forbidden = `export function Scene() @{
  <view id={document.title} />
}`;
		expect(() =>
			compile(forbidden, '/src/Global.native.tsrx', {
				hmr: false,
				renderer: validationRenderer,
			}),
		).toThrow(
			'Octane universal compiler: renderer "object" forbids unbound global "document". at /src/Global.native.tsrx:2:12',
		);

		const globalObject = `export function Scene() @{
  <view id={globalThis.document.title} />
}`;
		expect(() =>
			compile(globalObject, '/src/GlobalObject.native.tsrx', {
				hmr: false,
				renderer: validationRenderer,
			}),
		).toThrow(/forbids unbound global "document".*GlobalObject\.native\.tsrx:2:23/);

		const shadowedGlobalObject = `export function Scene(globalThis) @{
  <view id={globalThis.document.title} />
}`;
		expect(() =>
			compile(shadowedGlobalObject, '/src/ShadowedGlobalObject.native.tsrx', {
				hmr: false,
				renderer: validationRenderer,
			}),
		).not.toThrow();

		const bodyShadow = `export function Scene(value = document) @{
  const document = null;
  <view id={value} />
}`;
		expect(() =>
			compile(bodyShadow, '/src/Default.native.tsrx', {
				hmr: false,
				renderer: validationRenderer,
			}),
		).toThrow(/forbids unbound global "document".*Default\.native\.tsrx:1:30/);

		expect(() =>
			compile(`import value = window.module;`, '/src/Qualified.native.ts', {
				hmr: false,
				renderer: validationRenderer,
			}),
		).toThrow(/forbids unbound global "window".*Qualified\.native\.ts:1:15/);

		const ambient = `declare const document: any;
export function Scene() @{ <view id={document.title} /> }`;
		expect(() =>
			compile(ambient, '/src/Ambient.native.tsrx', {
				hmr: false,
				renderer: validationRenderer,
			}),
		).toThrow(/forbids unbound global "document".*Ambient\.native\.tsrx:2:37/);

		const enumMembers = `enum Environment {
  document = 1,
  copy = document,
}
export function Scene() @{ <view id={Environment.copy} /> }`;
		expect(() =>
			compile(enumMembers, '/src/Enum.native.tsrx', {
				hmr: false,
				renderer: validationRenderer,
			}),
		).not.toThrow();
	});

	it('rejects text parents and statically named host props at authored locations', () => {
		const text = `export function Scene() @{
  <view>Hello</view>
}`;
		expect(() =>
			compile(text, '/src/Text.native.tsrx', {
				hmr: false,
				renderer: validationRenderer,
			}),
		).toThrow(
			'Octane universal compiler: renderer "object" does not allow authored JSX text under <view>. at /src/Text.native.tsrx:2:8',
		);

		const dynamicText = `export function Scene({ value }) @{
  <view>{value as string}</view>
}`;
		expect(() =>
			compile(dynamicText, '/src/DynamicText.native.tsrx', {
				hmr: false,
				renderer: validationRenderer,
			}),
		).toThrow(
			'Octane universal compiler: renderer "object" does not allow authored primitive text under <view>. at /src/DynamicText.native.tsrx:2:9',
		);

		expect(() =>
			compile(
				'export function Scene() @{ <view><raw-text text="invalid" /></view> }',
				'/src/RawText.native.tsrx',
				{ hmr: false, renderer: validationRenderer },
			),
		).toThrow(/does not allow <raw-text> under <view>.*RawText\.native\.tsrx:1:/);
		expect(() =>
			compile(
				'export function Scene() @{ <text><raw-text text="valid" /></text> }',
				'/src/RawTextValid.native.tsrx',
				{ hmr: false, renderer: validationRenderer },
			),
		).not.toThrow();

		const componentChildren = `
function Label({ children }) @{ <text>{children}</text> }
export function Scene() @{ <view><Label>Hello</Label></view> }
`;
		expect(() =>
			compile(componentChildren, '/src/ComponentChildren.native.tsrx', {
				hmr: false,
				renderer: validationRenderer,
			}),
		).not.toThrow();

		const prop = `export function Scene() @{
  <view onClick={() => undefined} />
}`;
		expect(() =>
			compile(prop, '/src/Prop.native.tsrx', {
				hmr: false,
				renderer: validationRenderer,
			}),
		).toThrow(
			'Octane universal compiler: renderer "object" does not allow static attribute "onClick" on <view>. at /src/Prop.native.tsrx:2:8',
		);

		const nestedText = `
function Frame({ content }) @{ <text>{content}</text> }
export function Scene() @{ <Frame content=<view>Invalid</view> /> }
`;
		expect(() =>
			compile(nestedText, '/src/NestedText.native.tsrx', {
				hmr: false,
				renderer: validationRenderer,
			}),
		).toThrow(/does not allow authored JSX text under <view>.*NestedText\.native\.tsrx:3:48/);

		const nestedProp = `
function Frame({ content }) @{ <text>{content}</text> }
export function Scene() @{ <Frame content={<view onClick={() => undefined} />} /> }
`;
		expect(() =>
			compile(nestedProp, '/src/NestedProp.native.tsrx', {
				hmr: false,
				renderer: validationRenderer,
			}),
		).toThrow(/does not allow static attribute "onClick" on <view>.*NestedProp\.native\.tsrx:3:49/);

		const hostChildrenAttribute = 'export function Scene() @{ <view children={<>Invalid</>} /> }';
		expect(() =>
			compile(hostChildrenAttribute, '/src/HostChildren.native.tsrx', {
				hmr: false,
				renderer: validationRenderer,
			}),
		).toThrow(/does not allow authored JSX text under <view>.*HostChildren\.native\.tsrx/);

		const componentPropBoundary = `
function Frame({ content }) @{ <text>{content}</text> }
export function Scene() @{ <view><Frame content={<>Allowed</>} /></view> }
`;
		expect(() =>
			compile(componentPropBoundary, '/src/ComponentProp.native.tsrx', {
				hmr: false,
				renderer: validationRenderer,
			}),
		).not.toThrow();
	});

	it('applies validation to lowered renderer regions with authored locations', () => {
		const region = `
  <view>Invalid</view>`;
		expect(() =>
			lowerUniversalRendererRegion(
				region,
				'/src/Boundary.native.tsrx',
				'dom',
				validationRenderer,
				0,
				'children',
				{ authoredSource: region },
			),
		).toThrow(
			'Octane universal compiler: renderer "object" does not allow authored JSX text under <view>. at /src/Boundary.native.tsrx:2:8',
		);

		const lowered = lowerUniversalRendererRegion(
			'<view />',
			'/src/Boundary.native.tsrx',
			'dom',
			validationRenderer,
			1,
			'children',
			{ universalRuntime: { runtime: 'object', thread: 'background' } },
		);
		expect(lowered.metadata.universalRuntime).toEqual({
			runtime: 'object',
			thread: 'background',
		});
		expect(Object.isFrozen(lowered.metadata.universalRuntime)).toBe(true);
	});

	it('keeps owning and lowered renderer validation scoped to their authored regions', () => {
		const config = normalizeRendererConfig({
			registry: {
				inner: {
					module: '@renderers/inner',
					text: 'host',
					validation: {
						forbiddenGlobals: ['document'],
						forbiddenImports: ['browser-only'],
						textParents: ['view'],
					},
				},
				outer: {
					module: '@renderers/outer',
					text: 'host',
					validation: { textParents: ['label'] },
				},
			},
			boundaries: {
				'@scene/bridge': {
					Native: {
						ownerRenderer: 'outer',
						childRenderer: 'inner',
						prop: 'children',
					},
				},
			},
		});
		const options = {
			hmr: false,
			renderer: { id: 'outer', ...config.registry.outer },
			rendererBoundaries: config.boundaries,
			rendererRegistry: config.registry,
		};
		const valid = `
import { Native } from '@scene/bridge';
export function Scene({ document }) @{
  <group><Native><view id={document.value}>Inner</view></Native></group>
}`;
		expect(() => compile(valid, '/src/Scoped.native.tsrx', options)).not.toThrow();

		const invalid = `
import { Native } from '@scene/bridge';
export function Scene() @{
  <group>Outer<Native><view>Inner</view></Native></group>
}`;
		expect(() => compile(invalid, '/src/Scoped.native.tsrx', options)).toThrow(
			'Octane universal compiler: renderer "outer" does not allow authored JSX text under <group>. at /src/Scoped.native.tsrx:4:9',
		);

		const forbiddenImport = `
import { Native } from '@scene/bridge';
import runtime from 'browser-only/subpath';
export function Scene() @{
  <group><Native><view id={runtime.value}>Inner</view></Native></group>
}`;
		expect(() => compile(forbiddenImport, '/src/ScopedImport.native.tsrx', options)).toThrow(
			/forbids static import "browser-only\/subpath".*ScopedImport\.native\.tsrx:3:20/,
		);

		const forbiddenRequire = `
import { Native } from '@scene/bridge';
const runtime = require('browser-only/subpath');
export function Scene() @{
  <group><Native><view id={runtime.value}>Inner</view></Native></group>
}`;
		expect(() => compile(forbiddenRequire, '/src/ScopedRequire.native.tsrx', options)).toThrow(
			/forbids static CommonJS require "browser-only\/subpath".*ScopedRequire\.native\.tsrx:3:/,
		);

		const ownerOnlyImport = `
import { Native } from '@scene/bridge';
import runtime from 'browser-only/owner';
export function Scene() @{
  <group id={runtime.value}><Native><view>Inner</view></Native></group>
}`;
		expect(() => compile(ownerOnlyImport, '/src/OwnerImport.native.tsrx', options)).not.toThrow();

		const childLocalForbidden = `
import { Native } from '@scene/bridge';
function Child() @{ <view id={document.title}>Inner</view> }
export function Scene() @{ <group><Native><Child /></Native></group> }
`;
		expect(() => compile(childLocalForbidden, '/src/ChildGlobal.native.tsrx', options)).toThrow(
			/renderer "inner" forbids unbound global "document".*ChildGlobal\.native\.tsrx:3:/,
		);

		const outerStrictConfig = normalizeRendererConfig({
			registry: {
				inner: {
					module: '@renderers/inner',
					text: 'host',
					validation: {
						hostProps: { view: ['id', 'onTap'] },
						textParents: ['view'],
					},
				},
				outer: {
					module: '@renderers/outer',
					text: 'host',
					validation: {
						forbiddenGlobals: ['document'],
						forbiddenImports: ['browser-only'],
						hostProps: { view: ['id'] },
						textParents: ['label'],
					},
				},
			},
			boundaries: {
				'@scene/bridge': {
					Native: {
						ownerRenderer: 'outer',
						childRenderer: 'inner',
						prop: 'children',
					},
				},
			},
		});
		const outerStrictOptions = {
			hmr: false,
			renderer: { id: 'outer', ...outerStrictConfig.registry.outer },
			rendererBoundaries: outerStrictConfig.boundaries,
			rendererRegistry: outerStrictConfig.registry,
		};
		const childOnly = `
import { Native } from '@scene/bridge';
import runtime from 'browser-only/child';
function Child() @{ <view onTap={runtime.tap}>{document.title}</view> }
export function Scene() @{ <label><Native><Child /></Native></label> }
`;
		expect(() =>
			compile(childOnly, '/src/ChildOnly.native.tsrx', outerStrictOptions),
		).not.toThrow();

		const sharedChild = `
import { Native } from '@scene/bridge';
function Child() @{ <view id={document.title} /> }
export function Scene() @{
  <label><Child /><Native><Child /></Native></label>
}`;
		expect(() => compile(sharedChild, '/src/SharedChild.native.tsrx', outerStrictOptions)).toThrow(
			/renderer "outer" forbids unbound global "document".*SharedChild\.native\.tsrx:3:/,
		);
	});

	it('emits a static host plan with dynamic values and keyed range lowering', () => {
		const source = `
			export function Scene({items, color}) @{
				<scene tone={color}>
					@for (const item of items; key item.id) {
						<><node value={item.value}/><label>{item.label as string}</label></>
					}
				</scene>
			}
		`;
		const output = compile(source, '/src/Scene.object.tsrx', { renderer }).code;

		expect(output).toContain('from "octane/universal"');
		expect(output).toContain('"kind": "host"');
		expect(output).toContain('"kind": "range"');
		expect(output).toContain('"bindings": [["tone", 0]]');
		expect(output).not.toContain('<scene');
	});

	it('infers omitted dependencies for hooks imported from the renderer runtime', () => {
		const source = `
			import { useMemo as memo } from 'octane/universal';
			function useComputed(factory, dependencies) {
				return memo(factory, dependencies);
			}
			export function Scene(props) @{
				const value = useComputed(() => props.value);
				<node value={value} />
			}
		`;
		const output = compile(source, '/src/Scene.object.tsrx', {
			renderer,
			hmr: false,
		}).code;

		expect(() => parseModule(output, '/dist/Scene.object.js')).not.toThrow();
		expect(output).toMatch(/memo\(factory, dependencies, [^)]+\)/);
		expect(output).toContain('() => props.value, [props.value]');
	});

	it('renders pure keyed host loops without per-item owners while preserving host identity', () => {
		const source = `
			export function Scene({items}) @{
				@for (const item of items; key item.id) {
					<node name={item.name} vector={[item.value, 0]} />
				}
			}
		`;
		let output = compile(source, '/src/PureList.object.tsrx', {
			renderer,
			hmr: false,
		}).code;
		expect(output).toMatch(/__octaneUniversalFor\(\s*items/);
		expect(output).toMatch(/,\s*null,\s*true,\s*true\s*\)/);
		const hmrOutput = compile(source, '/src/PureList.object.tsrx', {
			renderer,
			hmr: true,
		}).code;
		expect(hmrOutput).toMatch(/__octaneUniversalFor\(\s*items/);
		expect(hmrOutput).not.toMatch(/,\s*null,\s*true/);

		output = output.replace(
			/import\s*\{([\s\S]*?)\}\s*from\s*["']octane\/universal["'];/g,
			(_match, specifiers: string) =>
				`const {${specifiers.replace(/\s+as\s+/g, ': ')}} = __universal;`,
		);
		output = output.replace('export const Scene =', 'const Scene =');
		const ownerlessCalls: unknown[] = [];
		const compactCalls: unknown[] = [];
		const runtime = {
			...UniversalRuntime,
			universalFor: (...args: unknown[]) => {
				ownerlessCalls.push(args[4]);
				compactCalls.push(args[5]);
				return (UniversalRuntime.universalFor as any)(...args);
			},
		};
		const PureList = new Function('__universal', `${output}\nreturn Scene;`)(runtime) as (
			props: unknown,
		) => unknown;
		const { container, root } = objectRoot(true);

		root.render(PureList as any, {
			items: [
				{ id: 'a', name: 'A', value: 1 },
				{ id: 'b', name: 'B', value: 2 },
			],
		});
		expect(ownerlessCalls).toEqual([true]);
		expect(compactCalls).toEqual([true]);
		const a = container.children[0];
		const b = container.children[1];

		root.render(PureList as any, {
			items: [
				{ id: 'a', name: 'Aye', value: 10 },
				{ id: 'b', name: 'Bee', value: 20 },
			],
		});
		expect(container.children).toEqual([a, b]);
		expect(container.children.map((child) => child.props.name)).toEqual(['Aye', 'Bee']);
		expect(container.children.map((child) => child.props.vector)).toEqual([
			[10, 0],
			[20, 0],
		]);

		root.render(PureList as any, {
			items: [
				{ id: 'b', name: 'Bee', value: 20 },
				{ id: 'a', name: 'Aye', value: 10 },
				{ id: 'c', name: 'See', value: 3 },
			],
		});
		expect(container.children.map((child) => child.props.name)).toEqual(['Bee', 'Aye', 'See']);
		expect(container.children[0]).toBe(b);
		expect(container.children[1]).toBe(a);
		expect(container.children.map((child) => child.props.vector)).toEqual([
			[20, 0],
			[10, 0],
			[3, 0],
		]);

		const committed = [...container.children];
		const commits = container.commits.length;
		expect(() =>
			root.render(PureList as any, {
				items: [
					{ id: 'same', name: 'first', value: 1 },
					{ id: 'same', name: 'second', value: 2 },
				],
			}),
		).toThrow(/Duplicate universal list key same/);
		expect(container.children).toEqual(committed);
		expect(container.commits).toHaveLength(commits);

		root.render(PureList as any, { items: [] });
		expect(container.children).toEqual([]);
		root.unmount();
	});

	it('preserves keyed state reached through data property getters', () => {
		const source = `
			export function Scene({items}) @{
				@for (const item of items; key item.id) {
					<node name={item.name} />
				}
			}
		`;
		let output = compile(source, '/src/GetterStateList.object.tsrx', {
			renderer,
			hmr: false,
		}).code;
		output = output.replace(
			/import\s*\{([\s\S]*?)\}\s*from\s*["']octane\/universal["'];/g,
			(_match, specifiers: string) =>
				`const {${specifiers.replace(/\s+as\s+/g, ': ')}} = __universal;`,
		);
		output = output.replace('export const Scene =', 'const Scene =');
		const GetterStateList = new Function('__universal', `${output}\nreturn Scene;`)(
			UniversalRuntime,
		) as (props: unknown) => unknown;
		const setters = new Map<string, (value: string) => void>();
		const item = (id: string, initial: string) => ({
			id,
			get name() {
				const [value, setValue] = UniversalRuntime.useState(initial, 'getter-state');
				setters.set(id, setValue);
				return value;
			},
		});
		const a = item('a', 'A');
		const b = item('b', 'B');
		const { container, root } = objectRoot(true);

		root.render(GetterStateList as any, { items: [a, b] });
		expect(container.children.map((child) => child.props.name)).toEqual(['A', 'B']);
		const [hostA, hostB] = container.children;

		UniversalRuntime.flushUniversalSync(() => setters.get('a')!('A2'));
		expect(container.children).toEqual([hostA, hostB]);
		expect(container.children.map((child) => child.props.name)).toEqual(['A2', 'B']);

		root.render(GetterStateList as any, { items: [b, a] });
		expect(container.children).toEqual([hostB, hostA]);
		expect(container.children.map((child) => child.props.name)).toEqual(['B', 'A2']);
		root.unmount();
	});

	it('classifies each stable leaf once when one retained host must be recreated', () => {
		const container = createObjectContainer();
		const classified: string[] = [];
		const driver = {
			...createObjectDriver(),
			updates: {
				classify(
					_type: string,
					_previous: Readonly<Record<string, unknown>>,
					next: Readonly<Record<string, unknown>>,
				) {
					const name = next.name as string;
					classified.push(name);
					return name === 'b' ? ('recreate' as const) : ('update' as const);
				},
			},
		};
		const root = createUniversalRoot(container, driver);
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'node',
			bindings: [
				['name', 0],
				['value', 1],
			],
		});
		const Scene = defineUniversalComponent('object', (props: { values: readonly number[] }) =>
			universalList(['a', 'b'], (name, index) =>
				universalKey(name, universalValue(plan, [name, props.values[index]])),
			),
		);

		root.render(Scene, { values: [1, 2] });
		const [a, b] = container.children;
		const commits = container.commits.length;
		const aborted = root.prepare(Scene, { values: [3, 4] });
		expect(aborted.status).toBe('prepared');
		aborted.abort();
		expect(container.children).toEqual([a, b]);
		expect(container.children.map((child) => child.props.value)).toEqual([1, 2]);
		expect(container.commits).toHaveLength(commits);

		classified.length = 0;
		root.render(Scene, { values: [3, 4] });

		expect(classified).toEqual(['a', 'b']);
		expect(container.children[0]).toBe(a);
		expect(container.children[1]).not.toBe(b);
		expect(container.children.map((child) => child.props.value)).toEqual([3, 4]);
		root.unmount();
	});

	it('expands compact leaves nested below an ordinary host and across an empty transition', () => {
		const container = createObjectContainer();
		const baseDriver = createObjectDriver();
		const root = createUniversalRoot(container, {
			...baseDriver,
			capabilities: { ...baseDriver.capabilities, compilerLeafProps: true },
		});
		const leafPlan = universalPlan('object', {
			kind: 'host',
			type: 'node',
			bindings: [['value', 0]],
		});
		const parentPlan = universalPlan('object', {
			kind: 'host',
			type: 'scene',
			children: [{ kind: 'slot', slot: 0 }],
		});
		const Scene = defineUniversalComponent('object', (props: { values: readonly number[] }) =>
			universalValue(parentPlan, [
				universalFor(
					props.values,
					(_value, index) => index,
					(value) => universalValue(leafPlan, [value]),
					null,
					true,
					true,
				),
			]),
		);

		root.render(Scene, { values: [1, 2] });
		const parent = container.children[0];
		const leaves = [...parent.children];
		root.render(Scene, { values: [3, 4] });
		expect(container.children[0]).toBe(parent);
		expect(parent.children).toEqual(leaves);
		expect(parent.children.map((child) => child.props.value)).toEqual([3, 4]);

		root.render(Scene, { values: [] });
		expect(container.children[0]).toBe(parent);
		expect(parent.children).toEqual([]);
		root.unmount();
	});

	it('classifies each compact retained leaf once when one host must be recreated', () => {
		const container = createObjectContainer();
		const classified: string[] = [];
		let rejectPreparation = false;
		const baseDriver = createObjectDriver();
		const driver = {
			...baseDriver,
			capabilities: { ...baseDriver.capabilities, compilerLeafProps: true },
			updates: {
				classify(
					_type: string,
					_previous: Readonly<Record<string, unknown>>,
					next: Readonly<Record<string, unknown>>,
				) {
					const name = next.name as string;
					classified.push(name);
					return name === 'b' ? ('recreate' as const) : ('update' as const);
				},
			},
			prepareBatch(
				target: Parameters<typeof baseDriver.prepareBatch>[0],
				batch: Parameters<typeof baseDriver.prepareBatch>[1],
				context: Parameters<typeof baseDriver.prepareBatch>[2],
			) {
				if (rejectPreparation) throw new Error('compact preparation rejected');
				return baseDriver.prepareBatch(target, batch, context);
			},
		};
		const root = createUniversalRoot(container, driver);
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'node',
			bindings: [
				['name', 0],
				['value', 1],
			],
		});
		const Scene = defineUniversalComponent('object', (props: { values: readonly number[] }) =>
			universalFor(
				['a', 'b'],
				(name) => name,
				(name, index) => universalValue(plan, [name, props.values[index]]),
				null,
				true,
				true,
			),
		);

		root.render(Scene, { values: [1, 2] });
		const [a, b] = container.children;
		const commits = container.commits.length;
		const aborted = root.prepare(Scene, { values: [3, 4] });
		expect(aborted.status).toBe('prepared');
		aborted.abort();
		expect(container.children).toEqual([a, b]);
		expect(container.children.map((child) => child.props.value)).toEqual([1, 2]);
		expect(container.commits).toHaveLength(commits);

		rejectPreparation = true;
		expect(() => root.render(Scene, { values: [3, 4] })).toThrow('compact preparation rejected');
		expect(container.children).toEqual([a, b]);
		expect(container.children.map((child) => child.props.value)).toEqual([1, 2]);
		expect(container.commits).toHaveLength(commits);

		rejectPreparation = false;
		classified.length = 0;
		root.render(Scene, { values: [3, 4] });

		expect(classified).toEqual(['a', 'b']);
		expect(container.children[0]).toBe(a);
		expect(container.children[1]).not.toBe(b);
		expect(container.children.map((child) => child.props.value)).toEqual([3, 4]);
		root.unmount();
	});

	it('preserves lazy keyed-loop evaluation when eliding item owners', () => {
		const source = `
			export function Scene({items}) @{
				@for (const item of items; key item.id) {
					<node name={item.name} />
				}
			}
		`;
		let output = compile(source, '/src/LazyPureList.object.tsrx', {
			renderer,
			hmr: false,
		}).code;
		expect(output).toMatch(/,\s*null,\s*true,\s*true\s*\)/);
		output = output.replace(
			/import\s*\{([\s\S]*?)\}\s*from\s*["']octane\/universal["'];/g,
			(_match, specifiers: string) =>
				`const {${specifiers.replace(/\s+as\s+/g, ': ')}} = __universal;`,
		);
		output = output.replace('export const Scene =', 'const Scene =');

		const timing: string[] = [];
		const runtime = {
			...UniversalRuntime,
			universalFor: (...args: unknown[]) => {
				timing.push('descriptor:start');
				const descriptor = (UniversalRuntime.universalFor as any)(...args);
				timing.push('descriptor:end');
				return descriptor;
			},
		};
		const LazyPureList = new Function('__universal', `${output}\nreturn Scene;`)(runtime) as (
			props: unknown,
		) => unknown;
		const items = {
			*[Symbol.iterator]() {
				timing.push('iterate');
				yield {
					get id() {
						timing.push('key:a');
						return 'a';
					},
					get name() {
						timing.push('prop:a');
						return 'A';
					},
				};
				yield {
					get id() {
						timing.push('key:b');
						return 'b';
					},
					get name() {
						timing.push('prop:b');
						return 'B';
					},
				};
			},
		};
		const props = {
			get items() {
				timing.push('source');
				return items;
			},
		};
		const { container, root } = objectRoot();

		root.render(LazyPureList as any, props);

		expect(timing).toEqual([
			'source',
			'descriptor:start',
			'descriptor:end',
			'iterate',
			'key:a',
			'prop:a',
			'key:b',
			'prop:b',
		]);
		expect(container.children.map((child) => child.props.name)).toEqual(['A', 'B']);
		root.unmount();
	});

	it('keeps scoped keyed loops when item ownership may be observable', () => {
		const cases = [
			{
				label: 'item setup and hooks',
				source: `import { useState } from 'octane';
					export function Scene({items}) @{
						@for (const item of items; key item.id) {
							const [value] = useState(item.value);
							<node value={value} />
						}
					}`,
			},
			{
				label: 'component children',
				source: `function Child({value}) @{ <node value={value} /> }
					export function Scene({items}) @{
						@for (const item of items; key item.id) { <Child value={item.value} /> }
					}`,
			},
			{
				label: 'refs',
				source: `export function Scene({items, hostRef}) @{
						@for (const item of items; key item.id) { <node ref={hostRef} /> }
					}`,
			},
			{
				label: 'events',
				source: `export function Scene({items, select}) @{
						@for (const item of items; key item.id) { <node onClick={() => select(item.id)} /> }
					}`,
			},
			{
				label: 'local callbacks',
				source: `export function Scene({items, attach}) @{
						@for (const item of items; key item.id) { <node attach={attach} /> }
					}`,
			},
			{
				label: 'spreads',
				source: `export function Scene({items, host}) @{
						@for (const item of items; key item.id) { <node {...host} /> }
					}`,
			},
			{
				label: 'host children',
				source: `export function Scene({items}) @{
						@for (const item of items; key item.id) { <node><leaf /></node> }
					}`,
			},
			{
				label: 'impure props',
				source: `export function Scene({items, read}) @{
						@for (const item of items; key item.id) { <node value={read(item)} /> }
					}`,
			},
		];

		for (const example of cases) {
			const output = compile(example.source, `/src/${example.label}.object.tsrx`, {
				renderer,
				hmr: false,
			}).code;
			expect(output, example.label).toContain('__octaneUniversalFor(');
			expect(output, example.label).not.toMatch(/,\s*null,\s*true\s*\)/);
		}
	});

	it('lowers nested components, dynamic JSX values, and ordered spreads without a DOM deopt', () => {
		const source = `
			import { Imported as Alias } from './Imported.object.tsrx';
			const Library = { Child: Alias };
			const Local = ({value, children}) => <node value={value}>{children}</node>;
			export function Scene({Current, before, after, ok}) {
				if (!ok) return null;
				return <scene {...before} tone="warm" {...after} tone="final">
					<Local value={1}><leaf /></Local>
					<Alias value={2} />
					<Library.Child value={3} />
					<{Current} value={4} />
					{ok ? <active /> : <inactive />}
				</scene>;
			}
		`;
		const output = compile(source, '/src/Scene.object.tsrx', {
			renderer,
			hmr: false,
		});

		expect(output.code).toContain('universalComponent as __octaneUniversalComponent');
		expect(output.code).toContain('universalProps as __octaneUniversalProps');
		expect(output.code).toContain("['spread', before]");
		expect(output.code).toContain('[\'set\', "tone", "warm"]');
		expect(output.code).toContain("['spread', after]");
		expect(output.code).toContain('[\'set\', "tone", "final"]');
		expect(output.code).toContain('__octaneUniversalComponent("object", Library.Child');
		expect(output.code).toContain('__octaneUniversalComponent("object", Current');
		expect(output.code).not.toMatch(/<[A-Za-z{]/);
		expect(output.map.sourcesContent).toEqual([source]);
		expect(output.map.sources).toEqual(['Scene.object.tsrx']);
	});

	it('capability-gates className aliasing to renderer host props', () => {
		const source = `
			function Child({ className }) { return <leaf received={className} />; }
			export function Scene({ middle, last }) {
				return <scene>
					<node className="first" {...middle} class="after" className={last} />
					<Child className="component-value" />
				</scene>;
			}
		`;
		const ordinary = compile(source, '/src/ClassAliases.object.tsrx', {
			renderer,
			hmr: false,
		}).code;
		const aliased = compile(source, '/src/ClassAliases.object.tsrx', {
			renderer: { ...renderer, capabilities: ['class-name-alias'] },
			hmr: false,
		}).code;

		expect(ordinary).toContain('[\'set\', "className", "first"]');
		expect(ordinary).toContain('[\'set\', "class", "after"]');
		expect(ordinary).not.toMatch(/\],\s*undefined,\s*true\s*\)/);
		expect(aliased).toContain('[\'set\', "class", "first"]');
		expect(aliased).toContain("['spread', middle]");
		expect(aliased).toMatch(/\['set', "class", last\]\s*\],\s*undefined,\s*true\s*\)/);
		expect(aliased).toContain('[\'set\', "className", "component-value"]');
	});

	it('copies __proto__ as own prop data without polluting universal props', () => {
		const marker = Symbol('spread-marker');
		const spread = JSON.parse(
			'{"className":"spread-class","__proto__":{"id":"forged","class":"owned"}}',
		) as Record<PropertyKey, unknown>;
		Object.defineProperty(spread, marker, {
			enumerable: true,
			value: 'symbol-value',
		});

		for (const canonicalizeHostClass of [false, true]) {
			const props = universalProps(
				[
					['set', 'before', 1],
					['spread', spread],
					['set', 'after', 2],
				],
				undefined,
				canonicalizeHostClass,
			).props as Readonly<Record<PropertyKey, unknown>>;

			expect(Object.getPrototypeOf(props)).toBe(Object.prototype);
			expect(Object.prototype.hasOwnProperty.call(props, '__proto__')).toBe(true);
			expect(props.__proto__).toEqual({ id: 'forged', class: 'owned' });
			expect(props.id).toBeUndefined();
			expect(props[marker]).toBe('symbol-value');
			if (canonicalizeHostClass) {
				expect(props.class).toBe('spread-class');
				expect(Object.prototype.hasOwnProperty.call(props, 'className')).toBe(false);
			} else {
				expect(props.className).toBe('spread-class');
			}
		}

		const direct = universalProps([['set', '__proto__', { direct: true }]]).props as Readonly<
			Record<string, unknown>
		>;
		expect(Object.getPrototypeOf(direct)).toBe(Object.prototype);
		expect(direct.__proto__).toEqual({ direct: true });
	});

	it('lowers every universal directive and preserves explicit host keys in the prop program', () => {
		const source = `
			export function Scene({items, mode, host}) @{
				<scene key={mode} {...host}>
					@if (mode === 'if') { <yes /> } @else { <no /> }
					@switch (mode) {
						@case 'one': { <one /> }
						@default: { <other /> }
					}
					@for (const item of items; key item.id) {
						<node key={item.id} value={item.value} />
					} @empty { <empty /> }
					@try { <ready /> } @pending { <pending /> } @catch (error) {
						<failed error={error} />
					}
				</scene>
			}
		`;
		const output = compile(source, '/src/Directives.object.tsrx', {
			renderer,
			hmr: false,
		}).code;

		expect(output).toContain('universalIf as __octaneUniversalIf');
		expect(output).toContain('universalSwitch as __octaneUniversalSwitch');
		expect(output).toContain('universalFor as __octaneUniversalFor');
		expect(output).toContain('universalTry as __octaneUniversalTry');
		expect(output).toContain('[\'set\', "key", mode]');
		expect(output).toContain("['spread', host]");
		expect(output).toContain('(item, __octaneUniversalIndex) => item.id');
		expect(output).not.toContain('"key":');
	});

	it('keeps HMR, profiling, and parallel-use planning on universal components', () => {
		const source = `
			import { use } from 'octane';
			export function Scene({loadA, loadB}) {
				const a = use(loadA());
				const b = use(loadB());
				return <scene a={a} b={b} />;
			}
		`;
		const output = compile(source, '/src/Profiled.object.tsrx', {
			renderer,
			hmr: true,
			profile: true,
		}).code;

		expect(output).toContain('hmrUniversalComponent as __octaneUniversalHmr');
		expect(output).toContain('UNIVERSAL_HMR as __octaneUniversalHmrSymbol');
		expect(output).toContain('__profileComponent as __octaneProfileComponent');
		expect(output).toContain('useBatch as _$useBatch');
		expect(output).toContain('_$useBatch([__pu$0, __pu$1])');
		expect(output).toContain('__warm:');
		expect(output).toContain('import.meta.hot.accept');
		expect(output).toContain('"componentId":"/src/Profiled.object.tsrx#Scene@3:10"');
		expect(output).toContain('"line":4,"column":14');
	});

	it('warms adjacent universal component trees from a parent with no use()', async () => {
		const source = `
			import { use } from 'octane';
			function LeftLeaf({load, token}) @{
				const value = use(load('left-leaf', token));
				<leaf value={value} />
			}
			function Left({load, token}) @{
				const value = use(load('left', token));
				<left value={value}><LeftLeaf load={load} token={token} /></left>
			}
			function RightLeaf({load, token}) @{
				const value = use(load('right-leaf', token));
				<leaf value={value} />
			}
			function Right({load, token}) @{
				const value = use(load('right', token));
				<right value={value}><RightLeaf load={load} token={token} /></right>
			}
			export function Scene({load, token}) @{
				<scene><Left load={load} token={token} /><Right load={load} token={token} /></scene>
			}
		`;
		let output = compile(source, '/src/Async.object.tsrx', {
			renderer,
			hmr: false,
		}).code;
		output = output.replace(
			/import\s*\{([\s\S]*?)\}\s*from\s*["']octane\/universal["'];/g,
			(_match, specifiers: string) =>
				`const {${specifiers.replace(/\s+as\s+/g, ': ')}} = __universal;`,
		);
		output = output.replace('export const Scene =', 'const Scene =');
		const Scene = new Function('__universal', `${output}\nreturn Scene;`)(UniversalRuntime) as (
			props: unknown,
		) => unknown;

		const calls: string[] = [];
		const jobs = new Map<string, { promise: Promise<string>; resolve: (value: string) => void }>();
		const load = (resource: string, token: number) => {
			const key = `${resource}:${token}`;
			calls.push(key);
			let resolve!: (value: string) => void;
			const promise = new Promise<string>((done) => {
				resolve = done;
			});
			jobs.set(key, { promise, resolve });
			return promise;
		};
		const expected = ['left-leaf:0', 'left:0', 'right-leaf:0', 'right:0'];
		const { container, root } = objectRoot();
		const settleRound = async (keys: string[]) => {
			for (const key of keys) jobs.get(key)!.resolve(key);
			await Promise.all(keys.map((key) => jobs.get(key)!.promise));
			await Promise.resolve();
			await Promise.resolve();
		};

		const suspended = root.render(Scene as any, { load, token: 0 });
		expect(suspended.status).toBe('suspended');
		expect([...calls].sort()).toEqual(expected);

		await settleRound(expected);

		const scene = container.children[0];
		expect(scene.children.map((child) => [child.type, child.props.value])).toEqual([
			['left', 'left:0'],
			['right', 'right:0'],
		]);
		expect(scene.children.map((child) => child.children[0].props.value)).toEqual([
			'left-leaf:0',
			'right-leaf:0',
		]);
		expect([...calls].sort()).toEqual(expected);

		const tokenOne = ['left-leaf:1', 'left:1', 'right-leaf:1', 'right:1'];
		expect(root.render(Scene as any, { load, token: 1 }).status).toBe('suspended');
		expect(calls.slice(4).sort()).toEqual(tokenOne);
		await settleRound(tokenOne);

		expect(root.render(Scene as any, { load, token: 0 }).status).toBe('suspended');
		// A fresh render may return to old dependency values, but the previous
		// episode's consumed tombstones must not suppress adjacent warming.
		expect(calls.slice(8).sort()).toEqual(expected);
		await settleRound(expected);
		expect(calls).toHaveLength(12);
		root.unmount();
	});

	it('skips fulfilled siblings and warms repeated component occurrences independently', async () => {
		const source = `
			import { use } from 'octane';
			function Item({load, name, token}) @{
				const value = use(load(name, token));
				<item value={value} />
			}
			export function Scene({load, first, second, token}) @{
				<scene>
					<Item load={load} name={first} token={token} />
					<Item load={load} name={second} token={token} />
				</scene>
			}
		`;
		let output = compile(source, '/src/RepeatedAsync.object.tsrx', {
			renderer,
			hmr: false,
		}).code;
		output = output.replace(
			/import\s*\{([\s\S]*?)\}\s*from\s*["']octane\/universal["'];/g,
			(_match, specifiers: string) =>
				`const {${specifiers.replace(/\s+as\s+/g, ': ')}} = __universal;`,
		);
		output = output.replace('export const Scene =', 'const Scene =');
		const Scene = new Function('__universal', `${output}\nreturn Scene;`)(UniversalRuntime) as (
			props: unknown,
		) => unknown;

		const calls: string[] = [];
		const jobs = new Map<
			string,
			Array<{ promise: Promise<string>; resolve: (v: string) => void }>
		>();
		const load = (name: string, token: number) => {
			const key = `${name}:${token}`;
			calls.push(key);
			if (key === 'stable:0') {
				return { status: 'fulfilled', value: 'STABLE', then() {} };
			}
			let resolve!: (value: string) => void;
			const promise = new Promise<string>((done) => {
				resolve = done;
			});
			const list = jobs.get(key);
			const job = { promise, resolve };
			if (list === undefined) jobs.set(key, [job]);
			else list.push(job);
			return promise;
		};
		const settle = async (key: string) => {
			const list = jobs.get(key)!;
			for (const job of list) job.resolve(key);
			await Promise.all(list.map((job) => job.promise));
			await Promise.resolve();
			await Promise.resolve();
		};
		const { container, root } = objectRoot();

		expect(
			root.render(Scene as any, {
				load,
				first: 'stable',
				second: 'changing',
				token: 0,
			}).status,
		).toBe('suspended');
		// The second item suspended after the stable item completed. Its ancestor
		// plan must not invoke the stable loader a second time.
		expect(calls).toEqual(['stable:0', 'changing:0']);
		await settle('changing:0');

		expect(
			root.render(Scene as any, {
				load,
				first: 'same',
				second: 'same',
				token: 1,
			}).status,
		).toBe('suspended');
		expect(calls.slice(2)).toEqual(['same:1', 'same:1']);
		await settle('same:1');
		expect(container.children[0].children.map((child) => child.props.value)).toEqual([
			'same:1',
			'same:1',
		]);
		expect(calls).toHaveLength(4);
		root.unmount();
	});

	it('preserves distinct results across more than 64 same-dependency component occurrences', async () => {
		const occurrenceCount = 65;
		const items = Array.from({ length: occurrenceCount }, () => '<Item load={load} />').join('');
		const source = `
			import { use } from 'octane';
			function Item({load}) @{
				const value = use(load('same'));
				<item value={value} />
			}
			export function Scene({load}) @{
				<scene>${items}</scene>
			}
		`;
		let output = compile(source, '/src/ManyRepeatedAsync.object.tsrx', {
			renderer,
			hmr: false,
		}).code;
		output = output.replace(
			/import\s*\{([\s\S]*?)\}\s*from\s*["']octane\/universal["'];/g,
			(_match, specifiers: string) =>
				`const {${specifiers.replace(/\s+as\s+/g, ': ')}} = __universal;`,
		);
		output = output.replace('export const Scene =', 'const Scene =');
		const Scene = new Function('__universal', `${output}\nreturn Scene;`)(UniversalRuntime) as (
			props: unknown,
		) => unknown;

		const calls: string[] = [];
		const jobs: Array<{ promise: Promise<string>; resolve: (value: string) => void }> = [];
		const load = (key: string) => {
			calls.push(key);
			let resolve!: (value: string) => void;
			const promise = new Promise<string>((done) => {
				resolve = done;
			});
			jobs.push({ promise, resolve });
			return promise;
		};
		const expected = Array.from(
			{ length: occurrenceCount },
			(_, index) => `VALUE-${index.toString().padStart(3, '0')}`,
		);
		const { container, root } = objectRoot();

		expect(root.render(Scene as any, { load }).status).toBe('suspended');
		// All occurrences start in the first attempt, before any promise settles.
		expect(calls).toHaveLength(occurrenceCount);
		expect(calls.every((key) => key === 'same')).toBe(true);
		expect(jobs).toHaveLength(occurrenceCount);

		for (let index = occurrenceCount - 1; index >= 0; index--) {
			jobs[index].resolve(expected[index]);
		}
		await Promise.all(jobs.map((job) => job.promise));
		await Promise.resolve();
		await Promise.resolve();

		expect(container.children[0].children.map((child) => child.props.value)).toEqual(expected);
		expect(calls).toHaveLength(occurrenceCount);
		root.unmount();
	});

	it('preserves nested function hoisting and executes supported universal useId hooks', () => {
		const source = `import { useId } from 'octane';
			export function Parent({show}) {
				if (show) return <Child />;
				function Child() {
					const id = useId();
					return <node id={id} />;
				}
				return null;
			}`;
		let output = compile(source, '/src/Hoisted.object.tsrx', {
			renderer,
			hmr: false,
		}).code;
		output = output.replace(
			/import\s*\{([\s\S]*?)\}\s*from\s*["']octane\/universal["'];/g,
			(_match, specifiers: string) =>
				`const {${specifiers.replace(/\s+as\s+/g, ': ')}} = __universal;`,
		);
		output = output.replace('export const Parent =', 'const Parent =');
		const Parent = new Function('__universal', `${output}\nreturn Parent;`)(
			UniversalRuntime,
		) as (props: { show: boolean }) => unknown;
		const { container, root } = objectRoot();

		root.render(Parent as any, { show: true });
		const node = container.children[0];
		const id = node.props.id;
		expect(id).toMatch(/^:octane-u[0-9a-z]+:$/);
		root.unmount();
	});

	it('reuses useId allocations after errored, suspended, and explicitly aborted drafts', () => {
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'node',
			bindings: [['id', 0]],
		});
		const never = new Promise<never>(() => {});
		for (const discard of ['error', 'suspend', 'abort'] as const) {
			const { container, root } = objectRoot();
			const observed: string[] = [];
			const Component = defineUniversalComponent(
				'object',
				(props: { mode: 'ready' | typeof discard }) => {
					const id = UniversalRuntime.useId('transactional-id');
					observed.push(id);
					if (props.mode === 'error') throw new Error('discard id draft');
					if (props.mode === 'suspend') use(never);
					return universalValue(plan, [id]);
				},
			);

			if (discard === 'error') {
				expect(() => root.render(Component, { mode: discard })).toThrow('discard id draft');
			} else if (discard === 'suspend') {
				expect(root.render(Component, { mode: discard }).status).toBe('suspended');
			} else {
				const prepared = root.prepare(Component, { mode: 'ready' });
				expect(prepared.status).toBe('prepared');
				prepared.abort();
			}

			const discardedId = observed[0];
			root.render(Component, { mode: 'ready' });
			expect(container.children[0].props.id).toBe(discardedId);
			expect(observed.at(-1)).toBe(discardedId);
			root.unmount();
		}
	});

	it('reclaims useId allocations from discarded try arms before committing a fallback', () => {
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'fallback',
			bindings: [['id', 0]],
		});
		const never = new Promise<never>(() => {});
		for (const discard of ['error', 'suspend'] as const) {
			const { container, root } = objectRoot();
			let discardedId!: string;
			const Component = defineUniversalComponent('object', () =>
				universalTry(
					() => {
						discardedId = UniversalRuntime.useId('discarded-arm-id');
						if (discard === 'error') throw new Error('discard try arm');
						use(never);
					},
					() => universalValue(plan, [UniversalRuntime.useId('committed-pending-id')]),
					() => universalValue(plan, [UniversalRuntime.useId('committed-catch-id')]),
				),
			);

			root.render(Component, undefined);
			expect(container.children[0].props.id).toBe(discardedId);
			root.unmount();
		}
	});

	it('still diagnoses runtime APIs without a universal implementation', () => {
		expect(() =>
			compile(
				`import { lazy } from 'octane';
				 export const Scene = lazy(() => import('./Scene.object.tsrx'));`,
				'/src/UnsupportedHook.object.tsrx',
				{ renderer },
			),
		).toThrow(/runtime import "lazy" has no universal renderer implementation/);
	});

	it('capability-gates universal server serialization', () => {
		expect(() =>
			compile('export function Scene() @{ <scene/> }', '/src/Scene.object.tsrx', {
				mode: 'server',
				renderer,
			}),
		).toThrow(/serialization\/hydration capability/);
		expect(() =>
			compile(
				'export function Scene() @{ <Activity mode="hidden"><node /></Activity> }',
				'/src/Scene.object.tsrx',
				{ renderer },
			),
		).toThrow(/Activity requires an explicit renderer visibility capability/);
	});

	it('executes a compiler-produced static plan through the object driver', () => {
		const { container, root } = objectRoot();
		const log: string[] = [];
		const refValues: unknown[] = [];
		const hostRef = (value: unknown) => refValues.push(value);

		root.render(CompiledUniversalScene, {
			tone: 'warm',
			value: 1,
			label: 'first',
			log: (entry: string) => log.push(entry),
			hostRef,
		});
		expect(container.children[0]).toMatchObject({
			type: 'scene',
			props: { tone: 'warm' },
		});
		expect(container.children[0].children.map((child) => child.type)).toEqual(['node', 'label']);
		expect(container.children[0].children[1].children[0].props.value).toBe('first');
		expect(refValues).toEqual([container.children[0]]);
		expect(log).toEqual(['layout:first']);

		root.render(CompiledUniversalScene, {
			tone: 'cool',
			value: 2,
			label: 'second',
			log: (entry: string) => log.push(entry),
			hostRef,
		});
		expect(container.children[0].props.tone).toBe('cool');
		expect(container.children[0].children[0].props.value).toBe(2);
		expect(log).toEqual(['layout:first', 'cleanup:first', 'layout:second']);
		expect(container.commits).toHaveLength(2);

		const scene = container.children[0];
		root.unmount();
		expect(log).toEqual(['layout:first', 'cleanup:first', 'layout:second', 'cleanup:second']);
		expect(refValues.at(-1)).toBe(null);
		expect(scene.children).toEqual([]);
	});
});

describe('universal logical topology and transactions', () => {
	it('preserves nested owner, hook, and host identity across equivalent HMR plans', async () => {
		const { container, root } = objectRoot();
		const childPlan = universalPlan('object', {
			kind: 'host',
			type: 'node',
			bindings: [['count', 0]],
		});
		let setCount!: (value: number) => void;
		const Child = defineUniversalComponent('object', () => {
			const [count, update] = useUniversalState(1, 'hmr-child-state');
			setCount = update;
			return universalValue(childPlan, [count]);
		});
		const createImplementation = () => {
			const parentPlan = universalPlan('object', {
				kind: 'if',
				conditionSlot: 0,
				then: {
					kind: 'component',
					renderer: 'object',
					component: Child,
				},
			});
			return defineUniversalComponent('object', () => universalValue(parentPlan, [true]));
		};
		const Parent = UniversalRuntime.hmrUniversalComponent('object', createImplementation());

		root.render(Parent, undefined);
		const host = container.children[0];
		setCount(5);
		await Promise.resolve();
		expect(host.props.count).toBe(5);

		(Parent as any)[UniversalRuntime.UNIVERSAL_HMR].update(createImplementation());
		await Promise.resolve();
		expect(container.children[0]).toBe(host);
		expect(host.props.count).toBe(5);
		root.unmount();
	});

	it('creates, updates, moves, inserts, and removes keyed ranges while preserving survivors', () => {
		const { container, root } = objectRoot();
		root.render(Scene, {
			items: [
				{ id: 'a', value: 1, label: 'A' },
				{ id: 'b', value: 2, label: 'B' },
			],
		});
		const scene = container.children[0];
		const aNode = scene.children[0];
		const aLabel = scene.children[1];
		const bNode = scene.children[2];
		expect(scene.children.map((child) => child.type)).toEqual(['node', 'label', 'node', 'label']);
		expect(container.commits).toHaveLength(1);

		root.render(Scene, {
			items: [
				{ id: 'b', value: 20, label: 'Bee' },
				{ id: 'a', value: 10, label: 'Aye' },
				{ id: 'c', value: 3, label: 'C' },
			],
		});
		expect(scene.children[0]).toBe(bNode);
		expect(scene.children[2]).toBe(aNode);
		expect(scene.children[3]).toBe(aLabel);
		expect(scene.children[0].props.value).toBe(20);
		expect(scene.children[1].children[0].props.value).toBe('Bee');
		expect(container.commits[1].commands.some((command) => command.op === 'move')).toBe(true);
		expect(container.commits[1].commands.some((command) => command.op === 'insert')).toBe(true);

		root.render(Scene, { items: [{ id: 'c', value: 30, label: 'See' }] });
		expect(scene.children).toHaveLength(2);
		expect(scene.children[0].props.value).toBe(30);
		expect(container.commits[2].commands.some((command) => command.op === 'remove')).toBe(true);
		expect(container.commits[2].commands.some((command) => command.op === 'destroy')).toBe(true);
		expect(container.commits).toHaveLength(3);
	});

	it('publishes callback and object refs after the host batch and clears them on teardown', () => {
		const { container, root } = objectRoot();
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'node',
			bindings: [
				['value', 0],
				['ref', 1],
			],
			children: [{ kind: 'host', type: 'leaf', bindings: [['ref', 2]] }],
		});
		const events: unknown[] = [];
		const ref = vi.fn((value: unknown) => events.push(value));
		const objectRef: { current: unknown } = { current: null };
		const Component = defineUniversalComponent('object', (props: { value: number }) =>
			universalValue(plan, [props.value, ref, objectRef]),
		);

		root.render(Component, { value: 1 });
		expect(ref).toHaveBeenCalledTimes(1);
		expect(events[0]).toBe(container.children[0]);
		expect(objectRef.current).toBe(container.children[0].children[0]);
		root.render(Component, { value: 2 });
		expect(ref).toHaveBeenCalledTimes(1);
		root.unmount();
		expect(events.at(-1)).toBe(null);
		expect(objectRef.current).toBe(null);
		expect(container.children).toEqual([]);
	});

	it('orders insertion, ref, layout, and passive work around one host batch', async () => {
		const container = createObjectContainer();
		const baseDriver = createObjectDriver();
		const log: string[] = [];
		const driver = {
			...baseDriver,
			prepareBatch(
				target: typeof container,
				batch: (typeof container.commits)[number],
				context: Parameters<typeof baseDriver.prepareBatch>[2],
			) {
				const prepared = baseDriver.prepareBatch(target, batch, context);
				return {
					...prepared,
					apply() {
						log.push('host');
						prepared.apply();
					},
				};
			},
		};
		const root = createUniversalRoot(container, driver);
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'node',
			bindings: [['ref', 0]],
		});
		const Component = defineUniversalComponent('object', () => {
			useUniversalInsertionEffect(() => {
				log.push('insertion');
				return () => log.push('insertion-cleanup');
			}, []);
			useUniversalLayoutEffect(() => {
				log.push('layout');
				return () => log.push('layout-cleanup');
			}, []);
			useUniversalEffect(() => {
				log.push('passive');
				return () => log.push('passive-cleanup');
			}, []);
			return universalValue(plan, [
				(value: unknown) => log.push(value === null ? 'ref:null' : 'ref:instance'),
			]);
		});

		root.render(Component, undefined);
		expect(log).toEqual(['host', 'insertion', 'ref:instance', 'layout']);
		expect(container.commits).toHaveLength(1);
		await Promise.resolve();
		expect(log).toEqual(['host', 'insertion', 'ref:instance', 'layout', 'passive']);
		root.unmount();
		expect(log.slice(-4)).toEqual(['host', 'insertion-cleanup', 'layout-cleanup', 'ref:null']);
		await Promise.resolve();
		expect(log.at(-1)).toBe('passive-cleanup');
		expect(container.commits).toHaveLength(2);
	});

	it('defers passive updates and flushes each prior commit before the next render', async () => {
		const { root } = objectRoot();
		const log: string[] = [];
		const plan = universalPlan('object', { kind: 'host', type: 'node' });
		const Component = defineUniversalComponent('object', (props: { value: number }) => {
			useUniversalInsertionEffect(() => {
				log.push(`insertion:${props.value}`);
				return () => log.push(`insertion-cleanup:${props.value}`);
			}, [props.value]);
			useUniversalLayoutEffect(() => {
				log.push(`layout:${props.value}`);
				return () => log.push(`layout-cleanup:${props.value}`);
			}, [props.value]);
			useUniversalEffect(() => {
				log.push(`passive:${props.value}`);
				return () => log.push(`passive-cleanup:${props.value}`);
			}, [props.value]);
			return universalValue(plan);
		});

		root.render(Component, { value: 1 });
		await Promise.resolve();
		log.length = 0;
		root.render(Component, { value: 2 });
		expect([...log]).toEqual([
			'insertion-cleanup:1',
			'insertion:2',
			'layout-cleanup:1',
			'layout:2',
		]);

		root.render(Component, { value: 3 });
		expect([...log]).toEqual([
			'insertion-cleanup:1',
			'insertion:2',
			'layout-cleanup:1',
			'layout:2',
			'passive-cleanup:1',
			'passive:2',
			'insertion-cleanup:2',
			'insertion:3',
			'layout-cleanup:2',
			'layout:3',
		]);
		await Promise.resolve();
		expect(log.slice(-2)).toEqual(['passive-cleanup:2', 'passive:3']);
		root.unmount();
		await Promise.resolve();
	});

	it('preserves declaration order when removed and changed effect cleanups mix', async () => {
		const { root } = objectRoot();
		const log: string[] = [];
		const plan = universalPlan('object', { kind: 'host', type: 'node' });
		const effect = (phase: string, name: string, value: number) => () => {
			log.push(`${phase}:create:${name}:${value}`);
			return () => log.push(`${phase}:cleanup:${name}:${value}`);
		};
		const Component = defineUniversalComponent(
			'object',
			(props: { showB: boolean; value: number }) => {
				useUniversalInsertionEffect(effect('insertion', 'A', props.value), [props.value], 'i:a');
				if (props.showB) {
					useUniversalInsertionEffect(effect('insertion', 'B', props.value), [props.value], 'i:b');
				}
				useUniversalInsertionEffect(effect('insertion', 'C', props.value), [props.value], 'i:c');

				useUniversalLayoutEffect(effect('layout', 'A', props.value), [props.value], 'l:a');
				if (props.showB) {
					useUniversalLayoutEffect(effect('layout', 'B', props.value), [props.value], 'l:b');
				}
				useUniversalLayoutEffect(effect('layout', 'C', props.value), [props.value], 'l:c');

				useUniversalEffect(effect('passive', 'A', props.value), [props.value], 'p:a');
				if (props.showB) {
					useUniversalEffect(effect('passive', 'B', props.value), [props.value], 'p:b');
				}
				useUniversalEffect(effect('passive', 'C', props.value), [props.value], 'p:c');
				return universalValue(plan);
			},
		);

		root.render(Component, { showB: true, value: 1 });
		await Promise.resolve();
		log.length = 0;
		root.render(Component, { showB: false, value: 2 });
		expect([...log]).toEqual([
			'insertion:cleanup:A:1',
			'insertion:cleanup:B:1',
			'insertion:cleanup:C:1',
			'insertion:create:A:2',
			'insertion:create:C:2',
			'layout:cleanup:A:1',
			'layout:cleanup:B:1',
			'layout:cleanup:C:1',
			'layout:create:A:2',
			'layout:create:C:2',
		]);
		await Promise.resolve();
		expect(log.slice(-5)).toEqual([
			'passive:cleanup:A:1',
			'passive:cleanup:B:1',
			'passive:cleanup:C:1',
			'passive:create:A:2',
			'passive:create:C:2',
		]);
		root.unmount();
		await Promise.resolve();
	});

	it('routes a successful commit through one optional transport batch', () => {
		const container = createObjectContainer();
		const driver = createObjectDriver();
		const transported: unknown[] = [];
		const root = createUniversalRoot(container, driver, {
			transport: {
				prepareBatch(target, batch, prepare) {
					transported.push(batch);
					expect(target).toBe(container);
					return prepare(batch);
				},
			},
		});
		const plan = universalPlan('object', { kind: 'host', type: 'node' });
		const Component = defineUniversalComponent('object', () => universalValue(plan));

		root.render(Component, undefined);
		expect(transported).toEqual([container.commits[0]]);
		expect(container.commits).toHaveLength(1);
		root.unmount();
	});

	it('schedules captured state updates back through their owning root', async () => {
		const { container, root } = objectRoot();
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'node',
			bindings: [['value', 0]],
		});
		let update!: (value: number | ((previous: number) => number)) => void;
		const Component = defineUniversalComponent('object', () => {
			const [value, setValue] = useUniversalState(1);
			update = setValue;
			return universalValue(plan, [value]);
		});

		root.render(Component, undefined);
		update((value) => value + 1);
		await Promise.resolve();
		await Promise.resolve();
		expect(container.children[0].props.value).toBe(2);
		expect(container.commits).toHaveLength(2);
		root.unmount();
	});

	it('does not publish cleanups or topology when host acceptance rejects', () => {
		const container = createObjectContainer();
		const baseDriver = createObjectDriver();
		let reject = false;
		const driver = {
			...baseDriver,
			prepareBatch(
				target: typeof container,
				batch: (typeof container.commits)[number],
				context: Parameters<typeof baseDriver.prepareBatch>[2],
			) {
				if (reject) throw new Error('host rejected');
				return baseDriver.prepareBatch(target, batch, context);
			},
		};
		const root = createUniversalRoot(container, driver);
		const log: string[] = [];
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'node',
			bindings: [['value', 0]],
		});
		const Component = defineUniversalComponent('object', (props: { value: number }) => {
			useUniversalLayoutEffect(() => {
				log.push(`layout:${props.value}`);
				return () => log.push(`cleanup:${props.value}`);
			}, [props.value]);
			return universalValue(plan, [props.value]);
		});

		root.render(Component, { value: 1 });
		reject = true;
		expect(() => root.render(Component, { value: 2 })).toThrow('host rejected');
		expect(container.children[0].props.value).toBe(1);
		expect(log).toEqual(['layout:1']);

		reject = false;
		root.render(Component, { value: 3 });
		expect(container.children[0].props.value).toBe(3);
		expect(log).toEqual(['layout:1', 'cleanup:1', 'layout:3']);
		root.unmount();
	});

	it('finalizes a host-accepted transaction when a layout callback throws', () => {
		const { container, root } = objectRoot();
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'node',
			bindings: [['value', 0]],
		});
		const Component = defineUniversalComponent(
			'object',
			(props: { value: number; fail: boolean }) => {
				useUniversalLayoutEffect(() => {
					if (props.fail) throw new Error('layout failed');
				}, [props.fail]);
				return universalValue(plan, [props.value]);
			},
		);

		expect(() => root.render(Component, { value: 1, fail: true })).toThrow('layout failed');
		expect(container.children[0].props.value).toBe(1);
		root.render(Component, { value: 2, fail: false });
		expect(container.children[0].props.value).toBe(2);
		expect(container.commits).toHaveLength(2);
		root.unmount();
	});

	it('finishes ref and layout work when an insertion callback throws', () => {
		const { container, root } = objectRoot();
		const ref = vi.fn();
		const log: string[] = [];
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'node',
			bindings: [['ref', 0]],
		});
		const Component = defineUniversalComponent('object', (props: { fail: boolean }) => {
			useUniversalInsertionEffect(() => {
				if (props.fail) throw undefined;
			}, [props.fail]);
			useUniversalLayoutEffect(() => {
				log.push(`layout:${props.fail}`);
			}, [props.fail]);
			return universalValue(plan, [ref]);
		});

		const noError = Symbol('no error');
		let caught: unknown = noError;
		try {
			root.render(Component, { fail: true });
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeUndefined();
		expect(container.children).toHaveLength(1);
		expect(ref).toHaveBeenCalledWith(container.children[0]);
		expect(log).toEqual(['layout:true']);

		root.render(Component, { fail: false });
		expect(container.commits).toHaveLength(2);
		expect(ref).toHaveBeenCalledTimes(1);
		root.unmount();
	});

	it('finishes ref replacement and layout creation when a layout cleanup throws', () => {
		const { container, root } = objectRoot();
		const firstRef = vi.fn();
		const secondRef = vi.fn();
		const log: string[] = [];
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'node',
			bindings: [['ref', 0]],
		});
		const Component = defineUniversalComponent(
			'object',
			(props: { value: number; hostRef: (value: unknown) => void }) => {
				useUniversalLayoutEffect(() => {
					log.push(`layout:${props.value}`);
					return () => {
						if (props.value === 1) throw new Error('layout cleanup failed');
					};
				}, [props.value]);
				return universalValue(plan, [props.hostRef]);
			},
		);

		root.render(Component, { value: 1, hostRef: firstRef });
		expect(() => root.render(Component, { value: 2, hostRef: secondRef })).toThrow(
			'layout cleanup failed',
		);
		expect(firstRef).toHaveBeenLastCalledWith(null);
		expect(secondRef).toHaveBeenCalledWith(container.children[0]);
		expect(log).toEqual(['layout:1', 'layout:2']);
		root.unmount();
	});

	it('invalidates stale passive work and makes transaction commits idempotent', async () => {
		const { container, root } = objectRoot();
		const log: string[] = [];
		const plan = universalPlan('object', { kind: 'host', type: 'node' });
		const Component = defineUniversalComponent('object', (props: { enabled: boolean }) => {
			if (props.enabled) {
				useUniversalEffect(() => {
					log.push('mount');
					return () => log.push('cleanup');
				}, []);
			}
			return universalValue(plan);
		});

		const transaction = root.prepare(Component, { enabled: true });
		expect(transaction.status).toBe('prepared');
		if (transaction.status === 'prepared') {
			transaction.commit();
			transaction.commit();
		}
		await Promise.resolve();
		expect(log).toEqual(['mount']);
		expect(container.commits).toHaveLength(1);

		root.render(Component, { enabled: false });
		expect(log).toEqual(['mount']);
		root.render(Component, { enabled: true });
		expect(log).toEqual(['mount', 'cleanup']);
		root.unmount();
		await Promise.resolve();
		expect(log).toEqual(['mount', 'cleanup']);
	});

	it('drops errored, suspended, and superseded attempts without a host commit', async () => {
		const { container, root } = objectRoot();
		const singlePlan = universalPlan('object', {
			kind: 'host',
			type: 'node',
			bindings: [['value', 0]],
		});
		const Value = defineUniversalComponent('object', (props: { value: string }) =>
			universalValue(singlePlan, [props.value]),
		);
		const Throw = defineUniversalComponent('object', () => {
			throw new Error('render failed');
		});

		const first = root.prepare(Value, { value: 'A' });
		expect(first.status).toBe('prepared');
		if (first.status === 'prepared') first.abort();
		expect(container.commits).toHaveLength(0);
		expect(container.instanceCount).toBe(0);

		const superseded = root.prepare(Value, { value: 'B' });
		const winner = root.prepare(Value, { value: 'C' });
		expect(superseded.status).toBe('aborted');
		expect(container.commits).toHaveLength(0);
		if (winner.status === 'prepared') winner.commit();
		expect(container.children[0].props.value).toBe('C');
		expect(container.commits).toHaveLength(1);

		expect(() => root.render(Throw, undefined)).toThrow('render failed');
		expect(container.commits).toHaveLength(1);

		let resolve!: (value: string) => void;
		const pending = new Promise<string>((done) => {
			resolve = done;
		});
		const Suspends = defineUniversalComponent('object', () =>
			universalValue(singlePlan, [use(pending)]),
		);
		const suspended = root.render(Suspends, undefined);
		expect(suspended.status).toBe('suspended');
		expect(container.commits).toHaveLength(1);
		resolve('ready');
		await pending;
		await Promise.resolve();
		await Promise.resolve();
		expect(container.children[0].props.value).toBe('ready');
		expect(container.commits).toHaveLength(2);
		expect(container.instanceCount).toBe(1);
	});

	it('fails renderer mismatches clearly and capability-gates portals', () => {
		const { root } = objectRoot();
		const plan = universalPlan('other', { kind: 'host', type: 'node' });
		const Wrong = defineUniversalComponent('other', () => universalValue(plan));
		const WrongPlan = defineUniversalComponent('object', () => universalValue(plan));

		expect(() => root.render(Wrong, undefined)).toThrow(
			/root "object" cannot render component "other"/,
		);
		expect(() => root.render(WrongPlan, undefined)).toThrow(
			/root expects "object" but the plan targets "other"/,
		);
		const mismatchedContainer = createObjectContainer('other');
		const mismatchedRoot = createUniversalRoot(mismatchedContainer, createObjectDriver('object'));
		const objectPlan = universalPlan('object', { kind: 'host', type: 'node' });
		const ObjectComponent = defineUniversalComponent('object', () => universalValue(objectPlan));
		expect(() => mismatchedRoot.render(ObjectComponent, undefined)).toThrow(
			/driver "object", container "other", batch "object"/,
		);
		mismatchedRoot.unmount();
		const Portal = defineUniversalComponent('object', () =>
			createPortal(universalValue(objectPlan), {}),
		);
		expect(() => root.render(Portal, undefined)).toThrow(/portal capability/);
	});

	it('requires drivers to opt into text instead of assuming a fake-DOM text API', () => {
		const container = createObjectContainer();
		const driver = { ...createObjectDriver(), capabilities: { text: 'reject' as const } };
		const root = createUniversalRoot(container, driver);
		const textPlan = universalPlan('object', { kind: 'text', value: 'hello' });
		const Text = defineUniversalComponent('object', () => universalValue(textPlan));

		expect(() => root.render(Text, undefined)).toThrow(/rejects primitive text children/);
		expect(container.commits).toHaveLength(0);
		expect(container.instanceCount).toBe(0);
	});
});

describe('mixed DOM and universal ownership', () => {
	it('preserves deliberate null and undefined values across a DOM context bridge', () => {
		for (const theme of [null, undefined]) {
			const { container, root } = objectRoot();
			const plan = universalPlan('object', {
				kind: 'host',
				type: 'node',
				bindings: [['theme', 0]],
			});
			const Child = defineUniversalComponent('object', () =>
				universalValue(plan, [useUniversalContext(UniversalTheme)]),
			);
			const mounted = mount(UniversalBoundaryFixture, {
				root,
				component: Child,
				childProps: {},
				theme,
				log: () => {},
				failAfterPrepare: false,
			});

			expect(Object.prototype.hasOwnProperty.call(container.children[0].props, 'theme')).toBe(true);
			expect(container.children[0].props.theme).toBe(theme);
			mounted.unmount();
		}
	});

	it('preserves context, ref/layout ordering, and parent-first teardown', () => {
		const { container, root } = objectRoot();
		const log: string[] = [];
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'node',
			bindings: [
				['theme', 0],
				['ref', 1],
			],
		});
		const Child = defineUniversalComponent('object', (props: { log: (entry: string) => void }) => {
			const theme = useUniversalContext(UniversalTheme);
			useUniversalLayoutEffect(() => {
				props.log(`object-layout:${theme}`);
				return () => props.log('object-cleanup');
			}, [props.log, theme]);
			const ref = (value: unknown) =>
				props.log(value === null ? 'object-ref:null' : `object-ref:${(value as any).type}`);
			return universalValue(plan, [theme, ref]);
		});

		const mounted = mount(UniversalBoundaryFixture, {
			root,
			component: Child,
			childProps: { log: (entry: string) => log.push(entry) },
			theme: 'dark',
			log: (entry: string) => log.push(entry),
			failAfterPrepare: false,
		});
		expect(container.children[0].props.theme).toBe('dark');
		expect(log).toEqual(['object-ref:node', 'object-layout:dark', 'dom-layout']);
		expect(container.commits).toHaveLength(1);

		log.length = 0;
		mounted.unmount();
		expect(log).toEqual(['dom-cleanup', 'object-cleanup', 'object-ref:null']);
		expect(container.children).toEqual([]);
	});

	it('routes render errors lexically and aborts a prepared sibling transaction', async () => {
		const { container, root } = objectRoot();
		const plan = universalPlan('object', { kind: 'host', type: 'node' });
		const Child = defineUniversalComponent('object', () => universalValue(plan));
		const prepare = root.prepare.bind(root);
		let captured: ReturnType<typeof root.prepare> | null = null;
		root.prepare = ((...args: Parameters<typeof root.prepare>) => {
			captured = prepare(...args);
			return captured;
		}) as typeof root.prepare;
		const mounted = mount(UniversalBoundaryFixture, {
			root,
			component: Child,
			childProps: {},
			theme: 'dark',
			log: () => {},
			failAfterPrepare: true,
		});

		expect(mounted.find('.caught').textContent).toBe('caught: later sibling failed');
		expect(container.commits).toHaveLength(0);
		expect(container.instanceCount).toBe(0);
		await Promise.resolve();
		expect(captured?.status).toBe('aborted');
		mounted.unmount();
		root.unmount();
	});

	it('releases initial boundary ownership when the universal child throws during prepare', () => {
		const { container, root } = objectRoot();
		const plan = universalPlan('object', { kind: 'host', type: 'node' });
		const Throw = defineUniversalComponent('object', () => {
			throw new Error('object render failed');
		});
		const failed = mount(UniversalBoundaryFixture, {
			root,
			component: Throw,
			childProps: {},
			theme: 'dark',
			log: () => {},
			failAfterPrepare: false,
		});
		expect(failed.find('.caught').textContent).toBe('caught: object render failed');
		expect(container.commits).toHaveLength(0);
		failed.unmount();

		const Safe = defineUniversalComponent('object', () => universalValue(plan));
		const recovered = mount(UniversalBoundaryFixture, {
			root,
			component: Safe,
			childProps: {},
			theme: 'dark',
			log: () => {},
			failAfterPrepare: false,
		});
		expect(container.commits).toHaveLength(1);
		recovered.unmount();
	});

	it('aborts a suspended initial boundary when its DOM owner is abandoned', async () => {
		const { container, root } = objectRoot();
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'node',
			bindings: [['value', 0]],
		});
		let resolve!: (value: string) => void;
		const pending = new Promise<string>((done) => {
			resolve = done;
		});
		const Suspends = defineUniversalComponent('object', () => universalValue(plan, [use(pending)]));
		const prepare = root.prepare.bind(root);
		let captured: ReturnType<typeof root.prepare> | null = null;
		root.prepare = ((...args: Parameters<typeof root.prepare>) => {
			captured = prepare(...args);
			return captured;
		}) as typeof root.prepare;

		const mounted = mount(UniversalBoundaryFixture, {
			root,
			component: Suspends,
			childProps: {},
			theme: 'dark',
			log: () => {},
			failAfterPrepare: true,
		});
		await Promise.resolve();
		expect(captured?.status).toBe('aborted');
		resolve('late');
		await pending;
		await Promise.resolve();
		await Promise.resolve();
		expect(container.commits).toHaveLength(0);
		expect(container.instanceCount).toBe(0);
		mounted.unmount();
		root.unmount();
	});

	it('retains suspended ownership for retry and tears it down when the retry errors', async () => {
		const { container, root } = objectRoot();
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'node',
			bindings: [['value', 0]],
		});
		let failRetry = false;
		let resolve!: (value: string) => void;
		const pending = new Promise<string>((done) => {
			resolve = done;
		});
		const SuspendsThenThrows = defineUniversalComponent('object', () => {
			if (failRetry) throw new Error('object retry failed');
			return universalValue(plan, [use(pending)]);
		});
		const Safe = defineUniversalComponent('object', () => universalValue(plan, ['safe']));

		const mounted = mount(UniversalBoundaryFixture, {
			root,
			component: SuspendsThenThrows,
			childProps: {},
			theme: 'dark',
			log: () => {},
			failAfterPrepare: false,
		});
		expect(container.commits).toHaveLength(0);
		expect(container.instanceCount).toBe(0);

		failRetry = true;
		resolve('ready');
		await pending;
		await Promise.resolve();
		await Promise.resolve();

		expect(mounted.find('.caught').textContent).toBe('caught: object retry failed');
		expect(container.commits).toHaveLength(0);
		expect(container.instanceCount).toBe(0);
		expect(() => root.render(Safe, undefined)).toThrow(/unmounted universal root/);
		mounted.unmount();
	});
});

describe('universal nested boundary ownership', () => {
	it('registers, replaces, removes, and tears down renderer event listeners', () => {
		const { container, root } = objectRoot();
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'mesh',
			propsSlot: 0,
		});
		const SceneWithEvent = defineUniversalComponent(
			'object',
			(props: { handler: ((payload: string) => void) | null }) =>
				universalValue(plan, [universalProps([['set', 'onPointerDown', props.handler]])]),
		);
		const log: string[] = [];

		root.render(SceneWithEvent, { handler: (payload) => log.push(`first:${payload}`) });
		const mesh = container.children[0];
		const firstCommand = container.commits[0].commands.find((command) => command.op === 'event');
		expect(firstCommand).toMatchObject({
			op: 'event',
			type: 'pointerdown',
			listener: { priority: 'discrete' },
		});
		container.dispatchEvent(mesh, 'pointerdown', 'one');

		root.render(SceneWithEvent, { handler: (payload) => log.push(`second:${payload}`) });
		const replacement = container.commits[1].commands.find((command) => command.op === 'event');
		expect(replacement).toMatchObject({
			op: 'event',
			listener: { id: (firstCommand as any).listener.id },
		});
		container.dispatchEvent(mesh.id, 'pointerdown', 'two');

		root.render(SceneWithEvent, { handler: null });
		expect(container.commits[2].commands).toContainEqual({
			op: 'event',
			id: mesh.id,
			type: 'pointerdown',
			listener: null,
		});
		expect(() => container.dispatchEvent(mesh, 'pointerdown', 'three')).toThrow(
			/no "pointerdown" listener/,
		);
		expect(log).toEqual(['first:one', 'second:two']);

		root.unmount();
		expect(() => container.dispatchEvent(mesh, 'pointerdown', 'four')).toThrow(
			/unknown event target/,
		);
	});

	it('keeps a caught error active until its reset callback retries the body', async () => {
		const { container, root } = objectRoot();
		const bodyPlan = universalPlan('object', {
			kind: 'host',
			type: 'body',
			bindings: [['value', 0]],
		});
		const catchPlan = universalPlan('object', {
			kind: 'host',
			type: 'catch',
			bindings: [['value', 0]],
		});
		let shouldThrow = true;
		let bodyAttempts = 0;
		let reset!: () => void;
		const Boundary = defineUniversalComponent('object', () =>
			universalTry(
				() => {
					bodyAttempts++;
					if (shouldThrow) throw new Error('broken');
					return universalValue(bodyPlan, ['ready']);
				},
				null,
				(error, retry) => {
					reset = retry;
					return universalValue(catchPlan, [(error as Error).message]);
				},
			),
		);

		root.render(Boundary, undefined);
		expect(container.children[0]).toMatchObject({ type: 'catch', props: { value: 'broken' } });
		expect(bodyAttempts).toBe(1);

		shouldThrow = false;
		root.render(Boundary, undefined);
		expect(container.children[0]).toMatchObject({ type: 'catch', props: { value: 'broken' } });
		expect(bodyAttempts).toBe(1);

		reset();
		await Promise.resolve();
		expect(container.children[0]).toMatchObject({ type: 'body', props: { value: 'ready' } });
		expect(bodyAttempts).toBe(2);
		root.unmount();
	});

	it('hides committed content beside a fallback and reconnects it after suspended work settles', async () => {
		const { container, root } = objectRoot();
		const primaryPlan = universalPlan('object', {
			kind: 'host',
			type: 'mesh',
			bindings: [
				['ref', 0],
				['value', 1],
			],
		});
		const fallbackPlan = universalPlan('object', {
			kind: 'host',
			type: 'fallback',
			bindings: [['value', 0]],
		});
		const log: string[] = [];
		const ref = (value: unknown) => log.push(value === null ? 'ref:null' : 'ref:mesh');
		let pending: Promise<string> | null = null;
		let resolve!: (value: string) => void;
		const Boundary = defineUniversalComponent('object', () =>
			universalTry(
				() => {
					const value = pending === null ? 'one' : use(pending);
					useUniversalLayoutEffect(
						() => {
							log.push(`layout:${value}`);
							return () => log.push(`cleanup:${value}`);
						},
						[value],
						Symbol.for('retained-layout'),
					);
					return universalValue(primaryPlan, [ref, value]);
				},
				() => universalValue(fallbackPlan, ['pending']),
			),
		);

		root.render(Boundary, undefined);
		const committed = container.children[0];
		expect(log).toEqual(['ref:mesh', 'layout:one']);
		expect(container.commits).toHaveLength(1);
		expect(container.instanceCount).toBe(1);

		pending = new Promise<string>((done) => {
			resolve = done;
		});
		const suspended = root.render(Boundary, undefined);
		expect(suspended.status).toBe('committed');
		expect(container.children[0]).toBe(committed);
		expect(container.children[0].props.value).toBe('one');
		expect(container.children[0].visible).toBe(false);
		expect(container.children[1]).toMatchObject({
			type: 'fallback',
			props: { value: 'pending' },
			visible: true,
		});
		expect(container.commits).toHaveLength(2);
		expect(container.instanceCount).toBe(2);
		expect(log).toEqual(['ref:mesh', 'layout:one', 'cleanup:one', 'ref:null']);

		resolve('two');
		await pending;
		await Promise.resolve();
		await Promise.resolve();
		expect(container.children[0]).toBe(committed);
		expect(container.children[0].props.value).toBe('two');
		expect(container.children[0].visible).toBe(true);
		expect(container.children).toHaveLength(1);
		expect(container.commits).toHaveLength(3);
		expect(container.instanceCount).toBe(1);
		expect(log).toEqual([
			'ref:mesh',
			'layout:one',
			'cleanup:one',
			'ref:null',
			'ref:mesh',
			'layout:two',
		]);
		root.unmount();
	});
});
