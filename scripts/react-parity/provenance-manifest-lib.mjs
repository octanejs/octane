import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));

function fail(packageDir, message) {
	throw new Error(`${relative(repoRoot, packageDir)} provenance: ${message}`);
}

function walk(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap(function flatten(entry) {
		const path = join(directory, entry.name);
		return entry.isDirectory() ? walk(path) : entry.isFile() ? [path] : [];
	});
}

function sha256(bytes) {
	return createHash('sha256').update(bytes).digest('hex');
}

function leafPaths(value, prefix = '') {
	return Object.entries(value).flatMap(([key, child]) =>
		typeof child === 'object' && child !== null
			? leafPaths(child, `${prefix}${key}.`)
			: `${prefix}${key}`,
	);
}

/**
 * Config-driven provenance verification for lock-pinned ports whose checks are
 * pure data: artifact hashes, required files, license equalities, package
 * identity, and export-condition mirroring. The behavior lives in the
 * package's audit/provenance.json; bespoke contracts (case crosswalks,
 * structural digests, generated inventories) stay in per-package scripts.
 *
 * Sections, all optional:
 * - artifacts:        [{ path, sha256 }] exact digests, typically for
 *                     upstream-artifact/ files the lock does not cover.
 * - requiredFiles:    [path] must exist (fixtures the lanes depend on).
 * - filesEqual:       [{ path, equalsPath }] byte equality.
 * - filesInclude:     [{ path, includes: [substring] }].
 * - packageIdentity:  { path, name, version, license } for a vendored manifest.
 * - exportConditionsMatchUpstream: compare the binding package.json's exports
 *                     condition leaves against packageIdentity.path's.
 * - unpublishedDirs:  [dir] the binding's files allowlist must not include.
 *
 * The lock check always runs first (disable only from negative-control
 * fixtures that have no lock).
 */
export function verifyProvenanceManifest(packageDir, { lock = true } = {}) {
	const root = resolve(packageDir);
	const config = JSON.parse(readFileSync(join(root, 'audit/provenance.json'), 'utf8'));

	if (lock) {
		try {
			execFileSync(
				process.execPath,
				[
					join(repoRoot, 'scripts/react-port/materialize.mjs'),
					'run',
					'--check',
					'--package-dir',
					root,
				],
				{ cwd: repoRoot, stdio: 'pipe' },
			);
		} catch (error) {
			fail(root, `upstream tree drifted from audit/upstream.lock.json: ${error.message}`);
		}
	}

	for (const artifact of config.artifacts ?? []) {
		const actual = sha256(readFileSync(join(root, artifact.path)));
		if (actual !== artifact.sha256) {
			fail(root, `${artifact.path} checksum drifted: expected ${artifact.sha256}, got ${actual}`);
		}
	}

	for (const required of config.requiredFiles ?? []) {
		if (!existsSync(join(root, required))) fail(root, `required evidence missing: ${required}`);
	}

	for (const pair of config.filesEqual ?? []) {
		const left = readFileSync(join(root, pair.path));
		const right = readFileSync(join(root, pair.equalsPath));
		if (!left.equals(right)) fail(root, `${pair.path} does not match ${pair.equalsPath}`);
	}

	for (const check of config.filesInclude ?? []) {
		const source = readFileSync(join(root, check.path), 'utf8');
		for (const needle of check.includes) {
			if (!source.includes(needle)) fail(root, `${check.path} lacks required text: ${needle}`);
		}
	}

	const identity = config.packageIdentity;
	if (identity) {
		const manifest = JSON.parse(readFileSync(join(root, identity.path), 'utf8'));
		for (const field of ['name', 'version', 'license']) {
			if (identity[field] !== undefined && manifest[field] !== identity[field]) {
				fail(root, `${identity.path} ${field} drifted: expected ${identity[field]}`);
			}
		}
		if (config.exportConditionsMatchUpstream) {
			const binding = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
			const upstreamConditions = leafPaths(manifest.exports ?? {}).sort();
			const bindingConditions = leafPaths(binding.exports ?? {}).sort();
			if (JSON.stringify(bindingConditions) !== JSON.stringify(upstreamConditions)) {
				fail(
					root,
					`package export conditions drifted\nexpected: ${upstreamConditions.join(', ')}\nactual: ${bindingConditions.join(', ')}`,
				);
			}
		}
	}

	for (const unpublished of config.unpublishedDirs ?? []) {
		const binding = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
		if ((binding.files ?? []).includes(unpublished)) {
			fail(root, `${unpublished}/ must remain unpublished evidence`);
		}
	}

	return { files: existsSync(join(root, 'upstream')) ? walk(join(root, 'upstream')).length : 0 };
}
