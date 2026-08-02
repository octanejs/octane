import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { builtinModules, createRequire } from 'node:module';
import { access, lstat, mkdir, readFile, readdir, readlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

import ts from 'typescript';
import { parse as parseYaml } from 'yaml';

import {
	buildTypeScriptCompilerArgv,
	loadManifest,
	requiredExecutableLanes,
	toPortablePath,
	verifyLaneEnvironment,
	verifyManifestFiles,
} from './harness-lib.mjs';

const execFileAsync = promisify(execFile);
const RECEIPT_SCHEMA_VERSION = 1;
export const FINGERPRINT_VERSION = 1;
const RECEIPT_LANE_TYPES = new Set(['pristine-upstream', 'pristine-types']);
const EXACT_NODE_VERSION = /^\d+\.\d+\.\d+$/;
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/;
const BUILTINS = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
const TOOL_INPUTS = [
	'scripts/react-parity/harness-lib.mjs',
	'scripts/react-parity/harness.mjs',
	'scripts/react-parity/receipts-lib.mjs',
	'scripts/react-parity/receipts.mjs',
];
const DEFAULT_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const lockfileCache = new Map();

function canonicalize(value) {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (!value || typeof value !== 'object') return value;
	return Object.fromEntries(
		Object.keys(value)
			.sort()
			.map((key) => [key, canonicalize(value[key])]),
	);
}

export function canonicalJson(value) {
	return JSON.stringify(canonicalize(value));
}

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

function exactRepositoryPath(root, path, label = 'path') {
	if (
		typeof path !== 'string' ||
		path.length === 0 ||
		isAbsolute(path) ||
		path.split(/[\\/]/).includes('..') ||
		/[?*{}[\]]/.test(path)
	) {
		throw new Error(`${label} must be an exact repository-relative path`);
	}
	const absolute = resolve(root, path);
	if (relative(root, absolute).startsWith('..')) throw new Error(`${label} escapes the repository`);
	return absolute;
}

async function exists(path) {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function listPathInputs(root, declaredPath, records) {
	const absolute = exactRepositoryPath(root, declaredPath, 'receipt input');
	const metadata = await lstat(absolute);
	if (metadata.isSymbolicLink()) {
		records.set(declaredPath, `symlink:${await readlink(absolute)}`);
		return;
	}
	if (metadata.isFile()) {
		records.set(declaredPath, `file:${sha256(await readFile(absolute))}`);
		return;
	}
	if (!metadata.isDirectory()) throw new Error(`unsupported receipt input: ${declaredPath}`);
	const entries = await readdir(absolute, { withFileTypes: true });
	for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
		await listPathInputs(root, toPortablePath(join(declaredPath, entry.name)), records);
	}
}

function packageNameFromSpecifier(specifier) {
	if (
		!specifier ||
		specifier.startsWith('.') ||
		specifier.startsWith('/') ||
		specifier.startsWith('#') ||
		BUILTINS.has(specifier)
	) {
		return null;
	}
	const parts = specifier.split('/');
	return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function sourceModuleSpecifiers(file, source) {
	const scriptKind = file.endsWith('.tsx')
		? ts.ScriptKind.TSX
		: file.endsWith('.jsx')
			? ts.ScriptKind.JSX
			: file.endsWith('.js') || file.endsWith('.cjs') || file.endsWith('.mjs')
				? ts.ScriptKind.JS
				: ts.ScriptKind.TS;
	const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind);
	const found = new Set(ast.typeReferenceDirectives.map(({ fileName }) => `@types/${fileName}`));
	function visit(node) {
		if (
			(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
			node.moduleSpecifier &&
			ts.isStringLiteral(node.moduleSpecifier)
		) {
			found.add(node.moduleSpecifier.text);
		}
		if (
			ts.isCallExpression(node) &&
			node.arguments.length > 0 &&
			ts.isStringLiteral(node.arguments[0]) &&
			((ts.isIdentifier(node.expression) && ['require', 'import'].includes(node.expression.text)) ||
				node.expression.kind === ts.SyntaxKind.ImportKeyword)
		) {
			found.add(node.arguments[0].text);
		}
		ts.forEachChild(node, visit);
	}
	visit(ast);
	return found;
}

async function packageIdentityFromResolvedPath(resolvedPath) {
	let directory = dirname(resolvedPath);
	while (directory !== dirname(directory)) {
		const packageJson = join(directory, 'package.json');
		if (await exists(packageJson)) {
			try {
				const value = JSON.parse(await readFile(packageJson, 'utf8'));
				if (typeof value.name === 'string' && typeof value.version === 'string') {
					return { name: value.name, version: value.version };
				}
			} catch {
				// Keep walking: nested fixtures can contain non-package package.json files.
			}
		}
		if (!directory.split(sep).includes('node_modules')) break;
		directory = dirname(directory);
	}
	return null;
}

async function resolvePackageIdentity(specifier, fromFile) {
	const packageName = packageNameFromSpecifier(specifier);
	if (!packageName) return null;
	const requireFromFile = createRequire(fromFile);
	for (const candidate of [specifier, packageName]) {
		try {
			const resolvedPath = requireFromFile.resolve(candidate);
			return await packageIdentityFromResolvedPath(resolvedPath);
		} catch {
			// An import can be type-only or intentionally unavailable in an unexecuted tool file.
		}
	}
	return null;
}

async function collectSourceDependencies(root, fileRecords, identities) {
	for (const path of [...fileRecords.keys()].filter((file) => SOURCE_FILE.test(file)).sort()) {
		const absolute = resolve(root, path);
		const source = await readFile(absolute, 'utf8');
		for (const specifier of sourceModuleSpecifiers(path, source)) {
			const identity = await resolvePackageIdentity(specifier, absolute);
			if (identity) identities.set(`${identity.name}@${identity.version}`, identity);
		}
	}
}

async function collectResolvedPaths(value, identities) {
	if (
		typeof value === 'string' &&
		isAbsolute(value) &&
		value.includes(`${sep}node_modules${sep}`)
	) {
		const identity = await packageIdentityFromResolvedPath(value);
		if (identity) identities.set(`${identity.name}@${identity.version}`, identity);
		return;
	}
	if (Array.isArray(value)) {
		for (const child of value) await collectResolvedPaths(child, identities);
		return;
	}
	if (value && typeof value === 'object') {
		for (const child of Object.values(value)) await collectResolvedPaths(child, identities);
	}
}

async function collectJestInputs(root, lane, fileRecords, identities) {
	await listPathInputs(root, lane.execution.root, fileRecords);
	const config = exactRepositoryPath(root, lane.execution.config, 'Jest config');
	const jestBin = createRequire(config).resolve('jest/bin/jest');
	const jestIdentity = await packageIdentityFromResolvedPath(jestBin);
	if (!jestIdentity) throw new Error(`could not resolve Jest for ${lane.id}`);
	identities.set(`${jestIdentity.name}@${jestIdentity.version}`, jestIdentity);
	const { stdout } = await execFileAsync(
		process.execPath,
		[
			jestBin,
			'--showConfig',
			'--json',
			'--config',
			config,
			'--rootDir',
			exactRepositoryPath(root, lane.execution.root, 'Jest root'),
		],
		{ cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
	);
	await collectResolvedPaths(JSON.parse(stdout), identities);
}

async function collectTypeScriptInputs(root, lane, fileRecords, identities) {
	const [command, ...args] = buildTypeScriptCompilerArgv(
		lane.execution.compiler,
		lane.execution.project,
	);
	const { stdout } = await execFileAsync(command, [...args, '--listFilesOnly'], {
		cwd: root,
		encoding: 'utf8',
		maxBuffer: 16 * 1024 * 1024,
	});
	for (const line of stdout.split(/\r?\n/).filter(Boolean)) {
		const absolute = resolve(root, line);
		if (absolute.includes(`${sep}node_modules${sep}`)) {
			const identity = await packageIdentityFromResolvedPath(absolute);
			if (identity) identities.set(`${identity.name}@${identity.version}`, identity);
		} else {
			const path = toPortablePath(relative(root, absolute));
			if (path.startsWith('..'))
				throw new Error(`TypeScript input escapes the repository: ${line}`);
			await listPathInputs(root, path, fileRecords);
		}
	}
}

function dependencyEntryVersion(entry) {
	return typeof entry === 'string' ? entry : entry?.version;
}

function baseVersion(value) {
	return value.split('(')[0];
}

function snapshotCandidates(lockfile, identity) {
	const prefix = `${identity.name}@${identity.version}`;
	const snapshots = lockfile.snapshots ?? {};
	return Object.keys(snapshots)
		.filter((key) => key === prefix || key.startsWith(`${prefix}(`))
		.sort();
}

function packageMetadataForSnapshot(lockfile, snapshotKey) {
	if (lockfile.packages?.[snapshotKey]) return lockfile.packages[snapshotKey];
	const withoutPeers = snapshotKey.slice(
		0,
		snapshotKey.indexOf('(') === -1 ? undefined : snapshotKey.indexOf('('),
	);
	return lockfile.packages?.[withoutPeers] ?? null;
}

function resolveSnapshotDependency(lockfile, name, entry) {
	const version = dependencyEntryVersion(entry);
	if (!version || /^(?:link|workspace|file):/.test(version)) return null;
	const key = `${name}@${version}`;
	if (lockfile.snapshots?.[key]) return key;
	if (lockfile.snapshots?.[version]) return version;
	const unaliased = /^npm:((?:@[^/]+\/)?[^@]+)@(.+)$/.exec(version);
	if (unaliased) {
		const aliasKey = `${unaliased[1]}@${unaliased[2]}`;
		if (lockfile.snapshots?.[aliasKey]) return aliasKey;
	}
	throw new Error(`resolved dependency is missing from pnpm snapshots: ${key}`);
}

export function resolvedDependencyGraph(lockfile, identities) {
	const pending = [];
	for (const identity of identities) {
		const candidates = snapshotCandidates(lockfile, identity);
		if (candidates.length === 0)
			throw new Error(`could not find ${identity.name}@${identity.version} in pnpm-lock.yaml`);
		pending.push(...candidates);
	}
	const visited = new Set();
	const nodes = [];
	while (pending.length > 0) {
		const key = pending.shift();
		if (visited.has(key)) continue;
		visited.add(key);
		const snapshot = lockfile.snapshots?.[key];
		if (!snapshot) throw new Error(`missing pnpm snapshot ${key}`);
		const metadata = packageMetadataForSnapshot(lockfile, key);
		nodes.push({ key, metadata, snapshot });
		for (const [name, entry] of [
			...Object.entries(snapshot.dependencies ?? {}),
			...Object.entries(snapshot.optionalDependencies ?? {}),
		]) {
			const dependency = resolveSnapshotDependency(lockfile, name, entry);
			if (dependency) pending.push(dependency);
		}
	}
	const patches = Object.fromEntries(
		Object.entries(lockfile.patchedDependencies ?? {})
			.filter(([key]) => nodes.some((node) => baseVersion(node.key) === key))
			.sort(([left], [right]) => left.localeCompare(right, 'en')),
	);
	return {
		lockfileVersion: lockfile.lockfileVersion,
		nodes: nodes.sort((left, right) => left.key.localeCompare(right.key, 'en')),
		patches,
	};
}

async function readLockfile(path) {
	let parsed = lockfileCache.get(path);
	if (!parsed) {
		parsed = parseYaml(await readFile(path, 'utf8'));
		lockfileCache.set(path, parsed);
	}
	return parsed;
}

function receiptLaneDefinition(lane) {
	return {
		id: lane.id,
		type: lane.type,
		oracle: lane.oracle,
		environment: lane.environment,
		project: lane.project,
		evidenceOrigin: lane.evidenceOrigin,
		execution: lane.execution,
		files: lane.files,
	};
}

export function requiredReceiptLanes(manifest) {
	return manifest.lanes.filter(
		(lane) =>
			RECEIPT_LANE_TYPES.has(lane.type) && lane.oracle === 'required' && lane.available !== false,
	);
}

export function receiptPathForManifest(manifestPath) {
	return join(dirname(manifestPath), 'react-parity.receipts.json');
}

export async function discoverParityManifestPaths(root = DEFAULT_ROOT) {
	const packages = await readdir(join(root, 'packages'), { withFileTypes: true });
	const manifests = [];
	for (const entry of packages) {
		if (!entry.isDirectory()) continue;
		const path = `packages/${entry.name}/audit/react-parity.json`;
		if (await exists(join(root, path))) manifests.push(path);
	}
	return manifests.sort();
}

export async function computeLaneFingerprint({
	root = DEFAULT_ROOT,
	manifestPath,
	manifest,
	lane,
}) {
	const environment = manifest.environments[lane.environment];
	if (!EXACT_NODE_VERSION.test(environment.node)) {
		throw new Error(`receipt lane ${lane.id} must pin an exact Node version`);
	}
	const fileRecords = new Map();
	for (const path of TOOL_INPUTS) await listPathInputs(root, path, fileRecords);
	for (const file of lane.files) await listPathInputs(root, file.path, fileRecords);
	for (const path of [
		lane.execution?.config,
		lane.execution?.inventory,
		lane.execution?.project,
	].filter(Boolean)) {
		await listPathInputs(root, path, fileRecords);
	}
	const identities = new Map();
	if (lane.execution?.kind === 'jest-full') {
		await collectJestInputs(root, lane, fileRecords, identities);
	} else if (lane.execution?.kind === 'typescript') {
		await collectTypeScriptInputs(root, lane, fileRecords, identities);
	} else {
		throw new Error(`receipt lane ${lane.id} has unsupported execution ${lane.execution?.kind}`);
	}
	await collectSourceDependencies(root, fileRecords, identities);
	const lockfilePath = resolve(root, environment.lockfile);
	const lockfile = await readLockfile(lockfilePath);
	const dependencies = resolvedDependencyGraph(lockfile, [...identities.values()]);
	const payload = {
		fingerprintVersion: FINGERPRINT_VERSION,
		manifest: toPortablePath(manifestPath),
		provenance: manifest.provenance,
		lane: receiptLaneDefinition(lane),
		environment: {
			node: environment.node,
			packageManager: environment.packageManager,
			lockfile: environment.lockfile,
		},
		files: [...fileRecords.entries()]
			.map(([path, digest]) => ({ path, digest }))
			.sort((left, right) => left.path.localeCompare(right.path, 'en')),
		dependencies,
	};
	return `sha256:${sha256(canonicalJson(payload))}`;
}

export async function computeManifestFingerprints(
	manifestPath,
	root = DEFAULT_ROOT,
	manifest = undefined,
) {
	const loaded = manifest ?? (await loadManifest(resolve(root, manifestPath)));
	const receiptLanes = requiredReceiptLanes(loaded);
	const lanes = {};
	for (const lane of receiptLanes) {
		lanes[lane.id] = {
			inputSha256: await computeLaneFingerprint({ root, manifestPath, manifest: loaded, lane }),
		};
	}
	const nodeVersions = new Set(
		receiptLanes.map((lane) => loaded.environments[lane.environment].node),
	);
	if (nodeVersions.size === 0) return { manifest: loaded, node: null, lanes };
	if (nodeVersions.size !== 1)
		throw new Error(`${manifestPath} receipt lanes must use one Node version`);
	return { manifest: loaded, node: [...nodeVersions][0], lanes };
}

function validateReceiptShape(receipt, manifestPath, expectedLanes, node) {
	if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt))
		throw new Error('receipt root must be an object');
	const keys = new Set([
		'$schema',
		'schemaVersion',
		'fingerprintVersion',
		'manifest',
		'node',
		'lanes',
	]);
	for (const key of Object.keys(receipt))
		if (!keys.has(key)) throw new Error(`receipt has unknown key ${JSON.stringify(key)}`);
	if (receipt.schemaVersion !== RECEIPT_SCHEMA_VERSION)
		throw new Error('receipt schemaVersion must be 1');
	if (receipt.fingerprintVersion !== FINGERPRINT_VERSION)
		throw new Error(`receipt fingerprintVersion must be ${FINGERPRINT_VERSION}`);
	if (receipt.manifest !== manifestPath) throw new Error('receipt manifest path does not match');
	if (receipt.node !== node) throw new Error(`receipt Node version must be ${node}`);
	if (!receipt.lanes || typeof receipt.lanes !== 'object' || Array.isArray(receipt.lanes))
		throw new Error('receipt lanes must be an object');
	const actualIds = Object.keys(receipt.lanes).sort();
	const expectedIds = Object.keys(expectedLanes).sort();
	if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds))
		throw new Error('receipt lane set does not match the required pristine lanes');
	for (const id of actualIds) {
		const entry = receipt.lanes[id];
		if (
			!entry ||
			typeof entry !== 'object' ||
			Array.isArray(entry) ||
			Object.keys(entry).length !== 1 ||
			!/^sha256:[a-f0-9]{64}$/.test(entry.inputSha256)
		) {
			throw new Error(`receipt lane ${id} must contain one complete inputSha256`);
		}
	}
}

