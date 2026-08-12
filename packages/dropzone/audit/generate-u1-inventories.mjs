import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const pristineRoot = resolve(root, 'upstream/canonical');
const reportPath = process.argv[2];
if (!reportPath)
	throw new Error('usage: generate-u1-inventories.mjs <pristine Vitest JSON report>');
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const walk = (dir) =>
	readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = resolve(dir, entry.name);
		return entry.isDirectory() ? walk(path) : [path];
	});
const write = (path, value) =>
	writeFileSync(resolve(root, path), `${JSON.stringify(value, null, 2)}\n`);

const files = walk(resolve(root, 'upstream'))
	.map((path) => ({ path: relative(root, path), sha256: sha256(path) }))
	.sort((a, b) => a.path.localeCompare(b.path));
write('audit/upstream-files.json', {
	canonical: {
		commit: '01fc05c5996bf615caf812627f7491375e647c7d',
		archiveSha256: '947a1def85a3f7ef5b3ef74550cd60cc507389f4b08d3a6af1ba7b6646ce6a3e',
	},
	npm: {
		version: '20.0.0',
		tarballSha256: 'e76faa61389e085518b0d8492a7970e9ce4c060e4a2e9181b1eb089805afb95d',
	},
	files,
});
write('audit/npm-files.json', {
	files: files.filter(({ path }) => path.startsWith('upstream/npm/')),
});

const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const cases = report.testResults
	.flatMap((suite) =>
		suite.assertionResults.map((test) => ({
			file: relative(pristineRoot, suite.name).split(sep).join('/'),
			title: test.title,
			fullName: test.fullName,
			status: test.status,
		})),
	)
	.sort((a, b) => `${a.file}:${a.fullName}`.localeCompare(`${b.file}:${b.fullName}`));
write('audit/runtime-inventories/pristine-runtime.json', {
	collected: report.numTotalTests,
	executed: cases.filter(({ status }) => status === 'passed').length,
	skipped: report.numPendingTests,
	snapshots: report.snapshot,
	cases,
	snapshotFiles: [
		{
			file: 'upstream/canonical/src/__snapshots__/index.spec.tsx.snap',
			sha256: sha256(resolve(root, 'upstream/canonical/src/__snapshots__/index.spec.tsx.snap')),
		},
	],
});

const testSources = [
	'upstream/canonical/src/index.spec.tsx',
	'upstream/canonical/src/utils/index.spec.ts',
];
const registrations = testSources.flatMap((file) => {
	const text = readFileSync(resolve(root, file), 'utf8');
	return [...text.matchAll(/\b(?:it|test)(?:\.each\([^)]*\))?\s*\(\s*([`'\"])(.*?)\1/gs)].map(
		(match) => ({ file, title: match[2] }),
	);
});
write('audit/runtime-inventories/static-registrations.json', { files: testSources, registrations });

const typeFiles = walk(resolve(root, 'upstream/canonical/type-tests'))
	.map((path) => ({
		file: basename(path),
		sha256: sha256(path),
		expectErrors: (readFileSync(path, 'utf8').match(/@ts-expect-error/g) ?? []).length,
		typeAssertions: (readFileSync(path, 'utf8').match(/expectType|Expect<|Equal</g) ?? []).length,
	}))
	.sort((a, b) => a.file.localeCompare(b.file));
write('audit/type-inventories/pristine-types.json', {
	commands: ['tsc --noEmit', 'tsc --noEmit -p tsconfig.type-tests.json'],
	files: typeFiles,
});
