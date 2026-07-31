import { existsSync } from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const MODES = new Set(['--check', '--write']);

function changedPaths(cwd, staged) {
	return execFileSync(
		'git',
		['diff', ...(staged ? ['--cached'] : []), '--name-only', '--diff-filter=ACMR', '-z', '--'],
		{ cwd, encoding: 'utf8' },
	)
		.split('\0')
		.filter(Boolean);
}

function collectChangedPaths(cwd) {
	const repositoryRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
		cwd,
		encoding: 'utf8',
	}).trimEnd();
	// Keep the two layers separate: staged and unstaged edits can cancel each
	// other relative to HEAD while both still identify a file being worked on.
	const paths = new Set([
		...changedPaths(repositoryRoot, true),
		...changedPaths(repositoryRoot, false),
	]);
	return {
		files: [...paths].filter((file) => existsSync(path.resolve(repositoryRoot, file))),
		repositoryRoot,
	};
}

function parseArguments(argv) {
	const [mode, separator, ...paths] = argv;
	if (!MODES.has(mode) || separator !== '--') {
		throw new Error('Usage: node scripts/format-files.mjs (--write|--check) -- [path ...]');
	}
	return { mode, paths };
}

function main() {
	const { mode, paths } = parseArguments(process.argv.slice(2));
	const usesGitPaths = paths.length === 0;
	const workingDirectory = process.cwd();
	const changed = usesGitPaths ? collectChangedPaths(workingDirectory) : undefined;
	const files = changed?.files ?? paths;
	const prettierCwd = changed?.repositoryRoot ?? workingDirectory;

	if (files.length === 0) {
		console.log('No staged or unstaged files to format.');
		return 0;
	}

	const gitPathOptions = usesGitPaths
		? ['--ignore-unknown', '--no-error-on-unmatched-pattern']
		: [];
	const result = spawnSync('prettier', [mode, ...gitPathOptions, '--', ...files], {
		cwd: prettierCwd,
		stdio: 'inherit',
	});
	if (result.error) throw result.error;
	return result.status ?? 1;
}

try {
	process.exitCode = main();
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
}
