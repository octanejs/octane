import { execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { classifyExport, exportedNames } from './crosswalk-lib.mjs';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(PACKAGE_ROOT, '../..');
const upstreamRoot = resolve(process.argv[2] ?? '');
const output = resolve(process.argv[3] ?? join(PACKAGE_ROOT, 'audit/upstream-crosswalk.json'));
const PINNED_COMMIT = '1c84a49a1faf50b571c84e00bcf9c60b22ddd03e';

if (!process.argv[2]) {
	throw new Error(
		'usage: node build-upstream-crosswalk.mjs <pinned-react-spectrum-checkout> [output]',
	);
}

const entryPoints = [
	{
		package: 'react-aria',
		version: '3.50.0',
		upstreamPath: 'packages/react-aria/exports/index.ts',
		octanePath: 'packages/aria/src/index.ts',
	},
	{
		package: 'react-aria-components',
		version: '1.19.0',
		upstreamPath: 'packages/react-aria-components/exports/index.ts',
		octanePath: 'packages/aria/src/components/index.ts',
	},
	{
		package: 'react-stately',
		version: '3.48.0',
		upstreamPath: 'packages/react-stately/exports/index.ts',
		octanePath: 'packages/aria/src/stately/index.ts',
	},
];

const actualCommit = execFileSync('git', ['-C', upstreamRoot, 'rev-parse', 'HEAD'], {
	encoding: 'utf8',
}).trim();
if (actualCommit !== PINNED_COMMIT)
	throw new Error(`upstream checkout must be pinned to ${PINNED_COMMIT}; found ${actualCommit}`);
for (const args of [
	['-C', upstreamRoot, 'diff', '--quiet'],
	['-C', upstreamRoot, 'diff', '--cached', '--quiet'],
]) {
	try {
		execFileSync('git', args, { stdio: 'pipe' });
	} catch {
		throw new Error('upstream checkout must have no tracked modifications');
	}
}

function walk(root) {
	const files = [];
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		const path = join(root, entry.name);
		if (entry.isDirectory()) files.push(...walk(path));
		else if (entry.isFile()) files.push(path);
	}
	return files;
}

const mappedEntryPoints = entryPoints.map((entry) => {
	const upstream = exportedNames(join(upstreamRoot, entry.upstreamPath));
	const octane = exportedNames(join(REPO_ROOT, entry.octanePath));
	return {
		...entry,
		exports: [...upstream]
			.map(([name, kind]) => classifyExport(name, kind, octane, entry.octanePath))
			.sort((a, b) => a[0].localeCompare(b[0])),
	};
});

const upstreamArtifacts = entryPoints
	.flatMap((entry) => {
		const testRoot = join(upstreamRoot, `packages/${entry.package}/test`);
		return walk(testRoot).map((file) => {
			const path = relative(upstreamRoot, file).split('\\').join('/');
			const kind = /(?:^|\/)types?\.(?:ts|tsx)$/.test(path)
				? 'type-test'
				: /\.test\.(?:js|jsx|ts|tsx)$/.test(path)
					? 'runtime-test'
					: 'support';
			return [path, kind, kind === 'support' ? 'not-vendored-support' : 'not-adapted'];
		});
	})
	.sort((a, b) => a[0].localeCompare(b[0]));

const exports = mappedEntryPoints.flatMap((entry) => entry.exports);
const result = {
	schemaVersion: 1,
	provenance: {
		repository: 'https://github.com/adobe/react-spectrum.git',
		commit: PINNED_COMMIT,
		tags: ['react-aria@3.50.0', 'react-aria-components@1.19.0', 'react-stately@3.48.0'],
	},
	entryPoints: mappedEntryPoints,
	artifactEvidence: {
		'not-adapted':
			'The canonical suite is present but is not adapted case-by-case; representative same-fixture behavior is bounded by the differential lanes.',
		'not-vendored-support': 'Support bytes remain in the immutable external checkout.',
	},
	upstreamArtifacts,
	summary: {
		exports: exports.length,
		surfacePresentUnverifiedExports: exports.filter(
			(entry) => entry[2] === 'surface-present-unverified',
		).length,
		gapExports: exports.filter((entry) => entry[2] === 'gap').length,
		upstreamArtifacts: upstreamArtifacts.length,
		runtimeTests: upstreamArtifacts.filter((entry) => entry[1] === 'runtime-test').length,
		typeTests: upstreamArtifacts.filter((entry) => entry[1] === 'type-test').length,
		supportArtifacts: upstreamArtifacts.filter((entry) => entry[1] === 'support').length,
	},
};

writeFileSync(
	output,
	await format(JSON.stringify(result), {
		...(await resolveConfig(output, { editorconfig: true })),
		filepath: output,
		parser: 'json',
	}),
);
