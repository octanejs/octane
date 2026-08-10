import { describe, expect, it, vi } from 'vitest';
import { compileFixture, isOracleFixture } from './fixture-compiler';

function dependencies(compile: (source: string, path: string) => any) {
	return {
		readFile: vi.fn(function () {
			return 'fixture';
		}) as any,
		compile: vi.fn(compile) as any,
		transform: vi.fn(function () {
			return { code: 'compiled' };
		}) as any,
		writeFile: vi.fn() as any,
	};
}

describe('TanStack Virtual differential setup', () => {
	it('treats only *-diff.tsrx paths as React oracles', () => {
		expect(isOracleFixture('/fixtures/basic-list-diff.tsrx')).toBe(true);
		expect(isOracleFixture('/fixtures/server.tsrx')).toBe(false);
		expect(isOracleFixture('/fixtures/list-basic.tsrx')).toBe(false);
	});

	it('fails closed when TSRX compilation reports errors', () => {
		const deps = dependencies(function () {
			return { code: '', errors: [{ message: 'invalid' }] };
		});
		expect(() => compileFixture('/fixture/broken.tsrx', '/cache', deps)).toThrow(/invalid/);
		expect(deps.writeFile).not.toHaveBeenCalled();
	});

	it('propagates transform exceptions without writing cache output', () => {
		const deps = dependencies(function () {
			return { code: 'compiled' };
		});
		deps.transform.mockImplementation(function () {
			throw new Error('transform exploded');
		});
		expect(() => compileFixture('/fixture/broken.tsrx', '/cache', deps)).toThrow(
			'transform exploded',
		);
		expect(deps.writeFile).not.toHaveBeenCalled();
	});
});
