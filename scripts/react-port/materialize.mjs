#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	MATERIALIZE_STATE_FILE,
	PRISTINE_RELATIVE_PATH,
	UPSTREAM_LOCK_RELATIVE_PATH,
	UPSTREAM_PATCHES_RELATIVE_PATH,
	applyAdaptedRewrites,
	findForbiddenReactSpecifiers,
	findFormattingOnlyHunks,
	buildUpstreamLock,
	extractPristineFromArchive,
	gitBlobSha1,
	planAdaptedFiles,
	validateUpstreamLock,
	verifyPristineTree,
} from './materialize-lib.mjs';
import {
	classifyApprovedLicenseText,
	evaluateApprovedLicense,
	fetchBounded,
	fetchJson,
	githubHeaders,
} from './preflight-lib.mjs';
import { credentialValuesFromEnvironment, sanitizeForReport } from './report-lib.mjs';
import { validateBatchManifest } from './state-lib.mjs';

const ARCHIVE_MAX_BYTES = 192 * 1024 * 1024;
const BLOB_MAX_BYTES = 16 * 1024 * 1024;
const DIFF_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

function usage() {
	return `Usage: node scripts/react-port/materialize.mjs <command> [options]

Manage pinned upstream evidence for a binding through its committed
audit/upstream.lock.json. The committed packages/<binding>/upstream/ tree is
verified offline against the lock's git blob shas (the files' content
addresses in the upstream repository), and the adapted suite regenerates under
the lock's tests/upstream targets by applying the lock's mechanical rewrites
plus committed audit/upstream-patches/. A package without a committed pristine
tree fetches and hash-verifies it from the pinned commit instead.

Commands:
  lock   Derive audit/upstream.lock.json from a preflighted batch node or --pin
  run    Verify the pristine tree and regenerate the adapted suite
  diff   Regenerate audit/upstream-patches/ from the current adapted tree

Options:
  --package-dir <dir>        Binding package directory (required)
  --batch <id>               Preflight batch identifier (lock)
  --node <pkg:name>          Graph node identifier (lock)
  --pin <name@version>       Lock from an existing reviewed pin instead of a
                             preflight batch (lock; requires --repo, --commit)
  --repo <owner/repo>        Pinned GitHub repository (lock with --pin)
  --commit <sha>             Pinned 40-character commit (lock with --pin)
  --subdir <path>            Package subdirectory in the repository (lock
                             with --pin)
  --manifest <path>          Subtree-relative package.json that proves the
                             pin's commit correspondence (lock with --pin;
                             default: package.json)
  --work-root <dir>          Batch state root (default: .react-port-work)
  --scope <path>             Narrow the pin to this subtree-relative path
                             (lock; repeatable; default pins the whole subtree)
  --adapted-map <from=to[:re]>  Map a pinned source root onto a tests/upstream
                             target, optionally narrowed to files matching the
                             include regex (lock; repeatable)
  --adapted-rewrite <f=r>    Mechanical source rewrite applied to every mapped
                             file before its patch (lock; repeatable, ordered)
  --accept-license-file      Reviewed exception (lock with --pin): accept a
                             recognizable approved license file when the
                             pinned manifest declares no license at all; the
                             lock records the file-only basis
  --check                    Verify without network or writes (run)
  -h, --help                 Show this help
`;
}

