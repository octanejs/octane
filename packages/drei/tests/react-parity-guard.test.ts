import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(packageRoot, '../..');
const checker = path.join(packageRoot, 'scripts/check-react-parity.mjs');

async function runMutation(file: string, mutate: (value: any) => void) {
	const directory = await mkdtemp(path.join(tmpdir(), 'octane-drei-parity-'));
	await cp(path.join(packageRoot, 'audit'), directory, { recursive: true });
	const target = path.join(directory, file);
	const value = JSON.parse(await readFile(target, 'utf8'));
	mutate(value);
	await writeFile(target, JSON.stringify(value));
	return spawnSync(process.execPath, [checker], {
		cwd: repositoryRoot,
		encoding: 'utf8',
		env: { ...process.env, OCTANE_DREI_PARITY_AUDIT: directory },
	});
}

describe('Drei React-parity guard', () => {
	it('rejects a skipped runtime file', async () => {
		const result = await runMutation('adapted-runtime.json', (value) => value.files.pop());
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain('runtime test file was skipped');
	});

	it('rejects a deleted assertion identity', async () => {
		const result = await runMutation('adapted-runtime.json', (value) => value.tests.pop());
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain('lost or gained an assertion');
	});

	it('rejects a removed upstream @ts-expect-error inventory entry', async () => {
		const result = await runMutation('upstream-test-artifacts.json', (value) =>
			value.upstreamSourceExpectErrors.pop(),
		);
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain('@ts-expect-error directive was removed');
	});

	it('rejects a fabricated upstream type-test suite', async () => {
		const result = await runMutation(
			'upstream-test-artifacts.json',
			(value) => (value.upstreamTypeSuite = 'present'),
		);
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain('must not claim an upstream type suite');
	});
});
