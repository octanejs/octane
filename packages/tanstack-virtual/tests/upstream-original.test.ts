import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
// @ts-expect-error shared ESM runner has no declaration emit
import { runPristineUpstreamSuite } from '../../../scripts/react-parity/tanstack-virtual-pristine-runtime.mjs';

// @parity-case pristine:virtual-original-unit-suite
it('runs all seven pinned Virtual unit registrations unchanged', () => {
	const expected = JSON.parse(
		readFileSync(resolve(import.meta.dirname, '../audit/pristine-runtime.json'), 'utf8'),
	).tests;
	const result = runPristineUpstreamSuite();
	expect(result.status, result.stdout + result.stderr).toBe(0);
	expect(result.identities.every((test: { status: string }) => test.status === 'passed')).toBe(
		true,
	);
	expect(
		result.identities.map(({ file, fullName }: { file: string; fullName: string }) => ({
			file,
			fullName,
		})),
	).toEqual(
		expected.map(({ file, fullName }: { file: string; fullName: string }) => ({ file, fullName })),
	);
}, 120_000);