export function createReceiptDocument(manifestPath, node, lanes) {
	return {
		$schema: '../../../scripts/react-parity/react-parity.receipts.schema.json',
		schemaVersion: RECEIPT_SCHEMA_VERSION,
		fingerprintVersion: FINGERPRINT_VERSION,
		manifest: manifestPath,
		node,
		lanes: Object.fromEntries(
			Object.entries(lanes)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([id, entry]) => [id, { inputSha256: entry.inputSha256 }]),
		),
	};
}

export function compareReceipt(receipt, manifestPath, expected) {
	validateReceiptShape(receipt, manifestPath, expected.lanes, expected.node);
	const stale = Object.keys(expected.lanes).filter(
		(id) => receipt.lanes[id].inputSha256 !== expected.lanes[id].inputSha256,
	);
	return { stale, current: stale.length === 0 };
}

async function readReceipt(path) {
	try {
		return JSON.parse(await readFile(path, 'utf8'));
	} catch (error) {
		if (error.code === 'ENOENT') return null;
		throw new Error(`${path}: invalid receipt JSON: ${error.message}`);
	}
}

export async function receiptStatus(manifestPath, root = DEFAULT_ROOT, { strict = true } = {}) {
	const absoluteManifest = resolve(root, manifestPath);
	const manifest = await loadManifest(absoluteManifest);
	await verifyManifestFiles(manifest, root);
	const expected = await computeManifestFingerprints(manifestPath, root, manifest);
	const relativeReceipt = toPortablePath(relative(root, receiptPathForManifest(absoluteManifest)));
	if (Object.keys(expected.lanes).length === 0) {
		return {
			manifestPath,
			receiptPath: relativeReceipt,
			expected,
			receipt: null,
			stale: [],
			current: true,
		};
	}
	const receipt = await readReceipt(resolve(root, relativeReceipt));
	if (!receipt) {
		if (strict)
			throw new Error(`${relativeReceipt} is missing; run pnpm test for the owning package`);
		return {
			manifestPath,
			receiptPath: relativeReceipt,
			expected,
			receipt: null,
			stale: Object.keys(expected.lanes),
		};
	}
	try {
		const comparison = compareReceipt(receipt, manifestPath, expected);
		if (strict && !comparison.current) {
			throw new Error(
				`${relativeReceipt} is stale for ${comparison.stale.join(', ')}; run pnpm test for the owning package`,
			);
		}
		return { manifestPath, receiptPath: relativeReceipt, expected, receipt, ...comparison };
	} catch (error) {
		if (strict) throw error;
		return {
			manifestPath,
			receiptPath: relativeReceipt,
			expected,
			receipt,
			stale: Object.keys(expected.lanes),
			current: false,
			reason: error.message,
		};
	}
}

