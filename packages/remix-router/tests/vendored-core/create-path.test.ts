// Ported from react-router@7.18.1 packages/react-router/__tests__/router/create-path-test.ts — verbatim except: renamed to create-path.test.ts, imports re-pointed at the vendored sources (../../lib/* → ../../src/lib/*), jest→vitest globals via ./_shim.
import './_shim';
import { createPath } from '../../src/lib/router/history';

describe('createPath', () => {
	describe('given only a pathname', () => {
		it('returns the pathname unchanged', () => {
			let path = createPath({ pathname: 'https://google.com' });
			expect(path).toBe('https://google.com');
		});
	});

	describe('given a pathname and a search param', () => {
		it('returns the constructed pathname', () => {
			let path = createPath({
				pathname: 'https://google.com',
				search: '?something=cool',
			});
			expect(path).toBe('https://google.com?something=cool');
		});
	});

	describe('given a pathname and a search param without ?', () => {
		it('returns the constructed pathname', () => {
			let path = createPath({
				pathname: 'https://google.com',
				search: 'something=cool',
			});
			expect(path).toBe('https://google.com?something=cool');
		});
	});

	describe('given a pathname and a hash param', () => {
		it('returns the constructed pathname', () => {
			let path = createPath({
				pathname: 'https://google.com',
				hash: '#section-1',
			});
			expect(path).toBe('https://google.com#section-1');
		});
	});

	describe('given a pathname and a hash param without #', () => {
		it('returns the constructed pathname', () => {
			let path = createPath({
				pathname: 'https://google.com',
				hash: 'section-1',
			});
			expect(path).toBe('https://google.com#section-1');
		});
	});

	describe('given a full location object', () => {
		it('returns the constructed pathname', () => {
			let path = createPath({
				pathname: 'https://google.com',
				search: 'something=cool',
				hash: '#section-1',
			});
			expect(path).toBe('https://google.com?something=cool#section-1');
		});
	});
});
