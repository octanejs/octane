import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const LOCK_RELATIVE_PATH = path.join('audit', 'upstream.lock.json');
const MARKER_RELATIVE_PATH = path.join('upstream', '.octane-materialize.json');

function treesPresent(packageDirectory) {
	// A committed pristine tree has no marker (byte drift is caught by the
	// verifiers); a materialized one must carry a marker from the current lock.
	if (!existsSync(path.join(packageDirectory, 'upstream'))) return false;
	try {
		const lock = JSON.parse(readFileSync(path.join(packageDirectory, LOCK_RELATIVE_PATH), 'utf8'));
		const markerPath = path.join(packageDirectory, MARKER_RELATIVE_PATH);
		if (existsSync(markerPath)) {
			const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
			if (marker.lockFingerprint !== lock.fingerprint) return false;
		}
		return (lock.adaptedMappings ?? []).every((mapping) =>
			existsSync(path.join(packageDirectory, ...mapping.toRoot.split('/'))),
		);
	} catch {
		return false;
	}
}

/**
 * Presence-level guarantee that every lock-pinned package's regenerated
 * upstream trees exist before test collection globs them. This runs at
 * vitest.config.js load time, so it must stay near-free when the trees are
 * already materialized from the current lock; byte-level drift is enforced by
 * the parity verifiers and the pristine wrapper, not here.
 */
export function ensureMaterializedUpstream(repoRoot, { spawn = spawnSync } = {}) {
	const packagesRoot = path.join(repoRoot, 'packages');
	if (!existsSync(packagesRoot)) return [];
	const materialized = [];
	for (const entry of readdirSync(packagesRoot, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const packageDirectory = path.join(packagesRoot, entry.name);
		if (!existsSync(path.join(packageDirectory, LOCK_RELATIVE_PATH))) continue;
		if (treesPresent(packageDirectory)) continue;
		const result = spawn(
			process.execPath,
			[
				path.join(repoRoot, 'scripts', 'react-port', 'materialize.mjs'),
				'run',
				'--package-dir',
				packageDirectory,
			],
			{ cwd: repoRoot, encoding: 'utf8' },
		);
		if (result.status !== 0) {
			throw new Error(
				`packages/${entry.name}: materializing pinned upstream evidence failed\n${result.stderr || result.stdout || ''}`,
			);
		}
		materialized.push(`packages/${entry.name}`);
	}
	return materialized;
}
