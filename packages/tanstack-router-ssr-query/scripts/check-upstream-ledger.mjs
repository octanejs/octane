import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const upstreamRoot = resolve(packageRoot, 'upstream');

function walk(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap(function walkEntry(entry) {
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
		.map(function parseChecksum(line) {
			const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
			if (!match) throw new Error(`invalid checksum line: ${line}`);
			return [match[2], match[1]];
		}),
);
const files = walk(upstreamRoot)
	.map(function toPortable(path) {
		return relative(upstreamRoot, path).split(sep).join('/');
	})
	.sort();
if (
	files.length !== 9 ||
	checksums.size !== files.length ||
	files.some(function missingChecksum(path) {
		return !checksums.has(path);
	})
)
	throw new Error('vendored TanStack React Router SSR Query file inventory drifted');
for (const path of files) {
	const digest = createHash('sha256')
		.update(readFileSync(resolve(upstreamRoot, path)))
		.digest('hex');
	if (digest !== checksums.get(path)) throw new Error(`vendored upstream bytes drifted: ${path}`);
}

const metadata = JSON.parse(readFileSync(resolve(upstreamRoot, 'package/package.json'), 'utf8'));
if (
	metadata.name !== '@tanstack/react-router-ssr-query' ||
	metadata.version !== '1.167.1' ||
	metadata.dependencies['@tanstack/router-ssr-query-core'] !== 'workspace:*' ||
	Object.keys(metadata.exports).length !== 2
)
	throw new Error('upstream package metadata drifted');
const sourceFiles = files.filter(function isSource(path) {
	return path.startsWith('package/src/');
});
const testFiles = files.filter(function isTest(path) {
	return /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path);
});
if (sourceFiles.length !== 1 || testFiles.length !== 0)
	throw new Error('upstream source or runtime suite inventory drifted');

const crosswalk = JSON.parse(
	readFileSync(resolve(packageRoot, 'audit/upstream-crosswalk.json'), 'utf8'),
);
const upstreamPaths = Object.keys(metadata.exports).sort();
const declaredPaths = crosswalk.publicEntrypoints
	.map(function entryPath(entry) {
		return entry.path;
	})
	.sort();
if (JSON.stringify(upstreamPaths) !== JSON.stringify(declaredPaths))
	throw new Error('upstream entrypoint crosswalk drifted');

const runtimeEntrypoint = crosswalk.publicEntrypoints.find(function findRuntime(entry) {
	return entry.path === '.';
});
const metadataEntrypoint = crosswalk.publicEntrypoints.find(function findMetadata(entry) {
	return entry.path === './package.json';
});
if (!runtimeEntrypoint?.exports || !Array.isArray(runtimeEntrypoint.exports))
	throw new Error('runtime entrypoint must declare export-by-export rows');
const exportNames = runtimeEntrypoint.exports
	.map(function exportName(entry) {
		return entry.name;
	})
	.sort();
if (JSON.stringify(exportNames) !== JSON.stringify(['Options', 'setupRouterSsrQueryIntegration']))
	throw new Error('runtime entrypoint export crosswalk drifted');
for (const entry of runtimeEntrypoint.exports) {
	if (!entry.disposition || !entry.evidence || !entry.kind)
		throw new Error(`export ${entry.name} must declare kind, disposition, and evidence`);
}
if (
	metadataEntrypoint?.disposition !== 'intentionally-omitted' ||
	!metadataEntrypoint.consumerImpact ||
	!metadataEntrypoint.statusAgreement
)
	throw new Error('./package.json gap must record omission, consumer impact, and status agreement');

if (crosswalk.typeSuite?.disposition !== 'present')
	throw new Error('type suite must be present and inventoried');
if (!crosswalk.typeSuite.pristineProject || !crosswalk.typeSuite.adaptedProject)
	throw new Error('type suite must point at pristine and adapted compile projects');
if (
	crosswalk.typeSuite.pristineProject !==
	'packages/tanstack-router-ssr-query/upstream/package/tsconfig.build.json'
)
	throw new Error('pristine type project must be the vendored upstream tsconfig.build.json');
const expectedCompilers = [
	'typescript55',
	'typescript56',
	'typescript57',
	'typescript58',
	'typescript59',
	'typescript60',
];
if (JSON.stringify(crosswalk.typeSuite.pristineCompilers) !== JSON.stringify(expectedCompilers))
	throw new Error('pristine type suite must inventory typescript55–typescript60');
if (crosswalk.typeSuite.adaptedCompiler !== 'tsrx-tsc')
	throw new Error('adapted type suite must use tsrx-tsc');
if (
	JSON.stringify(crosswalk.typeSuite.adaptedIncompatibleCompilers) !==
	JSON.stringify(['typescript55', 'typescript56', 'typescript57', 'typescript58', 'typescript60'])
)
	throw new Error('adapted lane must record explicit per-version incompatibilities');

console.log(
	'TanStack React Router SSR Query upstream ledger is current (9 files, 1 source file, 2 entrypoints, export crosswalk, TS 5.5–6.0 pristine matrix, no runtime test suite).',
);
