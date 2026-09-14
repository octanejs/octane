import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { compileReactFixture } from '../../../../test-utils/differential-precompile.js';
import { differentialConfig } from './_setup.js';

let dir: string;

afterEach(() => {
	if (dir) rmSync(dir, { recursive: true, force: true });
});

function stage() {
	dir = mkdtempSync(join(tmpdir(), 'differential-setup-'));
	const fixture = join(dir, 'broken.tsrx');
	writeFileSync(fixture, 'fixture source');
	mkdirSync(join(dir, 'cache'));
	return fixture;
}

function compileDeps(compile: () => { code: string; errors?: unknown[] }) {
	return {
		compile: vi.fn(compile),
		transform: vi.fn(() => ({ code: 'compiled' })),
	};
}

function run(fixture: string, deps: ReturnType<typeof compileDeps>) {
	return compileReactFixture(fixture, {
		...differentialConfig,
		fixtureDir: dir,
		cacheDir: join(dir, 'cache'),
		deps,
	});
}

describe('differential setup', () => {
	it('treats only *-diff.tsrx paths as React oracles', () => {
		expect(differentialConfig.match?.test('basic-list-diff.tsrx')).toBe(true);
		expect(differentialConfig.match?.test('server.tsrx')).toBe(false);
		expect(differentialConfig.match?.test('list-basic.tsrx')).toBe(false);
	});

	it('fails closed when TSRX compilation reports errors', () => {
		const deps = compileDeps(() => ({ code: '', errors: [{ message: 'invalid' }] }));
		expect(() => run(stage(), deps)).toThrow(/invalid/);
	});

	it('propagates transform exceptions without writing cache output', () => {
		const deps = compileDeps(() => ({ code: 'compiled' }));
		deps.transform.mockImplementation(() => {
			throw new Error('transform exploded');
		});
		expect(() => run(stage(), deps)).toThrow('transform exploded');
	});
});
