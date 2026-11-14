import { resolve } from 'node:path';
import { runConfiguredPristineSuite } from './pristine-suite-lib.mjs';

export function runPristineUpstreamSuite({
	repoRoot = resolve(import.meta.dirname, '../..'),
	reportPath,
} = {}) {
	return runConfiguredPristineSuite(repoRoot, 'packages/lottie-react', { reportPath });
}
