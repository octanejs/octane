import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { buildUpstreamCrosswalk } from './upstream-crosswalk-lib.mjs';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(PACKAGE_ROOT, '../..');
const upstreamRoot = resolve(process.argv[2] ?? '');
const output = resolve(process.argv[3] ?? join(PACKAGE_ROOT, 'audit/upstream-crosswalk.json'));
const PINNED_COMMIT = 'b34551d644f2e58ebf8fc1050d949f6654ceca6c';

if (!process.argv[2])
	throw new Error('usage: node build-upstream-crosswalk.mjs <pinned-base-ui-checkout> [output]');

const actualCommit = execFileSync('git', ['-C', upstreamRoot, 'rev-parse', 'HEAD'], {
	encoding: 'utf8',
}).trim();
if (actualCommit !== PINNED_COMMIT)
	throw new Error(`upstream checkout must be pinned to ${PINNED_COMMIT}; found ${actualCommit}`);
for (const args of [
	['-C', upstreamRoot, 'diff', '--quiet'],
	['-C', upstreamRoot, 'diff', '--cached', '--quiet'],
]) {
	try {
		execFileSync('git', args, { stdio: 'pipe' });
	} catch {
		throw new Error('upstream checkout must have no tracked modifications');
	}
}

const result = buildUpstreamCrosswalk(upstreamRoot, REPO_ROOT);

writeFileSync(
	output,
	await format(JSON.stringify(result), {
		...(await resolveConfig(output, { editorconfig: true })),
		filepath: output,
		parser: 'json',
	}),
);
