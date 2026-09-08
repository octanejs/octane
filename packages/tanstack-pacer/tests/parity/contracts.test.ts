import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../../..');
const manifest = JSON.parse(
	readFileSync(resolve(root, 'packages/tanstack-pacer/audit/react-parity.json'), 'utf8'),
);
const status = JSON.parse(
	readFileSync(resolve(root, 'packages/tanstack-pacer/status.json'), 'utf8'),
);

describe('@octanejs/tanstack-pacer parity audit contracts', () => {
	// @parity-case adapted:tanstack-pacer-upstream-ledger
	it('authenticates all 16 entrypoints and the absent runtime suite', () => {
		expect(manifest.provenance).toMatchObject({
			version: '0.22.1',
			commit: 'a894009100aeb373965d4121eb92a1af634af012',
			verification: 'recorded-unverified',
		});
		expect(() =>
			execFileSync(
				process.execPath,
				[
					'scripts/react-port/materialize.mjs',
					'run',
					'--check',
					'--package-dir',
					'packages/tanstack-pacer',
				],
				{
					cwd: root,
					stdio: 'pipe',
				},
			),
		).not.toThrow();
	});

	it('keeps the structural state-setter type adaptation explicit', () => {
		expect(status.divergences.join(' ')).toContain('structurally identical local aliases');
	});
});