export async function verifyAllReceipts(root = DEFAULT_ROOT) {
	const statuses = [];
	for (const manifestPath of await discoverParityManifestPaths(root)) {
		const status = await receiptStatus(manifestPath, root, { strict: true });
		statuses.push(status);
	}
	return {
		schemaVersion: 1,
		entries: statuses.flatMap((status) =>
			Object.entries(status.expected.lanes).map(([lane, entry]) => ({
				manifest: status.manifestPath,
				receipt: status.receiptPath,
				lane,
				inputSha256: entry.inputSha256,
			})),
		),
		always: statuses.flatMap((status) => {
			const receipted = new Set(Object.keys(status.expected.lanes));
			return requiredExecutableLanes(status.expected.manifest)
				.filter((lane) => !receipted.has(lane.id))
				.map((lane) => ({ manifest: status.manifestPath, lane: lane.id }));
		}),
	};
}

async function spawnHarness(root, manifestPath, laneIds) {
	const argv = [
		resolve(root, 'scripts/react-parity/harness.mjs'),
		'run',
		'--manifest',
		manifestPath,
		...laneIds.flatMap((lane) => ['--lane', lane]),
	];
	const exitCode = await new Promise((resolveExit, reject) => {
		const child = spawn(process.execPath, argv, { cwd: root, stdio: 'inherit' });
		child.on('error', reject);
		child.on('close', (code, signal) => resolveExit(code ?? (signal ? 1 : 0)));
	});
	if (exitCode !== 0) throw new Error(`React parity lanes failed for ${manifestPath}`);
}

