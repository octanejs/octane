import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const expected = JSON.parse(readFileSync(resolve(root, 'audit/upstream-files.json'), 'utf8'));
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const walk = (dir) =>
	readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = resolve(dir, entry.name);
		return entry.isDirectory() ? walk(path) : [path];
	});
const actual = walk(resolve(root, 'upstream'))
	.map((path) => ({
		path: relative(root, path),
		sha256: hash(path),
	}))
	.sort((a, b) => a.path.localeCompare(b.path));
if (JSON.stringify(actual) !== JSON.stringify(expected.files)) {
	throw new Error(
		'react-dropzone upstream evidence drifted; regenerate only from both pinned artifacts',
	);
}
const npmFiles = actual.filter(({ path }) => path.startsWith('upstream/npm/'));
if (npmFiles.length !== 11) throw new Error(`expected 11 npm files, found ${npmFiles.length}`);
const registry = JSON.parse(readFileSync(resolve(root, 'audit/registry-metadata.json'), 'utf8'));
if (registry.sha256 !== expected.npm.tarballSha256 || registry.fileCount !== npmFiles.length) {
	throw new Error('registry tarball metadata drifted');
}
const pkg = JSON.parse(readFileSync(resolve(root, 'upstream/npm/package.json'), 'utf8'));
const conditions = Object.keys(pkg.exports['.']);
if (JSON.stringify(conditions) !== JSON.stringify(['types', 'import', 'require'])) {
	throw new Error(`root conditions drifted: ${conditions.join(',')}`);
}
if (pkg.exports['./package.json'] !== './package.json')
	throw new Error('./package.json export drifted');
console.log(`react-dropzone provenance verified: ${actual.length} files (${npmFiles.length} npm)`);
