import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { verifyMaterializedUpstreamEvidence } from '../../../scripts/react-parity/materialized-upstream-lib.mjs';
import { buildUpstreamCrosswalk } from './upstream-crosswalk-lib.mjs';

const packageRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(packageRoot, '../..');
const output = resolve(process.argv[2] ?? resolve(packageRoot, 'audit/upstream-crosswalk.json'));
verifyMaterializedUpstreamEvidence(repoRoot, 'packages/base-ui');
const result = buildUpstreamCrosswalk(resolve(packageRoot, 'upstream'), repoRoot);
writeFileSync(
	output,
	await format(JSON.stringify(result), {
		...(await resolveConfig(output, { editorconfig: true })),
		filepath: output,
		parser: 'json',
	}),
);
