import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import {
	APPROVED_LICENSE_IDENTIFIERS,
	fingerprint,
	isRecognizableMitText,
} from './preflight-lib.mjs';
import { hasObservablePackageTests } from './package-tests-lib.mjs';
import { OCTANE_BETA_PEER_RANGE } from '../workspace-packages.mjs';

const EVIDENCE_STATUSES = new Set(['required', 'passed', 'failed', 'blocked', 'inapplicable']);
const CROSSWALK_CLASSIFICATIONS = new Set([
	'implemented',
	'conformance',
	'blocked',
	'unsupported',
	'inapplicable',
]);
const LICENSE_ARTIFACT_PATTERN = /^(?:licen[cs]e|copying)(?:[._-].*)?$/i;
const NOTICE_ARTIFACT_PATTERN = /^notice(?:[._-].*)?$/i;
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REQUIRED_NODE_ENGINE = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'))
	.engines.node;

export const EVIDENCE_MATRIX_SCHEMA_VERSION = 5;

const COMMON_GATES = [
	['identity-license', 'Immutable identity and approved-license preflight', false, 'automated'],
	['upstream-crosswalk', 'Complete upstream test-registration crosswalk', false, 'automated'],
	['package-tests', 'Focused package behavior tests', false, 'command'],
	[
		'upstream-types-pristine',
		'Pristine upstream type tests with the original compiler and pinned React types',
		false,
		'command',
	],
	[
		'upstream-types-adapted',
		'One-for-one adapted upstream type tests with the Octane compiler',
		false,
		'command',
	],
	['authored-source-types', 'Strict direct authored-source typecheck', false, 'command'],
	['public-types', 'Precise packed public type surface and negative controls', false, 'command'],
	[
		'packed-source-types-node',
		'Strict packed source typecheck with Node ambient types',
		false,
		'command',
	],
	[
		'packed-source-types-browser',
		'Strict packed source typecheck without Node ambient types',
		false,
		'command',
	],
	['public-exports', 'Public entrypoint and export checks', false, 'command'],
	['package-pack', 'Packed external-consumer check', false, 'command'],
	['package-contract', 'Binding package contract', false, 'automated'],
	['provenance', 'UPSTREAM, license, and notice provenance', false, 'automated'],
	['closure-audit', 'Final shipped dependency and adapted-source closure', false, 'automated'],
	['generated-data', 'Affected catalog and generated-data checks', true, 'command'],
	['format', 'Formatting checks', false, 'command'],
];

const CATEGORY_GATES = Object.freeze({
	'thin-core': [
		[
			'differential-surface',
			'Framework-neutral core and thin binding equivalence',
			false,
			'command',
		],
	],
	'hooks-store': [
		[
			'identity-lifecycle',
			'Subscription, identity, bailout, effect, and cleanup behavior',
			false,
			'command',
		],
		['server-snapshot', 'Server snapshot and hydration-safe store behavior', true, 'command'],
	],
	'dom-component': [
		['differential-events', 'Differential DOM and event-sequence behavior', false, 'command'],
		['focus-ref-keyed', 'Focus, ref lifecycle, and keyed survivor identity', false, 'command'],
		['browser', 'Real-browser component behavior', false, 'command'],
	],
	'provider-portal': [
		['provider-identity', 'Provider/context identity and nested ownership', false, 'command'],
		[
			'portal-lifecycle',
			'Portal ancestry, suspension/error ownership, and teardown',
			false,
			'command',
		],
	],
	'ssr-sensitive': [
		['ssr-hydration', 'SSR, streaming when public, and hydration behavior', false, 'command'],
	],
	'async-suspense': [
		[
			'async-lifecycle',
			'Promise, replay, rejection, timer, and cleanup behavior',
			false,
			'command',
		],
	],
	'performance-sensitive': [
		[
			'performance',
			'Relevant runtime, SSR, hydration, compiler, and size guards',
			false,
			'command',
		],
	],
});

function gateRecord([id, label, allowInapplicable, evidenceType]) {
	return [id, { id, label, status: 'required', allowInapplicable, evidenceType }];
}

function normalizeCategories(categories) {
	if (!Array.isArray(categories) || categories.length === 0) {
		throw new Error('At least one binding evidence category is required');
	}
	const normalizedCategories = [...new Set(categories)].sort();
	for (const category of normalizedCategories) {
		if (!CATEGORY_GATES[category]) throw new Error(`Unknown evidence category: ${category}`);
	}
	return normalizedCategories;
}

function gateDefinitions(categories) {
	return [...COMMON_GATES, ...categories.flatMap((category) => CATEGORY_GATES[category])];
}

export function isCurrentEvidenceMatrix(matrix) {
	if (
		!matrix ||
		typeof matrix !== 'object' ||
		matrix.schemaVersion !== EVIDENCE_MATRIX_SCHEMA_VERSION ||
		!matrix.gates ||
		typeof matrix.gates !== 'object'
	) {
		return false;
	}
	let definitions;
	try {
		definitions = gateDefinitions(normalizeCategories(matrix.categories));
	} catch {
		return false;
	}
	const expectedGates = new Map(
		definitions.map(([id, , allowInapplicable, evidenceType]) => [
			id,
			{ allowInapplicable, evidenceType },
		]),
	);
	if (
		Object.keys(matrix.gates).length !== expectedGates.size ||
		Object.keys(matrix.gates).some((gateId) => !expectedGates.has(gateId))
	) {
		return false;
	}
	return [...expectedGates].every(([gateId, definition]) => {
		const gate = matrix.gates[gateId];
		return (
			gate &&
			gate.id === gateId &&
			EVIDENCE_STATUSES.has(gate.status) &&
			gate.allowInapplicable === definition.allowInapplicable &&
			gate.evidenceType === definition.evidenceType
		);
	});
}

