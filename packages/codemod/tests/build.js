import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export default function buildCodemod() {
	const require = createRequire(import.meta.url);
	execFileSync(
		process.execPath,
		[
			require.resolve('typescript/bin/tsc'),
			'-p',
			fileURLToPath(new URL('../tsconfig.json', import.meta.url)),
		],
		{ stdio: 'inherit' },
	);
}
