import { resolve } from 'node:path';

import { verifyVaulUpstream as verifyPackageUpstream } from '../../packages/vaul/scripts/verify-upstream.mjs';

/**
 * Repo-root entry point for react-parity:check.
 */
export function verifyVaulUpstream(repoRoot) {
	return verifyPackageUpstream(resolve(repoRoot, 'packages/vaul'));
}
