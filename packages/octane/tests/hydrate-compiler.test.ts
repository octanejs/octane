import { parseModule } from '@tsrx/core';
import { describe, expect, it } from 'vitest';
import { createOctaneCompiler } from '../src/compiler/bundler.js';
import { compile } from '../src/compiler/compile.js';
import { decodeMappings } from './_source-map.js';

const ROOT = '/project';
const FILE = '/project/src/App.tsrx';

function compiler() {
	return createOctaneCompiler({ root: ROOT, hmr: false, dev: false });
}

function walkAst(root: unknown, visit: (node: any) => void) {
	const seen = new WeakSet<object>();
	const walk = (node: any) => {
		if (node === null || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) walk(child);
			return;
		}
		if (seen.has(node)) return;
		seen.add(node);
		visit(node);
		for (const [key, value] of Object.entries(node)) {
			if (key === 'loc' || key === 'metadata' || key === 'parent') continue;
			walk(value);
		}
	};
	walk(root);
}

function dynamicImports(code: string): Set<string> {
	const requests = new Set<string>();
	walkAst(parseModule(code, 'compiled.js'), (node) => {
		if (node.type === 'ImportExpression' && typeof node.source?.value === 'string') {
			requests.add(node.source.value);
		}
	});
	return requests;
}

function staticImportLocals(code: string, request: string): string[] {
	const declaration = parseModule(code, 'compiled.js').body.find(
		(node: any) => node.type === 'ImportDeclaration' && node.source?.value === request,
	) as any;
	return declaration?.specifiers.map((specifier: any) => specifier.local.name) ?? [];
}

function hasStaticImport(code: string, request: string): boolean {
	return parseModule(code, 'compiled.js').body.some(
		(node: any) => node.type === 'ImportDeclaration' && node.source?.value === request,
	);
}

function identifierCallCount(code: string, name: string): number {
	let count = 0;
	walkAst(parseModule(code, 'compiled.js'), (node) => {
		if (node.type === 'CallExpression' && node.callee?.type === 'Identifier') {
			if (node.callee.name === name) count++;
		}
	});
	return count;
}

function nodeTypeCount(code: string, type: string): number {
	let count = 0;
	walkAst(parseModule(code, 'compiled.js'), (node) => {
		if (node.type === type) count++;
	});
	return count;
}

function runtimeExports(code: string): Set<string> {
	const names = new Set<string>();
	for (const node of parseModule(code, 'compiled.js').body as any[]) {
		if (node.type === 'ExportDefaultDeclaration') {
			names.add('default');
			continue;
		}
		if (node.type !== 'ExportNamedDeclaration') continue;
		for (const specifier of node.specifiers ?? []) names.add(specifier.exported.name);
		const declaration = node.declaration;
		if (declaration?.id?.name) names.add(declaration.id.name);
		for (const item of declaration?.declarations ?? []) {
			if (item.id?.type === 'Identifier') names.add(item.id.name);
		}
	}
	return names;
}

function hasReExport(code: string, request: string): boolean {
	return (parseModule(code, 'compiled.js').body as any[]).some(
		(node) => node.type === 'ExportNamedDeclaration' && node.source?.value === request,
	);
}

function dynamicImportClosureIdentifiers(code: string): Set<string> {
	const owners = new Set<any>();
	const functionTypes = new Set([
		'ArrowFunctionExpression',
		'FunctionDeclaration',
		'FunctionExpression',
	]);
	const findOwners = (node: any, functions: any[]) => {
		if (node === null || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) findOwners(child, functions);
			return;
		}
		const nextFunctions = functionTypes.has(node.type) ? [...functions, node] : functions;
		if (node.type === 'ImportExpression' && nextFunctions.length > 0) {
			owners.add(nextFunctions.at(-1));
		}
		for (const [key, value] of Object.entries(node)) {
			if (key === 'loc' || key === 'metadata' || key === 'parent') continue;
			findOwners(value, nextFunctions);
		}
	};
	findOwners(parseModule(code, 'compiled.js'), []);

	const identifiers = new Set<string>();
	for (const owner of owners) {
		walkAst(owner, (node) => {
			if (node.type === 'Identifier') identifiers.add(node.name);
		});
	}
	return identifiers;
}

function identifierArrays(code: string): string[][] {
	const values: string[][] = [];
	walkAst(parseModule(code, 'compiled.js'), (node) => {
		if (
			node.type === 'ArrayExpression' &&
			node.elements.every((element: any) => element?.type === 'Identifier')
		) {
			values.push(node.elements.map((element: any) => element.name));
		}
	});
	return values;
}

