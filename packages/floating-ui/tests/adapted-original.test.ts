import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

// @ts-expect-error adapted runner is plain ESM without declaration emit
import { runAdaptedUpstreamSuite } from '../../../scripts/react-parity/floating-ui-adapted-runtime.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

type Identity = { file: string; fullName: string; status?: string };

// @parity-case adapted:floating-ui-original-suite
it('runs the adapted @floating-ui/react 0.27.19 suites on Octane', function runsAdaptedFloatingUiSuite() {
	const expected = JSON.parse(
		readFileSync(resolve(repoRoot, 'packages/floating-ui/audit/adapted-runtime.json'), 'utf8'),
	).tests as Identity[];
	const result = runAdaptedUpstreamSuite({ repoRoot }) as {
		status: number | null;
		stdout: string;
		stderr: string;
		identities: Identity[];
	};
	const output = `${result.stdout}\n${result.stderr}`;
	expect(result.status, output).toBe(0);
	const passed = result.identities
		.filter(function keepPassed(test: Identity) {
			return test.status === 'passed';
		})
		.map(function identity(test: Identity) {
			return { file: test.file, fullName: test.fullName };
		});
	expect(passed).toEqual(
		expected.map(function expectedIdentity(test: Identity) {
			return { file: test.file, fullName: test.fullName };
		}),
	);
}, 180_000);
