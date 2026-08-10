/**
 * Negative controls for the differential fixture compiler. These are ordinary
 * package tests (not React-oracle parity evidence), so they live outside the
 * wholly differential project.
 */
import { describe, expect, it, vi } from 'vitest';
import { compileFixture } from '../differential/fixture-compiler';

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

describe('Tiptap differential setup', function () {
	it('fails closed on compiler errors', function () {
		const deps = dependencies(function () {
			return { code: '', errors: [{ message: 'invalid' }] };
		});
		expect(function () {
			compileFixture('/fixture/broken.tsrx', '/cache', deps);
		}).toThrow(/invalid/);
		expect(deps.writeFile).not.toHaveBeenCalled();
	});
	it('propagates transform exceptions without cache output', function () {
		const deps = dependencies(function () {
			return { code: 'compiled' };
		});
		deps.transform.mockImplementation(function () {
			throw new Error('transform exploded');
		});
		expect(function () {
			compileFixture('/fixture/broken.tsrx', '/cache', deps);
		}).toThrow('transform exploded');
		expect(deps.writeFile).not.toHaveBeenCalled();
	});
});
