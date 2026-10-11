import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';
import { createOctaneCompiler } from '../../src/compiler/bundler.js';
import { normalizeRendererConfig } from '../../src/compiler/renderers.js';

const filename = join(
	process.cwd(),
	'packages/octane/tests/_fixtures/static-component-composition.tsrx',
);
const source = readFileSync(filename, 'utf8');
const dynamicFilename = join(
	process.cwd(),
	'packages/octane/tests/_fixtures/dynamic-component-composition.tsrx',
);
const dynamicSource = readFileSync(dynamicFilename, 'utf8');
const wrapperFilename = join(
	process.cwd(),
	'packages/octane/tests/_fixtures/wrapper-component-composition.tsrx',
);
const wrapperSource = readFileSync(wrapperFilename, 'utf8');
const production = { dev: false, hmr: false };
const projectRenderers = {
	registry: {
		object: {
			module: '/src/object-renderer.js',
			server: 'client-only' as const,
			text: 'host' as const,
		},
	},
	boundaries: {
		'@scene/canvas': {
			Canvas: {
				ownerRenderer: 'dom',
				childRenderer: 'object',
				prop: 'children',
				server: 'omit-child' as const,
			},
		},
	},
};
const normalizedRenderers = normalizeRendererConfig(projectRenderers);
const boundaryOptions = {
	rendererBoundaries: normalizedRenderers.boundaries,
	rendererRegistry: normalizedRenderers.registry,
};

