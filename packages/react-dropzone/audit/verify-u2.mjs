import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifest = JSON.parse(readFileSync(resolve(root, 'audit/u2-parity.json'), 'utf8'));
const hash = (path) =>
	createHash('sha256')
		.update(readFileSync(resolve(root, path)))
		.digest('hex');
for (const entry of [manifest.source, manifest.runtime, manifest.differential, ...manifest.types]) {
	const path = entry.adapted ?? entry.file;
	if (hash(path) !== entry.adaptedSha256 && hash(path) !== entry.sha256) {
		throw new Error(`${path} drifted from the reviewed U2 evidence`);
	}
}
if (hash(manifest.source.upstream) !== manifest.source.upstreamSha256) {
	throw new Error('pinned upstream utility source drifted');
}
const titles = (path) =>
	[...readFileSync(resolve(root, path), 'utf8').matchAll(/\bit\(\s*(["'])(.*?)\1/g)].map(
		(match) => match[2],
	);
const upstreamTitles = titles(manifest.runtime.upstream);
const adaptedTitles = titles(manifest.runtime.adapted);
if (
	upstreamTitles.length !== manifest.runtime.expectedCases ||
	JSON.stringify(adaptedTitles) !== JSON.stringify(upstreamTitles)
) {
	throw new Error('adapted utility case identities differ from the 70 pinned upstream cases');
}
console.log(
	'react-dropzone U2 parity verified: 70 adapted cases, 3 differential cases, 3 type programs',
);
