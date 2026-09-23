import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { parseAst } from 'vite';
import { compile } from 'octane/compiler';
import { evaluateCompiledFixtureCode } from '../_server-fixture.js';

// `.tsrx` output is never TS-transformed after Octane, so TypeScript
// declarations with runtime semantics (enum, value namespace, import alias,
// parameter property) must be lowered by the compiler itself. Each module
// below is compiled by Octane and by tsc; both must parse as plain JavaScript
// under the bundler's own parser and produce identical runtime values.

const ID = '/src/Lowering.tsrx';

function octaneResult(source: string, mode: 'client' | 'server') {
	const { code } = compile(source, ID, { mode, hmr: false });
	// Rolldown's parser is what rejected `enum` in a real `vite build`.
	expect(() => parseAst(code, { lang: 'js' })).not.toThrow();
	return evaluateCompiledFixtureCode(code, ID, mode, undefined).result;
}

function tscResult(source: string) {
	const { outputText } = ts.transpileModule(source, {
		fileName: 'module.ts',
		compilerOptions: {
			module: ts.ModuleKind.ESNext,
			target: ts.ScriptTarget.ES2022,
			// The ES2022 default; Octane keeps class fields as native fields.
			useDefineForClassFields: true,
			preserveConstEnums: true,
		},
	});
	return evaluateCompiledFixtureCode(outputText, ID, 'client', undefined).result;
}

// Enum objects compare by own-key order too (reverse mappings are observable).
function snapshot(value: unknown): unknown {
	if (value === null || typeof value !== 'object') return value;
	return Object.entries(value).map(([key, entry]) => [key, snapshot(entry)]);
}

const CASES: Record<string, string> = {
	'numeric auto-increment with reverse mapping': `
		enum Direction { Up, Down, Left = 10, Right }
		export const result = Direction;
	`,
	'string, computed, and self-referencing members': `
		const seed = () => 40;
		enum Mixed {
			Str = 'str',
			Tpl = \`\${Str}-tpl\`,
			Bits = 1 << 3,
			Combo = Bits | 1,
			Neg = -Combo,
			Ref = Mixed.Bits * 2,
			Runtime = seed(),
			After = Runtime + 2,
			Quoted = Str + '!',
			'dash-key' = 7,
			NextAfterQuoted,
			Frac = 1 / 3,
			NotANumber = 0 / 0,
			Inf = 1 / 0,
			NegInf = -1 / 0,
		}
		export const result = Mixed;
	`,
	'const and merged enums': `
		const enum Flag { None = 0, Bold = 1 << 0, Italic = 1 << 1, Both = Bold | Italic }
		enum Merged { A = 1, B }
		enum Merged { C = B + 10, D }
		enum Other { X = Flag.Both * 100 }
		export const result = { Flag, Merged, Other };
	`,
	'enum declared in a function body': `
		enum Outer { S = 'outer', N = 3 }
		export function make() {
			enum Local { A = 'a', B = 'b', FromOuter = Outer.S, Next = Outer.N + 1 }
			return Local;
		}
		export const result = make();
	`,
	'value namespaces with exports, locals, and nesting': `
		namespace Geometry {
			export const unit = 10;
			export let mutable = 1;
			export function scale(n: number) { mutable++; return n * unit; }
			const local = unit + 1;
			export class Point { constructor(public x = local) {} }
			export namespace Labels { export const prefix = 'geo:' + unit; }
			export enum Axis { X, Y }
			export function shorthand() { return { unit, mutable }; }
			function assign() { mutable = 99; }
			export function reset() { assign(); return mutable; }
		}
		namespace Geometry {
			export const doubled = scale(2);
			export const labelled = Labels.prefix + Axis[1];
			export const point = new Point().x;
		}
		export const result = {
			unit: Geometry.unit,
			doubled: Geometry.doubled,
			labelled: Geometry.labelled,
			point: Geometry.point,
			shorthand: Geometry.shorthand(),
			reset: Geometry.reset(),
			mutable: Geometry.mutable,
			axis: Geometry.Axis,
		};
	`,
	'dotted namespace ids and function/namespace merging': `
		namespace A.B.C { export const deep = 'deep'; }
		namespace A.B { export const sibling = C.deep + '!'; }
		function tagged() { return 'fn'; }
		namespace tagged { export const tag = 'tag'; }
		export const result = { deep: A.B.C.deep, sibling: A.B.sibling, fn: tagged(), tag: tagged.tag };
	`,
	'type-only namespace members are erased inside value namespaces': `
		namespace Mixed {
			export interface Shape { size: number }
			export type Size = number;
			export namespace Types { export type T = string; }
			export declare const ambient: number;
			export const size: Size = 3;
		}
		export const result = { size: Mixed.size, keys: Object.keys(Mixed) };
	`,
	'import-equals aliases of namespace members': `
		namespace Source { export namespace Inner { export const value = 'aliased'; } }
		namespace TypesOnly { export interface Shape { size: number } }
		import Alias = Source.Inner;
		import Shape = TypesOnly.Shape;
		export const result = Alias.value;
	`,
	'parameter properties in base and derived classes': `
		class Base {
			constructor(public readonly name: string, protected count = 2) {}
			describe() { return this.name + ':' + this.count; }
		}
		class Derived extends Base {
			extra: string;
			constructor(name: string, private suffix: string) {
				'use strict';
				super(name, 5);
				this.extra = this.suffix + '!';
			}
			describe() { return super.describe() + ':' + this.suffix + ':' + this.extra; }
		}
		export const result = {
			base: Object.entries(new Base('b')),
			derived: Object.entries(new Derived('d', 's')),
			text: new Derived('d', 's').describe(),
		};
	`,
	'abstract members, overload signatures, and index signatures': `
		abstract class Shape {
			[key: string]: unknown;
			abstract area(): number;
			abstract readonly sides: number;
			describe(): string;
			describe(prefix?: string): string { return (prefix ?? '') + this.area(); }
		}
		class Square extends Shape {
			sides = 4;
			constructor(private size: number);
			constructor(private size: number) { super(); }
			area() { return this.size * this.size; }
		}
		export const result = { text: new Square(3).describe('a='), own: Object.keys(new Square(2)) };
	`,
};

