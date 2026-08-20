import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(packageRoot, '../..');

// The committed upstream/ tree verifies offline against the upstream git blob
// shas in audit/upstream.lock.json.
execFileSync(
	process.execPath,
	[
		resolve(repoRoot, 'scripts/react-port/materialize.mjs'),
		'run',
		'--check',
		'--package-dir',
		packageRoot,
	],
	{ cwd: repoRoot, stdio: 'pipe' },
);
const rootLicense = await readFile(resolve(packageRoot, 'LICENSE'), 'utf8');
const upstreamLicense = await readFile(resolve(packageRoot, 'upstream/LICENSE'), 'utf8');
if (rootLicense !== upstreamLicense) throw new Error('Published license does not match upstream');
console.log('react-day-picker v10.0.1 upstream evidence verified');
