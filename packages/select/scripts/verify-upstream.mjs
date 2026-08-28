import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const upstreamRoot = process.env.REACT_SELECT_UPSTREAM_ROOT ?? join(packageRoot, 'upstream');
const checksumFile = join(upstreamRoot, 'SHA256SUMS');
const expectedChecksumManifestDigest =
	'afe9505b2eb1fc35eec286aec284a35524eab572bde3946703a2453c343a1b8a';

function filesBelow(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		return entry.isDirectory() ? filesBelow(path) : [path];
	});
}

const checksumBytes = readFileSync(checksumFile);
assert.equal(
	createHash('sha256').update(checksumBytes).digest('hex'),
	expectedChecksumManifestDigest,
	'SHA256SUMS differs from the independently pinned canonical manifest',
);

const expected = new Map(
	checksumBytes
		.toString('utf8')
		.trim()
		.split('\n')
		.map((line) => {
			const match = line.match(/^([a-f0-9]{64})  \.\/(.+)$/);
			assert.ok(match, `invalid SHA256SUMS row: ${line}`);
			return [match[2], match[1]];
		}),
);
const actualFiles = filesBelow(upstreamRoot)
	.filter((path) => path !== checksumFile)
	.map((path) => relative(upstreamRoot, path))
	.sort();

assert.deepEqual(actualFiles, [...expected.keys()].sort(), 'vendored upstream file set drifted');
for (const file of actualFiles) {
	const digest = createHash('sha256')
		.update(readFileSync(join(upstreamRoot, file)))
		.digest('hex');
	assert.equal(digest, expected.get(file), `${file} differs from the pinned upstream bytes`);
}

const metadata = JSON.parse(readFileSync(join(upstreamRoot, 'package.json'), 'utf8'));
assert.equal(metadata.name, 'react-select');
assert.equal(metadata.version, '5.10.2');
assert.equal(metadata.license, 'MIT');
assert.equal(actualFiles.filter((file) => file.startsWith('src/')).length, 61);
assert.equal(
	actualFiles.filter((file) => /src\/__tests__\/[^/]+\.test\.tsx$/.test(file)).length,
	5,
);
assert.equal(actualFiles.filter((file) => file.endsWith('.snap')).length, 5);
assert.equal(
	createHash('sha256')
		.update(readFileSync(join(upstreamRoot, 'LICENSE')))
		.digest('hex'),
	'd736dd18c7e53f88217fa2106c748f1a1687bb91d69a1f673fa685269402d784',
);

process.stdout.write(`react-select@5.10.2 upstream verified: ${actualFiles.length} files\n`);
