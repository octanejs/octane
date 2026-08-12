import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('audit/upstream-files.json', root), 'utf8'));
const expected = {
	LICENSE: '2c2a938456c54cab1c4ecd38ea08230c063d9f1a478fc30ec5b172682f9fb1b1',
	'upstream/react-textarea-autosize-8.5.9.tgz': manifest.source.npmTarballSha256,
	'upstream/package.json': '196a091a631d8addf1573dcbe2f3c09d4603f9b27309ffc2f309503664a50ee4',
	'upstream/dist/declarations/src/index.d.ts':
		'4b44a78900c844368d8f27ce485bb55bd17ba164cb31e3b8bbc64c6800da506c',
};
for (const [file, digest] of Object.entries(expected)) {
	const actual = createHash('sha256')
		.update(await readFile(new URL(file, root)))
		.digest('hex');
	if (actual !== digest) throw new Error(`${file}: expected ${digest}, got ${actual}`);
}
const sourceFiles = (
	await readdir(new URL('upstream/src/', root), { recursive: true, withFileTypes: true })
).filter((entry) => entry.isFile());
const sourceRoot = new URL('upstream/src/', root).pathname;
const actualPaths = sourceFiles
	.map((entry) => {
		const parent = entry.parentPath.slice(sourceRoot.length);
		return parent ? `${parent}/${entry.name}` : entry.name;
	})
	.sort();
const expectedPaths = Object.keys(manifest.files).sort();
if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
	throw new Error(
		`upstream source inventory mismatch\nexpected: ${expectedPaths.join(', ')}\nactual: ${actualPaths.join(', ')}`,
	);
}
for (const [file, digest] of Object.entries(manifest.files)) {
	const actual = createHash('sha256')
		.update(await readFile(new URL(`upstream/src/${file}`, root)))
		.digest('hex');
	if (actual !== digest) throw new Error(`upstream/src/${file}: expected ${digest}, got ${actual}`);
}
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
for (const unpublished of ['audit', 'scripts', 'tests', 'typetests', 'upstream']) {
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
console.log(
	`verified react-textarea-autosize@8.5.9: ${sourceFiles.length} byte-pinned source/test artifacts`,
);