export function assertCurrentEvidenceMatrix(matrix) {
	if (!isCurrentEvidenceMatrix(matrix)) {
		throw new Error(
			`Evidence matrix does not satisfy schema version ${EVIDENCE_MATRIX_SCHEMA_VERSION}; rerun init with the existing evidence categories to reset it`,
		);
	}
	return matrix;
}

export function isCompleteEvidenceMatrix(matrix) {
	return (
		isCurrentEvidenceMatrix(matrix) &&
		Object.values(matrix.gates).every(
			(gate) =>
				gate.status === 'passed' ||
				(gate.status === 'inapplicable' && gate.allowInapplicable && Boolean(gate.reason)),
		)
	);
}

export function createEvidenceMatrix({ categories, preflightArtifact }) {
	if (typeof preflightArtifact !== 'string' || !preflightArtifact) {
		throw new Error('The preflight manifest/report artifact is required');
	}
	const normalizedCategories = normalizeCategories(categories);
	const definitions = gateDefinitions(normalizedCategories);
	const gates = Object.fromEntries(definitions.map(gateRecord));
	gates['identity-license'] = {
		...gates['identity-license'],
		status: 'passed',
		artifact: preflightArtifact,
		observed: 'Node reached ready through immutable identity and approved-license preflight.',
	};
	return {
		schemaVersion: EVIDENCE_MATRIX_SCHEMA_VERSION,
		categories: normalizedCategories,
		gates,
	};
}

export function recordEvidence(matrix, gateId, evidence) {
	assertCurrentEvidenceMatrix(matrix);
	const gate = matrix.gates?.[gateId];
	if (!gate) throw new Error(`Unknown evidence gate: ${gateId}`);
	if (!EVIDENCE_STATUSES.has(evidence.status) || evidence.status === 'required') {
		throw new Error(`Evidence gate ${gateId} needs a terminal status`);
	}
	if (evidence.status === 'passed' || evidence.status === 'failed') {
		if (!evidence.command && !evidence.artifact) {
			throw new Error(`Evidence gate ${gateId} requires a command or artifact`);
		}
		if (!evidence.observed) throw new Error(`Evidence gate ${gateId} requires an observed result`);
		if (gate.evidenceType === 'command' && !evidence.command) {
			throw new Error(`Evidence gate ${gateId} is command-backed and requires run evidence`);
		}
		if (gate.evidenceType === 'automated' && !evidence.artifact) {
			throw new Error(`Evidence gate ${gateId} requires automated artifact evidence`);
		}
	}
	if (evidence.status === 'blocked' && (!evidence.reason || !evidence.repair)) {
		throw new Error(`Blocked evidence gate ${gateId} requires a reason and repair action`);
	}
	if (evidence.status === 'inapplicable') {
		if (!gate.allowInapplicable) throw new Error(`Evidence gate ${gateId} cannot be inapplicable`);
		if (!evidence.reason) throw new Error(`Inapplicable evidence gate ${gateId} requires a reason`);
	}
	matrix.gates[gateId] = { ...gate, ...structuredClone(evidence), id: gateId };
	return matrix.gates[gateId];
}

