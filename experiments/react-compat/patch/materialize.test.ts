import { test, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import {
	mkdtemp,
	readFile,
	writeFile,
	mkdir,
	copyFile,
	symlink,
	access,
	rm,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(new URL('../../../packages/octane/package.json', import.meta.url));
const sourceDir = path.dirname(require.resolve('react-dom/package.json'));
const materializer = path.join(here, 'materialize.mjs');
const provenance = JSON.parse(await readFile(path.join(here, 'provenance.json'), 'utf8'));
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const stderrMatches = (pattern: RegExp) => (error: unknown) =>
	error instanceof Error &&
	'stderr' in error &&
	typeof error.stderr === 'string' &&
	pattern.test(error.stderr);

const temporaryDirectories: string[] = [];
afterEach(async () => {
	for (const directory of temporaryDirectories.splice(0)) {
		await rm(directory, { recursive: true, force: true });
	}
});

async function temporary() {
	const directory = await mkdtemp(path.join(os.tmpdir(), 'react-compat-patch-test-'));
	temporaryDirectories.push(directory);
	return directory;
}

test('rejects a modified artifact before producing output', async () => {
	const directory = await temporary();
	const copied = path.join(directory, 'input');
	await mkdir(path.join(copied, 'cjs'), { recursive: true });
	for (const relative of Object.keys(provenance.files)) {
		await copyFile(path.join(sourceDir, relative), path.join(copied, relative));
	}
	await writeFile(path.join(copied, 'cjs/react-dom-client.development.js'), 'modified\n', {
		flag: 'a',
	});
	const output = path.join(directory, 'output');
	await assert.rejects(
		execute(process.execPath, [materializer, copied, output]),
		stderrMatches(/Unrecognized cjs\/react-dom-client.development.js/),
	);
	await assert.rejects(access(output), { code: 'ENOENT' });
});

test('rejects the installed directory and aliases of its descendants', async () => {
	const directory = await temporary();
	const alias = path.join(directory, 'alias');
	await symlink(sourceDir, alias, 'dir');
	for (const output of [sourceDir, path.join(sourceDir, 'nested'), path.join(alias, 'nested')]) {
		await assert.rejects(
			execute(process.execPath, [materializer, sourceDir, output]),
			stderrMatches(/Output must not modify the installed React DOM package/),
		);
	}
});

test('materializes reproducibly without changing source bytes or following output symlinks', async () => {
	const directory = await temporary();
	const output = path.join(directory, 'output');
	await mkdir(output);
	const sourceFile = path.join(sourceDir, 'cjs/react-dom-client.development.js');
	await symlink(sourceFile, path.join(output, 'react-dom-client.development.cjs'));
	await execute(process.execPath, [materializer, sourceDir, output]);
	const first = await readFile(path.join(output, 'manifest.json'), 'utf8');
	await execute(process.execPath, [materializer, sourceDir, output]);
	assert.equal(await readFile(path.join(output, 'manifest.json'), 'utf8'), first);
	for (const [relative, expected] of Object.entries(provenance.files)) {
		assert.equal(hash(await readFile(path.join(sourceDir, relative))), expected);
	}
	for (const mode of ['development', 'production']) {
		await execute(process.execPath, ['--check', path.join(output, `react-dom-client.${mode}.cjs`)]);
	}
});
