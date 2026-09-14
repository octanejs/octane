import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

import { runConfiguredPristineSuite } from '../../../scripts/react-parity/pristine-suite-lib.mjs';

type Identity = { file: string; fullName: string; status?: string };

// @parity-case pristine:i18next-original-suite
it('runs the pinned react-i18next 17.0.14 suite unchanged', () => {
	const inventory = JSON.parse(
		readFileSync(resolve(import.meta.dirname, '../audit/pristine-runtime.json'), 'utf8'),
	) as { tests: Identity[]; snapshots: number };
	const result = runConfiguredPristineSuite(
		resolve(import.meta.dirname, '../../..'),
		'packages/i18next',
	) as {
		status: number;
		stdout: string;
		stderr: string;
		identities: Identity[];
		report: { snapshot: { total: number } };
	};
	expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
	expect(result.identities.map(({ file, fullName }) => ({ file, fullName }))).toEqual(
		inventory.tests.map(({ file, fullName }) => ({ file, fullName })),
	);
	expect(result.report.snapshot.total).toBe(inventory.snapshots);
}, 180_000);
