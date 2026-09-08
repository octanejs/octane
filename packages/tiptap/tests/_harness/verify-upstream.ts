/**
 * Fail closed before the pristine TipTap suite runs if the committed upstream
 * bytes drift from audit/upstream.lock.json (each file's upstream git blob
 * sha at the pinned commit).
 */
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

execFileSync(
	process.execPath,
	[
		resolve(repoRoot, 'scripts/react-port/materialize.mjs'),
		'run',
		'--check',
		'--package-dir',
		resolve(repoRoot, 'packages/tiptap'),
	],
	{ cwd: repoRoot, stdio: 'pipe' },
);
