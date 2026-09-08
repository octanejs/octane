import { describe, expect, it, vi } from 'vitest';
import { compileFixture } from './fixture-compiler';

function dependencies(compile: (source: string, path: string) => any) {
	return {
		readFile: vi.fn(() => 'fixture source') as any,
		compile: vi.fn(compile) as any,
		transform: vi.fn(() => ({ code: 'compiled' })) as any,
		writeFile: vi.fn() as any,
	};
}

describe('XState differential setup', () => {
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
		expect(deps.writeFile).not.toHaveBeenCalled();
	});

	it('rewrites the binding and runtime imports for the React side', () => {
		const written: string[] = [];
		const deps = {
			readFile: vi.fn(() => 'source') as any,
			compile: vi.fn(() => ({ code: 'compiled' })) as any,
			transform: vi.fn(() => ({
				code: [
					"import { useMachine } from '@octanejs/xstate';",
					"import { useState } from 'octane';",
					"import { createMachine } from 'xstate';",
				].join('\n'),
			})) as any,
			writeFile: vi.fn((_path: string, contents: string) => {
				written.push(contents);
			}) as any,
		};

		compileFixture('/fixtures/parity.tsrx', '/cache', deps);

		expect(written[0]).toContain('from "@xstate/react"');
		expect(written[0]).toContain('from "react"');
		// The actor core is shared by both sides and must survive untouched.
		expect(written[0]).toContain("from 'xstate'");
	});
});
