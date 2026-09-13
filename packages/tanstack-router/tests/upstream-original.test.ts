import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
// @ts-expect-error shared ESM test runner has no declaration emit
import { runConfiguredPristineSuite } from '../../../scripts/react-parity/pristine-suite-lib.mjs';

type Identity = { file: string; fullName: string; status: string };

// @parity-case pristine:tanstack-router-original-suite
it('runs all pinned Router runtime cases unchanged, including the upstream skip', () => {
	const directory = resolve(import.meta.dirname, '../audit');
	const expected = JSON.parse(readFileSync(resolve(directory, 'pristine-runtime.json'), 'utf8'))
		.tests as Identity[];
	const skipped = JSON.parse(
		readFileSync(resolve(directory, 'pristine-skipped.json'), 'utf8'),
	) as Identity[];
	const result = runConfiguredPristineSuite(
		resolve(import.meta.dirname, '../../..'),
		'packages/tanstack-router',
	) as {
		status: number;
		stdout: string;
		stderr: string;
		identities: Identity[];
	};
	expect(result.status, result.stdout + result.stderr).toBe(0);
	expect(result.identities.filter((test) => test.status !== 'passed')).toEqual(skipped);
	expect(
		result.identities
			.filter((test) => test.status === 'passed')
			.map(({ file, fullName }) => ({ file, fullName })),
	).toEqual(expected.map(({ file, fullName }) => ({ file, fullName })));
}, 180_000);
