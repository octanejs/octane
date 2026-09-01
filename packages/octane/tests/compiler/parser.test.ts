// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CompileError, ParseOptions } from '@tsrx/core/types';
import { parseModule as parseNativeModule } from 'oxc-tsrx/tsrx-core-compat';
import { parseModule } from '../../src/compiler/parser.node.js';

vi.mock('oxc-tsrx/tsrx-core-compat', async (importOriginal) => {
	const actual = await importOriginal<typeof import('oxc-tsrx/tsrx-core-compat')>();
	return { ...actual, parseModule: vi.fn(actual.parseModule) };
});

afterEach(() => vi.mocked(parseNativeModule).mockReset());

function syntaxDiagnostic(message: string): CompileError {
	return Object.assign(new SyntaxError(message), {
		code: undefined,
		pos: undefined,
		raisedAt: undefined,
		end: undefined,
		loc: undefined,
		fileName: 'input.tsrx',
		type: 'fatal' as const,
	});
}

describe('Node parser compatibility', () => {
	it('preserves parser options and publishes only the accepted parse outputs', () => {
		const source = '/* retained */ const value = (1); export function Text() @{ <p><3</p> }';
		const earlier = syntaxDiagnostic('earlier diagnostic');
		const errors: NonNullable<ParseOptions['errors']> = [earlier];
		const comments: NonNullable<ParseOptions['comments']> = [];
		vi.mocked(parseNativeModule).mockImplementationOnce((_source, _filename, options) => {
			options?.errors?.push(syntaxDiagnostic('native rejection'));
			throw new SyntaxError('native rejection');
		});
		const options = Object.freeze({ errors, comments, collect: true, preserveParens: true });
		const program = parseModule(source, 'text.tsrx', options);
		expect(program.body[0]).toMatchObject({
			type: 'VariableDeclaration',
			declarations: [{ init: { type: 'ParenthesizedExpression' } }],
		});
		expect(program.body[1].type).toBe('ExportNamedDeclaration');
		expect(errors).toEqual([earlier]);
		expect(comments.map((comment) => comment.value.trim())).toEqual(['retained']);
	});

	it.each([false, true])(
		'retains native diagnostics when neither parser accepts the input (loose=%s)',
		(loose) => {
			const rejection = syntaxDiagnostic('native syntax diagnostic');
			const errors: NonNullable<ParseOptions['errors']> = [];
			vi.mocked(parseNativeModule).mockImplementationOnce((_source, _filename, options) => {
				options?.errors?.push(rejection);
				throw rejection;
			});
			expect(() =>
				parseModule('export const value = ;', 'invalid.tsrx', { errors, collect: true, loose }),
			).toThrow(rejection);
			expect(errors).toEqual([rejection]);
		},
	);

	it.each([
		new Error('native unavailable'),
		Object.assign(new SyntaxError('native unavailable'), { name: 'ParserOperationalError' }),
		Object.assign(new SyntaxError('native unavailable'), { code: 'ERR_TSRX_NATIVE' }),
	])('does not hide operational parser failures: %s', (failure) => {
		vi.mocked(parseNativeModule).mockImplementationOnce(() => {
			throw failure;
		});
		expect(() => parseModule('export const value = 1;', 'valid.ts')).toThrow(failure);
	});

	it('keeps native comments and diagnostics on a successful parse', () => {
		const comments: NonNullable<ParseOptions['comments']> = [];
		const errors: NonNullable<ParseOptions['errors']> = [];
		const program = parseModule('/* native */ export const value = 1;', 'valid.ts', {
			comments,
			errors,
		});
		expect(program.body[0].type).toBe('ExportNamedDeclaration');
		expect(comments.map((comment) => comment.value.trim())).toEqual(['native']);
		expect(errors).toEqual([]);
	});

	it('does not reinterpret caller output-buffer failures as parser errors', () => {
		const failure = new SyntaxError('output buffer rejected a comment');
		const comments: NonNullable<ParseOptions['comments']> = [];
		let rejected = false;
		comments.push = (...items) => {
			if (!rejected) {
				rejected = true;
				throw failure;
			}
			return Array.prototype.push.apply(comments, items);
		};
		expect(() => parseModule('/* native */ const value = 1;', 'valid.ts', { comments })).toThrow(
			failure,
		);
	});
});
