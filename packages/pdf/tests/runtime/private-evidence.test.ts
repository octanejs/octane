import { describe, expect, it } from 'vitest';

import Ref from '../../src/Ref.js';
import { dataURItoByteString, isDataURI } from '../../src/utils.js';

describe('@octanejs/pdf private upstream evidence', () => {
	describe('isDataURI()', () => {
		// @parity-case adapted:react-pdf-utils-is-data-uri
		it.each`
			input                                            | expectedResult
			${'potato'}                                      | ${false}
			${'data:,Hello%2C%20world%21'}                   | ${true}
			${'data:text/plain;base64,SGVsbG8sIHdvcmxkIQ=='} | ${true}
		`('returns $expectedResult given $input', function ({ input, expectedResult }) {
			const result = isDataURI(input);
			expect(result).toBe(expectedResult);
		});
	});

	describe('dataURItoByteString()', () => {
		// @parity-case adapted:react-pdf-utils-invalid
		it('throws given invalid data URI', function () {
			expect(function () {
				dataURItoByteString('potato');
			}).toThrow();
		});

		// @parity-case adapted:react-pdf-utils-plain
		it('returns a byte string given plain text data URI', function () {
			const result = dataURItoByteString('data:,Hello%2C%20world%21');
			expect(result).toBe('Hello, world!');
		});

		// @parity-case adapted:react-pdf-utils-base64
		it('returns a byte string given base64 data URI', function () {
			const result = dataURItoByteString('data:text/plain;base64,SGVsbG8sIHdvcmxkIQ==');
			expect(result).toBe('Hello, world!');
		});

		// @parity-case adapted:react-pdf-utils-pdf
		it('returns a byte string given base64 PDF data URI', function () {
			const result = dataURItoByteString(
				'data:application/pdf;base64,JVBERi0xLg10cmFpbGVyPDwvUm9vdDw8L1BhZ2VzPDwvS2lkc1s8PC9NZWRpYUJveFswIDAgMyAzXT4+XT4+Pj4+Pg==',
			);
			expect(result).toBe('%PDF-1.\rtrailer<</Root<</Pages<</Kids[<</MediaBox[0 0 3 3]>>]>>>>>>');
		});

		// @parity-case adapted:react-pdf-utils-pdf-filename
		it('returns a byte string given base64 PDF data URI with filename', function () {
			const result = dataURItoByteString(
				'data:application/pdf;filename=generated.pdf;base64,JVBERi0xLg10cmFpbGVyPDwvUm9vdDw8L1BhZ2VzPDwvS2lkc1s8PC9NZWRpYUJveFswIDAgMyAzXT4+XT4+Pj4+Pg==',
			);
			expect(result).toBe('%PDF-1.\rtrailer<</Root<</Pages<</Kids[<</MediaBox[0 0 3 3]>>]>>>>>>');
		});
	});

	describe('Ref', () => {
		// @parity-case adapted:react-pdf-ref
		it('returns proper reference for given num and gen', function () {
			const num = 1;
			const gen = 2;
			const ref = new Ref({ num, gen });
			expect(ref.toString()).toBe('1R2');
		});

		// @parity-case adapted:react-pdf-ref-gen-0
		it('returns proper reference for given num and gen when gen = 0', function () {
			const num = 1;
			const gen = 0;
			const ref = new Ref({ num, gen });
			expect(ref.toString()).toBe('1R');
		});
	});
});
