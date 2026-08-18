#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateManifest } from './harness-lib.mjs';

const REPO = path.resolve(import.meta.dirname, '../..');

async function discoverManifests(root) {
	const packagesRoot = path.join(root, 'packages');
	const entries = await readdir(packagesRoot, { withFileTypes: true });
	const candidates = entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => path.join(packagesRoot, entry.name, 'audit/react-parity.json'));
	const manifests = [];
	for (const manifestPath of candidates) {
		try {
			await readFile(manifestPath);
			manifests.push(manifestPath);
		} catch (error) {
			if (error?.code !== 'ENOENT') throw error;
		}
	}
	return manifests;
}

function resolveLockfile(root, relativePath) {
	const lockfile = path.resolve(root, relativePath);
	const fromRoot = path.relative(root, lockfile);
	if (fromRoot === '..' || fromRoot.startsWith(`..${path.sep}`) || path.isAbsolute(fromRoot)) {
		throw new Error(`React parity lockfile must stay inside the repository: ${relativePath}`);
	}
	return lockfile;
}

export async function generateLockfileIntegrity(root = REPO) {
	const results = [];
	for (const manifestPath of await discoverManifests(root)) {
		const source = await readFile(manifestPath, 'utf8');
		const manifest = validateManifest(JSON.parse(source));
		const digests = [];
		for (const environment of Object.values(manifest.environments)) {
			const lockfile = await readFile(resolveLockfile(root, environment.lockfile));
			digests.push({
				current: environment.lockfileSha256,
				next: createHash('sha256').update(lockfile).digest('hex'),
			});
		}
		let environmentIndex = 0;
		const output = source.replace(
			/("lockfileSha256"\s*:\s*")([a-f0-9]{64})(")/g,
			(match, prefix, current, suffix) => {
				const environment = digests[environmentIndex++];
				if (environment === undefined || environment.current !== current) {
					throw new Error(`React parity lockfile digest layout drifted: ${manifestPath}`);
				}
				return `${prefix}${environment.next}${suffix}`;
			},
		);
		if (environmentIndex !== digests.length) {
			throw new Error(`React parity lockfile digest layout drifted: ${manifestPath}`);
		}
		const changed = output !== source;
		if (changed) {
			await writeFile(manifestPath, output);
		}
		results.push({
			changed,
			path: path.relative(root, manifestPath).replaceAll(path.sep, '/'),
		});
	}
	return results;
}

async function runCli() {
	const results = await generateLockfileIntegrity();
	if (results.length === 0) {
		console.log('No React parity manifests declare lockfile integrity.');
		return;
	}
	for (const result of results) {
		console.log(`${result.changed ? 'updated' : 'current'} ${result.path}`);
	}
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await runCli();
