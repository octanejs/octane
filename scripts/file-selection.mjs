import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

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
		paths: [...paths].filter((file) => existsSync(path.resolve(repositoryRoot, file))),
		workingDirectory: repositoryRoot,
	};
}

export function resolveFileSelection(paths, cwd = process.cwd()) {
	if (paths.length > 0) {
		return { paths, workingDirectory: cwd, usesGitPaths: false };
	}

	return { ...collectChangedPaths(cwd), usesGitPaths: true };
}