export function validateUpstreamCrosswalk(
	registrations,
	crosswalk,
	upstreamTestInventory = [],
	evidenceRoot = null,
) {
	if (!Array.isArray(registrations) || !Array.isArray(crosswalk)) {
		throw new Error('Upstream registrations and crosswalk must be arrays');
	}
	if (!Array.isArray(upstreamTestInventory)) {
		throw new Error('Immutable upstream test inventory must be an array');
	}
	const immutableTestPaths = new Set();
	const immutableRegistrations = new Map();
	for (const entry of upstreamTestInventory) {
		if (
			typeof entry?.path !== 'string' ||
			!entry.path ||
			!['runtime', 'type'].includes(entry.kind) ||
			!/^[a-f0-9]{40}$/i.test(entry.gitBlob ?? '') ||
			!Number.isSafeInteger(entry.size) ||
			entry.size < 0 ||
			!Array.isArray(entry.registrations) ||
			immutableTestPaths.has(entry.path)
		) {
			throw new Error('Immutable upstream test inventory contains an invalid or duplicate entry');
		}
		if (entry.registrations.length === 0) {
			throw new Error(`Immutable upstream test ${entry.path} has no counted registrations`);
		}
		immutableTestPaths.add(entry.path);
		for (const registration of entry.registrations) {
			if (
				typeof registration?.id !== 'string' ||
				!registration.id ||
				typeof registration.source !== 'string' ||
				!registration.source.startsWith(`${entry.path}:`) ||
				typeof registration.kind !== 'string' ||
				typeof registration.declarationId !== 'string' ||
				!registration.declarationId ||
				!Number.isSafeInteger(registration.estimatedRegistrations) ||
				registration.estimatedRegistrations < 1 ||
				!Number.isSafeInteger(registration.registrationIndex) ||
				registration.registrationIndex < 0 ||
				registration.registrationIndex >= registration.estimatedRegistrations ||
				immutableRegistrations.has(registration.id)
			) {
				throw new Error('Immutable upstream test inventory contains an invalid registration');
			}
			immutableRegistrations.set(registration.id, registration);
		}
	}
	const expected = new Map();
	for (const registration of registrations) {
		if (!registration.id || expected.has(registration.id)) {
			throw new Error(`Duplicate or missing upstream registration id: ${registration.id}`);
		}
		expected.set(registration.id, registration);
	}
	if (immutableTestPaths.size > 0) {
		const projectRegistration = (registration) => ({
			id: registration.id,
			source: registration.source,
			kind: registration.kind,
			title: registration.title ?? null,
		});
		const suppliedRegistrations = [...expected.values()]
			.map(projectRegistration)
			.sort((left, right) => left.id.localeCompare(right.id));
		const pinnedRegistrations = [...immutableRegistrations.values()]
			.map(projectRegistration)
			.sort((left, right) => left.id.localeCompare(right.id));
		if (fingerprint(suppliedRegistrations) !== fingerprint(pinnedRegistrations)) {
			throw new Error('Supplied registrations differ from the immutable upstream case inventory');
		}
	}
	const actual = new Map();
	const localEvidenceArtifacts = new Map();
	let resolvedEvidenceRoot = null;
	if (evidenceRoot !== null) {
		resolvedEvidenceRoot = realpathSync(evidenceRoot);
		if (!statSync(resolvedEvidenceRoot).isDirectory()) {
			throw new Error(`Crosswalk evidence root must be a directory: ${evidenceRoot}`);
		}
	}
	for (const entry of crosswalk) {
		if (!entry.id || actual.has(entry.id)) throw new Error(`Duplicate crosswalk id: ${entry.id}`);
		if (!expected.has(entry.id)) throw new Error(`Crosswalk contains unknown case ${entry.id}`);
		if (!CROSSWALK_CLASSIFICATIONS.has(entry.classification)) {
			throw new Error(`Crosswalk case ${entry.id} has invalid classification`);
		}
		if (
			(entry.classification === 'implemented' || entry.classification === 'conformance') &&
			!entry.localEvidence
		) {
			throw new Error(`Crosswalk case ${entry.id} requires local evidence`);
		}
		for (const evidencePath of entry.localEvidence
			? Array.isArray(entry.localEvidence)
				? entry.localEvidence
				: [entry.localEvidence]
			: []) {
			if (!isSafeLocalEvidencePath(evidencePath)) {
				throw new Error(`Crosswalk case ${entry.id} has unsafe local evidence: ${evidencePath}`);
			}
			if (!isCrosswalkEvidencePath(evidencePath)) {
				throw new Error(
					`Crosswalk case ${entry.id} requires a package-local test evidence path: ${evidencePath}`,
				);
			}
			if (resolvedEvidenceRoot) {
				const resolvedEvidencePath = realpathSync(path.resolve(resolvedEvidenceRoot, evidencePath));
				const relativePath = path.relative(resolvedEvidenceRoot, resolvedEvidencePath);
				if (
					relativePath === '..' ||
					relativePath.startsWith(`..${path.sep}`) ||
					path.isAbsolute(relativePath) ||
					!statSync(resolvedEvidencePath).isFile()
				) {
					throw new Error(`Crosswalk case ${entry.id} local evidence escapes the package root`);
				}
				localEvidenceArtifacts.set(evidencePath, {
					path: evidencePath,
					sha256: hashFile(resolvedEvidencePath),
				});
			}
		}
		if (
			['blocked', 'unsupported', 'inapplicable'].includes(entry.classification) &&
			!entry.rationale
		) {
			throw new Error(`Crosswalk case ${entry.id} requires a rationale`);
		}
		actual.set(entry.id, entry);
	}
	const missing = [...expected.keys()].filter((id) => !actual.has(id));
	if (missing.length > 0)
		throw new Error(`Crosswalk is missing upstream case(s): ${missing.join(', ')}`);
	const cases = [...expected.keys()]
		.sort()
		.map((id) => ({ ...expected.get(id), ...actual.get(id) }));
	const result = {
		status: cases.some((entry) => entry.classification === 'blocked') ? 'blocked' : 'passed',
		cases,
		upstreamTestInventory: [...upstreamTestInventory].sort((left, right) =>
			left.path.localeCompare(right.path),
		),
		localEvidenceArtifacts: [...localEvidenceArtifacts.values()].sort((left, right) =>
			left.path.localeCompare(right.path),
		),
	};
	result.fingerprint = fingerprint(result);
	return result;
}