describe('TypeScript runtime declarations lower to plain JavaScript', () => {
	for (const [name, source] of Object.entries(CASES)) {
		for (const mode of ['client', 'server'] as const) {
			it(`${name} (${mode})`, () => {
				expect(snapshot(octaneResult(source, mode))).toEqual(snapshot(tscResult(source)));
			});
		}
	}
});

describe('TypeScript runtime declarations without an ES module lowering', () => {
	const cases: Array<[string, string, string, number]> = [
		[
			'export assignment',
			'const value = 1;\nexport = value;',
			'OCTANE_TS_EXPORT_ASSIGNMENT_UNSUPPORTED',
			2,
		],
		[
			'import-equals require',
			"import dep = require('dep');\nexport const x = dep;",
			'OCTANE_TS_IMPORT_REQUIRE_UNSUPPORTED',
			1,
		],
		[
			'an auto-increment after a string member',
			"enum E {\n  A = 'a',\n  B,\n}",
			'OCTANE_TS_ENUM_INITIALIZER_REQUIRED',
			3,
		],
		[
			'a destructured namespace export',
			'namespace N {\n  export const { a } = { a: 1 };\n}',
			'OCTANE_TS_NAMESPACE_EXPORT_UNSUPPORTED',
			2,
		],
	];
	for (const [name, source, code, line] of cases) {
		for (const mode of ['client', 'server'] as const) {
			it(`rejects ${name} (${mode})`, () => {
				let error: any;
				try {
					compile(source, '/src/Rejected.tsrx', { mode, hmr: false });
				} catch (cause) {
					error = cause;
				}
				expect(error).toMatchObject({ code, loc: { line } });
				expect(error.message).toContain('Rejected.tsrx');
			});
		}
	}
});
