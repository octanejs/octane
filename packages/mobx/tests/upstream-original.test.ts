import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

// @ts-expect-error the shared pristine runner is plain ESM
import { runPristineUpstreamSuite } from '../../../scripts/react-parity/mobx-pristine-runtime.mjs';

type Identity = { file: string; fullName: string; status?: string };

// @parity-case pristine:mobx-original-suite
it('runs the pinned mobx-react-lite 5.0.3 suite unchanged', () => {
	const inventory = JSON.parse(
		readFileSync(resolve(import.meta.dirname, '../audit/pristine-runtime.json'), 'utf8'),
	) as { tests: Identity[]; snapshots: number };
	const result = runPristineUpstreamSuite() as {
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
}, 120_000);