function readJson(filePath, issues, label) {
	try {
		return JSON.parse(readFileSync(filePath, 'utf8'));
	} catch (error) {
		issues.push(
			`${label} is missing or invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
		);
		return null;
	}
}

function collectExportTargets(value, targets = []) {
	if (typeof value === 'string') targets.push(value);
	else if (value && typeof value === 'object') {
		for (const child of Object.values(value)) collectExportTargets(child, targets);
	}
	return targets;
}

function hashFile(filePath) {
	return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function sourceFiles(directory) {
	if (!existsSync(directory)) return [];
	return readdirSync(directory, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => path.join(entry.parentPath, entry.name));
}

function attributionArtifacts(packageDirectory, pattern) {
	if (!existsSync(packageDirectory)) return [];
	return readdirSync(packageDirectory, { withFileTypes: true })
		.filter((entry) => entry.isFile() && pattern.test(entry.name))
		.map((entry) => ({
			name: entry.name,
			sha256: hashFile(path.join(packageDirectory, entry.name)),
		}))
		.sort((left, right) => left.name.localeCompare(right.name));
}

function isConfinedExportTarget(packageDirectory, target) {
	if (!target.startsWith('./')) return false;
	try {
		const packageRoot = realpathSync(packageDirectory);
		const resolvedTarget = realpathSync(path.resolve(packageDirectory, target));
		const relativeTarget = path.relative(packageRoot, resolvedTarget);
		return (
			!relativeTarget.startsWith('..') &&
			!path.isAbsolute(relativeTarget) &&
			statSync(resolvedTarget).isFile()
		);
	} catch {
		return false;
	}
}

export function inspectBindingPackage(
	packageDirectory,
	{
		expectedPackageName,
		expectedDirectory,
		identity,
		expectedLicenseHashes = [],
		expectedNoticeHashes = [],
	},
) {
	const issues = [];
	const requiredFiles = ['package.json', 'README.md', 'status.json', 'UPSTREAM.md', 'LICENSE'];
	for (const relativePath of requiredFiles) {
		if (!existsSync(path.join(packageDirectory, relativePath)))
			issues.push(`Missing ${relativePath}`);
	}
	const manifest = readJson(path.join(packageDirectory, 'package.json'), issues, 'package.json');
	const status = readJson(path.join(packageDirectory, 'status.json'), issues, 'status.json');
	const licenseArtifacts = attributionArtifacts(packageDirectory, LICENSE_ARTIFACT_PATTERN);
	const noticeArtifacts = attributionArtifacts(packageDirectory, NOTICE_ARTIFACT_PATTERN);
	if (expectedLicenseHashes.length === 0) {
		issues.push('Preflight license evidence has no content hashes');
	}
	for (const expectedHash of new Set(expectedLicenseHashes)) {
		if (!licenseArtifacts.some((artifact) => artifact.sha256 === expectedHash)) {
			issues.push(
				`No packaged LICENSE artifact retains exact upstream bytes for hash ${expectedHash}`,
			);
		}
	}
	for (const expectedHash of new Set(expectedNoticeHashes)) {
		if (!noticeArtifacts.some((artifact) => artifact.sha256 === expectedHash)) {
			issues.push(
				`No packaged NOTICE artifact retains exact upstream bytes for hash ${expectedHash}`,
			);
		}
	}
	if (manifest) {
		if (expectedPackageName && manifest.name !== expectedPackageName) {
			issues.push(`package name must be ${expectedPackageName}`);
		} else if (!manifest.name?.startsWith('@octanejs/')) {
			issues.push('package name must use @octanejs/*');
		}
		if (manifest.license !== 'MIT') issues.push('package.json license must be exact MIT');
		if (manifest.engines?.node !== REQUIRED_NODE_ENGINE) {
			issues.push(`package.json engines.node must be ${REQUIRED_NODE_ENGINE}`);
		}
		if (manifest.publishConfig?.access !== 'public') issues.push('package must publish publicly');
		if (manifest.repository?.directory !== expectedDirectory) {
			issues.push(`repository.directory must be ${expectedDirectory}`);
		}
		if (manifest.dependencies?.octane !== undefined)
			issues.push('octane must not be a regular dependency');
		for (const dependencyField of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
			for (const reactPackage of ['react', 'react-dom']) {
				if (manifest[dependencyField]?.[reactPackage] !== undefined) {
					issues.push(
						`${reactPackage} must not be a runtime dependency (${dependencyField}); keep React test-only`,
					);
				}
			}
		}
		if (manifest.peerDependencies?.octane !== OCTANE_BETA_PEER_RANGE) {
			issues.push(`octane peer must be ${OCTANE_BETA_PEER_RANGE}`);
		}
		if (manifest.devDependencies?.octane !== 'workspace:*')
			issues.push('octane dev dependency must be workspace:*');
		if (typeof manifest.scripts?.test !== 'string')
			issues.push('package must define a test script');
		for (const packagedPath of [
			'src',
			'README.md',
			'UPSTREAM.md',
			...licenseArtifacts.map((artifact) => artifact.name),
			...noticeArtifacts.map((artifact) => artifact.name),
		]) {
			if (!Array.isArray(manifest.files) || !manifest.files.includes(packagedPath)) {
				issues.push(`package files must include ${packagedPath}`);
			}
		}
		const exportTargets = collectExportTargets(manifest.exports);
		if (exportTargets.length === 0) issues.push('package must declare public exports');
		for (const target of exportTargets) {
			if (!isConfinedExportTarget(packageDirectory, target)) {
				issues.push(`package export target is missing or escapes the package: ${target}`);
			}
		}
	}
	if (status) {
		if (
			status.upstream?.package !== identity.packageName ||
			status.upstream?.version !== identity.version
		) {
			issues.push('status.json upstream identity does not match preflight');
		}
		if (!/^\d{4}-\d{2}-\d{2}$/.test(status.verified ?? '')) {
			issues.push('status.json verified must be a YYYY-MM-DD completion date');
		}
		if (!status.surface) issues.push('status.json must describe the verified surface');
	}
	const upstreamPath = path.join(packageDirectory, 'UPSTREAM.md');
	if (existsSync(upstreamPath)) {
		const upstream = readFileSync(upstreamPath, 'utf8');
		for (const value of [identity.packageName, identity.version, identity.commit]) {
			if (!upstream.includes(value)) issues.push(`UPSTREAM.md does not identify ${value}`);
		}
		if (!/^## Source boundary$/m.test(upstream))
			issues.push('UPSTREAM.md has no Source boundary section');
	}
	const licensePath = path.join(packageDirectory, 'LICENSE');
	if (existsSync(licensePath) && !isRecognizableMitText(readFileSync(licensePath, 'utf8'))) {
		issues.push('LICENSE is not recognizable MIT text');
	}
	const authoredSource = sourceFiles(path.join(packageDirectory, 'src'));
	if (authoredSource.length === 0) issues.push('package has no source files');
	if (!hasObservablePackageTests(packageDirectory)) {
		issues.push('package has no observable test file');
	}
	for (const file of authoredSource.filter((file) => /\.(?:ts|tsx|tsrx)$/.test(file))) {
		if (/declare\s+module\s+['"]\*\.tsrx['"]/.test(readFileSync(file, 'utf8'))) {
			issues.push(
				`${path.relative(packageDirectory, file)} contains a forbidden ambient .tsrx declaration`,
			);
		}
	}
	const artifactPaths = new Set([
		...requiredFiles,
		...licenseArtifacts.map((artifact) => artifact.name),
		...noticeArtifacts.map((artifact) => artifact.name),
	]);
	const artifacts = Object.fromEntries(
		[...artifactPaths]
			.filter((relativePath) => existsSync(path.join(packageDirectory, relativePath)))
			.sort()
			.map((relativePath) => [relativePath, hashFile(path.join(packageDirectory, relativePath))]),
	);
	return {
		status: issues.length === 0 ? 'passed' : 'blocked',
		issues,
		artifacts,
		fingerprint: fingerprint({
			identity,
			expectedPackageName,
			expectedDirectory,
			artifacts,
			issues,
		}),
	};
}

function packageRoot(specifier) {
	if (specifier.startsWith('@')) return specifier.split('/').slice(0, 2).join('/');
	return specifier.split('/')[0];
}

function normalizedStrings(values) {
	if (!Array.isArray(values)) return [];
	return [
		...new Set(values.filter((value) => typeof value === 'string').map((value) => value.trim())),
	]
		.filter(Boolean)
		.sort();
}

function isSafeLocalEvidencePath(value) {
	if (typeof value !== 'string' || !value.trim()) return false;
	const candidate = value.trim();
	const segments = candidate.split('/');
	return (
		!path.posix.isAbsolute(candidate) &&
		!path.win32.isAbsolute(candidate) &&
		!candidate.includes('\\') &&
		!candidate.includes('\0') &&
		segments.every((segment) => segment && segment !== '.' && segment !== '..')
	);
}

function isCrosswalkEvidencePath(value) {
	if (!isSafeLocalEvidencePath(value)) return false;
	const normalized = value.trim();
	return (
		/^(?:tests?|__tests__|typetests|type-tests|test-d|audit)\//i.test(normalized) &&
		/\.(?:[cm]?[jt]sx?|tsrx|json|md)$/i.test(normalized)
	);
}

function normalizeReimplementationProof(proof) {
	return {
		packageName: typeof proof?.packageName === 'string' ? proof.packageName.trim() : '',
		publicBehaviors: normalizedStrings(proof?.publicBehaviors),
		localEvidence: normalizedStrings(proof?.localEvidence),
	};
}

const SHIPPED_SOURCE_EXTENSIONS = ['.ts', '.tsx', '.tsrx', '.js', '.jsx', '.mjs', '.cjs'];

function staticModuleSpecifiers(filePath) {
	const source = ts.createSourceFile(
		filePath,
		readFileSync(filePath, 'utf8'),
		ts.ScriptTarget.Latest,
		false,
		/\.(?:tsx|tsrx|jsx)$/.test(filePath) ? ts.ScriptKind.TSX : undefined,
	);
	const specifiers = [];
	function visit(node) {
		if (
			ts.isImportDeclaration(node) &&
			node.moduleSpecifier &&
			ts.isStringLiteralLike(node.moduleSpecifier) &&
			!node.importClause?.isTypeOnly
		) {
			specifiers.push(node.moduleSpecifier.text);
		} else if (
			ts.isExportDeclaration(node) &&
			node.moduleSpecifier &&
			ts.isStringLiteralLike(node.moduleSpecifier) &&
			!node.isTypeOnly
		) {
			specifiers.push(node.moduleSpecifier.text);
		} else if (
			ts.isImportEqualsDeclaration(node) &&
			ts.isExternalModuleReference(node.moduleReference) &&
			node.moduleReference.expression &&
			ts.isStringLiteralLike(node.moduleReference.expression) &&
			!node.isTypeOnly
		) {
			specifiers.push(node.moduleReference.expression.text);
		} else if (
			ts.isCallExpression(node) &&
			node.arguments.length === 1 &&
			ts.isStringLiteralLike(node.arguments[0]) &&
			(node.expression.kind === ts.SyntaxKind.ImportKeyword ||
				(ts.isIdentifier(node.expression) && node.expression.text === 'require'))
		) {
			specifiers.push(node.arguments[0].text);
		}
		ts.forEachChild(node, visit);
	}
	visit(source);
	return specifiers;
}

function resolveRelativeSource(fromFile, specifier) {
	const base = path.resolve(path.dirname(fromFile), specifier);
	const candidates = [
		base,
		...SHIPPED_SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`),
		...SHIPPED_SOURCE_EXTENSIONS.map((extension) => path.join(base, `index${extension}`)),
	];
	return (
		candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null
	);
}