function parseArguments(argumentsList) {
	const options = {
		adaptedMappings: [],
		adaptedRewrites: [],
		batch: null,
		scopes: [],
		check: false,
		acceptLicenseFile: false,
		commit: null,
		manifestPath: null,
		node: null,
		packageDirectory: null,
		pin: null,
		repo: null,
		subdirectory: null,
		workRoot: path.join(process.cwd(), '.react-port-work'),
	};
	const [command, ...rest] = argumentsList;
	if (command === '-h' || command === '--help') return { command: 'help', options };
	if (!['lock', 'run', 'diff'].includes(command ?? '')) {
		throw new Error('A command of lock, run, or diff is required');
	}
	for (let index = 0; index < rest.length; index += 1) {
		const argument = rest[index];
		const value = rest[index + 1];
		if (argument === '-h' || argument === '--help') return { command: 'help', options };
		if (argument === '--package-dir') {
			if (!value) throw new Error('--package-dir requires a directory');
			options.packageDirectory = path.resolve(value);
			index += 1;
		} else if (argument === '--batch') {
			if (!value || !/^[a-z0-9][a-z0-9._-]*$/i.test(value)) {
				throw new Error('--batch requires a path-safe identifier');
			}
			options.batch = value;
			index += 1;
		} else if (argument === '--node') {
			if (!value) throw new Error('--node requires a graph node identifier');
			options.node = value;
			index += 1;
		} else if (argument === '--work-root') {
			if (!value) throw new Error('--work-root requires a directory');
			options.workRoot = path.resolve(value);
			index += 1;
		} else if (argument === '--pin') {
			const separator = value?.lastIndexOf('@') ?? -1;
			if (separator <= 0 || separator === value.length - 1) {
				throw new Error('--pin requires <package-name>@<exact-version>');
			}
			options.pin = { packageName: value.slice(0, separator), version: value.slice(separator + 1) };
			index += 1;
		} else if (argument === '--repo') {
			const parts = value?.split('/') ?? [];
			if (parts.length !== 2 || !parts[0] || !parts[1]) {
				throw new Error('--repo requires <owner>/<repository>');
			}
			options.repo = { owner: parts[0], repo: parts[1] };
			index += 1;
		} else if (argument === '--commit') {
			if (!/^[0-9a-f]{40}$/i.test(value ?? '')) {
				throw new Error('--commit requires a 40-character git commit sha');
			}
			options.commit = value.toLowerCase();
			index += 1;
		} else if (argument === '--subdir') {
			if (!value) throw new Error('--subdir requires a repository-relative path');
			options.subdirectory = value;
			index += 1;
		} else if (argument === '--manifest') {
			if (!value) throw new Error('--manifest requires a subtree-relative package.json path');
			options.manifestPath = value;
			index += 1;
		} else if (argument === '--scope') {
			if (!value) throw new Error('--scope requires a subtree-relative path');
			options.scopes.push(value);
			index += 1;
		} else if (argument === '--adapted-map') {
			const separator = value?.indexOf('=') ?? -1;
			if (separator <= 0 || separator === value.length - 1) {
				throw new Error(
					'--adapted-map requires <pinned-root>=<tests/upstream-target>[:include-regex]',
				);
			}
			const target = value.slice(separator + 1);
			const includeSeparator = target.indexOf(':');
			options.adaptedMappings.push({
				fromRoot: value.slice(0, separator),
				toRoot: includeSeparator === -1 ? target : target.slice(0, includeSeparator),
				...(includeSeparator === -1 ? {} : { include: target.slice(includeSeparator + 1) }),
			});
			index += 1;
		} else if (argument === '--adapted-rewrite') {
			const separator = value?.indexOf('=') ?? -1;
			if (separator <= 0) {
				throw new Error('--adapted-rewrite requires <find>=<replace>');
			}
			options.adaptedRewrites.push({
				find: value.slice(0, separator),
				replace: value.slice(separator + 1),
			});
			index += 1;
		} else if (argument === '--accept-license-file') {
			options.acceptLicenseFile = true;
		} else if (argument === '--check') {
			options.check = true;
		} else {
			throw new Error(`Unknown option: ${argument}`);
		}
	}
	if (!options.packageDirectory) throw new Error('--package-dir is required');
	if (options.pin && (!options.repo || !options.commit)) {
		throw new Error('--pin requires --repo and --commit');
	}
	return { command, options };
}

function readLock(packageDirectory) {
	const lockPath = path.join(packageDirectory, UPSTREAM_LOCK_RELATIVE_PATH);
	if (!existsSync(lockPath)) {
		throw new Error(`Upstream lock does not exist: ${lockPath}`);
	}
	return validateUpstreamLock(JSON.parse(readFileSync(lockPath, 'utf8')));
}

function hasTrackedFiles(packageDirectory, relativeRoot, execFile) {
	try {
		const output = execFile('git', ['-C', packageDirectory, 'ls-files', '--', relativeRoot], {
			encoding: 'utf8',
		});
		return Boolean(output.trim());
	} catch {
		// Outside a git worktree the tracked-file distinction cannot apply.
		return false;
	}
}

function assertNoTrackedFiles(packageDirectory, relativeRoot, execFile) {
	if (hasTrackedFiles(packageDirectory, relativeRoot, execFile)) {
		throw new Error(
			`${relativeRoot} contains git-tracked files; regenerated trees must stay untracked`,
		);
	}
}

function writeTreeFile(rootDirectory, relativePath, bytes) {
	const absolutePath = path.join(rootDirectory, ...relativePath.split('/'));
	mkdirSync(path.dirname(absolutePath), { recursive: true });
	writeFileSync(absolutePath, bytes);
	return absolutePath;
}

