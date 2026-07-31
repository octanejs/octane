import assert from 'node:assert/strict';
import {
	access,
	chmod,
	mkdir,
	mkdtemp,
	readFile,
	realpath,
	rm,
	symlink,
	writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

const SCRIPT = fileURLToPath(new URL('./typecheck-files.mjs', import.meta.url));
const REPOSITORY_ROOT = path.resolve(path.dirname(SCRIPT), '..');

function git(cwd, args) {
	execFileSync('git', args, { cwd, stdio: 'ignore' });
}

async function createFixture(prefix = 'octane-typecheck-files-') {
	const root = await realpath(await mkdtemp(path.join(os.tmpdir(), prefix)));
	const bin = path.join(root, 'bin');
	const log = path.join(root, 'typecheck-invocations.jsonl');
	await mkdir(bin);
	const checker = `#!/usr/bin/env node
const { appendFileSync, readFileSync } = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const project = args[args.indexOf('-p') + 1];
if (args.includes('--showConfig')) {
  process.stdout.write(readFileSync(project, 'utf8'));
} else {
  appendFileSync(process.env.TYPECHECK_INVOCATIONS_LOG, JSON.stringify({
    checker: path.basename(process.argv[1]),
    config: JSON.parse(readFileSync(project, 'utf8')),
  }) + '\\n');
  process.exitCode = Number(process.env.TYPECHECK_EXIT_CODE || 0);
}
`;
	await Promise.all([
		writeFile(path.join(bin, 'tsgo'), checker),
		writeFile(path.join(bin, 'tsrx-tsc'), checker),
	]);
	await Promise.all([
		chmod(path.join(bin, 'tsgo'), 0o755),
		chmod(path.join(bin, 'tsrx-tsc'), 0o755),
	]);

	return {
		root,
		log,
		env: {
			...process.env,
			PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`,
			TYPECHECK_INVOCATIONS_LOG: log,
		},
	};
}

function run(root, env, paths = []) {
	return spawnSync(process.execPath, [SCRIPT, '--', ...paths], {
		cwd: root,
		encoding: 'utf8',
		env,
	});
}

async function invocations(log) {
	return (await readFile(log, 'utf8'))
		.trim()
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}

describe('typecheck-files command', () => {
	test('keeps interrupted project-local temporary directories out of Git status', () => {
		const result = spawnSync(
			'git',
			['check-ignore', '--quiet', 'packages/octane/.typecheck-files-interrupted/tsconfig-0.json'],
			{ cwd: REPOSITORY_ROOT },
		);
		assert.equal(result.status, 0, result.error?.message);
	});

	test('ignores build-only configs when selected explicitly or through Git', async () => {
		const fixture = await createFixture('octane-typecheck-build-config-');

		try {
			await Promise.all([
				writeFile(path.join(fixture.root, 'source.ts'), 'export const source = true;\n'),
				writeFile(
					path.join(fixture.root, 'tsconfig.build.json'),
					JSON.stringify({ files: ['./source.ts'] }),
				),
			]);

			const explicit = run(fixture.root, fixture.env, ['tsconfig.build.json']);
			assert.equal(explicit.status, 0, explicit.stderr);
			assert.match(explicit.stdout, /No selected files are covered by a TypeScript project/);
			await assert.rejects(access(fixture.log));

			git(fixture.root, ['init', '--quiet']);
			git(fixture.root, ['config', 'user.email', 'test@example.com']);
			git(fixture.root, ['config', 'user.name', 'Test']);
			git(fixture.root, ['add', '.']);
			git(fixture.root, ['commit', '--quiet', '-m', 'fixture']);
			await writeFile(
				path.join(fixture.root, 'tsconfig.build.json'),
				JSON.stringify({ compilerOptions: { noEmit: false }, files: ['./source.ts'] }),
			);

			const changed = run(fixture.root, fixture.env);
			assert.equal(changed.status, 0, changed.stderr);
			assert.match(changed.stdout, /No selected files are covered by a TypeScript project/);
			await assert.rejects(access(fixture.log));
		} finally {
			await rm(fixture.root, { force: true, recursive: true });
		}
	});

	test('does not discover projects above the repository root', async () => {
		const fixture = await createFixture('octane-typecheck-project-boundary-');
		const repository = path.join(fixture.root, 'repository');
		const packageRoot = path.join(repository, 'packages', 'fixture');
		const sourceDirectory = path.join(packageRoot, 'src');

		try {
			await mkdir(sourceDirectory, { recursive: true });
			await Promise.all([
				writeFile(path.join(sourceDirectory, 'source.ts'), 'export const source = true;\n'),
				writeFile(
					path.join(fixture.root, 'tsconfig.json'),
					JSON.stringify({ files: ['./repository/packages/fixture/src/source.ts'] }),
				),
			]);
			git(repository, ['init', '--quiet']);

			const escaped = run(sourceDirectory, fixture.env, ['source.ts']);
			assert.equal(escaped.status, 1);
			assert.match(escaped.stderr, /No TypeScript project includes: "source\.ts"/);
			await assert.rejects(access(fixture.log));

			await writeFile(
				path.join(packageRoot, 'tsconfig.json'),
				JSON.stringify({ files: ['./src/source.ts'] }),
			);
			const contained = run(sourceDirectory, fixture.env, ['source.ts']);
			assert.equal(contained.status, 0, contained.stderr);
			const [invocation] = await invocations(fixture.log);
			assert.equal(invocation.config.extends, path.join(packageRoot, 'tsconfig.json'));
		} finally {
			await rm(fixture.root, { force: true, recursive: true });
		}
	});

	test('resolves selected paths through repository symlinks before ownership checks', async () => {
		const fixture = await createFixture('octane-typecheck-symlink-');
		const repository = path.join(fixture.root, 'repository');
		const linkedRepository = path.join(fixture.root, 'linked-repository');

		try {
			await mkdir(path.join(repository, 'src'), { recursive: true });
			await Promise.all([
				writeFile(path.join(repository, 'src', 'source.ts'), 'export const source = true;\n'),
				writeFile(
					path.join(repository, 'tsconfig.json'),
					JSON.stringify({ files: ['./src/source.ts'] }),
				),
			]);
			git(repository, ['init', '--quiet']);
			await symlink(
				repository,
				linkedRepository,
				process.platform === 'win32' ? 'junction' : 'dir',
			);

			const result = run(repository, fixture.env, [
				path.join(linkedRepository, 'src', 'source.ts'),
			]);
			assert.equal(result.status, 0, result.stderr);
			const [invocation] = await invocations(fixture.log);
			assert.equal(invocation.config.extends, path.join(repository, 'tsconfig.json'));
		} finally {
			await rm(fixture.root, { force: true, recursive: true });
		}
	});

	test('checks the union of staged and unstaged files from their TypeScript project', async () => {
		const fixture = await createFixture();

		try {
			git(fixture.root, ['init', '--quiet']);
			git(fixture.root, ['config', 'user.email', 'test@example.com']);
			git(fixture.root, ['config', 'user.name', 'Test']);
			await Promise.all([
				writeFile(path.join(fixture.root, 'staged.ts'), 'export const staged = 0;\n'),
				writeFile(path.join(fixture.root, 'unstaged.ts'), 'export const unstaged = 0;\n'),
				writeFile(path.join(fixture.root, 'deleted.ts'), 'export const deleted = 0;\n'),
				writeFile(path.join(fixture.root, 'globals.d.ts'), 'declare const fixture: string;\n'),
				writeFile(
					path.join(fixture.root, 'tsconfig.json'),
					JSON.stringify({
						compilerOptions: { strict: true },
						files: ['./staged.ts', './unstaged.ts', './deleted.ts', './globals.d.ts'],
					}),
				),
			]);
			git(fixture.root, ['add', '.']);
			git(fixture.root, ['commit', '--quiet', '-m', 'fixture']);

			const cleanResult = run(fixture.root, fixture.env);
			assert.equal(cleanResult.status, 0, cleanResult.stderr);
			assert.match(cleanResult.stdout, /No staged or unstaged files to typecheck/);
			await assert.rejects(access(fixture.log));

			await writeFile(path.join(fixture.root, 'staged.ts'), 'export const staged = 1;\n');
			git(fixture.root, ['add', 'staged.ts']);
			await Promise.all([
				writeFile(path.join(fixture.root, 'unstaged.ts'), 'export const unstaged = 1;\n'),
				writeFile(path.join(fixture.root, 'untracked.ts'), 'export const untracked = 1;\n'),
				rm(path.join(fixture.root, 'deleted.ts')),
			]);

			const result = run(fixture.root, fixture.env);
			assert.equal(result.status, 0, result.stderr);
			const [invocation] = await invocations(fixture.log);
			assert.equal(invocation.checker, 'tsgo');
			assert.equal(invocation.config.extends, path.join(fixture.root, 'tsconfig.json'));
			assert.deepEqual(invocation.config.files.sort(), [
				path.join(fixture.root, 'globals.d.ts'),
				path.join(fixture.root, 'staged.ts'),
				path.join(fixture.root, 'unstaged.ts'),
			]);
		} finally {
			await rm(fixture.root, { force: true, recursive: true });
		}
	});

	test('accepts excluded files and folders using the nearest project configuration', async () => {
		const fixture = await createFixture('octane-typecheck-folder-');

		try {
			await mkdir(path.join(fixture.root, 'src'));
			await Promise.all([
				writeFile(path.join(fixture.root, 'src', 'component.tsrx'), 'export function App() @{}\n'),
				writeFile(path.join(fixture.root, 'src', 'helper.ts'), 'export const helper = true;\n'),
				writeFile(path.join(fixture.root, 'src', 'compiler.js'), 'export const compiler = true;\n'),
				writeFile(path.join(fixture.root, 'outside.ts'), 'export const outside = true;\n'),
				writeFile(path.join(fixture.root, 'globals.d.ts'), 'declare const fixture: string;\n'),
				writeFile(
					path.join(fixture.root, 'tsconfig.json'),
					JSON.stringify({
						compilerOptions: { strict: true, target: 'esnext' },
						files: ['./outside.ts', './globals.d.ts'],
					}),
				),
			]);

			const result = run(fixture.root, fixture.env, ['src']);
			assert.equal(result.status, 0, result.stderr);
			const [invocation] = await invocations(fixture.log);
			assert.equal(invocation.checker, 'tsrx-tsc');
			assert.deepEqual(invocation.config.files.sort(), [
				path.join(fixture.root, 'globals.d.ts'),
				path.join(fixture.root, 'src', 'compiler.js'),
				path.join(fixture.root, 'src', 'component.tsrx'),
				path.join(fixture.root, 'src', 'helper.ts'),
			]);
			assert.equal(invocation.config.compilerOptions.allowJs, true);
			assert.equal(invocation.config.compilerOptions.skipLibCheck, true);
			assert.equal(invocation.config.compilerOptions.jsx, 'react-jsx');
			assert.equal(invocation.config.compilerOptions.jsxImportSource, 'octane');
			assert.deepEqual(invocation.config.include, []);
			assert.deepEqual(invocation.config.exclude, []);
		} finally {
			await rm(fixture.root, { force: true, recursive: true });
		}
	});

	test('reports unowned explicit files and preserves checker failures', async () => {
		const fixture = await createFixture('octane-typecheck-failures-');

		try {
			await mkdir(path.join(fixture.root, 'project'));
			await Promise.all([
				writeFile(
					path.join(fixture.root, 'project', 'checked.ts'),
					'export const checked = true;\n',
				),
				writeFile(path.join(fixture.root, 'unowned.ts'), 'export const unowned = true;\n'),
				writeFile(
					path.join(fixture.root, 'project', 'tsconfig.json'),
					JSON.stringify({ files: ['./checked.ts'] }),
				),
			]);

			const unowned = run(fixture.root, fixture.env, ['unowned.ts']);
			assert.equal(unowned.status, 1);
			assert.match(unowned.stderr, /No TypeScript project includes: "unowned\.ts"/);

			const failed = run(fixture.root, { ...fixture.env, TYPECHECK_EXIT_CODE: '7' }, [
				'project/checked.ts',
			]);
			assert.equal(failed.status, 7);
		} finally {
			await rm(fixture.root, { force: true, recursive: true });
		}
	});
});
