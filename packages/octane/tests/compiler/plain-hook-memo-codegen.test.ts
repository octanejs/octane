import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { createOctaneCompiler } from '../../src/compiler/bundler.js';
import { slotHooks } from '../../src/compiler/slot-hooks.js';
import { decodeMappings } from '../_source-map.js';

const SOURCE = `import { useMemo } from 'octane';
export function useValue(value) { return useMemo(() => ({ value }), [value]); }`;

// The leading statements of `code` that correspond to `authored`, as syntax
// trees with each leaf's text (template quasis keep their raw escapes), so a
// reprint may change layout and optional semicolons but not the syntax.
function authoredShapes(code: string, authored: string) {
	const count = ts.createSourceFile('authored.ts', authored, ts.ScriptTarget.Latest).statements
		.length;
	const ast = ts.createSourceFile('output.ts', code, ts.ScriptTarget.Latest, true);
	function shape(node: ts.Node): unknown {
		const children: unknown[] = [];
		ts.forEachChild(node, (child) => {
			children.push(shape(child));
		});
		const kind = ts.SyntaxKind[node.kind];
		return children.length > 0 ? [kind, ...children] : `${kind} ${node.getText(ast)}`;
	}
	return ast.statements.slice(0, count).map(shape);
}

describe('plain-module memo compilation', () => {
	it.each([false, true])(
		'preserves parenthesized types with native fallback %s',
		(nativeFallback) => {
			const source = `import { useMemo } from 'octane';
${nativeFallback ? 'export type Preserve = <const T>(value: T) => T;' : ''}
export type StateAction<S> = S | ((previous: S) => S);
export function useValue(initial: boolean | (() => boolean), slot: symbol) {
  return useMemo(() => typeof initial === 'function' ? initial() : initial, [initial], slot);
}`;
			const out = slotHooks(source, 'parenthesized-types.ts', {
				manualSlots: true,
				inlineHookMemo: true,
			});
			expect(out).not.toBeNull();
			const compiled = ts.transpileModule(out!.code, {
				fileName: 'parenthesized-types.ts',
				reportDiagnostics: true,
				compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
			});
			expect(compiled.diagnostics).toEqual([]);
			const ast = ts.createSourceFile(
				'parenthesized-types.ts',
				out!.code,
				ts.ScriptTarget.Latest,
				true,
			);
			const action = ast.statements.find(
				(statement): statement is ts.TypeAliasDeclaration =>
					ts.isTypeAliasDeclaration(statement) && statement.name.text === 'StateAction',
			)!;
			expect(ts.isUnionTypeNode(action.type)).toBe(true);
			if (ts.isUnionTypeNode(action.type)) {
				expect(ts.isParenthesizedTypeNode(action.type.types[1])).toBe(true);
			}
		},
	);

	it('preserves the TypeScript module surface and emits an authored source map', () => {
		const source = `/** @jsxImportSource octane */
import { useMemo } from 'octane';
export interface Bag { [key: string]: number; }
export type Pair<A, B> = { a: A; b: B };
export enum Choice { First, Second = 4 }
class Box<T> { constructor(readonly value: T) {} }
export const widen = <T>(value: T): T => value;
export const useArrow = <T>(value: T) => useMemo(() => value, [value]);
export function useValue<T>(value: T) {
  return useMemo(() => new Box(value), [value]);
}`;
		const out = slotHooks(source, 'typed-hook.ts', { inlineHookMemo: true });
		expect(out).not.toBeNull();
		expect(out!.map).toMatchObject({
			version: 3,
			sources: ['typed-hook.ts'],
			sourcesContent: [source],
		});
		expect(out!.code).toContain('/** @jsxImportSource octane */');
		const ast = ts.createSourceFile('typed-hook.ts', out!.code, ts.ScriptTarget.Latest, true);
		expect(ast.statements.some(ts.isInterfaceDeclaration)).toBe(true);
		expect(ast.statements.some(ts.isTypeAliasDeclaration)).toBe(true);
		expect(ast.statements.some(ts.isEnumDeclaration)).toBe(true);
		const useValue = ast.statements.find(
			(statement): statement is ts.FunctionDeclaration =>
				ts.isFunctionDeclaration(statement) && statement.name?.text === 'useValue',
		);
		expect(useValue?.typeParameters?.[0].name.text).toBe('T');
		const originalLine = source.split('\n').findIndex((line) => line.includes('new Box(value)'));
		expect(
			decodeMappings(out!.map.mappings)
				.flat()
				.some((segment) => segment[2] === originalLine),
		).toBe(true);
	});

	it('reprints syntax that a parent printer owns without changing it', () => {
		// esrap prints each of these node types from its parent's visitor:
		// template elements, import specifiers and attributes, switch cases,
		// catch clauses, and method overload signatures.
		const authored = `import { useMemo } from 'octane';
import format, * as formats from './format';
import data from './data.json' with { type: 'json' };
export { formatted } from './formatted' with { type: 'json' };
export * from './all' with { type: 'json' };
class Formatter {
  read(): string;
  read(value?: string) { return value ?? formats.fallback; }
}
function describe(kind: string, count: number): string {
  switch (kind) {
    case 'raw':
      return String.raw\`\\n\${count}\\u0041\`;
    default:
      try {
        return \`\${format(kind)}:\\t\${\`[\${count}]\`}\\\`\`;
      } catch (error: unknown) {
        return new Formatter().read(String(error ?? data));
      }
  }
}
type Key = \`key-\${string}-end\`;
`;
		const out = slotHooks(
			`${authored}export function useLabel(kind: Key, count: number) {
  return useMemo(() => describe(kind, count), [kind, count]);
}`,
			'parent-printed.ts',
			{ inlineHookMemo: true },
		);
		expect(out?.map).not.toBeNull();
		expect(authoredShapes(out!.code, authored)).toEqual(authoredShapes(authored, authored));
	});

	it.each([
		[
			'tagged template type arguments',
			`function tag<T>(strings: TemplateStringsArray, ...values: T[]) { return strings.raw.join(''); }
export const tagged = tag<number>\`a\${1}\`;`,
		],
		['a global augmentation', 'declare global { interface Window { label: string } }'],
		['an empty type-only import', "import type {} from './globals';"],
		[
			'a non-null assertion inside an optional chain',
			'export const read = (box?: { item?: { label: string } }) => box?.item!.label;',
		],
		[
			'a static override method',
			`class Base { static read() { return 1; } }
export class Derived extends Base { static override read() { return 2; } }`,
		],
		[
			'an abstract method with an accessibility',
			'export abstract class Shape { protected abstract area(): number; }',
		],
		[
			'object method type parameters',
			'export const box = { wrap<T>(value: T) { return [value]; } };',
		],
		['an array pattern annotation', 'export const first = ([head]: number[]) => head;'],
		[
			'a generic superclass before a line-broken body',
			'class Base<T> { value?: T; }\nexport class Box<T>\n\textends Base<T>\n{}',
		],
		[
			'a cast assignment target',
			'export function clear(ref: { current: number }) { (ref.current as unknown) = undefined; }',
		],
		[
			'a cast update target',
			'export function bump(ref: { current: unknown }) { (ref.current as number)++; }',
		],
		[
			'a cast destructuring default target',
			'export function fill(ref: { current?: number }) { [(ref.current as number) = 1] = []; }',
		],
	])('keeps %s intact beside an inlined memo', (_label, syntax) => {
		const authored = `import { useMemo } from 'octane';\n${syntax}\n`;
		const out = slotHooks(
			`${authored}export function useValue(value) { return useMemo(() => ({ value }), [value]); }`,
			'misprinted.ts',
			{ inlineHookMemo: true },
		);
		expect(out).not.toBeNull();
		expect(authoredShapes(out!.code, authored)).toEqual(authoredShapes(authored, authored));
	});

	it('inlines memos beside non-null assertions that leave optional chains intact', () => {
		for (const expression of [
			'box!.item?.label',
			'box?.item.label!',
			'box?.item!?.label',
			'(box?.item)!.label',
		]) {
			const source = `import { useMemo } from 'octane';
export const read = (box?: { item: { label?: string } }) => ${expression};
export function useValue(value) { return useMemo(() => ({ value }), [value]); }`;
			expect(slotHooks(source, 'non-null-chain.ts', { inlineHookMemo: true })?.map).not.toBeNull();
		}
	});

	it('keeps the direct slot pass surgical unless memo lowering is requested', () => {
		expect(slotHooks(SOURCE, 'use-value.ts')).toEqual(
			slotHooks(SOURCE, 'use-value.ts', { inlineHookMemo: false }),
		);
		expect(slotHooks(SOURCE, 'use-value.ts')?.map).toBeNull();
	});

	it('keeps development, server, profiling, and universal modules on their existing paths', () => {
		for (const mode of [
			{ hmr: true },
			{ dev: true },
			{ profile: true },
			{ environment: 'server' as const },
			{ renderer: { target: 'universal' } },
			{ universalRuntime: 'universal' },
		]) {
			expect(slotHooks(SOURCE, 'use-value.ts', { ...mode, inlineHookMemo: true })).toEqual(
				slotHooks(SOURCE, 'use-value.ts', { ...mode, inlineHookMemo: false }),
			);
		}
	});

	it('retains parallel use and disposable-root specialization', () => {
		const sources = [
			{
				source: `import { use, useMemo } from 'octane';
					export function useValue(load, id) {
						const key = useMemo(() => id, [id]);
						const first = use(load(key));
						const second = use(load(key + 1));
						return [first, second];
					}`,
				options: {},
			},
			{
				source: `import { createRoot, useMemo } from 'octane';
					import App from './App.tsrx';
					export function useValue(value) { return useMemo(() => value, [value]); }
					createRoot(document.body).render(App);`,
				options: { isVoidComponentImport: () => true },
			},
		];
		for (const { source, options } of sources) {
			expect(slotHooks(source, 'preserved.ts', { ...options, inlineHookMemo: true })).toEqual(
				slotHooks(source, 'preserved.ts', { ...options, inlineHookMemo: false }),
			);
		}
	});

	it.each([false, true])(
		'does not infer dependencies in a manually slotted module (inline=%s)',
		(inlineHookMemo) => {
			const source = `import { useMemo } from 'octane';
const slot = Symbol('value');
function makeFactory(value) { return () => value; }
export function useValue(value) {
  const always = useMemo(makeFactory(value));
  return useMemo(() => always, [always], slot);
}`;
			const out = slotHooks(source, 'manual.ts', { manualSlots: true, inlineHookMemo });
			expect(out).not.toBeNull();
			if (inlineHookMemo) expect(out!.map).not.toBeNull();
			else expect(out!.map).toBeNull();
			const ast = ts.createSourceFile('manual.ts', out!.code, ts.ScriptTarget.Latest, true);
			const omitted: ts.CallExpression[] = [];
			function visit(node: ts.Node) {
				if (
					ts.isCallExpression(node) &&
					ts.isIdentifier(node.expression) &&
					node.expression.text === 'useMemo' &&
					node.arguments.length === 1
				) {
					omitted.push(node);
				}
				ts.forEachChild(node, visit);
			}
			visit(ast);
			expect(omitted).toHaveLength(1);
		},
	);

	it('retains factories and owners whose execution scope cannot be inlined', () => {
		for (const body of [
			`return useMemo(function named() { return [this, arguments, named]; }, [value]);`,
			`eval('value'); return useMemo(() => value, [value]);`,
			`'worklet'; return useMemo(() => value, [value]);`,
			`return consume(useMemo(() => { const next = value + 1; return next; }, [value]));`,
			`return useMemo((input) => input, [value]);`,
			`return useMemo(async () => value, [value]);`,
			`return class { value = useMemo(() => value, [value]); };`,
		]) {
			const source = `import { useMemo } from 'octane'; export function useValue(value) { ${body} }`;
			expect(slotHooks(source, 'scope.ts', { inlineHookMemo: true })).toEqual(
				slotHooks(source, 'scope.ts', { inlineHookMemo: false }),
			);
		}
		const parameter = `import { useMemo } from 'octane';
			export function useValue(value = useMemo(() => 1, [])) { return value; }`;
		expect(slotHooks(parameter, 'parameter.ts', { inlineHookMemo: true })).toEqual(
			slotHooks(parameter, 'parameter.ts', { inlineHookMemo: false }),
		);
	});

	it('keeps memo factories that call an imported or module-declared custom hook', () => {
		// Each call gains a withSlot boundary before memo lowering, so the
		// boundary itself must still count as a hook inside the factory.
		for (const call of ['useImported(value)', 'useLocal(value)', 'useParameter(value)']) {
			const source = `import { useMemo, useState } from 'octane';
				import { useImported } from './hooks';
				function useLocal(value) { return useState(value)[0]; }
				export function useValue(value, useParameter) { return useMemo(() => ${call}, [value]); }`;
			expect(slotHooks(source, 'custom-hook-factory.ts', { inlineHookMemo: true })).toEqual(
				slotHooks(source, 'custom-hook-factory.ts', { inlineHookMemo: false }),
			);
		}
	});

	it("preserves memo calls throughout an opaque execution directive's subtree", () => {
		const source = `import { useMemo } from 'octane';
export function makeWorklet(value) {
  'worklet';
  function inner() { return useMemo(() => value, [value]); }
  class Nested { read() { return useMemo(() => value, [value]); } }
  return [inner, Nested];
}
export function useValue(value) { return useMemo(() => value, [value]); }`;
		const out = slotHooks(source, 'worklet.ts', { inlineHookMemo: true });
		expect(out?.map).not.toBeNull();
		const ast = ts.createSourceFile('worklet.ts', out!.code, ts.ScriptTarget.Latest, true);
		const functions = ast.statements.filter(ts.isFunctionDeclaration);
		const worklet = functions.find((node) => node.name?.text === 'makeWorklet');
		const ordinary = functions.find((node) => node.name?.text === 'useValue');
		function memoCalls(root: ts.Node | undefined) {
			let count = 0;
			function visit(node: ts.Node) {
				if (
					ts.isCallExpression(node) &&
					ts.isIdentifier(node.expression) &&
					node.expression.text === 'useMemo'
				) {
					count++;
				}
				ts.forEachChild(node, visit);
			}
			if (root) visit(root);
			return count;
		}
		const directive = worklet?.body?.statements[0];
		expect(
			directive && ts.isExpressionStatement(directive) && ts.isStringLiteral(directive.expression)
				? directive.expression.text
				: null,
		).toBe('worklet');
		expect(memoCalls(worklet)).toBe(2);
		expect(memoCalls(ordinary)).toBe(0);
	});

	it('keeps authored manual hook calls when memo optimization is disabled and honors the hard opt-out', () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-manual-memo-'));
		try {
			writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'app', private: true }));
			const packageRoot = join(root, 'packages', 'manual-binding');
			const sourceRoot = join(packageRoot, 'src');
			mkdirSync(sourceRoot, { recursive: true });
			writeFileSync(
				join(packageRoot, 'package.json'),
				JSON.stringify({
					name: '@example/manual-binding',
					dependencies: { octane: '*' },
					octane: { hookSlots: { manual: ['src'] } },
				}),
			);
			const source = `import { useMemo, useState } from 'octane';
				const stateSlot = Symbol('state');
				const memoSlot = Symbol('memo');
				export function useValue(value) {
					const [state] = useState(value, stateSlot);
					return useMemo(() => state, [state], memoSlot);
				}`;
			const id = join(sourceRoot, 'use-value.ts');
			const compiler = createOctaneCompiler({ root });
			const enabled = compiler.transform(source, id);
			expect(enabled?.map).not.toBeNull();
			const optedOut = `// octane-no-slot\n${source}`;
			expect(compiler.transform(optedOut, id)?.code ?? optedOut).toBe(optedOut);
			for (const mode of [
				{ inlineHookMemo: false },
				{ dev: true },
				{ hmr: true },
				{ environment: 'server' as const },
			]) {
				const output = compiler.transform(source, id, mode);
				expect(output?.map).toBeNull();
				const ast = ts.createSourceFile(id, output!.code, ts.ScriptTarget.Latest, true);
				const calls: Array<[string, number, string]> = [];
				function visit(node: ts.Node) {
					if (
						ts.isCallExpression(node) &&
						ts.isIdentifier(node.expression) &&
						(node.expression.text === 'useState' || node.expression.text === 'useMemo')
					) {
						calls.push([
							node.expression.text,
							node.arguments.length,
							node.arguments.at(-1)!.getText(ast),
						]);
					}
					ts.forEachChild(node, visit);
				}
				visit(ast);
				expect(calls).toEqual([
					['useState', 2, 'stateSlot'],
					['useMemo', 3, 'memoSlot'],
				]);
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