async function fetchArchiveFiles(lock, options) {
	const { owner, repo } = lock.identity.repository;
	const archiveUrl = `https://codeload.github.com/${owner}/${repo}/tar.gz/${lock.identity.commit}`;
	const archive = await fetchBounded(archiveUrl, {
		fetchImpl: options.fetchImpl,
		allowedHosts: new Set(['codeload.github.com']),
		maxBytes: ARCHIVE_MAX_BYTES,
		requestTimeoutMs: options.requestTimeoutMs,
	});
	const extracted = extractPristineFromArchive(lock, archive.bytes);
	if (extracted.unexpected.length > 0) {
		throw new Error(
			`Upstream archive contains files outside the pinned lock: ${extracted.unexpected
				.slice(0, 5)
				.join(', ')}`,
		);
	}
	return extracted;
}

async function fetchPristineFiles(lock, options) {
	const { owner, repo } = lock.identity.repository;
	// The archive is the single-request fast path; export attributes or archive
	// size limits can defeat it, and every affected file falls back to the
	// content-addressed blob endpoint, which cannot return the wrong bytes.
	let extracted;
	let archiveFallbackReason = null;
	try {
		extracted = await fetchArchiveFiles(lock, options);
	} catch (error) {
		archiveFallbackReason = error instanceof Error ? error.message : String(error);
		extracted = {
			files: new Map(),
			missing: lock.files.map((file) => file.path),
			mismatched: [],
		};
	}
	const fallbackPaths = [...extracted.missing, ...extracted.mismatched];
	const byPath = new Map(lock.files.map((file) => [file.path, file]));
	for (const relativePath of fallbackPaths) {
		const pinned = byPath.get(relativePath);
		let bytes;
		try {
			bytes = await fetchGitBlob(owner, repo, pinned.gitBlob, pinned.size, options);
		} catch (error) {
			throw new Error(
				`${error instanceof Error ? error.message : String(error)} (${relativePath})`,
			);
		}
		extracted.files.set(relativePath, bytes);
	}
	return { files: extracted.files, blobFallbackCount: fallbackPaths.length, archiveFallbackReason };
}

function patchArtifactPaths(packageDirectory, targetPath) {
	const patchRoot = path.join(packageDirectory, UPSTREAM_PATCHES_RELATIVE_PATH);
	return {
		patchPath: path.join(patchRoot, ...`${targetPath}.patch`.split('/')),
		skipPath: path.join(patchRoot, ...`${targetPath}.skip`.split('/')),
	};
}

function regenerateAdaptedTree(lock, packageDirectory, pristineDirectory, execFile) {
	const planned = planAdaptedFiles(lock);
	const written = [];
	const skipped = [];
	const targetRoots = new Set((lock.adaptedMappings ?? []).map((mapping) => mapping.toRoot));
	for (const relativeRoot of targetRoots) {
		assertNoTrackedFiles(packageDirectory, relativeRoot, execFile);
		rmSync(path.join(packageDirectory, ...relativeRoot.split('/')), {
			force: true,
			recursive: true,
		});
	}
	// Patches apply in a scratch directory outside any git worktree: inside a
	// repository, git apply resolves patch paths against the repository root and
	// silently skips paths outside the current directory (exit 0), which would
	// turn a missed patch into a wrong-but-green adapted suite.
	const scratch = mkdtempSync(path.join(tmpdir(), 'react-port-materialize-apply-'));
	try {
		for (const { sourcePath, targetPath } of planned) {
			const { patchPath, skipPath } = patchArtifactPaths(packageDirectory, targetPath);
			if (existsSync(skipPath)) {
				skipped.push(targetPath);
				continue;
			}
			let bytes = readFileSync(path.join(pristineDirectory, ...sourcePath.split('/')));
			if (!bytes.includes(0)) {
				bytes = Buffer.from(applyAdaptedRewrites(bytes.toString('utf8'), lock.adaptedRewrites));
			}
			if (existsSync(patchPath)) {
				const committedPatch = readFileSync(patchPath, 'utf8');
				const formattingOnly = findFormattingOnlyHunks(committedPatch);
				if (formattingOnly.length > 0) {
					throw new Error(
						`${targetPath}: committed patch contains formatting-only hunks (${formattingOnly.join(' | ')}); keep the pristine tree's formatting so patches carry only genuine divergences`,
					);
				}
				const scratchPath = writeTreeFile(scratch, targetPath, bytes);
				execFile('git', ['-c', 'core.autocrlf=false', 'apply', '--whitespace=nowarn', patchPath], {
					cwd: scratch,
					encoding: 'utf8',
				});
				bytes = readFileSync(scratchPath);
			}
			if (!bytes.includes(0)) {
				const forbidden = findForbiddenReactSpecifiers(targetPath, bytes.toString('utf8'));
				if (forbidden.length > 0) {
					throw new Error(
						`Adapted file ${targetPath} still imports React (${forbidden.join(', ')}); the adapted suite must execute against Octane — remove the specifier via an adaptedRewrite or fix the patch`,
					);
				}
			}
			writeTreeFile(packageDirectory, targetPath, bytes);
			written.push(targetPath);
		}
	} finally {
		rmSync(scratch, { force: true, recursive: true });
	}
	return { written, skipped };
}

