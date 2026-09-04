import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runConfiguredPristineSuite } from './pristine-suite-lib.mjs';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export function runPristineUpstreamSuite({ repoRoot = defaultRoot, reportPath } = {}) {
	return runConfiguredPristineSuite(repoRoot, 'packages/octane-is', { reportPath });
}
