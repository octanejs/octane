import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { parseTarArchive } from './preflight-lib.mjs';
import { fingerprint } from './report-lib.mjs';

export const UPSTREAM_LOCK_SCHEMA_VERSION = 1;
export const UPSTREAM_LOCK_RELATIVE_PATH = 'audit/upstream.lock.json';
export const UPSTREAM_PATCHES_RELATIVE_PATH = 'audit/upstream-patches';
export const PRISTINE_RELATIVE_PATH = 'upstream';
export const MATERIALIZE_STATE_FILE = '.octane-materialize.json';

const MAX_LOCK_FILES = 20_000;
const MAX_LOCK_TOTAL_BYTES = 400 * 1024 * 1024;
const MAX_LOCK_PATH_DEPTH = 32;
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const SYMLINK_TREE_MODE = '120000';

export function gitBlobSha1(bytes) {
	if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
		throw new TypeError('Blob bytes must be a Buffer or Uint8Array');
	}
	return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

export function assertSafeLockPath(value, label) {
	if (typeof value !== 'string' || !value || value.includes('\0') || value.includes('\\')) {
		throw new Error(`${label} is not a safe relative path: ${String(value)}`);
	}
	if (path.posix.isAbsolute(value)) {
		throw new Error(`${label} is not a safe relative path: ${value}`);
	}
	const parts = value.split('/');
	if (
		parts.length > MAX_LOCK_PATH_DEPTH ||
		parts.some((part) => part === '' || part === '.' || part === '..')
	) {
		throw new Error(`${label} is not a safe relative path: ${value}`);
	}
	return value;
}

function validateIdentity(identity) {
	if (!identity || typeof identity !== 'object') {
		throw new Error('Upstream lock identity is required');
	}
	for (const field of ['packageName', 'version', 'integrity']) {
		if (typeof identity[field] !== 'string' || !identity[field]) {
			throw new Error(`Upstream lock identity is missing ${field}`);
		}
	}
	if (!GIT_SHA_PATTERN.test(identity.commit ?? '')) {
		throw new Error('Upstream lock identity commit must be a 40-character lowercase git sha');
	}
	const repository = identity.repository;
	if (
		!repository ||
		typeof repository.owner !== 'string' ||
		!repository.owner ||
		typeof repository.repo !== 'string' ||
		!repository.repo
	) {
		throw new Error('Upstream lock identity repository must name a GitHub owner and repo');
	}
	if (repository.subdirectory !== null && repository.subdirectory !== undefined) {
		assertSafeLockPath(repository.subdirectory, 'Upstream lock repository subdirectory');
	}
}

function validateAdaptedMappings(adaptedMappings) {
	if (!Array.isArray(adaptedMappings)) {
		throw new Error('Upstream lock adaptedMappings must be an array');
	}
	const targetRoots = new Set();
	for (const mapping of adaptedMappings) {
		if (!mapping || typeof mapping !== 'object') {
			throw new Error('Upstream lock adapted mapping must be an object');
		}
		assertSafeLockPath(mapping.fromRoot, 'Adapted mapping fromRoot');
		assertSafeLockPath(mapping.toRoot, 'Adapted mapping toRoot');
		if (mapping.toRoot !== 'tests/upstream' && !mapping.toRoot.startsWith('tests/upstream/')) {
			throw new Error(
				`Adapted mapping toRoot must be tests/upstream or one of its subdirectories: ${mapping.toRoot}`,
			);
		}
		if (targetRoots.has(mapping.toRoot)) {
			throw new Error(`Adapted mapping toRoot is duplicated: ${mapping.toRoot}`);
		}
		targetRoots.add(mapping.toRoot);
	}
}