async function fetchPinnedTree(owner, repo, commit, options) {
	const apiRoot = `https://api.github.com/repos/${owner}/${repo}`;
	const fetchOptions = {
		fetchImpl: options.fetchImpl,
		allowedHosts: new Set(['api.github.com']),
		headers: githubHeaders(options),
		requestTimeoutMs: options.requestTimeoutMs,
	};
	const commitResponse = await fetchJson(`${apiRoot}/commits/${commit}`, fetchOptions);
	if (commitResponse.sha?.toLowerCase() !== commit.toLowerCase()) {
		throw new Error('GitHub commit does not match the pinned immutable commit');
	}
	const treeSha = commitResponse.commit?.tree?.sha?.toLowerCase();
	if (!/^[0-9a-f]{40}$/.test(treeSha ?? '')) {
		throw new Error('GitHub commit has no immutable root tree');
	}
	const treeResponse = await fetchJson(`${apiRoot}/git/trees/${treeSha}?recursive=1`, fetchOptions);
	if (treeResponse.truncated) throw new Error('GitHub returned truncated source-tree evidence');
	if (treeResponse.sha?.toLowerCase() !== treeSha || !Array.isArray(treeResponse.tree)) {
		throw new Error('GitHub source tree does not match the resolved commit');
	}
	return treeResponse.tree;
}

async function fetchGitBlob(owner, repo, gitBlob, size, options) {
	if (size > BLOB_MAX_BYTES) {
		throw new Error(`Pinned upstream file is too large to fetch as a blob: ${gitBlob}`);
	}
	const blob = await fetchJson(
		`https://api.github.com/repos/${owner}/${repo}/git/blobs/${gitBlob}`,
		{
			fetchImpl: options.fetchImpl,
			allowedHosts: new Set(['api.github.com']),
			maxBytes: Math.ceil((BLOB_MAX_BYTES * 4) / 3) + 4096,
			headers: githubHeaders(options),
			requestTimeoutMs: options.requestTimeoutMs,
		},
	);
	if (blob.encoding !== 'base64' || typeof blob.content !== 'string') {
		throw new Error(`GitHub blob is not inline base64 evidence: ${gitBlob}`);
	}
	const bytes = Buffer.from(blob.content.replace(/\s/g, ''), 'base64');
	if (gitBlobSha1(bytes) !== gitBlob) {
		throw new Error(`GitHub blob bytes do not match the pinned lock: ${gitBlob}`);
	}
	return bytes;
}

function writeLockFile(options, lock) {
	const lockPath = path.join(options.packageDirectory, UPSTREAM_LOCK_RELATIVE_PATH);
	mkdirSync(path.dirname(lockPath), { recursive: true });
	writeFileSync(lockPath, `${JSON.stringify(lock, null, '\t')}\n`);
	return {
		command: 'lock',
		status: 'passed',
		lockPath: path.relative(process.cwd(), lockPath),
		fileCount: lock.files.length,
		fingerprint: lock.fingerprint,
	};
}

async function commandLockFromBatch(options) {
	const manifestPath = path.join(options.workRoot, options.batch, 'manifest.json');
	if (!existsSync(manifestPath)) {
		throw new Error(`Batch manifest does not exist: ${manifestPath}`);
	}
	const manifest = validateBatchManifest(JSON.parse(readFileSync(manifestPath, 'utf8')));
	const node = manifest.nodes[options.node];
	if (!node) throw new Error(`Batch manifest has no node ${options.node}`);
	if (!node.identity?.commit) {
		throw new Error(`Node ${options.node} has no preflighted immutable identity`);
	}
	const sourceLicense = node.license?.source;
	if (sourceLicense?.status !== 'passed' || !sourceLicense.spdx) {
		throw new Error(
			`Node ${options.node} has no approved source license; a lock cannot authorize adaptation`,
		);
	}
	const { owner, repo } = node.identity.repository;
	const treeEntries = await fetchPinnedTree(owner, repo, node.identity.commit, options);
	const lock = buildUpstreamLock({
		identity: node.identity,
		license: {
			spdx: sourceLicense.spdx,
			evidence: (sourceLicense.evidence ?? []).map(({ path: filePath, sha256 }) => ({
				path: filePath,
				sha256,
			})),
			notices: (sourceLicense.notices ?? []).map(({ path: filePath, sha256 }) => ({
				path: filePath,
				sha256,
			})),
		},
		treeEntries,
		scopes: options.scopes,
		adaptedMappings: options.adaptedMappings,
		adaptedRewrites: options.adaptedRewrites,
	});
	return writeLockFile(options, lock);
}

