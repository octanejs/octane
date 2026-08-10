import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const upstreamRoot = resolve(packageRoot, 'upstream');

function walk(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = resolve(directory, entry.name);
		return entry.isDirectory()
			? walk(path)
			: entry.isFile() && entry.name !== 'SHA256SUMS'
				? [path]
				: [];
	});
}

const checksums = new Map(
	readFileSync(resolve(upstreamRoot, 'SHA256SUMS'), 'utf8')
		.trim()
		.split('\n')
		.map((line) => {
			const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
			if (!match) throw new Error(`invalid checksum line: ${line}`);
			return [match[2], match[1]];
		}),
);
const files = walk(upstreamRoot)
	.map((path) => relative(upstreamRoot, path).split(sep).join('/'))
	.sort();
if (
	files.length !== 52 ||
	checksums.size !== files.length ||
	files.some((path) => !checksums.has(path))
)
	throw new Error('vendored TanStack React Pacer file inventory drifted');
for (const path of files) {
	const digest = createHash('sha256')
		.update(readFileSync(resolve(upstreamRoot, path)))
		.digest('hex');
	if (digest !== checksums.get(path)) throw new Error(`vendored upstream bytes drifted: ${path}`);
}

const upstreamTypes = JSON.parse(
	readFileSync(resolve(packageRoot, 'audit/upstream-types.json'), 'utf8'),
);
const sourceRelPaths = files
	.filter((path) => path.startsWith('package/src/'))
	.map((path) => path.slice('package/src/'.length))
	.sort();
const inventoryPaths = upstreamTypes.map((entry) => entry.path).sort();
if (JSON.stringify(sourceRelPaths) !== JSON.stringify(inventoryPaths))
	throw new Error('upstream-types inventory drifted from vendored source files');
for (const entry of upstreamTypes) {
	const digest = createHash('sha256')
		.update(readFileSync(resolve(upstreamRoot, 'package/src', entry.path)))
		.digest('hex');
	if (digest !== entry.sha256) throw new Error(`upstream-types hash drifted: ${entry.path}`);
}

const metadata = JSON.parse(readFileSync(resolve(upstreamRoot, 'package/package.json'), 'utf8'));
if (
	metadata.name !== '@tanstack/react-pacer' ||
	metadata.version !== '0.22.1' ||
	metadata.dependencies['@tanstack/pacer'] !== 'workspace:*' ||
	Object.keys(metadata.exports).length !== 16
)
	throw new Error('upstream package metadata drifted');
const sourceFiles = files.filter((path) => path.startsWith('package/src/'));
const testFiles = files.filter((path) => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path));
if (sourceFiles.length !== 43 || testFiles.length !== 0)
	throw new Error('upstream source or runtime suite inventory drifted');

const crosswalk = JSON.parse(
	readFileSync(resolve(packageRoot, 'audit/upstream-crosswalk.json'), 'utf8'),
);
const octaneMetadata = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));
const upstreamPaths = Object.keys(metadata.exports).sort();
const declaredPaths = crosswalk.publicEntrypoints.map((entry) => entry.path).sort();
if (JSON.stringify(upstreamPaths) !== JSON.stringify(declaredPaths))
	throw new Error('upstream entrypoint crosswalk drifted');
const expectedOctanePaths = upstreamPaths.filter((path) => path !== './package.json');
if (
	JSON.stringify(Object.keys(octaneMetadata.exports).sort()) !== JSON.stringify(expectedOctanePaths)
)
	throw new Error('Octane entrypoint surface drifted');

if (!Array.isArray(crosswalk.exports) || crosswalk.exports.length === 0)
	throw new Error('upstream export crosswalk must enumerate symbols');
const expectedTotals = crosswalk.expectedTotals;
if (
	!expectedTotals ||
	expectedTotals.exports !== crosswalk.exports.length ||
	expectedTotals.adapterValues !==
		crosswalk.exports.filter((entry) => entry.kind === 'value').length ||
	expectedTotals.adapterTypes !==
		crosswalk.exports.filter((entry) => entry.kind === 'type').length ||
	expectedTotals.coreStarReexports !==
		crosswalk.exports.filter((entry) => entry.kind === 'star-reexport').length
)
	throw new Error('upstream export crosswalk totals drifted');
for (const entry of crosswalk.exports) {
	if (!entry.name || !entry.kind || !entry.entrypoint || !entry.disposition || !entry.evidence)
		throw new Error(`export crosswalk row incomplete: ${JSON.stringify(entry)}`);
}
if (crosswalk.typeSuite?.disposition !== 'compile-only')
	throw new Error('typeSuite must record compile-only pristine/adapted lanes');

console.log(
	`TanStack React Pacer upstream ledger is current (52 files, 43 source files, 16 entrypoints, ${crosswalk.exports.length} export rows, compile-only type suite, no runtime test suite).`,
);
