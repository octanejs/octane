import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const repoRoot = resolve(root, '../..');

// The committed upstream/ git bytes verify offline against
// audit/upstream.lock.json (upstream git blob shas at the pinned commit).
execFileSync(
	process.execPath,
	[
		resolve(repoRoot, 'scripts/react-port/materialize.mjs'),
		'run',
		'--check',
		'--package-dir',
		root,
	],
	{ cwd: repoRoot, stdio: 'pipe' },
);

// The unpacked registry artifact under upstream-artifact/ stays hash-pinned by
// the artifact ledger plus the recorded tarball metadata.
const expected = JSON.parse(readFileSync(resolve(root, 'audit/upstream-files.json'), 'utf8'));
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const walk = (dir) =>
	readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = resolve(dir, entry.name);
		return entry.isDirectory() ? walk(path) : [path];
	});
const npmFiles = walk(resolve(root, 'upstream-artifact'))
	.map((path) => ({
		path: relative(root, path),
		sha256: hash(path),
	}))
	.sort((a, b) => a.path.localeCompare(b.path));
if (JSON.stringify(npmFiles) !== JSON.stringify(expected.files)) {
	throw new Error(
		'react-dropzone npm-artifact evidence drifted; regenerate only from the pinned artifact',
	);
}
if (npmFiles.length !== 11) throw new Error(`expected 11 npm files, found ${npmFiles.length}`);
const registry = JSON.parse(readFileSync(resolve(root, 'audit/registry-metadata.json'), 'utf8'));
if (registry.sha256 !== expected.npm.tarballSha256 || registry.fileCount !== npmFiles.length) {
	throw new Error('registry tarball metadata drifted');
}
const pkg = JSON.parse(readFileSync(resolve(root, 'upstream-artifact/package.json'), 'utf8'));
const conditions = Object.keys(pkg.exports['.']);
if (JSON.stringify(conditions) !== JSON.stringify(['types', 'import', 'require'])) {
	throw new Error(`root conditions drifted: ${conditions.join(',')}`);
}
if (pkg.exports['./package.json'] !== './package.json')
	throw new Error('./package.json export drifted');
console.log(
	`react-dropzone provenance verified: lock-pinned upstream plus ${npmFiles.length} npm-artifact files`,
);