function deriveShippedClosure(packageDirectory, sourceLedger) {
	const issues = [];
	const resolvedPackageDirectory = realpathSync(packageDirectory);
	const manifest = JSON.parse(
		readFileSync(path.join(resolvedPackageDirectory, 'package.json'), 'utf8'),
	);
	const runtimeDependencies = new Set([
		...Object.keys(manifest.dependencies ?? {}),
		...Object.keys(manifest.optionalDependencies ?? {}),
		...Object.keys(manifest.peerDependencies ?? {}),
	]);
	const queue = collectExportTargets(manifest.exports ?? manifest.main ?? manifest.module ?? [])
		.filter((target) => typeof target === 'string' && !/\.d\.[cm]?ts$/.test(target))
		.map((target) => path.resolve(resolvedPackageDirectory, target));
	const reachableFiles = new Set();
	while (queue.length > 0) {
		const filePath = queue.shift();
		if (!existsSync(filePath) || !statSync(filePath).isFile()) continue;
		const resolvedFile = realpathSync(filePath);
		const relativeFile = path.relative(resolvedPackageDirectory, resolvedFile);
		if (
			relativeFile === '..' ||
			relativeFile.startsWith(`..${path.sep}`) ||
			path.isAbsolute(relativeFile) ||
			reachableFiles.has(resolvedFile)
		) {
			continue;
		}
		reachableFiles.add(resolvedFile);
		for (const specifier of staticModuleSpecifiers(resolvedFile)) {
			if (specifier.startsWith('.') || specifier.startsWith('/')) {
				const dependencyFile = resolveRelativeSource(resolvedFile, specifier);
				if (dependencyFile) queue.push(dependencyFile);
			} else {
				runtimeDependencies.add(packageRoot(specifier));
			}
		}
	}

	const ledger = Array.isArray(sourceLedger) ? sourceLedger : [];
	const ledgerByPath = new Map();
	for (const entry of ledger) {
		if (
			!isSafeLocalEvidencePath(entry?.path) ||
			!['authored', 'adapted'].includes(entry?.origin) ||
			!/^[a-f0-9]{64}$/i.test(entry?.sha256 ?? '') ||
			ledgerByPath.has(entry.path)
		) {
			issues.push('Source ledger contains an invalid or duplicate entry.');
			continue;
		}
		if (entry.origin === 'adapted' && !entry.packageName) {
			issues.push(`Adapted source ledger entry ${entry.path} requires packageName.`);
		}
		ledgerByPath.set(entry.path, entry);
	}
	const adaptedByPackage = new Map();
	for (const filePath of [...reachableFiles].sort()) {
		const relativePath = path
			.relative(resolvedPackageDirectory, filePath)
			.split(path.sep)
			.join('/');
		const entry = ledgerByPath.get(relativePath);
		if (!entry) {
			issues.push(`Reachable shipped source ${relativePath} is missing from the source ledger.`);
			continue;
		}
		if (entry.sha256 !== hashFile(filePath)) {
			issues.push(`Source ledger hash does not match shipped bytes for ${relativePath}.`);
		}
		if (entry.origin === 'adapted') {
			const paths = adaptedByPackage.get(entry.packageName) ?? [];
			paths.push(relativePath);
			adaptedByPackage.set(entry.packageName, paths);
		}
		ledgerByPath.delete(relativePath);
	}
	for (const extraPath of ledgerByPath.keys()) {
		issues.push(`Source ledger entry ${extraPath} is not reachable from a public export.`);
	}
	return {
		issues,
		runtimeDependencies: [...new Set([...runtimeDependencies].map(packageRoot))].sort(),
		adaptedSources: [...adaptedByPackage]
			.map(([packageName, paths]) => ({ packageName, paths: paths.sort() }))
			.sort((left, right) => left.packageName.localeCompare(right.packageName)),
		sourceLedger: [...ledger].sort((left, right) =>
			String(left?.path ?? '').localeCompare(String(right?.path ?? '')),
		),
	};
}

