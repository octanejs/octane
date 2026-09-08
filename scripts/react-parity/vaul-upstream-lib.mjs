import { resolve } from 'node:path';

import { verifyProvenanceManifest as verifyPackageUpstream } from './provenance-manifest-lib.mjs';

/**
 * Repo-root entry point for react-parity:check.
 */
export function verifyVaulUpstream(repoRoot, options) {
	return verifyPackageUpstream(resolve(repoRoot, 'packages/vaul'), options);
}
