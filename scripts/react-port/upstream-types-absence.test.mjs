import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildUpstreamLock } from './materialize-lib.mjs';
import {
	buildTarGz,
	fixtureIdentity,
	fixtureTreeEntries,
} from './__fixtures__/materialize-fixtures.mjs';
import { inspectUpstreamTypeAbsence } from './upstream-types-absence.mjs';

function fixture(
	t,
	{ source = {}, published = {}, sourceManifest = {}, npmManifest = {}, scopes = [] } = {},
) {
	const packageDirectory = mkdtempSync(path.join(tmpdir(), 'react-port-types-absence-'));
	t.after(() => rmSync(packageDirectory, { recursive: true, force: true }));
	const manifest = { name: 'mit-widget', version: '1.0.0' };
	const sources = new Map(
		Object.entries({
			'package.json': JSON.stringify({ ...manifest, ...sourceManifest }),
			'src/index.js': 'export const widget = true;\n',
			...source,
		}),
	);
	const npm = Object.entries({
		'package/package.json': JSON.stringify({ ...manifest, ...npmManifest }),
		'package/index.js': 'exports.widget = true;\n',
		...published,
	});
	const artifact = buildTarGz(npm);
	const identity = fixtureIdentity({
		integrity: `sha512-${createHash('sha512').update(artifact).digest('base64')}`,
	});
	const lock = buildUpstreamLock({
		identity,
		license: { spdx: 'MIT' },
		treeEntries: fixtureTreeEntries(sources),
		scopes,
	});
	for (const [file, content] of sources) {
		const filePath = path.join(packageDirectory, 'upstream', file);
		mkdirSync(path.dirname(filePath), { recursive: true });
		writeFileSync(filePath, content);
	}
	mkdirSync(path.join(packageDirectory, 'audit'));
	writeFileSync(path.join(packageDirectory, 'audit/upstream.lock.json'), JSON.stringify(lock));
	mkdirSync(path.join(packageDirectory, 'upstream-artifact'));
	writeFileSync(path.join(packageDirectory, 'upstream-artifact/mit-widget-1.0.0.tgz'), artifact);
	const node = { identity, upstreamTestInventory: [] };
	return {
		packageDirectory,
		node,
		inspect: () => inspectUpstreamTypeAbsence(node, packageDirectory),
	};
}

test('proves absence against the complete materialized pin and integrity-checked npm archive', (t) => {
	const { inspect } = fixture(t);
	const result = inspect();
	assert.equal(result.status, 'absent');
	assert.equal(result.source.verifiedFiles, 2);
	assert.equal(result.npm.verifiedEntries, 2);
	assert.match(result.observed, /Authored, public, and packed type checks remain required/);
});

test('requires an explicit immutable preflight inventory and rejects pinned type cases', (t) => {
	const { node, inspect } = fixture(t);
	delete node.upstreamTestInventory;
	assert.throws(inspect, /preflight test inventory is required/);
	node.upstreamTestInventory = [{ kind: 'type', registrations: [] }];
	assert.throws(inspect, /contains upstream type cases/);
});

for (const [label, options, error] of [
	[
		'source declarations',
		{ source: { 'index.d.ts': 'export declare const widget: true;' } },
		/source contains TypeScript/,
	],
	[
		'source type tests',
		{ source: { 'test/types.test.ts': 'const value: boolean = true;' } },
		/source contains TypeScript/,
	],
	[
		'npm declarations',
		{ published: { 'package/index.d.mts': 'export declare const widget: true;' } },
		/npm artifact contains TypeScript/,
	],
	['source types field', { sourceManifest: { types: './index.d.ts' } }, /declares types/],
	['npm typings field', { npmManifest: { typings: './index.d.ts' } }, /declares typings/],
	['npm typesVersions', { npmManifest: { typesVersions: {} } }, /declares typesVersions/],
	[
		'conditional type exports',
		{
			npmManifest: {
				exports: { '.': { import: { types: './index.d.ts', default: './index.js' } } },
			},
		},
		/types condition/,
	],
	[
		'versioned type exports',
		{ npmManifest: { exports: { '.': { 'types@>=5': './index.d.ts' } } } },
		/types condition/,
	],
	[
		'TS export targets',
		{ npmManifest: { exports: './source.ts' } },
		/exports a TypeScript artifact/,
	],
	['partial source scope', { scopes: ['src'] }, /partial materialized source scope/],
]) {
	test(`rejects upstream type absence with ${label}`, (t) => {
		const { inspect } = fixture(t, options);
		assert.throws(inspect, error);
	});
}

test('rejects an added declaration outside the pinned source inventory', (t) => {
	const { packageDirectory, inspect } = fixture(t);
	writeFileSync(path.join(packageDirectory, 'upstream/index.d.ts'), 'export type Value = string;');
	assert.throws(inspect, /does not match the complete pinned lock/);
});

test('rejects missing or mutated source and an altered npm archive', (t) => {
	const { packageDirectory, inspect } = fixture(t);
	const source = path.join(packageDirectory, 'upstream/src/index.js');
	const original = readFileSync(source);
	rmSync(source);
	assert.throws(inspect, /does not match the complete pinned lock/);
	writeFileSync(source, 'changed');
	assert.throws(inspect, /does not match the complete pinned lock/);
	writeFileSync(source, original);
	writeFileSync(path.join(packageDirectory, 'upstream-artifact/mit-widget-1.0.0.tgz'), 'changed');
	assert.throws(inspect, /No npm tarball matches immutable preflight integrity/);
});

test('rejects a substituted lock identity even when its files hash correctly', (t) => {
	const { node, inspect } = fixture(t);
	node.identity = { ...node.identity, commit: 'b'.repeat(40) };
	assert.throws(inspect, /lock commit does not match immutable preflight identity/);
});