function normalizeAdaptedSources(adaptedSources) {
	return (adaptedSources ?? [])
		.map((adaptedSource) => ({
			packageName:
				typeof adaptedSource?.packageName === 'string' ? adaptedSource.packageName.trim() : '',
			paths: Array.isArray(adaptedSource?.paths)
				? [
						...new Set(
							adaptedSource.paths.map((sourcePath) =>
								typeof sourcePath === 'string' ? sourcePath.trim() : sourcePath,
							),
						),
					].sort()
				: adaptedSource?.paths,
		}))
		.sort((left, right) =>
			left.packageName === right.packageName
				? JSON.stringify(left).localeCompare(JSON.stringify(right))
				: left.packageName.localeCompare(right.packageName),
		);
}

function hasApprovedLicenseEvidence(node) {
	return (
		node?.license?.policy === 'approved-license-v2' &&
		node.license.published?.status === 'passed' &&
		node.license.source?.status === 'passed' &&
		node.license.published.spdx === node.license.source.spdx &&
		APPROVED_LICENSE_IDENTIFIERS.includes(node.license.published.spdx)
	);
}

export function auditShippedClosure({
	nodeId,
	graphNodes,
	evidenceRoot,
	packageDirectory,
	runtimeDependencies,
	adaptedSources,
	sourceLedger,
	reimplementedDependencies = [],
}) {
	const issues = [];
	const node = graphNodes[nodeId];
	if (!node) return { status: 'blocked', issues: [`Unknown graph node ${nodeId}`] };
	const plannedDependencies = new Set(
		(node.dependsOn ?? []).flatMap((dependencyId) => {
			const dependency = graphNodes[dependencyId];
			switch (dependency?.action) {
				case 'reuse-package':
					return dependency.packageName ? [dependency.packageName] : [];
				case 'reuse-binding':
				case 'create-binding':
				case 'extend-binding':
				case 'adopt-binding':
					return dependency.binding ? [dependency.binding] : [];
				default:
					return [];
			}
		}),
	);
	const plannedCleanRoomDependencies = new Set(
		(node.dependsOn ?? []).flatMap((dependencyId) => {
			const dependency = graphNodes[dependencyId];
			return dependency?.action === 'reimplement-in-parent' && dependency.packageName
				? [dependency.packageName]
				: [];
		}),
	);
	let derivedClosure = null;
	if (packageDirectory) {
		try {
			derivedClosure = deriveShippedClosure(packageDirectory, sourceLedger);
			issues.push(...derivedClosure.issues);
		} catch (error) {
			issues.push(
				`Could not derive shipped closure: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
	const normalizedRuntimeDependencies = [
		...new Set((derivedClosure?.runtimeDependencies ?? runtimeDependencies ?? []).map(packageRoot)),
	].sort();
	if (
		derivedClosure &&
		JSON.stringify(normalizedStrings(runtimeDependencies)) !==
			JSON.stringify(derivedClosure.runtimeDependencies)
	) {
		issues.push('Declared runtimeDependencies do not match the derived shipped closure.');
	}
	for (const dependency of normalizedRuntimeDependencies) {
		if (plannedCleanRoomDependencies.has(dependency)) {
			issues.push(
				`${dependency} is planned for clean-room reimplementation and must not be retained as a runtime dependency.`,
			);
			continue;
		}
		if (dependency === 'react' || dependency === 'react-dom') {
			issues.push(
				`Runtime dependency ${dependency} crosses the React runtime boundary and must be test-only.`,
			);
			continue;
		}
		if (dependency === 'octane' || plannedDependencies.has(dependency)) {
			continue;
		}
		issues.push(`Runtime dependency ${dependency} was not present in the approved graph.`);
	}
	const normalizedAdaptedSources = normalizeAdaptedSources(
		derivedClosure?.adaptedSources ?? adaptedSources ?? [],
	);
	if (
		derivedClosure &&
		fingerprint(normalizedAdaptedSources) !== fingerprint(normalizeAdaptedSources(adaptedSources))
	) {
		issues.push('Declared adaptedSources do not match the hashed shipped-source ledger.');
	}
	for (const adaptedSource of normalizedAdaptedSources) {
		const adaptedNode = graphNodes[`pkg:${adaptedSource.packageName}`];
		const copyForbidden =
			adaptedNode?.action === 'reimplement-in-parent' ||
			adaptedNode?.copyPermission === 'denied-or-unproven' ||
			adaptedNode?.reimplementation?.copySource === false;
		if (copyForbidden) {
			issues.push(
				`Adapted source ${adaptedSource.packageName} must not copy or adapt source because its graph action is no-copy.`,
			);
		} else if (!hasApprovedLicenseEvidence(adaptedNode)) {
			issues.push(
				`Adapted source ${adaptedSource.packageName} has no approved-license graph evidence.`,
			);
		}
		if (!Array.isArray(adaptedSource.paths) || adaptedSource.paths.length === 0) {
			issues.push(
				`Adapted source ${adaptedSource.packageName} has no recorded copied/adapted paths.`,
			);
		}
		for (const sourcePath of Array.isArray(adaptedSource.paths) ? adaptedSource.paths : []) {
			if (!isSafeLocalEvidencePath(sourcePath)) {
				issues.push(`Adapted source path is unsafe: ${sourcePath}`);
			}
		}
	}
	if (!Array.isArray(reimplementedDependencies)) {
		issues.push('reimplementedDependencies must be an array.');
		reimplementedDependencies = [];
	}
	const proofEntries = reimplementedDependencies
		.map((original) => ({ original, proof: normalizeReimplementationProof(original) }))
		.sort((left, right) =>
			left.proof.packageName === right.proof.packageName
				? JSON.stringify(left.proof).localeCompare(JSON.stringify(right.proof))
				: left.proof.packageName.localeCompare(right.proof.packageName),
		);
	const proofs = proofEntries.map(({ proof }) => proof);
	const proofsByPackage = new Map();
	const localEvidenceArtifacts = new Map();
	let resolvedEvidenceRoot = null;
	if (plannedCleanRoomDependencies.size > 0) {
		if (typeof evidenceRoot !== 'string' || !evidenceRoot.trim()) {
			issues.push('A package-local clean-room evidence root is required.');
		} else {
			try {
				const candidateEvidenceRoot = realpathSync(evidenceRoot);
				if (statSync(candidateEvidenceRoot).isDirectory()) {
					resolvedEvidenceRoot = candidateEvidenceRoot;
				} else {
					issues.push(`Clean-room evidence root must be a directory: ${evidenceRoot}`);
				}
			} catch {
				issues.push(`Clean-room evidence root is missing: ${evidenceRoot}`);
			}
		}
	}
	for (const { original, proof } of proofEntries) {
		const label = proof.packageName || '<missing package>';
		const packageProofs = proofsByPackage.get(proof.packageName) ?? [];
		packageProofs.push(proof);
		proofsByPackage.set(proof.packageName, packageProofs);
		if (!plannedCleanRoomDependencies.has(proof.packageName)) {
			issues.push(
				`Reimplementation proof for ${label} was not planned as a direct clean-room dependency.`,
			);
		}
		if (
			!Array.isArray(original?.publicBehaviors) ||
			original.publicBehaviors.length === 0 ||
			original.publicBehaviors.some((behavior) => typeof behavior !== 'string' || !behavior.trim())
		) {
			issues.push(`Reimplementation proof for ${label} requires nonempty public behaviors.`);
		}
		if (
			!Array.isArray(original?.localEvidence) ||
			original.localEvidence.length === 0 ||
			original.localEvidence.some(
				(evidencePath) => typeof evidencePath !== 'string' || !evidencePath.trim(),
			)
		) {
			issues.push(
				`Reimplementation proof for ${label} requires nonempty independently authored local evidence.`,
			);
		}
		for (const evidencePath of Array.isArray(original?.localEvidence)
			? original.localEvidence
			: []) {
			if (!isSafeLocalEvidencePath(evidencePath)) {
				issues.push(`Clean-room local evidence path is unsafe for ${label}: ${evidencePath}`);
			} else if (resolvedEvidenceRoot) {
				const normalizedEvidencePath = evidencePath.trim();
				try {
					const resolvedEvidencePath = realpathSync(
						path.resolve(resolvedEvidenceRoot, normalizedEvidencePath),
					);
					const relativeEvidencePath = path.relative(resolvedEvidenceRoot, resolvedEvidencePath);
					if (
						relativeEvidencePath === '..' ||
						relativeEvidencePath.startsWith(`..${path.sep}`) ||
						path.isAbsolute(relativeEvidencePath)
					) {
						issues.push(
							`Clean-room local evidence path ${normalizedEvidencePath} escapes the package root for ${label}.`,
						);
					} else if (statSync(resolvedEvidencePath).isFile()) {
						localEvidenceArtifacts.set(normalizedEvidencePath, {
							path: normalizedEvidencePath,
							sha256: hashFile(resolvedEvidencePath),
						});
					} else {
						issues.push(
							`Clean-room local evidence path ${normalizedEvidencePath} must be a regular file for ${label}.`,
						);
					}
				} catch {
					issues.push(
						`Clean-room local evidence path ${normalizedEvidencePath} is missing or unreadable for ${label}.`,
					);
				}
			}
		}
	}
	for (const packageName of [...plannedCleanRoomDependencies].sort()) {
		const proofCount = proofsByPackage.get(packageName)?.length ?? 0;
		if (proofCount === 0) {
			issues.push(`${packageName} clean-room dependency has no reimplementation proof.`);
		} else if (proofCount !== 1) {
			issues.push(
				`${packageName} clean-room dependency requires exactly one reimplementation proof; found ${proofCount}.`,
			);
		}
	}
	issues.sort();
	const sortedLocalEvidenceArtifacts = [...localEvidenceArtifacts.values()].sort((left, right) =>
		left.path.localeCompare(right.path),
	);
	const report = {
		status: issues.length === 0 ? 'passed' : 'blocked',
		issues,
		reimplementedDependencies: proofs,
	};
	const fingerprintInput = {
		nodeId,
		runtimeDependencies: normalizedRuntimeDependencies,
		adaptedSources: normalizedAdaptedSources,
		reimplementedDependencies: proofs,
		issues,
	};
	if (derivedClosure) fingerprintInput.sourceLedger = derivedClosure.sourceLedger;
	if (plannedCleanRoomDependencies.size > 0) {
		report.localEvidenceArtifacts = sortedLocalEvidenceArtifacts;
		fingerprintInput.localEvidenceArtifacts = sortedLocalEvidenceArtifacts;
	}
	report.fingerprint = fingerprint(fingerprintInput);
	return report;
}

export function evaluateVerificationReadiness({
	matrix,
	crosswalkReport,
	packageReport,
	closureReport,
}) {
	assertCurrentEvidenceMatrix(matrix);
	const issues = [];
	for (const gate of Object.values(matrix.gates ?? {})) {
		if (gate.status === 'passed') continue;
		if (gate.status === 'inapplicable' && gate.allowInapplicable && gate.reason) continue;
		issues.push(`Evidence gate ${gate.id} is ${gate.status}.`);
	}
	for (const [label, report] of [
		['Upstream crosswalk', crosswalkReport],
		['Package contract', packageReport],
		['Shipped closure', closureReport],
	]) {
		if (report?.status !== 'passed') issues.push(`${label} is not passed.`);
	}
	return {
		status: issues.length === 0 ? 'verified' : 'blocked',
		issues,
		fingerprint: fingerprint({ matrix, crosswalkReport, packageReport, closureReport }),
	};
}
