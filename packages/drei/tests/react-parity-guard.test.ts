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

async function runTypeMutation(file: string, mutate: (value: string) => string) {
	const directory = await mkdtemp(path.join(tmpdir(), 'octane-drei-type-parity-'));
	await cp(path.join(packageRoot, 'typetests'), directory, { recursive: true });
	const target = path.join(directory, file);
	await writeFile(target, mutate(await readFile(target, 'utf8')));
	return spawnSync(process.execPath, [checker], {
		cwd: repositoryRoot,
		encoding: 'utf8',
		env: { ...process.env, OCTANE_DREI_PARITY_TYPE_ROOT: directory },
	});
}

describe('Drei React-parity guard', () => {
	it('rejects a differential inventory that drops a paired runtime file', async () => {
		const result = await runMutation('differential-runtime.json', (value) => value.files.pop());
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain(
			'differential inventory must cover every paired file and exclude guards/browser',
		);
	});

	it('rejects a deleted assertion identity', async () => {
		const result = await runMutation('differential-runtime.json', (value) => value.tests.pop());
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

	it('rejects a skipped pristine type assertion file', async function () {
		const result = await runMutation('react-parity.json', function (value) {
			value.lanes
				.find(function (lane: { id: string }) {
					return lane.id === 'drei-pristine-types';
				})
				.files.splice(0, 1);
		});
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain('must execute its public API type assertion file');
	});

	it('rejects a deleted assertion group in the type pair', async function () {
		const result = await runTypeMutation('pristine/public-api.test-d.ts', function (value) {
			return value.replace('// Assertion group 2: invalid View frame count is rejected.\n', '');
		});
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain('assertion-group inventories differ');
	});

	it('rejects a removed type rejection assertion', async function () {
		const result = await runTypeMutation('adapted/public-api.test-d.ts', function (value) {
			return value.replace('// @ts-expect-error frame count is numeric on View\n', '');
		});
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain('must retain matching @ts-expect-error directives');
	});
});
