import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
// @ts-expect-error shared ESM runner has no declaration emit
import { runPristineUpstreamSuite } from '../../../scripts/react-parity/tanstack-ai-pristine-runtime.mjs';

// @parity-case pristine:tanstack-ai-original-suite
it('runs all 235 pinned AI registrations unchanged', () => {
	const expected = JSON.parse(
		readFileSync(resolve(import.meta.dirname, '../audit/pristine-runtime.json'), 'utf8'),
	).tests as { file: string; fullName: string }[];
	const result = runPristineUpstreamSuite() as {
		status: number;
		stdout: string;
		stderr: string;
		identities: { file: string; fullName: string; status: string }[];
	};
	expect(result.status, result.stdout + result.stderr).toBe(0);
	expect(result.identities.filter(({ status }) => status !== 'passed')).toEqual([]);
	expect(result.identities.map(({ file, fullName }) => ({ file, fullName }))).toEqual(
		expected.map(({ file, fullName }) => ({ file, fullName })),
	);
}, 120_000);
