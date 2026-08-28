#!/usr/bin/env node
// CLI for the config-driven provenance verifier: reads the package's
// audit/provenance.json and fails closed on any drift. See
// provenance-manifest-lib.mjs for the config schema.
import { basename, resolve } from 'node:path';

import { verifyProvenanceManifest } from './provenance-manifest-lib.mjs';

const flagIndex = process.argv.indexOf('--package-dir');
const packageDir = flagIndex === -1 ? process.cwd() : resolve(process.argv[flagIndex + 1]);
const result = verifyProvenanceManifest(packageDir);
console.log(
	`${basename(packageDir)} provenance verified (lock-pinned upstream tree, ${result.files} files).`,
);
