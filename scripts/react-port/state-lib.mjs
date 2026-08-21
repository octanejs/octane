import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync } from 'node:fs';
import { open, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isCompleteEvidenceMatrix, isCurrentEvidenceMatrix } from './evidence-lib.mjs';

const SCHEMA_VERSION = 1;
const NEXT_STATES = Object.freeze({
	resolved: new Set(['licensed', 'blocked']),
	licensed: new Set(['classified', 'blocked']),
	classified: new Set(['ready', 'blocked']),
	ready: new Set(['implementing', 'blocked']),
	implementing: new Set(['verified', 'blocked']),
	verified: new Set(),
	blocked: new Set(),
});
const BINDING_IMPLEMENTATION_ACTIONS = new Set([
	'create-binding',
	'extend-binding',
	'adopt-binding',
]);

export function needsBindingEvidenceRepair(node) {
	if (
		!BINDING_IMPLEMENTATION_ACTIONS.has(node?.action) ||
		(node.state !== 'implementing' && node.state !== 'verified')
	) {
		return false;
	}
	if (!isCurrentEvidenceMatrix(node.evidenceMatrix)) return true;
	return (
		node.state === 'verified' &&
		(!isCompleteEvidenceMatrix(node.evidenceMatrix) ||
			node.evidence?.readiness?.status !== 'verified')
	);
}

export function validateBatchManifest(manifest) {
	if (!manifest || typeof manifest !== 'object')
		throw new Error('Batch manifest must be an object');
	if (manifest.schemaVersion > SCHEMA_VERSION) {
		throw new Error(`Batch manifest uses newer schema version ${manifest.schemaVersion}`);
	}
	if (manifest.schemaVersion !== SCHEMA_VERSION) {
		throw new Error(`Batch manifest schemaVersion must be ${SCHEMA_VERSION}`);
	}
	if (typeof manifest.batchId !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/i.test(manifest.batchId)) {
		throw new Error('Batch manifest has an invalid batchId');
	}
	if (
		manifest.workspaceRoot !== undefined &&
		(typeof manifest.workspaceRoot !== 'string' || !path.isAbsolute(manifest.workspaceRoot))
	) {
		throw new Error('Batch manifest workspaceRoot must be an absolute path');
	}
	if (!manifest.nodes || typeof manifest.nodes !== 'object')
		throw new Error('Batch manifest has no nodes');
	for (const field of ['executionUnits', 'actionableExecutionUnits', 'executionOrder']) {
		if (manifest[field] !== undefined && !Array.isArray(manifest[field])) {
			throw new Error(`Batch manifest ${field} must be an array`);
		}
	}
	for (const field of ['executionUnits', 'actionableExecutionUnits']) {
		if (manifest[field]?.some((unit) => !Array.isArray(unit))) {
			throw new Error(`Batch manifest ${field} must contain arrays`);
		}
	}
	if (
		manifest.executionUnits !== undefined &&
		manifest.executionOrder !== undefined &&
		JSON.stringify(manifest.executionOrder) !== JSON.stringify(manifest.executionUnits.flat())
	) {
		throw new Error('Batch manifest executionOrder must match executionUnits');
	}
	for (const [id, node] of Object.entries(manifest.nodes)) {
		if (!NEXT_STATES[node.state])
			throw new Error(`Batch node ${id} has invalid state ${node.state}`);
		if (!Array.isArray(node.dependsOn)) throw new Error(`Batch node ${id} has no dependsOn array`);
	}
	return manifest;
}

export function createBatchManifest({
	batchId,
	workspaceRoot = null,
	inventoryFingerprint,
	nodes,
	baseline = {},
	graphFingerprint = null,
	executionUnits = [],
	actionableExecutionUnits = [],
	executionOrder = executionUnits.flat(),
}) {
	const manifest = {
		schemaVersion: SCHEMA_VERSION,
		batchId,
		...(workspaceRoot === null ? {} : { workspaceRoot: path.resolve(workspaceRoot) }),
		inventoryFingerprint,
		graphFingerprint,
		nodes: structuredClone(nodes),
		executionUnits: structuredClone(executionUnits),
		actionableExecutionUnits: structuredClone(actionableExecutionUnits),
		executionOrder: structuredClone(executionOrder),
		baseline: structuredClone(baseline),
		history: [],
	};
	return validateBatchManifest(manifest);
}

