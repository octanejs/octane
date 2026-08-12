import { describe, expect, it, vi } from 'vitest';
import { compileFixture } from '../differential/fixture-compiler';

function dependencies(compile: (source: string, path: string) => any) {
	return {
		readFile: vi.fn(() => 'fixture source') as any,
		compile: vi.fn(compile) as any,
		transform: vi.fn(() => ({ code: 'compiled' })) as any,
		writeFile: vi.fn() as any,
	};
}

describe('TanStack Router differential setup', () => {
	it('fails closed when the TSRX compiler reports errors', () => {
		const deps = dependencies(() => ({ code: '', errors: [{ message: 'invalid fixture' }] }));
		expect(() => compileFixture('/fixtures/broken.tsrx', '/cache', deps)).toThrow(
			/invalid fixture/,
		);
		expect(deps.transform).not.toHaveBeenCalled();
		expect(deps.writeFile).not.toHaveBeenCalled();
	});

	it('propagates compiler exceptions without writing cache output', () => {
		const deps = dependencies(() => {
			throw new Error('compiler exploded');
		});
		expect(() => compileFixture('/fixtures/broken.tsrx', '/cache', deps)).toThrow(
			'compiler exploded',
		);
		expect(deps.transform).not.toHaveBeenCalled();
		expect(deps.writeFile).not.toHaveBeenCalled();
	});
});
