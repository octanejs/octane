import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUpstreamCrosswalk } from './upstream-crosswalk-lib.mjs';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(PACKAGE_ROOT, '../..');
const crosswalk = JSON.parse(
	readFileSync(resolve(PACKAGE_ROOT, 'audit/upstream-crosswalk.json'), 'utf8'),
);
const vendoredRoot = resolve(PACKAGE_ROOT, 'upstream');

function walk(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) return walk(path);
		return entry.isFile() ? [path] : [];
	});
}

// The committed upstream/ tree verifies offline against the upstream git blob
// shas in audit/upstream.lock.json.
execFileSync(
	process.execPath,
	[
		resolve(REPO_ROOT, 'scripts/react-port/materialize.mjs'),
		'run',
		'--check',
		'--package-dir',
		PACKAGE_ROOT,
	],
	{ cwd: REPO_ROOT, stdio: 'pipe' },
);
const vendoredFiles = walk(vendoredRoot).map((path) =>
	path
		.slice(vendoredRoot.length + 1)
		.split('\\')
		.join('/'),
);
if (vendoredFiles.length !== 1129) throw new Error('vendored Base UI file inventory drifted');

const regenerated = buildUpstreamCrosswalk(vendoredRoot, REPO_ROOT);
if (JSON.stringify(crosswalk) !== JSON.stringify(regenerated))
	throw new Error('crosswalk drifted from the byte-exact vendored Base UI evidence');

if (crosswalk.provenance.commit !== 'b34551d644f2e58ebf8fc1050d949f6654ceca6c')
	throw new Error('crosswalk does not target the pinned Base UI commit');
if (crosswalk.surface.length !== 43 || new Set(crosswalk.surface.map(([path]) => path)).size !== 43)
	throw new Error('crosswalk must classify 43 unique public subpaths');
if (
	crosswalk.upstreamArtifacts.length !== 348 ||
	new Set(crosswalk.upstreamArtifacts.map(([path]) => path)).size !== 348
)
	throw new Error('crosswalk must classify 348 unique upstream test/support artifacts');
for (const [subpath, disposition, evidence] of crosswalk.surface) {
	if (!['surface-present-unverified', 'gap'].includes(disposition) || !evidence)
		throw new Error(`${subpath}: invalid surface disposition or evidence`);
	const present = existsSync(resolve(REPO_ROOT, `packages/base-ui/src/${subpath.slice(2)}.ts`));
	if (present !== (disposition === 'surface-present-unverified'))
		throw new Error(`${subpath}: disposition no longer matches the live Octane surface`);
}
if (
	crosswalk.upstreamArtifacts.some(
		(entry) => !['partially-adapted', 'not-adapted', 'vendored-support'].includes(entry[2]),
	)
)
	throw new Error('every upstream artifact requires a supported disposition');

console.log(
	`Base UI upstream crosswalk is current (${crosswalk.surface.length} subpaths, ${crosswalk.upstreamArtifacts.length} artifacts).`,
);
