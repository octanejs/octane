#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { parseTarArchive, verifyIntegrity } from './preflight-lib.mjs';
import { validateUpstreamLock, verifyPristineTree } from './materialize-lib.mjs';
import { validateBatchManifest } from './state-lib.mjs';

const TYPE_SOURCE = /\.(?:[cm]?tsx?|tsrx)$/i;

function assertNoTypeManifest(manifest, label) {
	for (const field of ['types', 'typings', 'typesVersions']) {
		if (Object.hasOwn(manifest, field)) {
			throw new Error(`${label} declares ${field}; upstream type absence is not established`);
		}
	}
	function visit(value) {
		if (typeof value === 'string' && TYPE_SOURCE.test(value)) {
			throw new Error(`${label} exports a TypeScript artifact: ${value}`);
		}
		if (!value || typeof value !== 'object') return;
		for (const [key, nested] of Object.entries(value)) {
			if (key === 'types' || key.startsWith('types@')) {
				throw new Error(`${label} exports a types condition; upstream types are present`);
			}
			visit(nested);
		}
	}
	visit(manifest.exports);
}

/** A missing type suite is evidence only when both immutable sources lack it. */
export function inspectUpstreamTypeAbsence(node, packageDirectory) {
	if (!Array.isArray(node.upstreamTestInventory)) {
		throw new Error('Immutable preflight test inventory is required');
	}
	if (node.upstreamTestInventory.some(({ kind }) => kind === 'type')) {
		throw new Error('Immutable preflight inventory contains upstream type cases');
	}
	const lock = validateUpstreamLock(
		JSON.parse(readFileSync(path.join(packageDirectory, 'audit/upstream.lock.json'), 'utf8')),
	);
	for (const field of ['packageName', 'version', 'commit', 'integrity']) {
		if (!node.identity?.[field] || node.identity[field] !== lock.identity[field]) {
			throw new Error(`Materialized lock ${field} does not match immutable preflight identity`);
		}
	}
	for (const field of ['owner', 'repo', 'subdirectory']) {
		if ((node.identity.repository?.[field] ?? null) !== (lock.identity.repository[field] ?? null)) {
			throw new Error(`Materialized lock repository ${field} does not match preflight identity`);
		}
	}
	if (lock.scopes?.length) {
		throw new Error('A partial materialized source scope cannot establish upstream type absence');
	}
	const pristineRoot = path.join(packageDirectory, 'upstream');
	if (!existsSync(pristineRoot)) throw new Error('Materialized pristine source is required');
	const drift = verifyPristineTree(lock, pristineRoot);
	if (Object.values(drift).some((files) => files.length > 0)) {
		throw new Error('Materialized pristine source does not match the complete pinned lock');
	}
	const sourceTypes = lock.files.filter(({ path: file }) => TYPE_SOURCE.test(file));
	if (sourceTypes.length) {
		throw new Error(
			`Pinned source contains TypeScript artifacts: ${sourceTypes.map(({ path: file }) => file).join(', ')}`,
		);
	}
	// A package manifest must be part of the hash-verified tree, not an extra
	// locally authored assertion that the upstream library has no declarations.
	if (!lock.files.some(({ path: file }) => file === 'package.json')) {
		throw new Error('Complete pinned source must include package.json');
	}
	for (const { path: file } of lock.files) {
		if (path.posix.basename(file) === 'package.json') {
			assertNoTypeManifest(
				JSON.parse(readFileSync(path.join(pristineRoot, file), 'utf8')),
				`Pinned ${file}`,
			);
		}
	}
	const artifactRoot = path.join(packageDirectory, 'upstream-artifact');
	const archives = readdirSync(artifactRoot, { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith('.tgz'))
		.map((entry) => path.join(artifactRoot, entry.name));
	let artifactPath;
	let artifact;
	for (const archivePath of archives) {
		const bytes = readFileSync(archivePath);
		try {
			verifyIntegrity(bytes, node.identity.integrity);
		} catch {
			continue;
		}
		if (artifact) throw new Error('Multiple npm tarballs match the pinned artifact');
		artifactPath = archivePath;
		artifact = bytes;
	}
	if (!artifact) throw new Error('No npm tarball matches immutable preflight integrity');
	const published = parseTarArchive(gunzipSync(artifact, { maxOutputLength: 400 * 1024 * 1024 }), {
		select: (file) => path.posix.basename(file) === 'package.json',
	});
	const artifactTypes = published.entries.filter(({ path: file }) => TYPE_SOURCE.test(file));
	if (artifactTypes.length) {
		throw new Error(
			`Pinned npm artifact contains TypeScript artifacts: ${artifactTypes.map(({ path: file }) => file).join(', ')}`,
		);
	}
	const publishedManifestBytes = published.files.get('package/package.json');
	if (!publishedManifestBytes) throw new Error('Pinned npm artifact has no package manifest');
	const publishedManifest = JSON.parse(publishedManifestBytes.toString('utf8'));
	if (
		publishedManifest.name !== node.identity.packageName ||
		publishedManifest.version !== node.identity.version
	) {
		throw new Error('Pinned npm manifest does not match immutable preflight package/version');
	}
	for (const [file, bytes] of published.files) {
		assertNoTypeManifest(JSON.parse(bytes.toString('utf8')), `Pinned npm ${file}`);
	}
	return {
		status: 'absent',
		observed:
			'No upstream TypeScript cases, source/declaration artifacts, or published type entrypoints exist at the immutable pin. Authored, public, and packed type checks remain required.',
		identity: lock.identity,
		upstreamTypeCases: 0,
		source: { lockFingerprint: lock.fingerprint, verifiedFiles: lock.files.length },
		npm: {
			artifact: artifactPath,
			integrity: node.identity.integrity,
			verifiedEntries: published.entries.length,
		},
	};
}

export function main(argumentsList = process.argv.slice(2)) {
	if (
		argumentsList.length !== 6 ||
		argumentsList[0] !== '--package-dir' ||
		argumentsList[2] !== '--manifest' ||
		argumentsList[4] !== '--node'
	) {
		throw new Error(
			'Usage: upstream-types-absence.mjs --package-dir <path> --manifest <batch-manifest> --node <pkg:id>',
		);
	}
	const manifest = validateBatchManifest(JSON.parse(readFileSync(argumentsList[3], 'utf8')));
	const node = manifest.nodes[argumentsList[5]];
	if (!node?.bindingDirectory || !manifest.workspaceRoot)
		throw new Error('Expected a graph-planned binding node');
	const packageDirectory = path.resolve(argumentsList[1]);
	const planned = path.resolve(manifest.workspaceRoot, node.bindingDirectory);
	if (realpathSync(packageDirectory) !== realpathSync(planned)) {
		throw new Error('Package directory does not match the immutable graph-planned node');
	}
	return inspectUpstreamTypeAbsence(node, packageDirectory);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		process.stdout.write(`${JSON.stringify(main(), null, 2)}\n`);
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 1;
	}
}
