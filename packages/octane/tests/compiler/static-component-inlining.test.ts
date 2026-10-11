import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';

const filename = join(
	process.cwd(),
	'packages/octane/tests/_fixtures/static-component-composition.tsrx',
);
const source = readFileSync(filename, 'utf8');
const production = { dev: false, hmr: false };

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
	it.each(['client', 'server'] as const)(
		'prints paired JS provenance with authored component locations in %s output',
		(mode) => {
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