function mappedOriginalPosition(code: string, map: any, needle: string) {
	const offset = code.lastIndexOf(needle);
	expect(offset).toBeGreaterThanOrEqual(0);
	const prefix = code.slice(0, offset).split('\n');
	const line = prefix.length - 1;
	const column = prefix.at(-1)!.length;
	let traced: number[] | null = null;
	for (const segment of decodeMappings(map.mappings)[line] ?? []) {
		if (segment[0] > column) break;
		if (segment.length > 1) traced = segment;
	}
	expect(traced).not.toBeNull();
	return { line: traced![2], column: traced![3] };
}

describe('Hydrate compiler splitting', () => {
	it('extracts aliased direct children, closes over local values, and leaves server children inline', () => {
		const source = `
import { Hydrate as Deferred } from 'octane';
import { visible } from 'octane/hydration';
import { Reviews } from './Reviews.tsrx';
const moduleValue = 'module';
export function App(props) @{
  const local = props.label;
  <main>
    <Deferred when={visible()} fallback={<p data-client-fallback="yes">loading</p>}>
      <section data-deferred-only={local}><Reviews label={moduleValue} /></section>
    </Deferred>
    <p>eager-only</p>
  </main>
}
`;
		const instance = compiler();
		const client = instance.transform(source, FILE, { environment: 'client' })!;
		expect(dynamicImports(client.code)).toEqual(new Set(['./App.tsrx?octane-hydrate=0']));
		expect(client.code).toContain('eager-only');
		expect(client.code).toContain('data-client-fallback');
		expect(client.code).not.toContain('data-deferred-only');
		expect(staticImportLocals(client.code, './Reviews.tsrx')).toEqual([]);
		expect(identifierArrays(client.code)).toContainEqual(['local']);
		const loaderIdentifiers = dynamicImportClosureIdentifiers(client.code);
		expect(loaderIdentifiers).not.toContain('local');
		expect(loaderIdentifiers).not.toContain('moduleValue');

		const child = instance.transform(source, `${FILE}?octane-hydrate=0`, {
			environment: 'client',
		})!;
		expect(child.code).toContain('data-deferred-only');
		expect(child.code).not.toContain('eager-only');
		expect(child.code).toContain("const moduleValue = 'module'");
		expect(staticImportLocals(child.code, './Reviews.tsrx')).toEqual(['Reviews']);
		expect(child.map.sourcesContent).toEqual([source]);

		const server = instance.transform(source, FILE, { environment: 'server' })!;
		expect(dynamicImports(server.code)).toEqual(new Set());
		expect(server.code).toContain('data-deferred-only');
		expect(server.code).toContain('eager-only');
		expect(server.code).not.toContain('data-client-fallback');
		expect(server.map.sourcesContent).toEqual([source]);
	});

	it('keeps imports in only the independently compiled slices that reference them', () => {
		const source = `
import { Hydrate } from 'octane';
import './eager-side-effect.css';
import { Eager, Deferred } from './widgets.tsrx';
export function App() @{
  <><Eager /><Hydrate when={gate}><Deferred /></Hydrate></>
}
`;
		const instance = compiler();
		const root = instance.transform(source, FILE, { environment: 'client' })!;
		expect(staticImportLocals(root.code, './widgets.tsrx')).toEqual(['Eager']);
		expect(hasStaticImport(root.code, './eager-side-effect.css')).toBe(true);

		const child = instance.transform(source, `${FILE}?octane-hydrate=0`, {
			environment: 'client',
		})!;
		expect(staticImportLocals(child.code, './widgets.tsrx')).toEqual(['Deferred']);
		expect(hasStaticImport(child.code, './eager-side-effect.css')).toBe(false);
	});

	it('moves same-module declarations and their dependencies into the split child', () => {
		const source = `
import { Hydrate } from 'octane';
import { reviewPrefix } from './review-data.js';
const formatReview = (label) => reviewPrefix + label;
function Reviews(props) @{ <button>{formatReview(props.label) as string}</button> }
export function App(props) @{
  <Hydrate when={gate}><Reviews label={props.label} /></Hydrate>
}
`;
		const instance = compiler();
		const root = instance.transform(source, FILE, { environment: 'client' })!;
		expect(hasStaticImport(root.code, './review-data.js')).toBe(false);
		expect(identifierArrays(root.code)).toContainEqual(['props']);

		const child = instance.transform(source, `${FILE}?octane-hydrate=0`, {
			environment: 'client',
		})!;
		expect(staticImportLocals(child.code, './review-data.js')).toEqual(['reviewPrefix']);
		expect(child.code).toContain('reviewPrefix + label');
	});

	it('keeps a same-module child eager when retained output also references it', () => {
		const source = `
import { Hydrate } from 'octane';
import { reviewPrefix } from './review-data.js';
function Reviews(props) @{ <button>{(reviewPrefix + props.label) as string}</button> }
export function App(props) @{
  <><Reviews label="eager" /><Hydrate when={gate}><Reviews label={props.label} /></Hydrate></>
}
`;
		const instance = compiler();
		const root = instance.transform(source, FILE, { environment: 'client' })!;
		expect(staticImportLocals(root.code, './review-data.js')).toEqual(['reviewPrefix']);

		const child = instance.transform(source, `${FILE}?octane-hydrate=0`, {
			environment: 'client',
		})!;
		expect(hasStaticImport(child.code, './review-data.js')).toBe(false);
		expect(identifierArrays(root.code)).toContainEqual(['Reviews', 'props']);
	});

	it('keeps dependent declarations eager when their module state is retained', () => {
		const source = `
import { Hydrate } from 'octane';
const reviewPrefix = 'review:';
const formatReview = (label) => reviewPrefix + label;
function Reviews(props) @{ <button>{formatReview(props.label) as string}</button> }
export function App(props) @{
  <><p>{reviewPrefix}</p><Hydrate when={gate}><Reviews label={props.label} /></Hydrate></>
}
`;
		const instance = compiler();
		const root = instance.transform(source, FILE, { environment: 'client' })!;
		expect(identifierArrays(root.code)).toContainEqual(['Reviews', 'props']);
	});

	it('keeps declarations eager when they depend on a retained public export', () => {
		const source = `
import { Hydrate } from 'octane';
export const reviewPrefix = 'review:';
const formatReview = (label) => reviewPrefix + label;
function Reviews(props) @{ <button>{formatReview(props.label) as string}</button> }
export function App(props) @{
  <Hydrate when={gate}><Reviews label={props.label} /></Hydrate>
}
`;
		const instance = compiler();
		const root = instance.transform(source, FILE, { environment: 'client' })!;
		expect(runtimeExports(root.code)).toEqual(new Set(['reviewPrefix', 'App']));
		expect(identifierArrays(root.code)).toContainEqual(['Reviews', 'props']);
	});

	it('keeps one module identity for declarations shared by sibling split children', () => {
		const source = `
import { Hydrate } from 'octane';
import { createReviews } from './review-data.js';
const Reviews = createReviews();
export function App() @{
  <>
    <Hydrate when={gate}><Reviews label="first" /></Hydrate>
    <Hydrate when={gate}><Reviews label="second" /></Hydrate>
  </>
}
`;
		const instance = compiler();
		const root = instance.transform(source, FILE, { environment: 'client' })!;
		expect(staticImportLocals(root.code, './review-data.js')).toEqual(['createReviews']);
		expect(identifierCallCount(root.code, 'createReviews')).toBe(1);
		expect(identifierArrays(root.code)).toContainEqual(['Reviews']);

		for (const path of ['0', '1']) {
			const child = instance.transform(source, `${FILE}?octane-hydrate=${path}`, {
				environment: 'client',
			})!;
			expect(hasStaticImport(child.code, './review-data.js')).toBe(false);
			expect(identifierCallCount(child.code, 'createReviews')).toBe(0);
		}
	});

	it('preserves authored public exports instead of moving their declarations', () => {
		const source = `
import { Hydrate } from 'octane';
export function Reviews(props) @{ <button>{props.label as string}</button> }
export function App(props) @{
  <Hydrate when={gate}><Reviews label={props.label} /></Hydrate>
}
`;
		const instance = compiler();
		const root = instance.transform(source, FILE, { environment: 'client' })!;
		expect(runtimeExports(root.code)).toEqual(new Set(['Reviews', 'App']));
		expect(identifierArrays(root.code)).toContainEqual(['Reviews', 'props']);

		const child = instance.transform(source, `${FILE}?octane-hydrate=0`, {
			environment: 'client',
		})!;
		expect(runtimeExports(child.code)).toEqual(new Set(['default']));
	});

	it('drops type-only edges while retaining value re-exports and deferred runtime imports', () => {
		const source = `
import { Hydrate } from 'octane';
import type { ReviewShape } from './review-types.js';
import { reviewPrefix, type RuntimeShape } from './review-data.js';
export { publicValue } from './public.js';
function Reviews(props: ReviewShape & RuntimeShape) @{
  <button>{(reviewPrefix + props.label) as string}</button>
}
export function App(props) @{
  <Hydrate when={gate}><Reviews label={props.label} /></Hydrate>
}
`;
		const instance = compiler();
		const root = instance.transform(source, FILE, { environment: 'client' })!;
		expect(hasStaticImport(root.code, './review-types.js')).toBe(false);
		expect(hasStaticImport(root.code, './review-data.js')).toBe(false);
		expect(hasReExport(root.code, './public.js')).toBe(true);

		const child = instance.transform(source, `${FILE}?octane-hydrate=0`, {
			environment: 'client',
		})!;
		expect(hasStaticImport(child.code, './review-types.js')).toBe(false);
		expect(staticImportLocals(child.code, './review-data.js')).toEqual(['reviewPrefix']);
		expect(hasReExport(child.code, './public.js')).toBe(false);
	});

	it('uses literal false as the only split opt-out', () => {
		const source = (split: string) => `
import { Hydrate } from 'octane';
export function App(enabled) @{
  <Hydrate when={gate} ${split}><span data-child="present" /></Hydrate>
}
`;
		const disabled = compiler().transform(source('split={false}'), FILE, {
			environment: 'client',
		})!;
		expect(dynamicImports(disabled.code)).toEqual(new Set());
		expect(disabled.code).toContain('data-child');

		const dynamic = compiler().transform(source('split={enabled}'), FILE, {
			environment: 'client',
		})!;
		expect(dynamicImports(dynamic.code)).toEqual(new Set(['./App.tsrx?octane-hydrate=0']));

		const defaulted = compiler().transform(source(''), FILE, { environment: 'client' })!;
		expect(dynamicImports(defaulted.code)).toEqual(new Set(['./App.tsrx?octane-hydrate=0']));
	});

	it('erases only the exact permanent-static descendant graph from the client', () => {
		const exact = `
import { Hydrate, Hydrate as StaticRange } from 'octane';
import { never as permanently } from 'octane/hydration';
import { StaticNavigation } from './StaticNavigation.tsrx';
export function App() @{
  <StaticRange split={false} when={permanently()}>
    <Hydrate when={gate}><StaticNavigation data-server-only="yes" /></Hydrate>
  </StaticRange>
}
`;
		const client = compiler().transform(exact, FILE, { environment: 'client' })!;
		expect(hasStaticImport(client.code, './StaticNavigation.tsrx')).toBe(false);
		expect(dynamicImports(client.code)).toEqual(new Set());
		expect(client.code).not.toContain('data-server-only');
		expect(client.code).toContain('__octanePermanentStatic');

		const server = compiler().transform(exact, FILE, { environment: 'server' })!;
		expect(hasStaticImport(server.code, './StaticNavigation.tsrx')).toBe(true);
		expect(server.code).toContain('data-server-only');
		expect(server.code).toContain('__octanePermanentStatic');

		const configured = `
import { Hydrate } from 'octane';
import { never } from 'octane/hydration';
import { StaticNavigation } from './StaticNavigation.tsrx';
export function App() @{
  <Hydrate split={false} when={never()} onHydrated={done}>
    <StaticNavigation data-server-only="yes" />
  </Hydrate>
}
`;
		const ordinary = compiler().transform(configured, FILE, { environment: 'client' })!;
		expect(hasStaticImport(ordinary.code, './StaticNavigation.tsrx')).toBe(true);
		expect(ordinary.code).toContain('data-server-only');
		expect(ordinary.code).not.toContain('__octanePermanentStatic');

		const empty = compiler().transform(
			`import { Hydrate } from 'octane'; import { never } from 'octane/hydration'; export function App() @{ <Hydrate split={false} when={never()} /> }`,
			FILE,
			{ environment: 'client' },
		)!;
		expect(dynamicImports(empty.code)).toEqual(new Set());
		expect(empty.code).toContain('__octanePermanentStatic');

		for (const inexact of [
			`import { Hydrate } from 'octane'; import { never } from 'octane/hydration'; import { StaticNavigation } from './StaticNavigation.tsrx'; export function App(options) @{ <Hydrate split={false} when={never()} {...options}><StaticNavigation data-server-only="yes" /></Hydrate> }`,
			`import { Hydrate } from 'octane'; import { never as importedNever } from 'octane/hydration'; import { StaticNavigation } from './StaticNavigation.tsrx'; export function App(importedNever) @{ <Hydrate split={false} when={importedNever()}><StaticNavigation data-server-only="yes" /></Hydrate> }`,
			`import { Hydrate } from 'octane'; import { never } from 'octane/hydration'; import { StaticNavigation } from './StaticNavigation.tsrx'; export function App() @{ <Hydrate split={false} when={never()} __static={true}><StaticNavigation data-server-only="yes" /></Hydrate> }`,
		]) {
			const retained = compiler().transform(inexact, FILE, { environment: 'client' })!;
			expect(hasStaticImport(retained.code, './StaticNavigation.tsrx')).toBe(true);
			expect(retained.code).toContain('data-server-only');
			expect(retained.code).not.toContain('__octanePermanentStatic');
		}
	});

	it('removes private declaration chains reachable only from a permanent-static range', () => {
		const source = `
import { Hydrate } from 'octane';
import { never } from 'octane/hydration';
import { StaticNavigation } from './StaticNavigation.tsrx';
function StaticLeaf() @{ <StaticNavigation data-server-only="leaf" /> }
function StaticShell() @{ <StaticLeaf /> }
function RetainedHelper() @{ <span data-client-retained="yes" /> }
export function App() @{
  <main>
    <Hydrate split={false} when={never()}><StaticShell /></Hydrate>
    <RetainedHelper />
  </main>
}
`;
		const client = compiler().transform(source, FILE, { environment: 'client' })!;
		expect(hasStaticImport(client.code, './StaticNavigation.tsrx')).toBe(false);
		expect(client.code).not.toContain('StaticLeaf');
		expect(client.code).not.toContain('StaticShell');
		expect(client.code).toContain('data-client-retained');

		const server = compiler().transform(source, FILE, { environment: 'server' })!;
		expect(hasStaticImport(server.code, './StaticNavigation.tsrx')).toBe(true);
		expect(server.code).toContain('data-server-only');

		const shared = source.replace('<RetainedHelper />', '<><StaticShell /><RetainedHelper /></>');
		const retained = compiler().transform(shared, FILE, { environment: 'client' })!;
		expect(hasStaticImport(retained.code, './StaticNavigation.tsrx')).toBe(true);
		expect(retained.code).toContain('data-server-only');

		const coupledInitializer = source.replace(
			'function StaticShell() @{ <StaticLeaf /> }',
			`const StaticShell = function StaticShell() @{ <StaticLeaf /> }, unrelated = observeClientModule();`,
		);
		const conservative = compiler().transform(coupledInitializer, FILE, {
			environment: 'client',
		})!;
		expect(conservative.code).toContain('observeClientModule');
		expect(hasStaticImport(conservative.code, './StaticNavigation.tsrx')).toBe(true);
	});

	it('preserves a permanent-static declaration graph exported by a later specifier', () => {
		const source = `
import { Hydrate } from 'octane';
import { never } from 'octane/hydration';
import { StaticNavigation } from './StaticNavigation.tsrx';
function StaticLeaf() @{ <StaticNavigation data-server-only="leaf" /> }
function StaticShell() @{ <StaticLeaf /> }
export { StaticShell as PublicStaticShell };
export function App() @{
  <Hydrate split={false} when={never()}><StaticShell /></Hydrate>
}
`;
		const client = compiler().transform(source, FILE, { environment: 'client' })!;
		expect(hasStaticImport(client.code, './StaticNavigation.tsrx')).toBe(true);
		expect(client.code).toContain('function StaticLeaf');
		expect(client.code).toContain('function StaticShell');
		expect(client.code).toContain('export { StaticShell as PublicStaticShell }');
	});

	it.each([
		['a TypeScript export assignment', 'export = StaticShell;'],
		['a runtime enum initializer', 'export enum RuntimeValue { value = StaticShell() }'],
		[
			'a runtime namespace initializer',
			'export namespace RuntimeValue { export const value = StaticShell }',
		],
		['a runtime export-import alias', 'export import RuntimeAlias = StaticShell.Member;'],
		[
			'a TypeScript parameter-property default',
			'export class Retained { constructor(public shell = StaticShell) {} }',
		],
		[
			'a parameter default before a body var',
			'export function Retained(value = StaticShell) { var StaticShell; return value }',
		],
		[
			'a use outside a nested class static-block var',
			'export function Retained() { class Local { static { var StaticShell } } return StaticShell }',
		],
		[
			'a declaration name observed through direct eval',
			"export function Retained() { return eval('StaticShell') }",
		],
	])('does not erase a declaration referenced by %s', (_name, retainedSource) => {
		const source = `
import { Hydrate } from 'octane';
import { never } from 'octane/hydration';
function StaticShell() { return <b /> }
${retainedSource}
function App() {
  return <Hydrate split={false} when={never()}><StaticShell /></Hydrate>;
}
`;
		const client = compiler().transform(source, FILE, { environment: 'client' })!;
		expect(client.code).toContain('function StaticShell');
		expect(client.code).toContain('__octanePermanentStatic');
	});

	it('erases an inner permanent-static graph from an ordinary split child', () => {
		const source = `
import { Hydrate } from 'octane';
import { never } from 'octane/hydration';
import { StaticNavigation } from './StaticNavigation.tsrx';
export function App() @{
  <Hydrate when={gate}>
    <section>
      <Hydrate split={false} when={never()}>
        <StaticNavigation data-server-only="yes" />
      </Hydrate>
    </section>
  </Hydrate>
}
`;
		const root = compiler().transform(source, FILE, { environment: 'client' })!;
		expect(dynamicImports(root.code)).toEqual(new Set(['./App.tsrx?octane-hydrate=0']));
		const child = compiler().transform(source, `${FILE}?octane-hydrate=0`, {
			environment: 'client',
		})!;
		expect(hasStaticImport(child.code, './StaticNavigation.tsrx')).toBe(false);
		expect(dynamicImports(child.code)).toEqual(new Set());
		expect(child.code).not.toContain('data-server-only');
	});

	it('derives stable nested paths from the original source', () => {
		const source = `
import { Hydrate as Deferred } from 'octane';
export function App(props) @{
  <Deferred when={gate}>
    <article data-outer={props.outer}>
      <Deferred when={gate}><strong data-inner={props.inner}>inner</strong></Deferred>
    </article>
  </Deferred>
}
`;
		const root = compiler().transform(source, FILE, { environment: 'client' })!;
		expect(dynamicImports(root.code)).toEqual(new Set(['./App.tsrx?octane-hydrate=0']));

		const outer = compiler().transform(source, `${FILE}?octane-hydrate=0`, {
			environment: 'client',
		})!;
		expect(outer.code).toContain('data-outer');
		expect(outer.code).not.toContain('data-inner');
		expect(dynamicImports(outer.code)).toEqual(new Set(['./App.tsrx?octane-hydrate=0.0']));

		const inner = compiler().transform(source, `${FILE}?octane-hydrate=0.0`, {
			environment: 'client',
		})!;
		expect(inner.code).toContain('data-inner');
		expect(dynamicImports(inner.code)).toEqual(new Set());
	});

	it('keeps nested splitting active through a split-disabled parent', () => {
		const source = `
import { Hydrate } from 'octane';
export function App() @{
  <>
    <Hydrate when={gate} split={false}>
      <Hydrate when={gate}><b data-nested="yes" /></Hydrate>
    </Hydrate>
    <Hydrate when={gate}><i data-sibling="yes" /></Hydrate>
  </>
}
`;
		const root = compiler().transform(source, FILE, { environment: 'client' })!;
		expect(dynamicImports(root.code)).toEqual(
			new Set(['./App.tsrx?octane-hydrate=0.0', './App.tsrx?octane-hydrate=1']),
		);
		expect(root.code).not.toContain('data-nested');
		expect(root.code).not.toContain('data-sibling');
	});

	it('can derive a queried child in a fresh compiler instance', () => {
		const source = `
import { Hydrate } from 'octane';
export function App(props) @{
  <Hydrate when={gate}><aside data-value={props.value}>deferred</aside></Hydrate>
}
`;
		const first = compiler().transform(source, `${FILE}?octane-hydrate=0`, {
			environment: 'client',
		})!;
		const fresh = compiler().transform(source, `${FILE}?octane-hydrate=0`, {
			environment: 'client',
		})!;
		expect(fresh.code).toBe(first.code);
		expect(fresh.map).toEqual(first.map);
	});

	it('applies the same root, query, and server preparation through compile()', () => {
		const source = `
import { Hydrate } from 'octane';
export function App(props) @{
  <Hydrate when={gate} fallback={<i data-fallback="client" />}>
    <aside data-direct-compile={props.value}>deferred</aside>
  </Hydrate>
}
`;
		const root = compile(source, '/src/App.tsrx', { hmr: false });
		expect(dynamicImports(root.code)).toEqual(new Set(['./App.tsrx?octane-hydrate=0']));
		expect(root.code).not.toContain('data-direct-compile');

		const child = compile(source, '/src/App.tsrx?octane-hydrate=0', { hmr: false });
		expect(child.code).toContain('data-direct-compile');
		expect(child.map.sourcesContent).toEqual([source]);

		const server = compile(source, '/src/App.tsrx', { mode: 'server' });
		expect(server.code).toContain('data-direct-compile');
		expect(server.code).not.toContain('data-fallback');
	});

	it('keeps composed child expression mappings anchored to authored source', () => {
		const source = `
import { Hydrate } from 'octane';
export function App(props) @{
  const local = props.label;
  <Hydrate when={gate}><span data-label={local}>mapped</span></Hydrate>
}
`;
		const child = compiler().transform(source, `${FILE}?octane-hydrate=0`, {
			environment: 'client',
		})!;
		const original = mappedOriginalPosition(child.code, child.map, 'local');
		expect(source.split('\n')[original.line]).toContain('data-label={local}');
		expect(original.column).toBe(source.split('\n')[original.line].indexOf('local'));
	});

	it('only recognizes direct static Hydrate imports and respects lexical shadowing', () => {
		const namespace = `
import * as Octane from 'octane';
export function App() @{ <Octane.Hydrate when={gate}><b>child</b></Octane.Hydrate> }
`;
		expect(
			dynamicImports(compiler().transform(namespace, FILE, { environment: 'client' })!.code),
		).toEqual(new Set());

		const indirect = `
import { Hydrate } from 'octane';
const Wrapped = Hydrate;
export function App() @{ <Wrapped when={gate}><b>child</b></Wrapped> }
`;
		expect(
			dynamicImports(compiler().transform(indirect, FILE, { environment: 'client' })!.code),
		).toEqual(new Set());

		const shadowed = `
import { Hydrate as Deferred } from 'octane';
export function App(Deferred) @{ <Deferred when={gate}><b>child</b></Deferred> }
`;
		expect(
			dynamicImports(compiler().transform(shadowed, FILE, { environment: 'client' })!.code),
		).toEqual(new Set());
	});

	it('preserves nested component hooks and ordinary-function receivers in split children', () => {
		const source = `
import { Hydrate, useState } from 'octane';
import { Renderer } from './Renderer.tsrx';
export function App() @{
  <Hydrate when={gate}>
    <Renderer
      component={function Inline() { const [value] = useState('ready'); return <span>{value}</span>; }}
      behavior={{ read() { return super.read(); } }}
    />
    <button onClick={function () { this.disabled = true; }}>go</button>
  </Hydrate>
}
`;
		const instance = compiler();
		const root = instance.transform(source, FILE, { environment: 'client' })!;
		expect(dynamicImports(root.code)).toEqual(new Set(['./App.tsrx?octane-hydrate=0']));
		expect(staticImportLocals(root.code, './Renderer.tsrx')).toEqual([]);

		const child = instance.transform(source, `${FILE}?octane-hydrate=0`, {
			environment: 'client',
		})!;
		expect(runtimeExports(child.code)).toEqual(new Set(['default']));
		expect(staticImportLocals(child.code, './Renderer.tsrx')).toEqual(['Renderer']);
		expect(identifierCallCount(child.code, 'useState')).toBeGreaterThan(0);
		expect(nodeTypeCount(child.code, 'ThisExpression')).toBeGreaterThan(0);
		expect(nodeTypeCount(child.code, 'Super')).toBeGreaterThan(0);
	});

	it('keeps scoped-style hashes identical across client and server compiles of a split module', () => {
		// Scope hashes are position-derived, and the client extraction and server
		// fallback strip shift a trailing <style> differently. The compiles must
		// agree on the emitted hash classes or every server-rendered scope class
		// hydration-mismatches.
		const source = `
import { Hydrate } from 'octane';
import { Reviews } from './Reviews.tsrx';
export function App() @{
  <section class="host">
    <Hydrate when={gate} fallback={<p>Loading</p>}>
      <Reviews />
    </Hydrate>
    <style>
      .host { color: red; }
    </style>
  </section>
}
`;
		const instance = compiler();
		const hashes = (code: string) => new Set(code.match(/tsrx-[0-9a-z]+/g) ?? []);
		const client = hashes(instance.transform(source, FILE, { environment: 'client' })!.code);
		const server = hashes(instance.transform(source, FILE, { environment: 'server' })!.code);
		expect(client.size).toBeGreaterThan(0);
		expect(client).toEqual(server);
	});

	it('keeps owning scoped styles while erasing permanent-static runtime children', () => {
		const source = `
import { Hydrate } from 'octane';
import { never } from 'octane/hydration';
import { StaticNavigation } from './StaticNavigation.tsrx';
export function App() @{
  <main class="host">
    <Hydrate split={false} when={never()}>
      <section class="static"><StaticNavigation /></section>
      <style>
        .host, .static { color: red; }
      </style>
    </Hydrate>
    <p class="live">Live sibling</p>
  </main>
}
`;
		const hashes = (code: string) => new Set(code.match(/tsrx-[0-9a-z]+/g) ?? []);
		const clientCode = compile(source, FILE, { hmr: false }).code;
		const serverCode = compile(source, FILE, { hmr: false, mode: 'server' }).code;
		expect(hasStaticImport(clientCode, './StaticNavigation.tsrx')).toBe(false);
		expect(clientCode).not.toContain('StaticNavigation');
		expect(clientCode).toContain('.host.tsrx-');
		expect(clientCode).toContain('live tsrx-');
		expect(hashes(clientCode).size).toBeGreaterThan(0);
		expect(hashes(clientCode)).toEqual(hashes(serverCode));
	});

	it.each([
		{
			code: 'OCTANE_HYDRATE_FUNCTION_CHILD',
			source: `import { Hydrate } from 'octane'; export function App() @{ <Hydrate when={gate}>{() => <b />}</Hydrate> }`,
		},
		{
			code: 'OCTANE_HYDRATE_DIRECT_HOOK',
			source: `import { Hydrate, useState as state } from 'octane'; export function App() @{ <Hydrate when={gate}>{state(0)}</Hydrate> }`,
		},
		{
			code: 'OCTANE_HYDRATE_THIS_CAPTURE',
			source: `import { Hydrate } from 'octane'; export function App() @{ <Hydrate when={gate}>{this.value}</Hydrate> }`,
		},
		{
			code: 'OCTANE_HYDRATE_SUPER_CAPTURE',
			source: `import { Hydrate } from 'octane'; class Base {} class App extends Base { render() { return <Hydrate when={gate}>{super.value}</Hydrate> } }`,
		},
		{
			code: 'OCTANE_HYDRATE_DIRECT_CHILDREN',
			source: `import { Hydrate } from 'octane'; export function App(child) @{ <Hydrate when={gate} children={child}></Hydrate> }`,
		},
		{
			code: 'OCTANE_HYDRATE_SPLIT_STYLE',
			source: `import { Hydrate } from 'octane'; export function App() @{ <Hydrate when={gate}><div class="x"><style>.x { color: red; }</style></div></Hydrate> }`,
		},
	])('reports unsupported extraction as $code', ({ source, code }) => {
		let thrown: any = null;
		try {
			compiler().transform(source, FILE, { environment: 'client' });
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toMatchObject({ code, filename: '/src/App.tsrx' });
		expect(thrown.message).toContain('split={false}');
	});

	it.each([
		{
			code: 'OCTANE_HYDRATE_THIS_CAPTURE',
			source: `import { Hydrate } from 'octane'; class App { render() { return <Hydrate when={gate}><button onClick={() => this.value} /></Hydrate> } }`,
		},
		{
			code: 'OCTANE_HYDRATE_SUPER_CAPTURE',
			source: `import { Hydrate } from 'octane'; class Base { read() {} } class App extends Base { render() { return <Hydrate when={gate}><button onClick={() => super.read()} /></Hydrate> } }`,
		},
	])('still reports lexical arrow capture as $code', ({ source, code }) => {
		let thrown: any = null;
		try {
			compiler().transform(source, FILE, { environment: 'client' });
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toMatchObject({ code, filename: '/src/App.tsrx' });
		expect(thrown.message).toContain('split={false}');
	});

	it('does not apply extraction diagnostics after the literal opt-out', () => {
		const source = `
import { Hydrate, useState as state } from 'octane';
export function App() @{
  <Hydrate when={gate} split={false}>{state(0)}</Hydrate>
}
`;
		expect(() => compiler().transform(source, FILE, { environment: 'client' })).not.toThrow();
	});

	it('permits scoped styles under split={false} and inside nested split-child functions', () => {
		// split={false} keeps children in the owning component, so its style
		// scope stays whole; a style nested in a function never joined that
		// scope, so extraction may move it freely.
		const optedOut = `import { Hydrate } from 'octane'; export function App() @{ <Hydrate when={gate} split={false}><div class="x"><style>.x { color: red; }</style></div></Hydrate> }`;
		expect(() => compiler().transform(optedOut, FILE, { environment: 'client' })).not.toThrow();
		const nested = `import { Hydrate } from 'octane'; import { Renderer } from './Renderer.tsrx'; export function App() @{ <Hydrate when={gate}><Renderer component={function Inline() @{ <div class="x"><style>.x { color: red; }</style></div> }} /></Hydrate> }`;
		expect(() => compiler().transform(nested, FILE, { environment: 'client' })).not.toThrow();
	});

	it('omits fallback work from safe server-only object spreads', () => {
		const source = `
import { Hydrate } from 'octane';
export function App() @{
  const singleUse = { when: gate, fallback: singleFallback(), label: 'single' };
  const shared = { when: gate, fallback: sharedFallback() };
  consume(shared);
  <>
    <Hydrate split={false} {...{ when: gate, fallback: inlineFallback(), label: 'inline' }}><b /></Hydrate>
    <Hydrate split={false} {...singleUse}><i /></Hydrate>
    <Hydrate split={false} {...shared}><u /></Hydrate>
    <Hydrate split={false} {...dynamicOptions()}><em /></Hydrate>
  </>
}
`;
		const client = compile(source, '/src/App.tsrx', { hmr: false });
		expect(identifierCallCount(client.code, 'inlineFallback')).toBe(1);
		expect(identifierCallCount(client.code, 'singleFallback')).toBe(1);
		expect(identifierCallCount(client.code, 'sharedFallback')).toBe(1);
		expect(identifierCallCount(client.code, 'dynamicOptions')).toBe(1);

		const server = compile(source, '/src/App.tsrx', { mode: 'server' });
		expect(identifierCallCount(server.code, 'inlineFallback')).toBe(0);
		expect(identifierCallCount(server.code, 'singleFallback')).toBe(0);
		expect(identifierCallCount(server.code, 'sharedFallback')).toBe(1);
		expect(identifierCallCount(server.code, 'dynamicOptions')).toBe(1);
	});
});