export function validateUpstreamLock(lock) {
	if (!lock || typeof lock !== 'object') throw new Error('Upstream lock must be an object');
	if (lock.schemaVersion !== UPSTREAM_LOCK_SCHEMA_VERSION) {
		throw new Error(
			`Upstream lock schemaVersion must be ${UPSTREAM_LOCK_SCHEMA_VERSION}: ${lock.schemaVersion}`,
		);
	}
	validateIdentity(lock.identity);
	if (!lock.license || typeof lock.license.spdx !== 'string' || !lock.license.spdx) {
		throw new Error('Upstream lock must record the approved license spdx identifier');
	}
	validateAdaptedMappings(lock.adaptedMappings ?? []);
	if (!Array.isArray(lock.files) || lock.files.length === 0) {
		throw new Error('Upstream lock must record at least one pinned file');
	}
	if (lock.files.length > MAX_LOCK_FILES) {
		throw new Error(`Upstream lock exceeds the pinned-file limit of ${MAX_LOCK_FILES}`);
	}
	const seen = new Set();
	let totalBytes = 0;
	for (const file of lock.files) {
		if (!file || typeof file !== 'object') throw new Error('Upstream lock file must be an object');
		assertSafeLockPath(file.path, 'Upstream lock file path');
		if (seen.has(file.path)) throw new Error(`Upstream lock file path is duplicated: ${file.path}`);
		seen.add(file.path);
		if (!GIT_SHA_PATTERN.test(file.gitBlob ?? '')) {
			throw new Error(`Upstream lock file has no 40-character git blob sha: ${file.path}`);
		}
		if (!Number.isSafeInteger(file.size) || file.size < 0) {
			throw new Error(`Upstream lock file has no non-negative size: ${file.path}`);
		}
		totalBytes += file.size;
	}
	if (totalBytes > MAX_LOCK_TOTAL_BYTES) {
		throw new Error('Upstream lock exceeds the pinned total byte limit');
	}
	const expected = upstreamLockFingerprint(lock);
	if (lock.fingerprint !== expected) {
		throw new Error('Upstream lock fingerprint does not match its recorded contents');
	}
	return lock;
}

export function upstreamLockFingerprint(lock) {
	return fingerprint({
		schemaVersion: lock.schemaVersion,
		identity: lock.identity,
		license: lock.license,
		adaptedMappings: lock.adaptedMappings ?? [],
		files: lock.files,
	});
}

export function buildUpstreamLock({ identity, license, treeEntries, adaptedMappings = [] }) {
	validateIdentity(identity);
	if (!Array.isArray(treeEntries)) throw new Error('Upstream tree entries are required');
	const subdirectory = identity.repository.subdirectory ?? null;
	const scopePrefix = subdirectory ? `${subdirectory}/` : '';
	const files = [];
	for (const entry of treeEntries) {
		if (entry.type !== 'blob') continue;
		if (subdirectory && !entry.path.startsWith(scopePrefix)) continue;
		const relativePath = subdirectory ? entry.path.slice(scopePrefix.length) : entry.path;
		if (entry.mode === SYMLINK_TREE_MODE) {
			throw new Error(`Pinned upstream tree contains a symlink: ${entry.path}`);
		}
		assertSafeLockPath(relativePath, 'Pinned upstream file path');
		if (!GIT_SHA_PATTERN.test(entry.sha ?? '')) {
			throw new Error(`Pinned upstream tree entry has no git blob sha: ${entry.path}`);
		}
		files.push({ path: relativePath, gitBlob: entry.sha, size: entry.size ?? 0 });
	}
	files.sort((left, right) => left.path.localeCompare(right.path));
	const lock = {
		schemaVersion: UPSTREAM_LOCK_SCHEMA_VERSION,
		identity: {
			packageName: identity.packageName,
			version: identity.version,
			repository: {
				owner: identity.repository.owner,
				repo: identity.repository.repo,
				subdirectory,
			},
			commit: identity.commit.toLowerCase(),
			integrity: identity.integrity,
		},
		license,
		adaptedMappings,
		files,
	};
	lock.fingerprint = upstreamLockFingerprint(lock);
	return validateUpstreamLock(lock);
}

export function planAdaptedFiles(lock) {
	const planned = [];
	const targets = new Set();
	for (const mapping of lock.adaptedMappings ?? []) {
		const fromPrefix = `${mapping.fromRoot}/`;
		for (const file of lock.files) {
			if (!file.path.startsWith(fromPrefix)) continue;
			const targetPath = `${mapping.toRoot}/${file.path.slice(fromPrefix.length)}`;
			if (targets.has(targetPath)) {
				throw new Error(`Adapted mappings produce a duplicated target: ${targetPath}`);
			}
			targets.add(targetPath);
			planned.push({ sourcePath: file.path, targetPath, gitBlob: file.gitBlob });
		}
	}
	return planned.sort((left, right) => left.targetPath.localeCompare(right.targetPath));
}

