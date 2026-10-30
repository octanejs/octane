import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
// @ts-expect-error shared ESM runner has no declaration emit
import { runConfiguredPristineSuite } from '../../../scripts/react-parity/pristine-suite-lib.mjs';

// @parity-case pristine:legendapp-list-original-suite
it('runs the pinned @legendapp/list suites unchanged against React', () => {
	const expected = JSON.parse(
		readFileSync(resolve(import.meta.dirname, '../audit/pristine-runtime.json'), 'utf8'),
	).tests as { file: string; fullName: string }[];
	const result = runConfiguredPristineSuite(
		resolve(import.meta.dirname, '../../..'),
		'packages/legendapp-list',
	) as {
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
}, 300_000);
