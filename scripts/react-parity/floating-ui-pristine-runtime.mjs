#!/usr/bin/env node
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	inventoryFromIdentities as configuredInventoryFromIdentities,
	pristineIdentitiesFromReport,
	runConfiguredPristineSuite,
} from './pristine-suite-lib.mjs';

const PACKAGE_PATH = 'packages/floating-ui';
const repoRootDefault = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export function pristineTestIdentities(report, repoRoot = repoRootDefault) {
	return pristineIdentitiesFromReport(report, { repoRoot, packagePath: PACKAGE_PATH });
}

export function runPristineUpstreamSuite({ repoRoot = repoRootDefault, reportPath } = {}) {
	return runConfiguredPristineSuite(repoRoot, PACKAGE_PATH, { reportPath });
}

export function inventoryFromIdentities(identities) {
	return configuredInventoryFromIdentities(identities, {
		project: 'floating-ui-pristine',
		roots: ['packages/floating-ui/upstream'],
	});
}
