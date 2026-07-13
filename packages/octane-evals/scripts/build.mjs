import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = join(packageRoot, '..', '..');

rmSync(join(packageRoot, 'dist'), { recursive: true, force: true });
execFileSync(
	join(repositoryRoot, 'node_modules', '.bin', 'tsc'),
	['-p', join(packageRoot, 'tsconfig.build.json')],
	{ stdio: 'inherit' },
);

console.log('@octanejs/evals: built runnable ESM and declarations in dist/');
