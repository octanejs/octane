import assert from 'node:assert/strict';
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

const SCRIPT = fileURLToPath(new URL('./format-files.mjs', import.meta.url));
const REPO_BIN = path.resolve(path.dirname(SCRIPT), '..', 'node_modules', '.bin');

function git(cwd, args) {
	execFileSync('git', args, { cwd, stdio: 'ignore' });
}

async function createFixture() {
	const root = await mkdtemp(path.join(os.tmpdir(), 'octane-format-files-'));
	const bin = path.join(root, 'bin');
	const log = path.join(root, 'prettier-arguments.json');
	await mkdir(bin);
	await writeFile(
		path.join(bin, 'prettier'),
		`#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
writeFileSync(process.env.PRETTIER_ARGUMENTS_LOG, JSON.stringify(process.argv.slice(2)));
process.exitCode = Number(process.env.PRETTIER_EXIT_CODE ?? 0);
`,
	);
	await chmod(path.join(bin, 'prettier'), 0o755);

	return {
		root,
		log,
		env: {
			...process.env,
			PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`,
			PRETTIER_ARGUMENTS_LOG: log,
		},
	};
}

function run(root, env, args) {
	return spawnSync(process.execPath, [SCRIPT, ...args], {
		cwd: root,
		encoding: 'utf8',
		env,
	});
}

describe('format-files command', () => {
	test('formats the union of staged and unstaged tracked files', async () => {
		const fixture = await createFixture();

		try {
			git(fixture.root, ['init', '--quiet']);
			git(fixture.root, ['config', 'user.email', 'test@example.com']);
			git(fixture.root, ['config', 'user.name', 'Test']);
			await Promise.all([
				writeFile(path.join(fixture.root, 'both.ts'), 'export const both = 0;\n'),
				writeFile(path.join(fixture.root, 'deleted.ts'), 'export const deleted = 0;\n'),
				writeFile(path.join(fixture.root, 'staged.ts'), 'export const staged = 0;\n'),
				writeFile(path.join(fixture.root, 'unstaged.ts'), 'export const unstaged = 0;\n'),
				writeFile(path.join(fixture.root, 'with space.ts'), 'export const space = 0;\n'),
			]);
			git(fixture.root, ['add', '.']);
			git(fixture.root, ['commit', '--quiet', '-m', 'fixture']);

			const cleanResult = run(fixture.root, fixture.env, ['--check', '--']);
			assert.equal(cleanResult.status, 0, cleanResult.stderr);
			assert.match(cleanResult.stdout, /No staged or unstaged files to format/);
			await assert.rejects(access(fixture.log));

			await Promise.all([
				writeFile(path.join(fixture.root, 'both.ts'), 'export const both = 1;\n'),
				writeFile(path.join(fixture.root, 'staged.ts'), 'export const staged = 1;\n'),
			]);
			git(fixture.root, ['add', 'both.ts', 'staged.ts']);
			await Promise.all([
				writeFile(path.join(fixture.root, 'both.ts'), 'export const both = 2;\n'),
				writeFile(path.join(fixture.root, 'unstaged.ts'), 'export const unstaged = 1;\n'),
				writeFile(path.join(fixture.root, 'with space.ts'), 'export const space = 1;\n'),
				writeFile(path.join(fixture.root, 'untracked.ts'), 'export const untracked = 1;\n'),
				rm(path.join(fixture.root, 'deleted.ts')),
			]);

			const changedResult = run(fixture.root, fixture.env, ['--check', '--']);
			assert.equal(changedResult.status, 0, changedResult.stderr);
			const prettierArguments = JSON.parse(await readFile(fixture.log, 'utf8'));
			const separatorIndex = prettierArguments.indexOf('--');
			assert.equal(prettierArguments[0], '--check');
			assert.notEqual(separatorIndex, -1);
			assert.deepEqual(prettierArguments.slice(separatorIndex + 1).sort(), [
				'both.ts',
				'staged.ts',
				'unstaged.ts',
				'with space.ts',
			]);
		} finally {
			await rm(fixture.root, { force: true, recursive: true });
		}
	});

	test('succeeds when Git changes contain only ignored or unsupported files', async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), 'octane-format-files-real-'));

		try {
			git(root, ['init', '--quiet']);
			git(root, ['config', 'user.email', 'test@example.com']);
			git(root, ['config', 'user.name', 'Test']);
			await Promise.all([
				writeFile(path.join(root, '.prettierignore'), 'ignored.js\n'),
				writeFile(path.join(root, 'ignored.js'), 'export const ignored = 0;\n'),
				writeFile(path.join(root, 'unsupported.data'), 'before\n'),
			]);
			git(root, ['add', '.']);
			git(root, ['commit', '--quiet', '-m', 'fixture']);
			await Promise.all([
				writeFile(path.join(root, 'ignored.js'), 'export const ignored = 1;\n'),
				writeFile(path.join(root, 'unsupported.data'), 'after\n'),
			]);

			const result = run(
				root,
				{
					...process.env,
					PATH: `${REPO_BIN}${path.delimiter}${process.env.PATH ?? ''}`,
				},
				['--check', '--'],
			);
			assert.equal(result.status, 0, result.stderr);
			assert.doesNotMatch(result.stderr, /No parser could be inferred|No files matching/);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	test('formats Git paths from the repository root when run from a subdirectory', async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), 'octane-format-files-subdirectory-'));
		const nested = path.join(root, 'packages', 'fixture');

		try {
			await mkdir(nested, { recursive: true });
			git(root, ['init', '--quiet']);
			git(root, ['config', 'user.email', 'test@example.com']);
			git(root, ['config', 'user.name', 'Test']);
			await writeFile(path.join(root, 'changed.js'), 'const value = { nested: false };\n');
			git(root, ['add', '.']);
			git(root, ['commit', '--quiet', '-m', 'fixture']);
			await writeFile(path.join(root, 'changed.js'), 'const value={nested:true}\n');

			const result = run(
				nested,
				{
					...process.env,
					PATH: `${REPO_BIN}${path.delimiter}${process.env.PATH ?? ''}`,
				},
				['--write', '--'],
			);
			assert.equal(result.status, 0, result.stderr);
			assert.equal(
				await readFile(path.join(root, 'changed.js'), 'utf8'),
				'const value = { nested: true };\n',
			);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	test('passes explicit paths through without requiring a Git repository', async () => {
		const fixture = await createFixture();

		try {
			const result = run(fixture.root, fixture.env, ['--write', '--', 'one.ts', 'with space.ts']);
			assert.equal(result.status, 0, result.stderr);
			const prettierArguments = JSON.parse(await readFile(fixture.log, 'utf8'));
			assert.deepEqual(prettierArguments, ['--write', '--', 'one.ts', 'with space.ts']);

			const failedResult = run(fixture.root, { ...fixture.env, PRETTIER_EXIT_CODE: '7' }, [
				'--check',
				'--',
				'one.ts',
			]);
			assert.equal(failedResult.status, 7);
		} finally {
			await rm(fixture.root, { force: true, recursive: true });
		}
	});
});
