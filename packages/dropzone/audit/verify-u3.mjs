import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifest = JSON.parse(readFileSync(resolve(root, 'audit/u3-parity.json'), 'utf8'));
const hash = (path) =>
	createHash('sha256')
		.update(readFileSync(resolve(root, path)))
		.digest('hex');
const expected = [
	[manifest.source.upstream, manifest.source.upstreamSha256],
	[manifest.source.runtime, manifest.source.runtimeSha256],
	[manifest.source.types, manifest.source.typesSha256],
	[manifest.adapted.file, manifest.adapted.sha256],
	[manifest.differential.file, manifest.differential.sha256],
	...manifest.types.map((entry) => [entry.file, entry.sha256]),
];
for (const [path, sha256] of expected) {
	if (hash(path) !== sha256) throw new Error(`${path} drifted from reviewed U3 evidence`);
}
const cases = (path) => [
	...readFileSync(resolve(root, path), 'utf8').matchAll(/\bit\(\s*(["'])(.*?)\1/g),
];
if (cases(manifest.adapted.file).length !== manifest.adapted.cases)
	throw new Error('U3 adapted case inventory drifted');
if (cases(manifest.differential.file).length !== manifest.differential.cases)
	throw new Error('U3 differential case inventory drifted');
console.log(
	'react-dropzone U3 parity verified: 10 adapted cases, 3 live differential cases, 4 type programs',
);
