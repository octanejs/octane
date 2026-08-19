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
	buildUpstreamLock,
	extractPristineFromArchive,
	gitBlobSha1,
	planAdaptedFiles,
	validateUpstreamLock,
	verifyPristineTree,
} from './materialize-lib.mjs';
import { fetchBounded, fetchJson, githubHeaders } from './preflight-lib.mjs';
import { credentialValuesFromEnvironment, sanitizeForReport } from './report-lib.mjs';
import { validateBatchManifest } from './state-lib.mjs';

const ARCHIVE_MAX_BYTES = 192 * 1024 * 1024;
const BLOB_MAX_BYTES = 16 * 1024 * 1024;

function usage() {
	return `Usage: node scripts/react-port/materialize.mjs <command> [options]

Materialize pinned upstream evidence for a binding from its committed
audit/upstream.lock.json instead of vendored upstream bytes. The pristine tree
regenerates under packages/<binding>/upstream/ and the adapted suite under the
lock's tests/upstream targets by applying committed audit/upstream-patches/.

Commands:
  lock   Derive audit/upstream.lock.json from a preflighted batch node
  run    Fetch, hash-verify, and regenerate the pristine and adapted trees
  diff   Regenerate audit/upstream-patches/ from the current adapted tree

Options:
  --package-dir <dir>        Binding package directory (required)
  --batch <id>               Preflight batch identifier (lock)
  --node <pkg:name>          Graph node identifier (lock)
  --work-root <dir>          Batch state root (default: .react-port-work)
  --adapted-map <from=to>    Map a pinned source root onto a tests/upstream
                             target (lock; repeatable)
  --check                    Verify without network or writes (run)
  -h, --help                 Show this help
`;
}

function parseArguments(argumentsList) {
	const options = {
		adaptedMappings: [],
		batch: null,
		check: false,
		node: null,
		packageDirectory: null,
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
		} else if (argument === '--adapted-map') {
			const separator = value?.indexOf('=') ?? -1;
			if (separator <= 0 || separator === value.length - 1) {
				throw new Error('--adapted-map requires <pinned-root>=<tests/upstream-target>');
			}
			options.adaptedMappings.push({
				fromRoot: value.slice(0, separator),
				toRoot: value.slice(separator + 1),
			});
			index += 1;
		} else if (argument === '--check') {
			options.check = true;
		} else {
			throw new Error(`Unknown option: ${argument}`);
		}
	}
	if (!options.packageDirectory) throw new Error('--package-dir is required');
	return { command, options };
}

function readLock(packageDirectory) {
	const lockPath = path.join(packageDirectory, UPSTREAM_LOCK_RELATIVE_PATH);
	if (!existsSync(lockPath)) {
		throw new Error(`Upstream lock does not exist: ${lockPath}`);
	}
	return validateUpstreamLock(JSON.parse(readFileSync(lockPath, 'utf8')));
}

function assertNoTrackedFiles(packageDirectory, relativeRoot, execFile) {
	try {
		const output = execFile('git', ['-C', packageDirectory, 'ls-files', '--', relativeRoot], {
			encoding: 'utf8',
		});
		if (output.trim()) {
			throw new Error(
				`${relativeRoot} contains git-tracked files; migrate the legacy vendored tree (git rm) before materializing over it`,
			);
		}
	} catch (error) {
		if (error?.message?.includes('git-tracked files')) throw error;
		// Outside a git worktree the tracked-file guard cannot apply.
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
	try {
		extracted = await fetchArchiveFiles(lock, options);
	} catch {
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
		if (pinned.size > BLOB_MAX_BYTES) {
			throw new Error(`Pinned upstream file is too large to fetch as a blob: ${relativePath}`);
		}
		const blob = await fetchJson(
			`https://api.github.com/repos/${owner}/${repo}/git/blobs/${pinned.gitBlob}`,
			{
				fetchImpl: options.fetchImpl,
				allowedHosts: new Set(['api.github.com']),
				maxBytes: Math.ceil((BLOB_MAX_BYTES * 4) / 3) + 4096,
				headers: githubHeaders(options),
				requestTimeoutMs: options.requestTimeoutMs,
			},
		);
		if (blob.encoding !== 'base64' || typeof blob.content !== 'string') {
			throw new Error(`GitHub blob is not inline base64 evidence: ${relativePath}`);
		}
		const bytes = Buffer.from(blob.content.replace(/\s/g, ''), 'base64');
		if (gitBlobSha1(bytes) !== pinned.gitBlob) {
			throw new Error(`GitHub blob bytes do not match the pinned lock: ${relativePath}`);
		}
		extracted.files.set(relativePath, bytes);
	}
	return { files: extracted.files, blobFallbackCount: fallbackPaths.length };
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
			if (existsSync(patchPath)) {
				const scratchPath = writeTreeFile(scratch, targetPath, bytes);
				execFile('git', ['apply', '--whitespace=nowarn', patchPath], {
					cwd: scratch,
					encoding: 'utf8',
				});
				bytes = readFileSync(scratchPath);
			}
			writeTreeFile(packageDirectory, targetPath, bytes);
			written.push(targetPath);
		}
	} finally {
		rmSync(scratch, { force: true, recursive: true });
	}
	return { written, skipped };
}

async function commandLock(options) {
	if (!options.batch || !options.node) {
		throw new Error('lock requires --batch and --node from a completed preflight');
	}
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
	const apiRoot = `https://api.github.com/repos/${owner}/${repo}`;
	const fetchOptions = {
		fetchImpl: options.fetchImpl,
		allowedHosts: new Set(['api.github.com']),
		headers: githubHeaders(options),
		requestTimeoutMs: options.requestTimeoutMs,
	};
	const commitResponse = await fetchJson(
		`${apiRoot}/commits/${node.identity.commit}`,
		fetchOptions,
	);
	if (commitResponse.sha?.toLowerCase() !== node.identity.commit.toLowerCase()) {
		throw new Error('GitHub commit does not match the preflighted immutable commit');
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
		treeEntries: treeResponse.tree,
		adaptedMappings: options.adaptedMappings,
	});
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
	assertNoTrackedFiles(options.packageDirectory, PRISTINE_RELATIVE_PATH, options.execFile);
	if (existsSync(pristineDirectory) && !existsSync(statePath)) {
		throw new Error(
			`${pristineDirectory} exists without a materialize state marker; remove or migrate it first`,
		);
	}
	const { files, blobFallbackCount } = await fetchPristineFiles(lock, options);
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
				{ encoding: 'utf8' },
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
		const pristineBytes = readFileSync(path.join(pristineDirectory, ...sourcePath.split('/')));
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
