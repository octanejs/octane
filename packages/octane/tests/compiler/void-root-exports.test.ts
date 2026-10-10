import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseModule } from '../../src/compiler/parser.node.js';
import {
	analyzeCompiledModule,
	createOctaneCompiler,
	findVoidComponentExports,
} from '../../src/compiler/bundler.js';

const finalVoidExports = (source: string, id: string) =>
	analyzeCompiledModule(source, id)?.voidComponentExports ?? [];

describe('compiled component export contracts', () => {
	it('certifies component exports only while their lexical bindings keep the compiled contract', () => {
		const freeze = (value: any): any => {
			if (value && typeof value === 'object' && !Object.isFrozen(value)) {
				for (const child of Object.values(value)) freeze(child);
				Object.freeze(value);
			}
			return value;
		};
		for (const [tail, eligible] of [
			['App = () => "replacement";', false],
			['function replace() { App = () => "replacement"; }', false],
			['({App} = replacement);', false],
			['[App] = replacement;', false],
			['for (App of replacements) {}', false],
			['eval("App = () => 1");', false],
			['(eval as Function)("App = () => 1");', false],
			['function unrelated(App) { App = () => "unrelated"; }', true],
			['{ let App; App = () => "unrelated"; }', true],
			['try {} catch (App) { App = () => "unrelated"; }', true],
			['for (let App of replacements) { App = () => "unrelated"; }', true],
		] as const) {
			for (const exported of ['export function App()', 'export default function App()']) {
				const ast = freeze(
					parseModule(`${exported} @{ <main>first</main> }\n${tail}`, '/project/View.tsrx'),
				);
				expect(findVoidComponentExports(ast, '/project/View.tsrx')).toEqual(
					eligible ? [exported.includes('default') ? 'default' : 'App'] : [],
				);
			}
		}
	});
});