function annotations(code: string) {
	return Array.from(code.matchAll(/\/\*([\s\S]*?)\*\//g), (match) => match[1].trim())
		.filter((comment) => comment.startsWith('octane-inline '))
		.map((comment) => {
			const match = /^octane-inline (START|END) (shared .+)$/.exec(comment);
			expect(match, 'inline provenance is a paired shared-region annotation').not.toBeNull();
			return { boundary: match![1], region: match![2] };
		});
}

function position(text: string, needle: string) {
	const offset = text.indexOf(needle);
	expect(offset).toBeGreaterThanOrEqual(0);
	const prefix = text.slice(0, offset);
	return `${prefix.split('\n').length}:${offset - prefix.lastIndexOf('\n') - 1}`;
}

describe('static component inlining compiler artifacts', () => {
	it.each(
		(['client', 'server'] as const).flatMap((mode) => [
			{
				mode,
				name: 'keyed fixture',
				id: dynamicFilename,
				input: dynamicSource,
				components: ['Frame', 'Panel', 'Details', 'Label'],
			},
			{
				mode,
				name: 'template-literal caller',
				id: 'dynamic-string-components.tsrx',
				input: `function Label({ label }) @{ <span title={label}>before{label as string}after</span> }
function Entry({ label }) @{ <section><Label label={label}/></section> }
export function App(props) @{ <main><Entry label={\`\${props.read()}\`}/></main> }`,
				components: ['Label'],
			},
			...(mode === 'client'
				? [
						{
							mode,
							name: 'delegated component calls',
							id: wrapperFilename,
							input: wrapperSource,
							components: [
								'First',
								'Details',
								'Panel',
								'ResourceFrame',
								'ResourceDetails',
								'ResourcePanel',
							],
						},
					]
				: []),
			{
				mode,
				name: 'exported entry',
				id: 'exported-entry-components.tsrx',
				input: `import { useState } from 'octane';
function Child({ text }) @{ <div>{text}</div> }
export default function App() @{ <Child text="123"/> }`,
				components: ['Child'],
			},
		]),
	)(
		'preserves paired provenance and source maps for $name in $mode output',
		({ mode, id, input, components }) => {
			const previous = process.env.OCTANE_COMPILE_FROZEN_AST;
			try {
				process.env.OCTANE_COMPILE_FROZEN_AST = '1';
				const result = compile(input, id, { ...production, mode, inspect: true });
				const comments = annotations(result.code);
				const starts = comments.filter((entry) => entry.boundary === 'START');
				expect(starts.length).toBeGreaterThan(0);
				expect(
					comments
						.filter((entry) => entry.boundary === 'END')
						.map((entry) => entry.region)
						.sort(),
				).toEqual(starts.map((entry) => entry.region).sort());
				for (const name of components) {
					const origin = `${name} (${id}:${position(input, `function ${name}`)}; call `;
					expect(starts.some((entry) => entry.region.includes(origin))).toBe(true);
				}
				expect(result.map.sourcesContent).toContain(input);
				for (const template of result.inspect?.templates ?? []) {
					expect(template.html).not.toContain('octane-inline');
				}
				delete process.env.OCTANE_COMPILE_FROZEN_AST;
				const unfrozen = compile(input, id, { ...production, mode, inspect: true });
				expect(unfrozen.code).toBe(result.code);
				expect(unfrozen.map).toEqual(result.map);
			} finally {
				if (previous === undefined) delete process.env.OCTANE_COMPILE_FROZEN_AST;
				else process.env.OCTANE_COMPILE_FROZEN_AST = previous;
			}
		},
	);

	it('keeps ordinary forwarding bodies in server output', () => {
		const result = compile(wrapperSource, wrapperFilename, { ...production, mode: 'server' });
		expect(annotations(result.code)).toEqual([]);
		expect(result.map.sourcesContent).toContain(wrapperSource);
	});

	it.each([
		[
			'exported entry inputs despite a known local caller',
			`function Label({ label }) @{ <span>{label as string}</span> }
export function Entry({ label }) @{ <Label label={label}/> }
export function Known() @{ <Entry label="known"/> }`,
		],
		[
			'a TypeScript-only string assertion',
			`function Label({ label }: { label: string }) @{ <span title={label}>{label as string}</span> }
function Entry({ label }: { label: string }) @{ <section><Label label={label}/></section> }
export function App(props) @{ <Entry label={props.value as string}/> }`,
		],
		[
			'mixed proven and unknown entry calls',
			`function Label({ label }: { label: string }) @{ <span title={label}>{label as string}</span> }
function Entry({ label }: { label: string }) @{ <section><Label label={label}/></section> }
export function Proven(props) @{ <Entry label={\`\${props.value}\`}/> }
export function Unknown(props) @{ <Entry label={props.value as string}/> }`,
		],
		...[
			['a spread entry call', '<Entry {...props}/>'],
			['a missing entry field', '<Entry/>'],
			['a duplicate entry field', '<Entry label={`first`} label={`second`}/>'],
			['an entry key', '<Entry key="entry" label={`${props.value}`}/>'],
			['an entry ref', '<Entry ref={props.ref} label={`${props.value}`}/>'],
			['an entry children prop', '<Entry children="child" label={`${props.value}`}/>'],
			['an entry prototype prop', '<Entry __proto__="prototype" label={`${props.value}`}/>'],
		].map(
			([name, call]) =>
				[
					name,
					`function Label({ label }) @{ <span title={label}>{label as string}</span> }
function Entry({ label }) @{ <section><Label label={label}/></section> }
export function Proven(props) @{ <Entry label={\`\${props.value}\`}/> }
export function Unsupported(props) @{ ${call} }`,
				] as const,
		),
	] as const)('keeps dynamic component boundaries for %s', (_name, input) => {
		for (const mode of ['client', 'server'] as const) {
			const result = compile(input, 'unknown-string-components.tsrx', { ...production, mode });
			expect(annotations(result.code)).toEqual([]);
		}
	});

	it.each(
		(['client', 'server'] as const).flatMap((mode) => [
			{
				mode,
				configuration: 'registry alone',
				options: { rendererRegistry: normalizedRenderers.registry },
			},
			{ mode, configuration: 'unrelated boundaries', options: boundaryOptions },
		]),
	)('keeps ordinary DOM $mode output unchanged with $configuration', ({ mode, options }) => {
		const ordinary = compile(source, filename, { ...production, mode });
		const configured = compile(source, filename, { ...production, mode, ...options });
		expect(annotations(configured.code).some((entry) => entry.boundary === 'START')).toBe(true);
		expect(configured.code).toBe(ordinary.code);
		expect(configured.map).toEqual(ordinary.map);
	});

	it.each(['client', 'server'] as const)(
		'keeps ordinary DOM %s inlining when a configured boundary import is unused',
		(mode) => {
			const input = `import { Canvas } from '@scene/canvas';\n${source}`;
			const ordinary = compile(input, filename, { ...production, mode });
			const configured = compile(input, filename, { ...production, mode, ...boundaryOptions });
			expect(annotations(configured.code).some((entry) => entry.boundary === 'START')).toBe(true);
			expect(configured.code).toBe(ordinary.code);
			expect(configured.map).toEqual(ordinary.map);
		},
	);

	it('inlines ordinary DOM modules through a project compiler with global renderer boundaries', () => {
		const compiler = createOctaneCompiler({
			root: '/project',
			hmr: false,
			renderers: projectRenderers,
		});
		const result = compiler.transform(source, '/project/src/App.tsrx');
		expect(result).not.toBeNull();
		expect(annotations(result!.code).some((entry) => entry.boundary === 'START')).toBe(true);
	});

	it.each(['client', 'server'] as const)(
		'retains component boundaries when the %s module renders a configured boundary',
		(mode) => {
			const input = `import { Canvas } from '@scene/canvas';
function Label() @{ <span>label</span> }
function Card() @{ <section><Label/></section> }
export function App() @{ <main><Card/><Canvas><node/></Canvas></main> }`;
			const result = compile(input, '/src/CanvasPage.tsrx', {
				...production,
				mode,
				...boundaryOptions,
			});
			expect(annotations(result.code)).toEqual([]);
		},
	);

	it('retains component boundaries in an explicitly selected external renderer', () => {
		const input = `function Label() @{ <span>label</span> }
function Card() @{ <section><Label/></section> }
export function App() @{ <Card/> }`;
		const result = compile(input, '/src/Scene.object.tsrx', {
			...production,
			...boundaryOptions,
			renderer: { id: 'object', ...normalizedRenderers.registry.object },
		});
		expect(annotations(result.code)).toEqual([]);
	});

	it.each(['client', 'server'] as const)(
		'prints paired JS provenance with authored component locations in %s output',
		(mode) => {
			const previous = process.env.OCTANE_COMPILE_ASSERT_LOC;
			try {
				process.env.OCTANE_COMPILE_ASSERT_LOC = '1';
				const result = compile(source, filename, { ...production, mode, inspect: true });
				const comments = annotations(result.code);
				const starts = comments.filter((entry) => entry.boundary === 'START');
				const ends = comments.filter((entry) => entry.boundary === 'END');
				expect(starts.length).toBeGreaterThan(0);
				expect(ends.map((entry) => entry.region).sort()).toEqual(
					starts.map((entry) => entry.region).sort(),
				);
				for (const name of ['Frame', 'Panel', 'Details', 'Label']) {
					const origin = `${name} (${filename}:${position(source, `function ${name}`)}; call `;
					expect(starts.some((entry) => entry.region.includes(origin))).toBe(true);
				}
				expect(result.map.sourcesContent).toContain(source);
				for (const template of result.inspect?.templates ?? []) {
					expect(template.html).not.toContain('octane-inline');
				}
			} finally {
				if (previous === undefined) delete process.env.OCTANE_COMPILE_ASSERT_LOC;
				else process.env.OCTANE_COMPILE_ASSERT_LOC = previous;
			}
		},
	);

	it('lists distinct shared-template origins without repeating a reused child callsite', () => {
		const sharedSource = `function FirstLabel() @{ <span>same</span> }
function SecondLabel() @{ <span>same</span> }
function FirstInner() @{ <div><FirstLabel/></div> }
function SecondInner() @{ <div><SecondLabel/></div> }
function FirstCard() @{ <section><FirstInner/></section> }
function SecondCard() @{ <section><SecondInner/></section> }
function ThirdCard() @{ <section><FirstInner/></section> }
export function App() @{ <main><FirstCard/><SecondCard/><ThirdCard/></main> }`;
		const result = compile(sharedSource, 'shared-static-components.tsrx', production);
		const starts = annotations(result.code).filter((entry) => entry.boundary === 'START');
		const shared = starts.find(
			(entry) =>
				entry.region.startsWith('shared template ') &&
				entry.region.includes('FirstInner (shared-static-components.tsrx:') &&
				entry.region.includes('SecondLabel (shared-static-components.tsrx:'),
		);
		expect(shared).toBeDefined();
		const childOrigin = `FirstLabel (shared-static-components.tsrx:${position(sharedSource, 'function FirstLabel')}; call ${position(sharedSource, '<FirstLabel/>')})`;
		// The same authored FirstLabel call is reached through FirstCard and
		// ThirdCard. Its source location appears once, while both distinct calls
		// to FirstInner remain visible in the shared declaration's provenance.
		expect(shared!.region.split(childOrigin)).toHaveLength(2);
		const innerOrigins = Array.from(
			shared!.region.matchAll(
				/FirstInner \(shared-static-components\.tsrx:\d+:\d+; call (\d+:\d+)\)/g,
			),
			(match) => match[1],
		);
		const thirdPrefix = sharedSource.slice(0, sharedSource.indexOf('function ThirdCard'));
		const thirdCallLine = thirdPrefix.split('\n').length;
		const thirdCallColumn = sharedSource.split('\n')[thirdCallLine - 1].indexOf('<FirstInner/>');
		expect(innerOrigins).toEqual([
			position(sharedSource, '<FirstInner/>'),
			`${thirdCallLine}:${thirdCallColumn}`,
		]);
	});

	it('includes inline provenance with the default production compile options', () => {
		const comments = annotations(compile(source, filename).code);
		const starts = comments.filter((entry) => entry.boundary === 'START');
		expect(starts.length).toBeGreaterThan(0);
		expect(
			comments
				.filter((entry) => entry.boundary === 'END')
				.map((entry) => entry.region)
				.sort(),
		).toEqual(starts.map((entry) => entry.region).sort());
	});

	it.each([
		['development', { dev: true, hmr: false }],
		['HMR', { dev: true, hmr: 'vite' }],
		['profiling', { dev: false, hmr: false, profile: true }],
		['development server', { dev: true, hmr: false, mode: 'server' }],
	] as const)('retains authored component boundaries in %s compilation', (_name, options) => {
		const result = compile(source, filename, options);
		expect(annotations(result.code)).toEqual([]);
	});

	it.each(['client', 'server'] as const)(
		'keeps adopted parser trees immutable when composing %s templates',
		(mode) => {
			const previous = process.env.OCTANE_COMPILE_FROZEN_AST;
			try {
				process.env.OCTANE_COMPILE_FROZEN_AST = '1';
				const frozen = compile(source, filename, { ...production, mode });
				delete process.env.OCTANE_COMPILE_FROZEN_AST;
				const unfrozen = compile(source, filename, { ...production, mode });
				expect(frozen.code).toBe(unfrozen.code);
				expect(frozen.map).toEqual(unfrozen.map);
			} finally {
				if (previous === undefined) delete process.env.OCTANE_COMPILE_FROZEN_AST;
				else process.env.OCTANE_COMPILE_FROZEN_AST = previous;
			}
		},
	);

	it.each([
		[
			'imported component',
			`import {Label} from './label.tsrx';
function Card() @{ <div><Label/></div> }
export function App() @{ <Card/> }`,
		],
		[
			'exported declaration',
			`export function Label() @{ <span>label</span> }
function Card() @{ <div><Label/></div> }
export function App() @{ <Card/> }`,
		],
		[
			'exported child called directly by an exported entry',
			`export function Label({ label }) @{ <span>{label}</span> }
export default function App() @{ <Label label="known"/> }`,
		],
		[
			'exported alias',
			`function Label() @{ <span>label</span> }
export {Label};
function Card() @{ <div><Label/></div> }
export function App() @{ <Card/> }`,
		],
		[
			'escaping component identity',
			`function Label() @{ <span>label</span> }
export const components={Label};
function Card() @{ <div><Label/></div> }
export function App() @{ <Card/> }`,
		],
		[
			'dynamic property read',
			`function Label(props) @{ <span>{props.value as string}</span> }
function Card(props) @{ <div><Label value={props.value}/></div> }
export function App(props) @{ <Card value={props.value}/> }`,
		],
		[
			'hookful setup',
			`import {useState} from 'octane';
function Label() @{ const [value]=useState('label'); <span>{value as string}</span> }
function Card() @{ <div><Label/></div> }
export function App() @{ <Card/> }`,
		],
		[
			'scoped styles',
			`function Label() @{ <span>label</span> }
function Card() @{ <div><style>span {color: red}</style><Label/></div> }
export function App() @{ <Card/> }`,
		],
		[
			'native input setup',
			`function Label() @{ <input defaultValue="seed"/> }
function Card() @{ <div><Label/></div> }
export function App() @{ <Card/> }`,
		],
		[
			'boolean text assertion',
			`function Label(props) @{ <span>{props.value as string}</span> }
function Card() @{ <div><Label value={true}/></div> }
export function App() @{ <Card/> }`,
		],
		[
			'null text assertion',
			`function Label(props) @{ <span>{props.value as string}</span> }
function Card() @{ <div><Label value={null}/></div> }
export function App() @{ <Card/> }`,
		],
		[
			'direct eval',
			`function Label() @{ <span>label</span> }
function Card() @{ <div><Label/></div> }
export function App() @{ eval('void Label'); <Card/> }`,
		],
		[
			'TypeScript-instantiated direct eval',
			`function Label() @{ <span>label</span> }
function Card() @{ <div><Label/></div> }
export function App() @{ (eval<string>)('void Label'); <Card/> }`,
		],
		[
			'escaped direct eval identifier',
			`function Label() @{ <span>label</span> }
function Card() @{ <div><Label/></div> }
export function App() @{ \\u0065val('void Label'); <Card/> }`,
		],
		[
			'text-returning component',
			`function Label() { return 'right'; }
function Card() @{ <div>left<Label/>tail</div> }
export function App(props) @{ <section data-tick={props.tick}><Card/></section> }`,
		],
	] as const)('preserves the component boundary for %s', (_name, input) => {
		for (const mode of ['client', 'server'] as const) {
			const result = compile(input, 'ordinary-components.tsrx', { ...production, mode });
			expect(annotations(result.code)).toEqual([]);
		}
	});
});
