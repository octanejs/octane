/**
 * Negative controls for the differential fixture compiler. These are ordinary
 * package tests (not React-oracle parity evidence), so they live outside the
 * wholly differential project.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { compileReactFixture } from '../../../../test-utils/differential-precompile.js';

let dir: string;

afterEach(() => {
	if (dir) rmSync(dir, { recursive: true, force: true });
});

function stage() {
	dir = mkdtempSync(join(tmpdir(), 'fixture-compiler-'));
	const fixture = join(dir, 'broken.tsrx');
	writeFileSync(fixture, 'fixture source');
	return fixture;
}

function config(fixture: string, deps: { compile: unknown; transform: unknown }) {
	return {
		fixtureDir: dir,
		cacheDir: join(dir, 'cache'),
		fixtures: 'all' as const,
		deps: deps as never,
	};
}

describe('TanStack Table differential setup', function () {
	it('fails closed when the TSRX compiler reports errors', function () {
		const transform = vi.fn(() => ({ code: 'compiled' }));
		expect(function () {
			compileReactFixture(
				stage(),
				config(join(dir, 'broken.tsrx'), {
					compile: () => ({ code: '', errors: [{ message: 'invalid fixture' }] }),
					transform,
				}),
			);
		}).toThrow(/invalid fixture/);
		expect(transform).not.toHaveBeenCalled();
	});

	it('propagates transform failures without writing cache output', function () {
		expect(function () {
			compileReactFixture(
				stage(),
				config(join(dir, 'broken.tsrx'), {
					compile: () => ({ code: 'compiled' }),
					transform: () => {
						throw new Error('transform exploded');
					},
				}),
			);
		}).toThrow('transform exploded');
	});
});
