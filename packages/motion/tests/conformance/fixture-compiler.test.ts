import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { compileReactFixture } from '../../../../test-utils/differential-precompile.js';

let dir: string;

afterEach(() => {
	if (dir) rmSync(dir, { recursive: true, force: true });
});

function run(compile: () => { code: string; errors?: unknown[] }) {
	dir = mkdtempSync(join(tmpdir(), 'fixture-compiler-'));
	const fixture = join(dir, 'broken.tsrx');
	writeFileSync(fixture, 'fixture source');
	const transform = vi.fn(() => ({ code: 'compiled' }));
	const call = () =>
		compileReactFixture(fixture, {
			fixtureDir: dir,
			cacheDir: join(dir, 'cache'),
			fixtures: 'all',
			deps: { compile: vi.fn(compile), transform },
		});
	return { call, transform };
}

describe('Motion differential setup', () => {
	it('fails closed when the TSRX compiler reports errors', () => {
		const { call, transform } = run(() => ({
			code: '',
			errors: [{ message: 'invalid fixture' }],
		}));
		expect(call).toThrow(/invalid fixture/);
		expect(transform).not.toHaveBeenCalled();
	});

	it('propagates compiler exceptions without writing cache output', () => {
		const { call, transform } = run(() => {
			throw new Error('compiler exploded');
		});
		expect(call).toThrow('compiler exploded');
		expect(transform).not.toHaveBeenCalled();
	});
});
