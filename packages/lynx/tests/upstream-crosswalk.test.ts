import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const LYNX_ROOT = resolve(import.meta.dirname, '..');
const phaseZeroEvidence = JSON.parse(
	readFileSync(resolve(LYNX_ROOT, 'audit/phase-0-evidence.json'), 'utf8'),
) as {
	gates: Array<{ id: string; status: string }>;
	milestoneExit: { blockingGateIds: string[] };
};

describe('Lynx upstream crosswalk', () => {
	it('keeps every committed runner case uniquely classified', () => {
		const output = execFileSync(
			process.execPath,
			[resolve(LYNX_ROOT, 'audit/validate-crosswalk.mjs')],
			{ encoding: 'utf8', timeout: 20_000 },
		);

		expect(output).toContain('213 classified test source files, 1725 classified runnable cases.');
		expect(
			phaseZeroEvidence.gates.find((gate) => gate.id === 'runner-expanded-test-case-inventory')
				?.status,
		).toBe('passed');
		expect(phaseZeroEvidence.milestoneExit.blockingGateIds).not.toContain(
			'runner-expanded-test-case-inventory',
		);
	}, 30_000);
});
