#!/usr/bin/env node

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { deriveUpstreamInventory } from './upstream-inventory.mjs';

const repositoryRoot = new URL('../../../', import.meta.url);
const crosswalkUrl = process.env.OCTANE_DREI_CROSSWALK_PATH
	? pathToFileURL(path.resolve(process.env.OCTANE_DREI_CROSSWALK_PATH))
	: new URL('../audit/upstream-crosswalk.json', import.meta.url);

const crosswalk = JSON.parse(await readFile(crosswalkUrl, 'utf8'));

const fail = (message) => {
	throw new Error(`Drei upstream crosswalk: ${message}`);
};

if (crosswalk.schemaVersion !== 1) fail('schemaVersion must be 1.');
if (crosswalk.upstream?.version !== '10.7.7')
	fail('upstream version must remain pinned to 10.7.7.');
if (crosswalk.upstream?.commit !== 'b8b99fd4ca1dfb8d821335671320512daa6efea4') {
	fail('upstream commit does not match the v10.7.7 pin.');
}
const { entries: upstreamEntries, runtimeNames, digest } = await deriveUpstreamInventory();
if (!Array.isArray(crosswalk.exports) || crosswalk.exports.length !== upstreamEntries.length) {
	fail(
		`expected ${upstreamEntries.length} source exports, received ${crosswalk.exports?.length ?? 'no inventory'}.`,
	);
}
if (crosswalk.expectedTotals?.sourceExports !== upstreamEntries.length)
	fail('recorded source export total does not match the pinned inventory.');
if (crosswalk.expectedTotals?.runtimeExports !== runtimeNames.size)
	fail('recorded runtime export total does not match the pinned runtime inventory.');
if (crosswalk.inventorySha256 !== digest)
	fail('inventorySha256 does not match the pinned upstream inventory.');

const names = new Set();
for (let index = 0; index < crosswalk.exports.length; index += 1) {
	const entry = crosswalk.exports[index];
	const upstreamEntry = upstreamEntries[index];
	if (
		entry.id !== `export:${upstreamEntry.name}` ||
		entry.name !== upstreamEntry.name ||
		entry.kind !== upstreamEntry.kind ||
		entry.source?.path !== upstreamEntry.source.path ||
		entry.source?.line !== upstreamEntry.source.line
	) {
		fail(`export inventory differs from pinned upstream at index ${index}.`);
	}
	if (names.has(entry.name)) fail(`duplicate export ${JSON.stringify(entry.name)}.`);
	names.add(entry.name);
	if (!['value', 'type', 'value-and-type'].includes(entry.kind)) {
		fail(`${entry.name} has invalid kind ${JSON.stringify(entry.kind)}.`);
	}
	if (!['ported', 'reused', 'divergence', 'not-applicable', 'gap'].includes(entry.status)) {
		fail(`${entry.name} has invalid status ${JSON.stringify(entry.status)}.`);
	}
	if (entry.status !== 'gap' && !entry.implementation) {
		fail(`${entry.name} is classified without an implementation or durable evidence target.`);
	}
	if (entry.status !== 'gap') {
		if (!Array.isArray(entry.evidence) || entry.evidence.length === 0) {
			fail(`${entry.name} is classified without executable or durable evidence.`);
		}
		for (const target of [entry.implementation, ...entry.evidence]) {
			if (typeof target !== 'string' || target.length === 0 || target.startsWith('/')) {
				fail(`${entry.name} has an invalid repository-relative evidence target.`);
			}
			try {
				await stat(new URL(target, repositoryRoot));
			} catch {
				fail(`${entry.name} points to missing evidence ${JSON.stringify(target)}.`);
			}
		}
	}
	if (entry.status === 'divergence' && !entry.divergence) {
		fail(`${entry.name} is divergent without a consumer-visible rationale.`);
	}
}

const gaps = crosswalk.exports.filter((entry) => entry.status === 'gap');
if (crosswalk.expectedTotals?.gaps !== gaps.length) {
	fail(`recorded gap total ${crosswalk.expectedTotals?.gaps} does not match ${gaps.length}.`);
}

if (process.argv.includes('--ready') && gaps.length > 0) {
	fail(`${gaps.length} exports remain unported; full Drei parity is not ready.`);
}

console.log(`Drei crosswalk valid: ${crosswalk.exports.length} exports, ${gaps.length} gaps.`);
