import { execFileSync } from 'node:child_process';

export function runRequiredBindingLanes({
	relativeFile,
	harnessPath,
	repo,
	execFile = execFileSync,
}) {
	execFile(process.execPath, [harnessPath, 'run-required', '--manifest', relativeFile], {
		cwd: repo,
		stdio: 'inherit',
	});
}