export function transitionNodeState(
	manifest,
	nodeId,
	nextState,
	{ evidenceFingerprint, reason = null, repair = null, evidence = null } = {},
) {
	validateBatchManifest(manifest);
	const node = manifest.nodes[nodeId];
	if (!node) throw new Error(`Unknown batch node ${nodeId}`);
	if (node.evidenceFingerprint !== evidenceFingerprint) {
		throw new Error(`Evidence fingerprint changed for ${nodeId}; invalidate it before transition`);
	}
	if (!NEXT_STATES[node.state].has(nextState)) {
		throw new Error(`Invalid state transition for ${nodeId}: ${node.state} -> ${nextState}`);
	}
	if (nextState === 'blocked' && (!reason || !repair)) {
		throw new Error('A blocked transition requires both a reason and repair action');
	}
	const previousState = node.state;
	Object.assign(node, {
		state: nextState,
		...(evidence === null ? {} : { evidence: structuredClone(evidence) }),
		...(nextState === 'blocked' ? { blockers: [reason], repair } : {}),
	});
	manifest.history.push({ nodeId, from: previousState, to: nextState, evidenceFingerprint });
	return node;
}

function includeDependentInvalidations(nodes, initialIds) {
	const invalidated = new Set(initialIds);
	let changed = true;
	while (changed) {
		changed = false;
		for (const [id, node] of Object.entries(nodes)) {
			if (invalidated.has(id) || !node.dependsOn.some((dependency) => invalidated.has(dependency)))
				continue;
			invalidated.add(id);
			changed = true;
		}
	}
	return invalidated;
}

export function invalidateChangedEvidence(manifest, nextFingerprints) {
	validateBatchManifest(manifest);
	const invalidated = includeDependentInvalidations(
		manifest.nodes,
		Object.entries(nextFingerprints)
			.filter(
				([id, nextFingerprint]) =>
					manifest.nodes[id] && manifest.nodes[id].evidenceFingerprint !== nextFingerprint,
			)
			.map(([id]) => id),
	);
	for (const id of invalidated) {
		const node = manifest.nodes[id];
		node.state = 'resolved';
		delete node.blockers;
		delete node.repair;
		delete node.evidence;
		if (Object.hasOwn(nextFingerprints, id)) node.evidenceFingerprint = nextFingerprints[id];
	}
	return [...invalidated].sort();
}

export function reconcileBatchManifest(previousManifest, nextManifest) {
	validateBatchManifest(previousManifest);
	validateBatchManifest(nextManifest);
	if (previousManifest.batchId !== nextManifest.batchId) {
		throw new Error('Cannot resume a different batchId');
	}

	const changedNodes = [];
	for (const [id, nextNode] of Object.entries(nextManifest.nodes)) {
		const previousNode = previousManifest.nodes[id];
		if (
			!previousNode ||
			previousNode.nodeFingerprint !== nextNode.nodeFingerprint ||
			previousNode.evidenceFingerprint !== nextNode.evidenceFingerprint ||
			needsBindingEvidenceRepair(previousNode)
		) {
			changedNodes.push(id);
		}
	}
	const invalidated = includeDependentInvalidations(nextManifest.nodes, changedNodes);

	const merged = structuredClone(nextManifest);
	for (const [id, nextNode] of Object.entries(merged.nodes)) {
		const previousNode = previousManifest.nodes[id];
		if (!previousNode || invalidated.has(id)) continue;
		nextNode.state = previousNode.state;
		for (const field of ['evidence', 'evidenceMatrix', 'outputs', 'blockers', 'repair']) {
			if (Object.hasOwn(previousNode, field))
				nextNode[field] = structuredClone(previousNode[field]);
			else delete nextNode[field];
		}
	}
	merged.baseline = structuredClone(previousManifest.baseline);
	merged.history = structuredClone(previousManifest.history ?? []);
	merged.resume = {
		invalidated: [...invalidated].sort(),
		preserved: Object.keys(merged.nodes)
			.filter((id) => previousManifest.nodes[id] && !invalidated.has(id))
			.sort(),
	};
	return validateBatchManifest(merged);
}

export function detectWorktreeCollisions({ plannedPaths, baseline, current }) {
	return [...new Set(plannedPaths)]
		.filter((filePath) => (baseline[filePath] ?? null) !== (current[filePath] ?? null))
		.sort();
}

function hashWorktreePath(repoRoot, relativePath) {
	const filePath = path.join(repoRoot, relativePath);
	try {
		const stats = lstatSync(filePath);
		if (stats.isSymbolicLink()) return `symlink:${readlinkSync(filePath)}`;
		if (stats.isDirectory()) return 'directory';
		if (!stats.isFile()) return `special:${stats.mode}`;
		return createHash('sha256').update(readFileSync(filePath)).digest('hex');
	} catch (error) {
		if (error?.code === 'ENOENT') return null;
		throw error;
	}
}

