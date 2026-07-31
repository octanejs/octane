import { spawnSync } from 'node:child_process';
import { resolveFileSelection } from './file-selection.mjs';

const MODES = new Set(['--check', '--write']);

function parseArguments(argv) {
	const [mode, separator, ...paths] = argv;
	if (!MODES.has(mode) || separator !== '--') {
		throw new Error('Usage: node scripts/format-files.mjs (--write|--check) -- [path ...]');
	}
	return { mode, paths };
}

function main() {
	const { mode, paths } = parseArguments(process.argv.slice(2));
	const selection = resolveFileSelection(paths);

	if (selection.paths.length === 0) {
		console.log('No staged or unstaged files to format.');
		return 0;
	}

	const gitPathOptions = selection.usesGitPaths
		? ['--ignore-unknown', '--no-error-on-unmatched-pattern']
		: [];
	const result = spawnSync('prettier', [mode, ...gitPathOptions, '--', ...selection.paths], {
		cwd: selection.workingDirectory,
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
