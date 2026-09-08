import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, parse, resolve } from 'node:path';
import { expect, it } from 'vitest';

// @ts-expect-error pristine identity helper is plain ESM without declaration emit
import {
	inventoryFromIdentities,
	pristineTestIdentities,
	runPristineUpstreamSuite,
} from '../../../scripts/react-parity/monaco-editor-pristine-runtime.mjs';

function findRepoRoot(start: string): string {
	let directory = resolve(start);
	const filesystemRoot = parse(directory).root;
	while (directory !== filesystemRoot) {
		if (
			existsSync(resolve(directory, 'pnpm-workspace.yaml')) &&
			existsSync(resolve(directory, 'packages/monaco-editor/package.json'))
		) {
			return directory;
		}
		directory = dirname(directory);
	}
	throw new Error(`Could not locate the Octane repository above ${start}`);
}

const repoRoot = findRepoRoot(process.cwd());
const packageRoot = resolve(repoRoot, 'packages/monaco-editor');

type Identity = { file: string; fullName: string; status?: string };

// @parity-case pristine:monaco-react-original-suite
it('runs all six pinned @monaco-editor/react 4.7.0 upstream RTL specs', function () {
	const result = runPristineUpstreamSuite({ repoRoot });
	const output = `${result.stdout}\n${result.stderr}`;
	expect(result.status, output).toBe(0);
	expect(result.identities.length, output).toBeGreaterThan(0);
	expect(
		result.identities.every(function allPassed(test) {
			return test.status === 'passed';
		}),
		output,
	).toBe(true);
	const expected = (
		JSON.parse(readFileSync(resolve(packageRoot, 'audit/pristine-runtime.json'), 'utf8'))
			.tests as Identity[]
	).map(function expectedIdentity(test) {
		return { file: test.file, fullName: test.fullName };
	});
	const executed = pristineTestIdentities(result.report, repoRoot).map(function identity(test) {
		return { file: test.file, fullName: test.fullName };
	});
	expect(executed).toEqual(expected);
}, 120_000);
