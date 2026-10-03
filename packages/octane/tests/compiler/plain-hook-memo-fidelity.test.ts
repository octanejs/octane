// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { transformSync } from 'esbuild';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { parseModule } from '@tsrx/core';
import { createPlainProgramPrinter } from '../../src/compiler/plain-hook-memo.js';

// Production client builds reprint plain `.ts`/`.js` hook modules through
// esrap (plain-hook-memo.js), so a printer gap changes only production output.
// Every Octane module of the repository's packages that the printer admits must
// reprint to the same TypeScript syntax tree and parse under TypeScript and
// esbuild. A new esrap gap, or an upgrade that opens one, fails here.

const PACKAGES = join(import.meta.dirname, '../../..');

const packages = readdirSync(PACKAGES).filter((name) => existsSync(join(PACKAGES, name, 'src')));

function modules(name: string) {
	const root = join(PACKAGES, name, 'src');
	return readdirSync(root, { recursive: true, encoding: 'utf8' })
		.filter(
			(path) => /\.[jt]s$/.test(path) && !path.endsWith('.d.ts') && !path.includes('node_modules'),
		)
		.map((path) => join(root, path));
}

const KEPT_FLAGS =
	ts.NodeFlags.Let |
	ts.NodeFlags.Const |
	ts.NodeFlags.Using |
	ts.NodeFlags.AwaitUsing |
	ts.NodeFlags.Namespace |
	ts.NodeFlags.GlobalAugmentation |
	ts.NodeFlags.OptionalChain;

type Keyword = {
	operator?: unknown;
	token?: unknown;
	isTypeOnly?: unknown;
	keywordToken?: unknown;
};

function head(node: ts.Node) {
	const keyword = node as ts.Node & Keyword;
	return [
		ts.SyntaxKind[node.kind],
		node.flags & KEPT_FLAGS,
		keyword.operator,
		keyword.token,
		keyword.isTypeOnly,
		keyword.keywordToken,
	].join(':');
}

const STATEMENT_LISTS = new Set([
	ts.SyntaxKind.SourceFile,
	ts.SyntaxKind.Block,
	ts.SyntaxKind.ModuleBlock,
	ts.SyntaxKind.CaseClause,
	ts.SyntaxKind.DefaultClause,
]);

const PROPERTY_ASSIGNMENT = `${ts.SyntaxKind[ts.SyntaxKind.PropertyAssignment]}:0::::`;

// The syntax tree without what printing may legitimately change: parentheses,
// `{ a }` for `{ a: a }`, `export { a }` for `export { a as a }`, and empty
// statements in a statement list. Keywords that are not child nodes remain.
function shape(node: ts.Node): unknown {
	if (ts.isParenthesizedExpression(node)) return shape(node.expression);
	if (ts.isParenthesizedTypeNode(node)) return shape(node.type);
	if (ts.isShorthandPropertyAssignment(node) && node.objectAssignmentInitializer === undefined) {
		const name = shape(node.name);
		return [PROPERTY_ASSIGNMENT, name, name];
	}
	const children: unknown[] = [];
	ts.forEachChild(
		node,
		(child) => {
			if (
				ts.isExportSpecifier(node) &&
				child === node.propertyName &&
				ts.isIdentifier(child) &&
				child.text === node.name.text
			) {
				return;
			}
			children.push(shape(child));
		},
		(list) => {
			for (const child of list) {
				if (!(ts.isEmptyStatement(child) && STATEMENT_LISTS.has(node.kind))) {
					children.push(shape(child));
				}
			}
		},
	);
	if (children.length > 0) return [head(node), ...children];
	const leaf = node as ts.Node & { rawText?: string; text?: string };
	return leaf.rawText ?? leaf.text ?? head(node);
}

function parse(code: string, file: string) {
	const source = ts.createSourceFile(
		file,
		code,
		ts.ScriptTarget.Latest,
		false,
		file.endsWith('.js') ? ts.ScriptKind.JS : ts.ScriptKind.TS,
	);
	const { parseDiagnostics } = source as unknown as { parseDiagnostics: readonly ts.Diagnostic[] };
	return { errors: parseDiagnostics.length, tree: JSON.stringify(shape(source)) };
}

describe('plain-module printer fidelity', () => {
	it.each(packages)(
		'reprints every Octane module of packages/%s/src that it admits unchanged',
		(name) => {
			const failures: string[] = [];
			for (const file of modules(name)) {
				const source = readFileSync(file, 'utf8');
				// Only a module that imports Octane reaches the printer.
				if (!source.includes('octane')) continue;
				let ast;
				try {
					ast = parseModule(source, file);
				} catch (error) {
					// The plain pass keeps such a module on its surgical path.
					if (error instanceof SyntaxError) continue;
					throw error;
				}
				const printed = createPlainProgramPrinter(ast)?.(ast, source, file);
				if (!printed) continue;
				const authored = parse(source, file);
				if (authored.errors > 0) continue;
				const output = parse(printed.code, file);
				const path = file.slice(PACKAGES.length + 1);
				if (output.errors > 0) failures.push(`${path}: TypeScript cannot parse the output`);
				else if (output.tree !== authored.tree) failures.push(`${path}: syntax tree changed`);
				try {
					transformSync(printed.code, { loader: file.endsWith('.js') ? 'js' : 'ts' });
				} catch {
					failures.push(`${path}: esbuild cannot parse the output`);
				}
			}
			expect(failures).toEqual([]);
		},
		60_000,
	);
});
