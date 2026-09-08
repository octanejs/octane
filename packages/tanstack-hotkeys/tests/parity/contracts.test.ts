import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../../..');
const manifest = JSON.parse(
	readFileSync(resolve(root, 'packages/tanstack-hotkeys/audit/react-parity.json'), 'utf8'),
);
const status = JSON.parse(
	readFileSync(resolve(root, 'packages/tanstack-hotkeys/status.json'), 'utf8'),
);

describe('@octanejs/tanstack-hotkeys parity audit contracts', () => {
	// @parity-case adapted:tanstack-hotkeys-upstream-ledger
	it('authenticates every adapter export and upstream runtime test', () => {
		expect(manifest.provenance).toMatchObject({
			version: '0.10.0',
			commit: 'c73a3a167c979d500e1008341ecad096a6c4e635',
			verification: 'verified',
		});
		expect(manifest.upstreamSuites).toEqual({ runtime: 'present', types: 'present' });
		expect(() =>
			execFileSync(
				process.execPath,
				[
					'scripts/react-port/materialize.mjs',
					'run',
					'--check',
					'--package-dir',
					'packages/tanstack-hotkeys',
				],
				{ cwd: root, stdio: 'pipe' },
			),
		).not.toThrow();
	});

	// OCTANE DIVERGENCE[plain-ref-target][adapted:tanstack-hotkeys-plain-ref]
	// @parity-case adapted:tanstack-hotkeys-plain-ref
	it('keeps the plain target-ref adaptation explicit', () => {
		expect(status.divergences.join(' ')).toContain('plain');
		expect(status.divergences.join(' ')).toContain('current');
	});
});
