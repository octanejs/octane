import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { verifyMaterializedUpstreamEvidence } from '../../../scripts/react-parity/materialized-upstream-lib.mjs';
import { buildUpstreamCrosswalk } from './upstream-crosswalk-lib.mjs';

const packageRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(packageRoot, '../..');
verifyMaterializedUpstreamEvidence(repoRoot, 'packages/base-ui');
const crosswalk = JSON.parse(
	readFileSync(resolve(packageRoot, 'audit/upstream-crosswalk.json'), 'utf8'),
);
const regenerated = buildUpstreamCrosswalk(resolve(packageRoot, 'upstream'), repoRoot);
if (JSON.stringify(crosswalk) !== JSON.stringify(regenerated)) {
	throw new Error('Base UI crosswalk drifted from its pinned source and adapted file mappings');
}
if (
	crosswalk.summary.gaps !== 0 ||
	crosswalk.upstreamArtifacts.some((entry) => entry[2] === 'not-adapted')
) {
	throw new Error('Base UI has an unimplemented export or missing adapted upstream artifact');
}
console.log(
	`Base UI crosswalk is current (${crosswalk.surface.length} entries, ${crosswalk.upstreamArtifacts.length} adapted artifacts; runtime verification is tracked separately).`,
);
