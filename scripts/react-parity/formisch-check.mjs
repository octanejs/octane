#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyFormischTestClassifications } from './formisch-classifications-lib.mjs';
import { verifyFormischUpstream } from './formisch-upstream-lib.mjs';
import { loadManifest, requiredExecutableLanes } from './harness-lib.mjs';
import { verifyTypeParity } from './type-parity-lib.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const manifestPath = 'packages/formisch/audit/react-parity.json';
verifyFormischUpstream(root, {
	integrity: '3f9c1c6da89473296033cc2701405080b2cb11478724bc7f045063ee618aaf57',
});
verifyTypeParity(root, { configPath: 'packages/formisch/audit/type-parity.json' });
verifyFormischTestClassifications(root);
execFileSync(
	process.execPath,
	['scripts/react-parity/harness.mjs', 'validate', '--manifest', manifestPath],
	{ cwd: root, stdio: 'inherit' },
);
const manifest = await loadManifest(resolve(root, manifestPath));
for (const lane of requiredExecutableLanes(manifest)) {
	execFileSync(
		process.execPath,
		['scripts/react-parity/harness.mjs', 'run', '--manifest', manifestPath, '--lane', lane.id],
		{ cwd: root, stdio: 'inherit' },
	);
}
console.log(
	`Formisch parity verified (${requiredExecutableLanes(manifest).length} required lanes).`,
);