export function captureWorktreeBaseline(repoRoot = process.cwd(), plannedRoots = []) {
	const output = execFileSync(
		'git',
		['--no-optional-locks', 'status', '--porcelain=v1', '-z', '--untracked-files=all'],
		{ cwd: repoRoot, encoding: 'utf8' },
	);
	const records = output.split('\0');
	const paths = [];
	for (let index = 0; index < records.length; index += 1) {
		const record = records[index];
		if (!record) continue;
		const status = record.slice(0, 2);
		paths.push(record.slice(3));
		if ((status.includes('R') || status.includes('C')) && records[index + 1]) {
			paths.push(records[index + 1]);
			index += 1;
		}
	}
	for (const plannedRoot of plannedRoots) {
		const rootPath = path.join(repoRoot, plannedRoot);
		try {
			paths.push(plannedRoot);
			if (!lstatSync(rootPath).isDirectory()) continue;
			for (const entry of readdirSync(rootPath, { recursive: true, withFileTypes: true })) {
				paths.push(path.relative(repoRoot, path.join(entry.parentPath, entry.name)));
			}
		} catch (error) {
			if (error?.code !== 'ENOENT') throw error;
		}
	}
	return Object.fromEntries(
		[...new Set(paths)]
			.sort()
			.map((relativePath) => [relativePath, hashWorktreePath(repoRoot, relativePath)]),
	);
}

export function assertPlannedPathIsSafe(repoRoot, relativePath) {
	const resolvedRoot = realpathSync(repoRoot);
	const segments = relativePath.split('/').filter(Boolean);
	let candidate = resolvedRoot;
	for (const segment of segments) {
		candidate = path.join(candidate, segment);
		try {
			if (lstatSync(candidate).isSymbolicLink()) {
				throw new Error(`Planned binding path contains a symlink: ${relativePath}`);
			}
		} catch (error) {
			if (error?.code === 'ENOENT') break;
			throw error;
		}
	}
	const relative = path.relative(resolvedRoot, candidate);
	if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
		throw new Error(`Planned binding path escapes the workspace: ${relativePath}`);
	}
}

export function detectNodeWorktreeCollisions({ repoRoot, bindingDirectory, baseline }) {
	const current = captureWorktreeBaseline(repoRoot, [bindingDirectory]);
	const prefix = `${bindingDirectory.replace(/\/$/, '')}/`;
	const plannedPaths = [
		bindingDirectory,
		...Object.keys(baseline ?? {}).filter(
			(filePath) => filePath === bindingDirectory || filePath.startsWith(prefix),
		),
		...Object.keys(current).filter(
			(filePath) => filePath === bindingDirectory || filePath.startsWith(prefix),
		),
	];
	return detectWorktreeCollisions({ plannedPaths, baseline: baseline ?? {}, current });
}

async function readLock(lockPath) {
	try {
		return JSON.parse(await readFile(lockPath, 'utf8'));
	} catch {
		throw new Error(`Batch is locked by an unreadable ownership record: ${lockPath}`);
	}
}

export async function acquireBatchLock(
	directory,
	{
		owner,
		pid = process.pid,
		now = Date.now(),
		staleAfterMs = 30 * 60 * 1000,
		allowStaleRecovery = false,
	} = {},
) {
	if (typeof owner !== 'string' || !owner) throw new Error('Batch lock owner is required');
	await mkdir(directory, { recursive: true });
	const lockPath = path.join(directory, '.lock');
	const record = { schemaVersion: 1, owner, pid, acquiredAt: now };

	async function create() {
		const handle = await open(lockPath, 'wx', 0o600);
		try {
			await handle.writeFile(`${JSON.stringify(record, null, 2)}\n`, 'utf8');
		} finally {
			await handle.close();
		}
	}

	try {
		await create();
	} catch (error) {
		if (error?.code !== 'EEXIST') throw error;
		const existing = await readLock(lockPath);
		const lockStat = await stat(lockPath);
		const acquiredAt = Number(existing.acquiredAt) || lockStat.mtimeMs;
		if (!allowStaleRecovery || now - acquiredAt <= staleAfterMs) {
			throw new Error(`Batch is locked by ${existing.owner ?? 'another writer'}`);
		}
		await rename(lockPath, path.join(directory, `.lock.stale.${Math.trunc(now)}`));
		await create();
	}
	return { directory, path: lockPath, owner };
}

export async function writeManifestAtomically(directory, manifest, { owner } = {}) {
	validateBatchManifest(manifest);
	const lockPath = path.join(directory, '.lock');
	const lock = await readLock(lockPath);
	if (!owner || lock.owner !== owner)
		throw new Error('Manifest writer does not own the batch lock');
	const manifestPath = path.join(directory, 'manifest.json');
	const temporaryPath = path.join(directory, 'manifest.json.tmp');
	try {
		await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, {
			encoding: 'utf8',
			mode: 0o600,
		});
		await rename(temporaryPath, manifestPath);
	} catch (error) {
		await unlink(temporaryPath).catch(() => {});
		throw error;
	}
	return manifestPath;
}

export async function releaseBatchLock(lock) {
	const existing = await readLock(lock.path);
	if (existing.owner !== lock.owner)
		throw new Error('Cannot release a batch lock owned by another writer');
	await unlink(lock.path);
}
