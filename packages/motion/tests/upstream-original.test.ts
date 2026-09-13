import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { runPristineUpstreamSuite } from '../../../scripts/react-parity/motion-pristine-runtime.mjs';

// @parity-case pristine:motion-complete-original-suite
it('runs the complete pinned Motion client and SSR suites unchanged', () => {
	const result = runPristineUpstreamSuite();
	expect(result.status, result.stdout + result.stderr).toBe(0);
	const expected = JSON.parse(
		readFileSync(resolve(import.meta.dirname, '../audit/pristine-runtime.json'), 'utf8'),
	);
	expect(result.identities).toEqual(expected.tests);
	// These seven disabled cases are preserved upstream bytes, not passing evidence.
	expect(result.skipped).toEqual(expected.upstreamSkipped);
}, 180_000);
