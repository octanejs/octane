import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('audit/upstream-files.json', root), 'utf8'));
const expected = {
	LICENSE: '2c2a938456c54cab1c4ecd38ea08230c063d9f1a478fc30ec5b172682f9fb1b1',
	'upstream-artifact/react-textarea-autosize-8.5.9.tgz': manifest.source.npmTarballSha256,
	'upstream-artifact/dist/declarations/src/index.d.ts':
		'4b44a78900c844368d8f27ce485bb55bd17ba164cb31e3b8bbc64c6800da506c',
};
for (const [file, digest] of Object.entries(expected)) {
	const actual = createHash('sha256')
		.update(await readFile(new URL(file, root)))
		.digest('hex');
	if (actual !== digest) throw new Error(`${file}: expected ${digest}, got ${actual}`);
}
// The committed upstream/ source tree verifies offline against
// audit/upstream.lock.json (upstream git blob shas at the pinned commit);
// scripts/react-parity runs that check for every lock-pinned package.
const pkg = JSON.parse(await readFile(new URL('upstream/package.json', root), 'utf8'));
if (pkg.name !== 'react-textarea-autosize' || pkg.version !== '8.5.9' || pkg.license !== 'MIT')
	throw new Error('upstream package identity mismatch');
const bindingPkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const leafPaths = (value, prefix = '') =>
	Object.entries(value).flatMap(([key, child]) =>
		typeof child === 'object' && child !== null
			? leafPaths(child, `${prefix}${key}.`)
			: `${prefix}${key}`,
	);
const upstreamConditions = leafPaths(pkg.exports).sort();
const bindingConditions = leafPaths(bindingPkg.exports).sort();
if (JSON.stringify(bindingConditions) !== JSON.stringify(upstreamConditions)) {
	throw new Error(
		`package export condition mismatch\nexpected: ${upstreamConditions.join(', ')}\nactual: ${bindingConditions.join(', ')}`,
	);
}
for (const unpublished of [
	'audit',
	'scripts',
	'tests',
	'typetests',
	'upstream',
	'upstream-artifact',
]) {
	if (bindingPkg.files.includes(unpublished))
		throw new Error(`${unpublished}/ must remain unpublished evidence`);
}
const source = await readFile(new URL('src/index.tsrx', root), 'utf8');
for (const marker of [
	'export default function TextareaAutosize',
	'export interface TextareaAutosizeProps',
	'export type TextareaHeightChangeMeta',
]) {
	if (!source.includes(marker)) throw new Error(`missing public surface marker: ${marker}`);
}
console.log('verified react-textarea-autosize@8.5.9 npm-artifact and package-contract evidence');