export async function runStaleReceiptLanes({
	root = DEFAULT_ROOT,
	manifestPaths,
	force = false,
	execute = spawnHarness,
	statusForManifest = receiptStatus,
	computeFingerprints = computeManifestFingerprints,
	verifyEnvironment = verifyLaneEnvironment,
	writeReceipt = writeFile,
} = {}) {
	const selectedManifests = manifestPaths ?? (await discoverParityManifestPaths(root));
	const results = [];
	for (const manifestPath of selectedManifests) {
		const before = await statusForManifest(manifestPath, root, { strict: false });
		const laneIds = force ? Object.keys(before.expected.lanes) : before.stale;
		if (laneIds.length === 0) {
			results.push({ manifestPath, laneIds, skipped: true });
			continue;
		}
		const pnpmVersion = (await execFileAsync('pnpm', ['--version'], { encoding: 'utf8' })).stdout;
		for (const laneId of laneIds) {
			const lane = before.expected.manifest.lanes.find((candidate) => candidate.id === laneId);
			await verifyEnvironment(before.expected.manifest, lane, root, pnpmVersion);
		}
		await execute(root, manifestPath, laneIds);
		const after = await computeFingerprints(manifestPath, root, before.expected.manifest);
		for (const laneId of laneIds) {
			if (after.lanes[laneId].inputSha256 !== before.expected.lanes[laneId].inputSha256) {
				throw new Error(`receipt inputs changed while ${laneId} was running`);
			}
		}
		const document = createReceiptDocument(manifestPath, after.node, after.lanes);
		const destination = resolve(root, before.receiptPath);
		await mkdir(dirname(destination), { recursive: true });
		await writeReceipt(destination, `${JSON.stringify(document, null, 2)}\n`);
		results.push({ manifestPath, laneIds, skipped: false });
	}
	return results;
}

export async function runCiLanes({ root = DEFAULT_ROOT, manifestPath, laneIds }) {
	const status = await receiptStatus(manifestPath, root, { strict: true });
	const eligible = new Set(
		requiredExecutableLanes(status.expected.manifest).map((lane) => lane.id),
	);
	if (laneIds.length === 0 || laneIds.some((lane) => !eligible.has(lane))) {
		throw new Error(`CI selected an invalid required lane for ${manifestPath}`);
	}
	const pnpmVersion = (await execFileAsync('pnpm', ['--version'], { encoding: 'utf8' })).stdout;
	for (const laneId of laneIds) {
		const lane = status.expected.manifest.lanes.find((candidate) => candidate.id === laneId);
		await verifyLaneEnvironment(status.expected.manifest, lane, root, pnpmVersion);
	}
	await spawnHarness(root, manifestPath, laneIds);
}
