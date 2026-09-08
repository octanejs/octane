#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	renderAdaptedCaseContracts,
	verifyReactTransitionGroupUpstream,
} from './react-transition-group-upstream-lib.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const write = process.argv.includes('--write');

if (write) {
	const contractsPath = resolve(
		root,
		'packages/transition-group/audit/adapted-case-contracts.json',
	);
	writeFileSync(contractsPath, renderAdaptedCaseContracts(root));
	console.log(`wrote ${contractsPath}`);
}

const summary = verifyReactTransitionGroupUpstream(root);
console.log(
	`react-transition-group upstream verified: ${summary.artifacts} artifacts, ${summary.cases} cases, ${summary.contractAssertions} adapted assertions across ${summary.contractCases} contracts`,
);
