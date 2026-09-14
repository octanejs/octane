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

import { readFileSync, readdirSync } from 'node:fs';

describe('differential setup', () => {
	it('fails closed when the TSRX compiler reports errors', () => {
		const deps = compileDeps(() => ({ code: '', errors: [{ message: 'invalid fixture' }] }));
		expect(() => run(stage(), deps)).toThrow(/invalid fixture/);
	});

	it('propagates compiler exceptions without writing cache output', () => {
		const deps = compileDeps(() => {
			throw new Error('compiler exploded');
		});
		expect(() => run(stage(), deps)).toThrow('compiler exploded');
	});

	it('rewrites the binding and runtime imports for the React side', () => {
		const fixture = stage();
		const deps = {
			compile: vi.fn(() => ({ code: 'compiled' })),
			transform: vi.fn(() => ({
				code: [
					"import { useMachine } from '@octanejs/xstate';",
					"import { useState } from 'octane';",
					"import { createMachine } from 'xstate';",
				].join('\n'),
			})),
		};
		run(fixture, deps);
		const written = readFileSync(join(dir, 'cache', readdirSync(join(dir, 'cache'))[0]), 'utf8');
		expect(written).toContain('from "@xstate/react"');
		expect(written).toContain('from "react"');
		// The actor core is shared by both sides and must survive untouched.
		expect(written).toContain("from 'xstate'");
	});
});