const LICENSE_FILE_PATTERN = /^(?:licen[cs]e|copying)(?:\..*)?$/i;
const NOTICE_FILE_PATTERN = /^notice(?:\..*)?$/i;
const RELEASE_PLACEHOLDER_VERSIONS = new Set(['0.0.0-development', '0.0.0-semantic-release']);

async function releaseTagMatchesCommit({ owner, repo, packageName, version }, options) {
	const fetchOptions = {
		fetchImpl: options.fetchImpl,
		allowedHosts: new Set(['api.github.com']),
		headers: githubHeaders(options),
		requestTimeoutMs: options.requestTimeoutMs,
	};
	for (const tag of [`v${version}`, `${packageName}@${version}`]) {
		let reference;
		try {
			reference = await fetchJson(
				`https://api.github.com/repos/${owner}/${repo}/git/ref/tags/${encodeURIComponent(tag)}`,
				fetchOptions,
			);
		} catch {
			continue;
		}
		let sha = reference.object?.sha?.toLowerCase();
		if (reference.object?.type === 'tag' && sha) {
			const tagObject = await fetchJson(
				`https://api.github.com/repos/${owner}/${repo}/git/tags/${sha}`,
				fetchOptions,
			);
			sha = tagObject.object?.sha?.toLowerCase();
		}
		if (sha === options.commit) return true;
	}
	return false;
}

// For a file-only license basis, every discovered license file must classify
// to one approved identifier; that identifier then stands in for the missing
// manifest declaration so the normal consistency checks still apply.
function classifyLicenseFilesOnly(licenseFiles) {
	const classifications = new Set(
		licenseFiles.map((file) => classifyApprovedLicenseText(file.content)),
	);
	if (classifications.size !== 1) return undefined;
	const [only] = classifications;
	return only === 'unrecognized' ? undefined : only;
}

