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

describe('plain-module memo compilation', () => {
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

	it('does not infer dependencies in a manually slotted module', () => {
		const source = `import { useMemo } from 'octane';
const slot = Symbol('value');
function makeFactory(value) { return () => value; }
export function useValue(value) {
  const always = useMemo(makeFactory(value));
  return useMemo(() => always, [always], slot);
}`;
		expect(slotHooks(source, 'manual.ts', { manualSlots: true, inlineHookMemo: false })).toBeNull();
		const out = slotHooks(source, 'manual.ts', { manualSlots: true, inlineHookMemo: true });
		expect(out?.map).not.toBeNull();
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
	});

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

	it('runs memo-only optimization for manual source packages and honors the hard opt-out', () => {
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
			expect(compiler.transform(source, id, { inlineHookMemo: false })?.code ?? source).toBe(
				source,
			);
			const optedOut = `// octane-no-slot\n${source}`;
			expect(compiler.transform(optedOut, id)?.code ?? optedOut).toBe(optedOut);
			for (const mode of [{ dev: true }, { hmr: true }, { environment: 'server' as const }]) {
				expect(compiler.transform(source, id, mode)?.code ?? source).toBe(source);
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