function listFilesRecursively(rootDirectory) {
	if (!existsSync(rootDirectory)) return [];
	const files = [];
	const walk = (directory) => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const entryPath = path.join(directory, entry.name);
			if (entry.isSymbolicLink()) {
				throw new Error(`Materialized tree contains a symlink: ${entryPath}`);
			}
			if (entry.isDirectory()) walk(entryPath);
			else if (entry.isFile()) files.push(entryPath);
		}
	};
	walk(rootDirectory);
	return files.sort();
}

export function verifyPristineTree(lock, rootDirectory) {
	const missing = [];
	const mismatched = [];
	const expected = new Map(lock.files.map((file) => [file.path, file]));
	for (const file of lock.files) {
		const absolutePath = path.join(rootDirectory, ...file.path.split('/'));
		if (!existsSync(absolutePath)) {
			missing.push(file.path);
			continue;
		}
		if (gitBlobSha1(readFileSync(absolutePath)) !== file.gitBlob) mismatched.push(file.path);
	}
	const unexpected = listFilesRecursively(rootDirectory)
		.map((absolutePath) => path.relative(rootDirectory, absolutePath).split(path.sep).join('/'))
		.filter(
			(relativePath) => relativePath !== MATERIALIZE_STATE_FILE && !expected.has(relativePath),
		);
	return { missing, mismatched, unexpected };
}

export function extractPristineFromArchive(lock, archiveBytes) {
	const uncompressed = gunzipSync(archiveBytes, {
		maxOutputLength: MAX_LOCK_TOTAL_BYTES + 64 * 1024 * 1024,
	});
	const subdirectory = lock.identity.repository.subdirectory;
	const wanted = new Map(lock.files.map((file) => [file.path, file]));
	const prefixes = new Set();
	const relativize = (entryPath) => {
		const separator = entryPath.indexOf('/');
		if (separator === -1) return null;
		prefixes.add(entryPath.slice(0, separator));
		let rest = entryPath.slice(separator + 1);
		if (subdirectory) {
			if (rest !== subdirectory && !rest.startsWith(`${subdirectory}/`)) return null;
			rest = rest === subdirectory ? '' : rest.slice(subdirectory.length + 1);
		}
		return rest || null;
	};
	const parsed = parseTarArchive(uncompressed, {
		select: (entryPath) => {
			const relativePath = relativize(entryPath);
			return relativePath !== null && wanted.has(relativePath);
		},
		// The archive spans the whole repository; entries outside the pinned
		// scope (including symlinks the hardened parser would reject) are never
		// extracted, so they must not abort the scoped read. In-scope links
		// still fail validation, matching the lock builder's symlink rejection.
		skip: (entryPath) => relativize(entryPath) === null,
		// The codeload archive spans the whole repository, not only the pinned
		// subdirectory, so its entry limits are far above the lock's own caps.
		limits: {
			maxDepth: 40,
			maxFiles: 200_000,
			maxHeaders: 400_000,
			maxTotalBytes: MAX_LOCK_TOTAL_BYTES + 64 * 1024 * 1024,
		},
	});
	if (prefixes.size > 1) {
		throw new Error('Upstream archive does not have a single top-level directory');
	}
	const files = new Map();
	const mismatched = [];
	for (const [entryPath, bytes] of parsed.files) {
		const relativePath = relativize(entryPath);
		const expected = wanted.get(relativePath);
		if (!expected) continue;
		if (gitBlobSha1(bytes) === expected.gitBlob) files.set(relativePath, bytes);
		else mismatched.push(relativePath);
	}
	const missing = lock.files
		.map((file) => file.path)
		.filter((relativePath) => !files.has(relativePath) && !mismatched.includes(relativePath));
	const unexpected = parsed.entries
		.filter((entry) => entry.type === 'file')
		.map((entry) => relativize(entry.path))
		.filter((relativePath) => relativePath !== null && !wanted.has(relativePath));
	return { files, missing, mismatched, unexpected };
}
