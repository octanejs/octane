import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

// @ts-expect-error pristine runner is plain ESM without declaration emit
import {
	inventoryFromIdentities,
	runPristineUpstreamSuite,
} from '../../../scripts/react-parity/react-spring-pristine-runtime.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

type Identity = { file: string; fullName: string; status?: string };

// @parity-case pristine:react-spring-original-suite
it('runs the pinned react-spring 10.1.2 unit suite unchanged', function runsPinnedReactSpringSuite() {
	const expected = JSON.parse(
		readFileSync(resolve(repoRoot, 'packages/react-spring/audit/pristine-runtime.json'), 'utf8'),
	).tests as Identity[];
	const result = runPristineUpstreamSuite({ repoRoot }) as {
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
	const inventory = inventoryFromIdentities(result.identities);
	expect(inventory.tests).toHaveLength(expected.length);
}, 180_000);
