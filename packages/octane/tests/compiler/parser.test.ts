// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CompileError, ParseOptions } from '@tsrx/core/types';
import { parseModule as parseNativeModule } from 'oxc-tsrx/tsrx-core-compat';
import { parseModule as parseJavaScriptModule } from '../../src/compiler/parser.browser.js';
import { parseModule } from '../../src/compiler/parser.node.js';

vi.mock('oxc-tsrx/tsrx-core-compat', async (importOriginal) => {
	const actual = await importOriginal<typeof import('oxc-tsrx/tsrx-core-compat')>();
	return { ...actual, parseModule: vi.fn(actual.parseModule) };
});

vi.mock('../../src/compiler/parser.browser.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../src/compiler/parser.browser.js')>();
	return { ...actual, parseModule: vi.fn(actual.parseModule) };
});

afterEach(() => {
	vi.mocked(parseNativeModule).mockReset();
	vi.mocked(parseJavaScriptModule).mockReset();
});

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

	it.each([
		'export function C(props) { return <section><style>{props.css}</style><p /></section>; }',
		'export function C(props) @{ <section><style data-x="1">\n\t{props.css}\n</style><p /></section> }',
	])(
		'retries the bare Error the native CSS reader raises for a <style> expression child: %s',
		(source) => {
			// The compat facade reads every <style> element's raw text as CSS after
			// its error translation, so `<style>{css}</style>` (an ordinary element,
			// amendment A1 rule C) escapes as a bare Error rather than a
			// SyntaxError. The Node entry must still hand the source to the
			// JavaScript parser; here that parser is stubbed so the test does not
			// depend on which @tsrx/core version accepts the shape.
			vi.mocked(parseNativeModule).mockImplementationOnce(() => {
				throw new Error('Expected identifier');
			});
			const accepted = {
				type: 'Program' as const,
				sourceType: 'module' as const,
				body: [{ type: 'ExportNamedDeclaration' as const }],
			};
			vi.mocked(parseJavaScriptModule).mockImplementationOnce(() => accepted as any);
			const program = parseModule(source, 'style-value.tsrx');
			expect(program).toBe(accepted);
			expect(vi.mocked(parseNativeModule)).toHaveBeenCalledTimes(1);
			expect(vi.mocked(parseJavaScriptModule)).toHaveBeenCalledTimes(1);
			expect(vi.mocked(parseJavaScriptModule).mock.calls[0][0]).toBe(source);
		},
	);

	it('keeps a bare native Error visible when the source has no <style> expression child', () => {
		const failure = new Error('Expected identifier');
		vi.mocked(parseNativeModule).mockImplementationOnce(() => {
			throw failure;
		});
		expect(() =>
			parseModule('export function C() @{ <style>.a { color: red; }</style> }', 'block.tsrx'),
		).toThrow(failure);
		expect(vi.mocked(parseJavaScriptModule)).not.toHaveBeenCalled();
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
