import { describe, expect, it, vi } from 'vitest';
import { compileFixture } from './fixture-compiler.mjs';

function dependencies(compile) {
	return {
		readFile: vi.fn(() => 'fixture source'),
		compile: vi.fn(compile),
		transform: vi.fn(() => ({ code: 'compiled' })),
		writeFile: vi.fn(),
	};
}

describe('Nuqs differential setup', () => {
	it('fails closed when the TSRX compiler reports errors', () => {
		const deps = dependencies(() => ({ code: '', errors: [{ message: 'invalid fixture' }] }));
		expect(() => compileFixture('/fixtures/broken.tsrx', '/cache', deps)).toThrow(
			/invalid fixture/,
		);
		expect(deps.writeFile).not.toHaveBeenCalled();
	});

	it('propagates compiler exceptions without writing cache output', () => {
		const deps = dependencies(() => {
			throw new Error('compiler exploded');
		});
		expect(() => compileFixture('/fixtures/broken.tsrx', '/cache', deps)).toThrow(
			'compiler exploded',
		);
		expect(deps.writeFile).not.toHaveBeenCalled();
	});
});
