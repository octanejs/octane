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
	it('fails closed when the TSRX compiler reports errors', () => {
		const deps = compileDeps(() => ({ code: '', errors: [{ message: 'invalid fixture' }] }));
		expect(() => run(stage(), deps)).toThrow(/invalid fixture/);
		expect(deps.transform).not.toHaveBeenCalled();
	});

	it('propagates compiler exceptions without writing cache output', () => {
		const deps = compileDeps(() => {
			throw new Error('compiler exploded');
		});
		expect(() => run(stage(), deps)).toThrow('compiler exploded');
	});

	it('fails closed when rewrite leaves Octane-only imports', () => {
		const deps = compileDeps(() => ({ code: 'export {}' }));
		deps.transform = vi.fn(() => ({
			code: 'import { render } from "@octanejs/testing-library";\nexport {}',
		}));
		expect(() => run(stage(), deps)).toThrow(/Octane-only imports/);
	});
});
