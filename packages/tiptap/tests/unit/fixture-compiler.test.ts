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
	writeFileSync(fixture, 'fixture');
	return fixture;
}

function run(
	fixture: string,
	deps: {
		compile: () => { code: string; errors?: unknown[] };
		transform: () => { code: string };
	},
) {
	return compileReactFixture(fixture, {
		fixtureDir: dir,
		cacheDir: join(dir, 'cache'),
		fixtures: 'all',
		deps,
	});
}

describe('Tiptap differential setup', function () {
	it('fails closed on compiler errors', function () {
		const transform = vi.fn(() => ({ code: 'compiled' }));
		expect(function () {
			run(stage(), {
				compile: () => ({ code: '', errors: [{ message: 'invalid' }] }),
				transform,
			});
		}).toThrow(/invalid/);
		expect(transform).not.toHaveBeenCalled();
	});
	it('propagates transform exceptions without cache output', function () {
		expect(function () {
			run(stage(), {
				compile: () => ({ code: 'compiled' }),
				transform: () => {
					throw new Error('transform exploded');
				},
			});
		}).toThrow('transform exploded');
	});
});