// Legacy migration mode: many published pins lack the registry gitHead that
// preflight requires, but a vendored binding already carries a reviewed
// UPSTREAM.md pin. The explicit pin is accepted only when the pinned commit's
// own package manifest declares exactly the pinned name and version and the
// pinned tree carries recognizable approved-license evidence.
async function commandLockFromPin(options) {
	const { packageName, version } = options.pin;
	const { owner, repo } = options.repo;
	const subdirectory = options.subdirectory ?? null;
	const registryMetadata = await fetchJson(
		`https://registry.npmjs.org/${encodeURIComponent(packageName)}/${encodeURIComponent(version)}`,
		{
			fetchImpl: options.fetchImpl,
			allowedHosts: new Set(['registry.npmjs.org']),
			requestTimeoutMs: options.requestTimeoutMs,
		},
	);
	if (registryMetadata.name !== packageName || registryMetadata.version !== version) {
		throw new Error('Registry metadata contradicts the pinned package identity');
	}
	if (typeof registryMetadata.dist?.integrity !== 'string' || !registryMetadata.dist.integrity) {
		throw new Error('Registry metadata lacks tarball integrity evidence for the pin');
	}
	const treeEntries = await fetchPinnedTree(owner, repo, options.commit, options);
	// A pin whose subtree spans sibling monorepo packages proves its
	// commit correspondence through one named member manifest instead of
	// <subdir>/package.json.
	const manifestRelativePath = options.manifestPath ?? 'package.json';
	const manifestPath = subdirectory
		? `${subdirectory}/${manifestRelativePath}`
		: manifestRelativePath;
	const manifestEntry = treeEntries.find(
		(entry) => entry.path === manifestPath && entry.type === 'blob' && entry.mode !== '120000',
	);
	if (!manifestEntry) throw new Error(`Pinned commit has no ${manifestPath}`);
	const manifest = JSON.parse(
		(await fetchGitBlob(owner, repo, manifestEntry.sha, manifestEntry.size ?? 0, options)).toString(
			'utf8',
		),
	);
	// Semantic-release repositories keep a placeholder version in git and stamp
	// the real one at publish; for those, version correspondence is proven by
	// the release tag resolving to the pinned commit instead.
	const versionCorresponds =
		manifest.version === version ||
		(RELEASE_PLACEHOLDER_VERSIONS.has(manifest.version) &&
			(await releaseTagMatchesCommit({ owner, repo, packageName, version }, options)));
	if (manifest.name !== packageName || !versionCorresponds) {
		throw new Error(
			`Pinned commit manifest declares ${manifest.name}@${manifest.version}, not ${packageName}@${version}; the pin does not correspond to this commit`,
		);
	}
	if (manifest.license !== registryMetadata.license) {
		throw new Error('Pinned commit license metadata contradicts the registry artifact');
	}
	const licenseFiles = [];
	const noticeFiles = [];
	// License evidence is gathered from the repository root, the pin subtree
	// root, and the directory of the identity-proving member manifest, so a
	// member-scoped license or notice cannot hide behind a root-level one.
	const manifestDirectory = path.posix.dirname(manifestPath);
	const licenseDirectories = new Set(['.', subdirectory ?? '.', manifestDirectory]);
	for (const entry of treeEntries) {
		if (entry.type !== 'blob' || entry.mode === '120000') continue;
		const directory = path.posix.dirname(entry.path);
		if (!licenseDirectories.has(directory)) continue;
		const basename = path.posix.basename(entry.path);
		const isLicense = LICENSE_FILE_PATTERN.test(basename);
		const isNotice = NOTICE_FILE_PATTERN.test(basename);
		if (!isLicense && !isNotice) continue;
		const file = {
			path: entry.path,
			scope: directory === '.' ? 'root' : 'package',
			content: (await fetchGitBlob(owner, repo, entry.sha, entry.size ?? 0, options)).toString(
				'utf8',
			),
		};
		if (isNotice) noticeFiles.push(file);
		else licenseFiles.push(file);
	}
	// --accept-license-file is a reviewed exception for pins whose manifest
	// omits a license declaration entirely: the recognizable approved license
	// file is then the evidence, and the lock records the file-only basis. It
	// never overrides a contradicting declaration, and the default stays
	// fail-closed on a silent manifest.
	const manifestDeclaresLicense =
		typeof manifest.license === 'string' && manifest.license.trim() !== '';
	const verdict = evaluateApprovedLicense({
		manifestLicense:
			!manifestDeclaresLicense && options.acceptLicenseFile
				? classifyLicenseFilesOnly(licenseFiles)
				: manifest.license,
		licenseFiles,
		noticeFiles,
	});
	if (verdict.status !== 'passed') {
		throw new Error(
			`Pinned source license evidence is not approved: ${verdict.reasons.join('; ')}`,
		);
	}
	const licenseDeclaration =
		!manifestDeclaresLicense && options.acceptLicenseFile ? 'file-only' : 'manifest';
	const lock = buildUpstreamLock({
		identity: {
			packageName,
			version,
			repository: { owner, repo, subdirectory },
			commit: options.commit.toLowerCase(),
			integrity: registryMetadata.dist.integrity,
		},
		license: {
			spdx: verdict.spdx,
			declaration: licenseDeclaration,
			evidence: verdict.evidence.map(({ path: filePath, sha256 }) => ({ path: filePath, sha256 })),
			notices: verdict.notices.map(({ path: filePath, sha256 }) => ({ path: filePath, sha256 })),
		},
		treeEntries,
		scopes: options.scopes,
		adaptedMappings: options.adaptedMappings,
		adaptedRewrites: options.adaptedRewrites,
	});
	return writeLockFile(options, lock);
}

async function commandLock(options) {
	if (options.pin) return commandLockFromPin(options);
	if (!options.batch || !options.node) {
		throw new Error('lock requires --batch and --node from a completed preflight, or --pin');
	}
	return commandLockFromBatch(options);
}

