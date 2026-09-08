#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import { deriveUpstreamInventory } from './upstream-inventory.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(packageRoot, '../..');
const output = path.join(packageRoot, 'audit/upstream-crosswalk.json');

let existingEntries = new Map();
try {
	const existing = JSON.parse(await readFile(output, 'utf8'));
	existingEntries = new Map(existing.exports?.map((entry) => [entry.name, entry]) ?? []);
} catch (error) {
	if (error?.code !== 'ENOENT') throw error;
}

const { entries: inventoryEntries, runtimeNames, digest } = await deriveUpstreamInventory();
const entries = inventoryEntries.map(({ name, kind, source }) => {
	const generated = {
		id: `export:${name}`,
		name,
		kind,
		source,
		status: 'gap',
		implementation: null,
		evidence: [],
		divergence: null,
	};
	const existing = existingEntries.get(name);
	if (
		existing?.kind === generated.kind &&
		existing.source?.path === generated.source.path &&
		existing.source?.line === generated.source.line
	) {
		generated.status = existing.status;
		generated.implementation = existing.implementation;
		generated.evidence = existing.evidence;
		generated.divergence = existing.divergence;
	}
	return generated;
});

const crosswalk = {
	schemaVersion: 1,
	upstream: {
		repository: 'https://github.com/pmndrs/drei',
		version: '10.7.7',
		commit: 'b8b99fd4ca1dfb8d821335671320512daa6efea4',
		publicEntry: 'src/index.ts',
		license: 'MIT',
	},
	policy: {
		target: 'complete-web-api',
		allowedStatuses: ['ported', 'reused', 'divergence', 'not-applicable'],
		readyRequiresZeroGaps: true,
	},
	expectedTotals: {
		runtimeExports: runtimeNames.size,
		sourceExports: entries.length,
		gaps: entries.filter((entry) => entry.status === 'gap').length,
	},
	inventorySha256: digest,
	exports: entries,
};

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, await format(JSON.stringify(crosswalk), { filepath: output }));
console.log(
	`Wrote ${entries.length} Drei exports (${runtimeNames.size} runtime) to ${path.relative(repositoryRoot, output)}.`,
);
