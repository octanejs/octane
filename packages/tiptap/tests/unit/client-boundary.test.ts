/**
 * @vitest-environment node
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const entries = ['src/index.ts', 'src/menus/index.ts'];

describe('@octanejs/tiptap client module boundaries', () => {
	it.each(entries)('%s keeps the client directive as its first statement', (entry) => {
		const source = ts.createSourceFile(
			entry,
			readFileSync(resolve(import.meta.dirname, '../../', entry), 'utf8'),
			ts.ScriptTarget.Latest,
			false,
			ts.ScriptKind.TS,
		);
		const [firstStatement] = source.statements;

		expect(ts.isExpressionStatement(firstStatement)).toBe(true);
		expect(
			ts.isExpressionStatement(firstStatement) &&
				ts.isStringLiteral(firstStatement.expression) &&
				firstStatement.expression.text,
		).toBe('use client');
	});
});