describe('final-code void component exports', () => {
	const compiler = createOctaneCompiler({ root: '/project' });
	const compileClient = (source: string, id: string) =>
		compiler.transform(source, id, {
			environment: 'client',
			dev: false,
			hmr: false,
			collectVoidComponentExports: true,
		}) as { code: string; voidComponentExports: string[] };

	it('re-proves every void export the compiler claims on its own client output', () => {
		const fixture = (name: string) =>
			readFileSync(resolve(import.meta.dirname, '../_fixtures', name), 'utf8');
		const sources: Record<string, string> = {
			// Warm-plan stamps around components that render imported children.
			'components.tsrx': fixture('components.tsrx'),
			// Setup-running initializers: scoped styles and event delegation.
			'clsx-class.tsrx': fixture('clsx-class.tsrx'),
			// Presentation-view stamps.
			'dom-presentation.tsrx': fixture('dom-presentation.tsrx'),
			// Anonymous default components, beside an authored `_default` binding.
			'anonymous-default-component.tsrx': fixture('anonymous-default-component.tsrx'),
			'anonymous-default-arrow-component.tsrx': fixture('anonymous-default-arrow-component.tsrx'),
			'Shapes.tsrx': `import { memo } from 'octane';
export function Plain() @{ <p>plain</p>; }
export default function Default() @{ <p>default</p>; }
function Local(props: { x: string }) @{ <p>{props.x as string}</p>; }
export const Memoized = memo(Local);
export function Branches({ x }: { x?: boolean }) {
	if (!x) return null;
	return <p>branch</p>;
}
export const Arrow = (props: { a: string }) => @{ <p>{props.a as string}</p>; };
export function Guarded({ x }: { x?: boolean }) @{ if (!x) return null; <p>guarded</p>; }
export function Value() { return <p>value</p>; }`,
		};
		for (const [name, source] of Object.entries(sources)) {
			const id = `/project/src/${name}`;
			const result = compileClient(source, id);
			const claims = result.voidComponentExports;
			expect(claims.length, name).toBeGreaterThan(0);
			// Adapters require both proofs, so the final-code check may accept more.
			expect(finalVoidExports(result.code, id), name).toEqual(expect.arrayContaining(claims));
		}
		expect(
			compileClient(sources['Shapes.tsrx'], '/project/src/Shapes.tsrx').voidComponentExports,
		).toEqual(['Plain', 'default', 'Memoized', 'Branches', 'Arrow', 'Guarded']);
		for (const name of [
			'anonymous-default-component.tsrx',
			'anonymous-default-arrow-component.tsrx',
		]) {
			expect(
				compileClient(sources[name], `/project/src/${name}`).voidComponentExports,
				name,
			).toEqual(['default']);
		}
	});

	it('follows transpiled output and rejects any export that can return a value', () => {
		const runtime = `import { __s, markWarm, memo } from 'octane';
import { bindPresentationView, delegateEvents } from 'octane/internal/client';\n`;
		for (const [body, expected] of [
			// ES5 lowering: \`var\` bindings, destructured parameters, and a
			// setup-running initializer printed as a called function expression.
			[
				`export var A = __s(function A(param, s) { var x = param.x; var cb = function () { return 1; }; });`,
				['A'],
			],
			[
				`export var A = function () { return delegateEvents(['click']), __s(markWarm(function A() {}, function () { return 1; })); }();`,
				['A'],
			],
			[`export const A = (() => (delegateEvents(['click']), function A() {}))();`, ['A']],
			[
				`export const A = bindPresentationView(function A() { 'use dom bindings'; }, 'd:1');`,
				['A'],
			],
			[`var Local = __s(function () {}); export var M = __s(memo(Local));`, ['M']],
			[`var D = __s(function D() {}); export default D;`, ['default']],
			[`export default function () {}`, ['default']],
			[`function A() {} export { A as B, A as default };`, ['B', 'default']],
			[`export const A = () => { if (x) return; };`, ['A']],
			[`export function A() { class X { m() { return 1; } } }`, ['A']],
			// Value returns, rebinding, and every unknown shape stay generic.
			[`export function A() { if (x) return null; }`, []],
			[`export const A = () => undefined;`, []],
			[`export async function A() {}`, []],
			[`export function* A() {}`, []],
			[`export var A = function () {}; A = () => 1;`, []],
			[`export var A = function () {}; { var A = () => 1; }`, []],
			[`export function A() {} function A() { return 1; }`, []],
			[`export var A = function () {}; eval('A = 1');`, []],
			[`export let A = function () {}; function replace() { A = 1; }`, []],
			[`export default function A() {} A = 1;`, []],
			[`import { __s as wrap } from './octane'; export const A = wrap(function () {});`, []],
			[`import { lazy } from 'octane'; export const A = lazy(function () {});`, []],
			[`export const A = memo(function () {}, () => true);`, []],
			[`export const A = markWarm(function () {});`, []],
			[`export const A = __s?.(function () {});`, []],
			[`export const A = __s(...[function () {}]);`, []],
			[`export const A = (function A() { return A; })();`, []],
			[`export const A = ((x) => x)(function () {});`, []],
			[`export const A = (() => { setup(); return function () {}; })();`, []],
			[`export const A = (() => function () {})(1);`, []],
			[`export { A } from './a';`, []],
			[`import { A } from './a'; export { A };`, []],
			[`var A = memo(B); var B = memo(A); export { A };`, []],
			[`export const A = (`, []],
		] as const) {
			expect(finalVoidExports(runtime + body, '/project/Final.js'), body).toEqual(expected);
		}
	});

	it('reads the value bindings a module imports', () => {
		expect(
			analyzeCompiledModule(
				`import Default, { Named, Other as Local, type Shape } from './a';
import * as all from './b';
import type { Gone } from './c';
import './side-effect';`,
				'/project/Entry.ts',
			)?.importBindings,
		).toEqual([
			{ local: 'Default', request: './a', imported: 'default' },
			{ local: 'Named', request: './a', imported: 'Named' },
			{ local: 'Local', request: './a', imported: 'Other' },
			{ local: 'all', request: './b', imported: '*' },
		]);
		expect(analyzeCompiledModule('import {', '/project/Entry.ts')).toBeNull();
	});
});
