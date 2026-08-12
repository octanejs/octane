import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifest = JSON.parse(readFileSync(resolve(root, 'audit/u4-parity.json'), 'utf8'));
const hash = (path) =>
	createHash('sha256')
		.update(readFileSync(resolve(root, path)))
		.digest('hex');
const entries = [
	manifest.runtime,
	manifest.probe,
	manifest.adapted,
	manifest.differential,
	...manifest.browser,
	...manifest.types,
];
for (const { file, sha256 } of entries) {
	if (hash(file) !== sha256) throw new Error(`${file} drifted from reviewed U4 evidence`);
}
const cases = (path) =>
	[...readFileSync(resolve(root, path), 'utf8').matchAll(/\bit\(\s*(["'])(.*?)\1/g)].length;
if (cases(manifest.adapted.file) !== manifest.adapted.cases)
	throw new Error('U4 adapted case inventory drifted');
if (cases(manifest.differential.file) !== manifest.differential.cases)
	throw new Error('U4 differential case inventory drifted');
if (cases(manifest.browser[1].file) !== manifest.browser[1].cases)
	throw new Error('U4 browser case inventory drifted');
console.log(
	'react-dropzone U4 parity verified: 11 adapted, 2 differential, 2 Chromium, 1 type program',
);
