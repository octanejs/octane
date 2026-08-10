#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReactDropzonePortAuthored } from './react-dropzone-evidence-lib.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const read = (path) => readFileSync(resolve(root, path));
const json = (path) => JSON.parse(read(path));
const hash = (path) => createHash('sha256').update(read(path)).digest('hex');
const write = (path, value) =>
	writeFileSync(resolve(root, path), `${JSON.stringify(value, null, 2)}\n`);

const pristineTypeRoot = 'packages/react-dropzone/upstream/canonical/type-tests';
const adaptedTypeRoot = 'packages/react-dropzone/typetests';
const typeNames = readdirSync(resolve(root, pristineTypeRoot))
	.filter((name) => name.endsWith('.tsx'))
	.sort();
write('packages/react-dropzone/audit/type-inventories/parity.json', {
	schemaVersion: 1,
	pristine: typeNames.map((name) => ({
		path: `${pristineTypeRoot}/${name}`,
		sha256: hash(`${pristineTypeRoot}/${name}`),
	})),
	adapted: typeNames.map((name) => ({
		path: `${adaptedTypeRoot}/${name}`,
		sha256: hash(`${adaptedTypeRoot}/${name}`),
	})),
});

const sourcePairs = [
	[
		'packages/react-dropzone/upstream/canonical/src/index.tsx',
		'packages/react-dropzone/src/index.tsrx',
	],
	[
		'packages/react-dropzone/upstream/canonical/src/utils/index.ts',
		'packages/react-dropzone/src/utils/index.ts',
	],
];
write('packages/react-dropzone/audit/transformation-ledger.json', {
	schemaVersion: 1,
	pairs: sourcePairs.map(([upstream, adapted]) => ({
		upstream,
		upstreamSha256: hash(upstream),
		adapted,
		adaptedSha256: hash(adapted),
	})),
	permitted: [
		'React hooks mapped to Octane hooks',
		'.tsx component syntax mapped to .tsrx templates',
		'React synthetic event and renderable types mapped to native DOM and Octane types',
		'forwardRef mapped to ref-as-prop authoring',
		'React refs mapped to Octane refs and array-ref composition',
		'async acquisition aborted on unmount',
		'repository formatting',
	],
});

const adaptedInventories = [
	json('packages/react-dropzone/audit/runtime-inventories/adapted-dom.json'),
];
const adaptedTitles = adaptedInventories.flatMap(({ tests }) =>
	tests.map(({ fullName }) => fullName),
);
const upstream = json('packages/react-dropzone/audit/runtime-inventories/pristine-runtime.json');
const upstreamCounts = new Map();
const upstreamCases = upstream.cases.map((entry) => {
	const identity = `${entry.file}\0${entry.fullName}`;
	const occurrence = (upstreamCounts.get(identity) ?? 0) + 1;
	upstreamCounts.set(identity, occurrence);
	const matches = adaptedTitles.filter((fullName) => fullName.endsWith(` ${entry.title}`));
	return matches.length > 0
		? {
				file: entry.file,
				fullName: entry.fullName,
				occurrence,
				disposition: 'adapted-title-match',
				adaptedFullNames: matches,
			}
		: {
				file: entry.file,
				fullName: entry.fullName,
				occurrence,
				disposition: 'pristine-oracle-plus-contract',
				rationale: entry.file.includes('/utils/')
					? 'The byte-exact React oracle executes this utility case; the adapted utility table and live differential lanes cover the Octane boundary.'
					: 'The byte-exact React oracle executes this state-machine case; adapted contract, acquisition, and differential lanes cover its observable Octane boundary.',
			};
});
const portAuthored = buildReactDropzonePortAuthored(root);
write('packages/react-dropzone/audit/test-classifications.json', {
	schemaVersion: 1,
	upstreamCases,
	portAuthored,
});

execFileSync(
	resolve(root, 'node_modules/.bin/prettier'),
	[
		'--write',
		'packages/react-dropzone/audit/type-inventories/parity.json',
		'packages/react-dropzone/audit/transformation-ledger.json',
		'packages/react-dropzone/audit/test-classifications.json',
	],
	{ cwd: root, stdio: 'ignore' },
);

console.log(
	`react-dropzone evidence generated: ${upstreamCases.length} upstream cases, ${typeNames.length} type pairs, ${portAuthored.length} authored tests`,
);