async function commandRun(options) {
	const lock = readLock(options.packageDirectory);
	const pristineDirectory = path.join(options.packageDirectory, PRISTINE_RELATIVE_PATH);
	const statePath = path.join(pristineDirectory, MATERIALIZE_STATE_FILE);
	if (options.check) {
		if (!existsSync(pristineDirectory)) {
			throw new Error('No materialized pristine tree exists; run materialize first');
		}
		const verification = verifyPristineTree(lock, pristineDirectory);
		const drift =
			verification.missing.length + verification.mismatched.length + verification.unexpected.length;
		return {
			command: 'run',
			mode: 'check',
			status: drift === 0 ? 'passed' : 'failed',
			...verification,
		};
	}
	// Committed-pristine mode: the pinned upstream tree is tracked in this
	// repository and verified offline against the lock's git blob shas — its
	// content addresses in the upstream repository — so no network is ever
	// needed. Only the adapted suite regenerates.
	if (hasTrackedFiles(options.packageDirectory, PRISTINE_RELATIVE_PATH, options.execFile)) {
		const verification = verifyPristineTree(lock, pristineDirectory);
		if (
			verification.missing.length > 0 ||
			verification.mismatched.length > 0 ||
			verification.unexpected.length > 0
		) {
			throw new Error(
				`${pristineDirectory} does not match audit/upstream.lock.json (missing: ${verification.missing.length}, mismatched: ${verification.mismatched.length}, unexpected: ${verification.unexpected.length}); the committed pristine tree must stay byte-exact to the pinned upstream commit`,
			);
		}
		const adapted = regenerateAdaptedTree(
			lock,
			options.packageDirectory,
			pristineDirectory,
			options.execFile,
		);
		return {
			command: 'run',
			mode: 'committed',
			status: 'passed',
			pristineFileCount: lock.files.length,
			blobFallbackCount: 0,
			adaptedWritten: adapted.written.length,
			adaptedSkipped: adapted.skipped,
			lockFingerprint: lock.fingerprint,
		};
	}
	if (existsSync(pristineDirectory) && !existsSync(statePath)) {
		throw new Error(
			`${pristineDirectory} exists without a materialize state marker; remove or migrate it first`,
		);
	}
	// A pristine tree already materialized from this exact lock needs no
	// network: verify it in place and regenerate only the adapted suite, so
	// repeated test runs stay offline and fast.
	if (existsSync(statePath)) {
		const marker = JSON.parse(readFileSync(statePath, 'utf8'));
		if (marker.lockFingerprint === lock.fingerprint) {
			const existing = verifyPristineTree(lock, pristineDirectory);
			if (
				existing.missing.length === 0 &&
				existing.mismatched.length === 0 &&
				existing.unexpected.length === 0
			) {
				const adapted = regenerateAdaptedTree(
					lock,
					options.packageDirectory,
					pristineDirectory,
					options.execFile,
				);
				return {
					command: 'run',
					mode: 'reuse',
					status: 'passed',
					pristineFileCount: lock.files.length,
					blobFallbackCount: 0,
					adaptedWritten: adapted.written.length,
					adaptedSkipped: adapted.skipped,
					lockFingerprint: lock.fingerprint,
				};
			}
		}
	}
	const { files, blobFallbackCount, archiveFallbackReason } = await fetchPristineFiles(
		lock,
		options,
	);
	rmSync(pristineDirectory, { force: true, recursive: true });
	for (const [relativePath, bytes] of files) {
		writeTreeFile(pristineDirectory, relativePath, bytes);
	}
	writeFileSync(
		statePath,
		`${JSON.stringify({ lockFingerprint: lock.fingerprint, schemaVersion: 1 }, null, '\t')}\n`,
	);
	const verification = verifyPristineTree(lock, pristineDirectory);
	if (
		verification.missing.length > 0 ||
		verification.mismatched.length > 0 ||
		verification.unexpected.length > 0
	) {
		throw new Error('Materialized pristine tree failed post-write verification');
	}
	const adapted = regenerateAdaptedTree(
		lock,
		options.packageDirectory,
		pristineDirectory,
		options.execFile,
	);
	return {
		command: 'run',
		mode: 'materialize',
		status: 'passed',
		pristineFileCount: files.size,
		blobFallbackCount,
		...(archiveFallbackReason === null ? {} : { archiveFallbackReason }),
		adaptedWritten: adapted.written.length,
		adaptedSkipped: adapted.skipped,
		lockFingerprint: lock.fingerprint,
	};
}

function unifiedDiff(targetPath, pristineBytes, adaptedBytes, execFile) {
	if (pristineBytes.includes(0) || adaptedBytes.includes(0)) {
		throw new Error(`Adapted upstream file is binary and cannot be patched: ${targetPath}`);
	}
	const scratch = mkdtempSync(path.join(tmpdir(), 'react-port-materialize-diff-'));
	try {
		const leftPath = path.join(scratch, 'pristine');
		const rightPath = path.join(scratch, 'adapted');
		writeFileSync(leftPath, pristineBytes);
		writeFileSync(rightPath, adaptedBytes);
		let output = '';
		try {
			output = execFile(
				'git',
				['-c', 'core.autocrlf=false', 'diff', '--no-index', '--', leftPath, rightPath],
				{ encoding: 'utf8', maxBuffer: DIFF_MAX_BUFFER_BYTES },
			);
		} catch (error) {
			// git diff exits 1 when the files differ; that is the expected path.
			if (typeof error?.stdout !== 'string' || error.status !== 1) throw error;
			output = error.stdout;
		}
		if (!output) return null;
		const lines = output.split('\n').filter((line) => !line.startsWith('index '));
		const rewritten = lines
			.map((line) => {
				if (line.startsWith('diff --git ')) return `diff --git a/${targetPath} b/${targetPath}`;
				if (line.startsWith('--- ')) return `--- a/${targetPath}`;
				if (line.startsWith('+++ ')) return `+++ b/${targetPath}`;
				return line;
			})
			.join('\n');
		return rewritten.endsWith('\n') ? rewritten : `${rewritten}\n`;
	} finally {
		rmSync(scratch, { force: true, recursive: true });
	}
}

