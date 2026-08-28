#!/usr/bin/env node
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	inventoryFromIdentities as configuredInventoryFromIdentities,
	pristineIdentitiesFromReport,
	runConfiguredPristineSuite,
} from './pristine-suite-lib.mjs';

// The runner behavior lives in packages/livestore/audit/pristine-suite.json,
// executed by the shared config-driven engine; this module keeps the
// package-scoped export names its consumers import.
const PACKAGE_PATH = 'packages/livestore';
const repoRootDefault = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export function pristineTestIdentities(report, repoRoot = repoRootDefault) {
	return pristineIdentitiesFromReport(report, { repoRoot, packagePath: PACKAGE_PATH });
}

export function runPristineUpstreamSuite({ repoRoot = repoRootDefault, reportPath } = {}) {
	return runConfiguredPristineSuite(repoRoot, PACKAGE_PATH, { reportPath });
}

export function inventoryFromIdentities(identities) {
	return configuredInventoryFromIdentities(identities, {
		project: 'livestore-pristine',
		roots: ['packages/livestore/upstream'],
	});
}