async function commandDiff(options) {
	const lock = readLock(options.packageDirectory);
	const pristineDirectory = path.join(options.packageDirectory, PRISTINE_RELATIVE_PATH);
	const verification = existsSync(pristineDirectory)
		? verifyPristineTree(lock, pristineDirectory)
		: null;
	if (!verification || verification.missing.length > 0 || verification.mismatched.length > 0) {
		throw new Error('diff requires a verified materialized pristine tree; run materialize first');
	}
	const planned = planAdaptedFiles(lock);
	const written = [];
	const removed = [];
	const unchanged = [];
	const skipped = [];
	for (const { sourcePath, targetPath } of planned) {
		const { patchPath, skipPath } = patchArtifactPaths(options.packageDirectory, targetPath);
		const adaptedPath = path.join(options.packageDirectory, ...targetPath.split('/'));
		if (existsSync(skipPath)) {
			if (existsSync(adaptedPath)) {
				throw new Error(
					`${targetPath} exists but is marked skipped; remove the .skip marker or the file`,
				);
			}
			skipped.push(targetPath);
			continue;
		}
		if (!existsSync(adaptedPath)) {
			throw new Error(
				`Adapted file is missing for pinned upstream case ${sourcePath}; adapt it or add a rationale .skip marker at ${path.relative(options.packageDirectory, skipPath)}`,
			);
		}
		let pristineBytes = readFileSync(path.join(pristineDirectory, ...sourcePath.split('/')));
		if (!pristineBytes.includes(0)) {
			pristineBytes = Buffer.from(
				applyAdaptedRewrites(pristineBytes.toString('utf8'), lock.adaptedRewrites),
			);
		}
		const adaptedBytes = readFileSync(adaptedPath);
		const patch = pristineBytes.equals(adaptedBytes)
			? null
			: unifiedDiff(targetPath, pristineBytes, adaptedBytes, options.execFile);
		if (patch === null) {
			if (existsSync(patchPath)) {
				rmSync(patchPath);
				removed.push(targetPath);
			} else {
				unchanged.push(targetPath);
			}
			continue;
		}
		const formattingOnly = findFormattingOnlyHunks(patch);
		if (formattingOnly.length > 0) {
			throw new Error(
				`${targetPath}: patch contains formatting-only hunks (${formattingOnly.join(' | ')}); keep the pristine tree's formatting so patches carry only genuine divergences`,
			);
		}
		mkdirSync(path.dirname(patchPath), { recursive: true });
		writeFileSync(patchPath, patch);
		written.push(targetPath);
	}
	return {
		command: 'diff',
		status: 'passed',
		patchesWritten: written,
		patchesRemoved: removed,
		unchanged: unchanged.length,
		skipped,
	};
}

export async function main({
	argumentsList = process.argv.slice(2),
	fetchImpl = globalThis.fetch,
	execFile = (file, fileArguments, executionOptions) =>
		execFileSync(file, fileArguments, executionOptions),
	env = process.env,
} = {}) {
	let parsed;
	try {
		parsed = parseArguments(argumentsList);
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${usage()}`);
		process.exitCode = 2;
		return;
	}
	if (parsed.command === 'help') {
		process.stdout.write(usage());
		return;
	}
	const options = {
		...parsed.options,
		execFile,
		fetchImpl,
		githubToken: env.GITHUB_TOKEN,
	};
	try {
		const report =
			parsed.command === 'lock'
				? await commandLock(options)
				: parsed.command === 'run'
					? await commandRun(options)
					: await commandDiff(options);
		process.stdout.write(`${JSON.stringify(sanitizeForReport(report), null, 2)}\n`);
		if (report.status !== 'passed') process.exitCode = 2;
	} catch (error) {
		process.stderr.write(
			`${sanitizeForReport(error instanceof Error ? error.message : String(error), '', credentialValuesFromEnvironment(env))}\n`,
		);
		process.exitCode = 2;
	}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	await main();
}
