import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { extractTestCases } from '../react-parity/inventory-lib.mjs';

export const REDACT_REPOSITORY = 'https://github.com/TanStack/redact';
export const LEDGER_SCHEMA = './redact-adversarial-ledger.schema.json';
export const CLASSIFICATIONS = ['portable', 'adaptable', 'divergence', 'non_goal'];
export const STATUSES = [
	'planned',
	'in_progress',
	'covered',
	'documented',
	'decision_required',
	'blocked',
];
export const RISKS = ['critical', 'high', 'medium', 'low'];
export const MODES = [
	'client',
	'server-string',
	'server-static',
	'server-stream',
	'hydrate-match',
	'hydrate-mismatch',
	'deferred-hydration',
	'production-compile',
	'real-browser',
	'packaged-consumer',
	'vite-client',
	'vite-ssr',
	'rspack',
	'rsbuild',
	'rspeedy',
	'benchmark',
];
export const OBSERVABLES = [
	'markup',
	'node-identity',
	'dom-mutations',
	'focus',
	'selection',
	'scroll',
	'live-properties',
	'effects',
	'refs',
	'events',
	'errors',
	'streaming',
	'emitted-code',
	'package-resolution',
	'resolved-configuration',
	'bundle-contents',
	'performance',
];

const SOURCE_KINDS = ['issue', 'pull_request', 'commit', 'test'];
const REFERENCE_KINDS = ['source', 'test', 'documentation', 'benchmark', 'integration'];
const ACTION_KINDS = ['test', 'implementation', 'decision', 'documentation', 'benchmark'];
const EVIDENCE_KINDS = ['test', 'command'];
const OPEN_STATUSES = new Set(['planned', 'in_progress', 'decision_required', 'blocked']);
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const ID_PATTERN = /^RDX-[A-Z]+-[0-9]{3}$/;
const AREA_PATTERN = /^[a-z][a-z0-9-]*$/;

function isRecord(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function expectRecord(value, label, errors) {
	if (isRecord(value)) return value;
	errors.push(`${label} must be an object.`);
	return null;
}

function checkKeys(record, allowed, label, errors) {
	for (const key of Object.keys(record)) {
		if (!allowed.includes(key)) errors.push(`${label} has unknown field ${JSON.stringify(key)}.`);
	}
}

function requireKeys(record, required, label, errors) {
	for (const key of required) {
		if (!Object.hasOwn(record, key)) errors.push(`${label} is missing ${JSON.stringify(key)}.`);
	}
}

function expectString(value, label, errors, pattern = null) {
	if (typeof value !== 'string' || value.trim() === '') {
		errors.push(`${label} must be a non-empty string.`);
		return false;
	}
	if (pattern && !pattern.test(value)) {
		errors.push(`${label} has invalid value ${JSON.stringify(value)}.`);
		return false;
	}
	return true;
}

function expectEnum(value, allowed, label, errors) {
	if (!allowed.includes(value)) {
		errors.push(
			`${label} must be one of ${allowed.map((item) => JSON.stringify(item)).join(', ')}.`,
		);
		return false;
	}
	return true;
}

function expectUniqueArray(value, label, errors, { minItems = 1 } = {}) {
	if (!Array.isArray(value)) {
		errors.push(`${label} must be an array.`);
		return null;
	}
	if (value.length < minItems) errors.push(`${label} must contain at least ${minItems} item(s).`);
	const seen = new Set();
	for (const item of value) {
		const key = JSON.stringify(item);
		if (seen.has(key)) errors.push(`${label} contains duplicate ${key}.`);
		seen.add(key);
	}
	return value;
}

function expectEnumArray(value, allowed, label, errors) {
	const items = expectUniqueArray(value, label, errors);
	if (!items) return;
	for (const [index, item] of items.entries()) {
		expectEnum(item, allowed, `${label}[${index}]`, errors);
	}
}

function expectPositiveIntegerArray(value, label, errors) {
	const items = expectUniqueArray(value, label, errors);
	if (!items) return [];
	for (const [index, item] of items.entries()) {
		if (!Number.isInteger(item) || item < 1)
			errors.push(`${label}[${index}] must be a positive integer.`);
	}
	const sorted = [...items].sort((a, b) => a - b);
	if (items.some((item, index) => item !== sorted[index]))
		errors.push(`${label} must be sorted numerically.`);
	return items;
}

function isRepositoryPath(value) {
	if (typeof value !== 'string' || value === '' || value.includes('\\') || value.includes('\0'))
		return false;
	if (path.posix.isAbsolute(value) || value.startsWith('./')) return false;
	const normalized = path.posix.normalize(value);
	return normalized === value && normalized !== '..' && !normalized.startsWith('../');
}

function expectRepositoryPath(value, label, errors) {
	if (isRepositoryPath(value)) return true;
	errors.push(`${label} must be a normalized repository-relative path.`);
	return false;
}

function resolveRepositoryFile(repoRoot, file, label, errors) {
	if (!expectRepositoryPath(file, label, errors)) return null;
	const absolute = path.resolve(repoRoot, file);
	const relative = path.relative(repoRoot, absolute);
	if (relative.startsWith('..') || path.isAbsolute(relative)) {
		errors.push(`${label} resolves outside the repository.`);
		return null;
	}
	if (!existsSync(absolute) || !statSync(absolute).isFile()) {
		errors.push(`${label} does not name an existing file: ${file}.`);
		return null;
	}
	return absolute;
}

function checkSourceUrl(source, label, errors) {
	if (!expectString(source.url, `${label}.url`, errors)) return;
	let expected;
	switch (source.kind) {
		case 'issue':
			expected = `${REDACT_REPOSITORY}/issues/${source.number}`;
			break;
		case 'pull_request':
			expected = `${REDACT_REPOSITORY}/pull/${source.number}`;
			break;
		case 'commit':
			expected = `${REDACT_REPOSITORY}/commit/${source.commit}`;
			break;
		case 'test':
			expected = `${REDACT_REPOSITORY}/blob/${source.commit}/${source.path}`;
			break;
		default:
			return;
	}
	if (
		source.url !== expected &&
		!(source.kind === 'test' && source.url.startsWith(`${expected}#`))
	) {
		errors.push(`${label}.url must be the pinned canonical URL ${JSON.stringify(expected)}.`);
	}
}

function validateSource(sourceValue, label, errors, observedSources, snapshotCommit) {
	const source = expectRecord(sourceValue, label, errors);
	if (!source) return null;
	checkKeys(
		source,
		['kind', 'url', 'title', 'number', 'commit', 'path', 'testName'],
		label,
		errors,
	);
	requireKeys(source, ['kind', 'url'], label, errors);
	if (!expectEnum(source.kind, SOURCE_KINDS, `${label}.kind`, errors)) return null;
	if (source.title !== undefined) expectString(source.title, `${label}.title`, errors);

	if (source.kind === 'issue' || source.kind === 'pull_request') {
		if (source.title === undefined)
			errors.push(`${label}.title is required for issue and pull-request attribution.`);
		if (!Number.isInteger(source.number) || source.number < 1)
			errors.push(`${label}.number must be a positive integer.`);
		for (const key of ['commit', 'path', 'testName']) {
			if (source[key] !== undefined)
				errors.push(`${label}.${key} is not valid for a ${source.kind} source.`);
		}
		const sourceKey = `${source.kind}:${source.number}`;
		const priorTitle = observedSources.titles.get(sourceKey);
		if (priorTitle !== undefined && priorTitle !== source.title)
			errors.push(
				`${label}.title disagrees with the other ${source.kind} #${source.number} attribution.`,
			);
		else if (typeof source.title === 'string') observedSources.titles.set(sourceKey, source.title);
		if (source.kind === 'issue') observedSources.issues.add(source.number);
		else observedSources.pullRequests.add(source.number);
	} else {
		if (!expectString(source.commit, `${label}.commit`, errors, COMMIT_PATTERN)) return null;
		if (source.number !== undefined)
			errors.push(`${label}.number is not valid for a ${source.kind} source.`);
		if (source.kind === 'test') {
			expectRepositoryPath(source.path, `${label}.path`, errors);
			expectString(source.testName, `${label}.testName`, errors);
			if (typeof source.path === 'string') observedSources.tests.add(source.path);
			if (source.commit !== snapshotCommit)
				errors.push(`${label}.commit must match the audited upstream snapshot ${snapshotCommit}.`);
		} else {
			for (const key of ['path', 'testName']) {
				if (source[key] !== undefined)
					errors.push(`${label}.${key} is not valid for a commit source.`);
			}
		}
	}

	checkSourceUrl(source, label, errors);
	return source;
}

const configuredTestPatternsByRoot = new Map();

function globPatternToRegExp(pattern) {
	let source = '^';
	for (let index = 0; index < pattern.length; index++) {
		if (pattern.startsWith('**/', index)) {
			source += '(?:.*/)?';
			index += 2;
		} else if (pattern.startsWith('**', index)) {
			source += '.*';
			index += 1;
		} else if (pattern[index] === '*') {
			source += '[^/]*';
		} else {
			source += pattern[index].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		}
	}
	return new RegExp(`${source}$`);
}

function configuredTestPatterns(repoRoot) {
	if (configuredTestPatternsByRoot.has(repoRoot)) return configuredTestPatternsByRoot.get(repoRoot);
	const configPath = path.join(repoRoot, 'vitest.config.js');
	if (!existsSync(configPath)) {
		configuredTestPatternsByRoot.set(repoRoot, []);
		return [];
	}
	const config = readFileSync(configPath, 'utf8');
	const patterns = [
		...config.matchAll(/['"]((?:packages|website)[^'"]*\*[^'"]*(?:\.test|\.spec)\.[^'"]+)['"]/g),
	].map((match) => globPatternToRegExp(match[1]));
	configuredTestPatternsByRoot.set(repoRoot, patterns);
	return patterns;
}

function hasExecutableTest(contents, file, testName, repoRoot) {
	if (!configuredTestPatterns(repoRoot).some((pattern) => pattern.test(file))) return false;
	if (/\b(?:describe|suite)\s*\.\s*(?:skip|todo)\s*\(/.test(contents)) return false;
	return extractTestCases(contents, { file }).some(
		(testCase) =>
			testCase.title === testName &&
			testCase.kind !== 'xit' &&
			!testCase.modifiers.some((modifier) =>
				['skip', 'todo', 'fails', 'failing'].includes(modifier),
			) &&
			testCase.gate === null &&
			Number.isInteger(testCase.estimatedRegistrations) &&
			testCase.estimatedRegistrations > 0,
	);
}

function validateOctaneReference(referenceValue, label, errors, repoRoot) {
	const reference = expectRecord(referenceValue, label, errors);
	if (!reference) return;
	checkKeys(reference, ['kind', 'file', 'symbol', 'testName', 'note'], label, errors);
	requireKeys(reference, ['kind', 'file'], label, errors);
	expectEnum(reference.kind, REFERENCE_KINDS, `${label}.kind`, errors);
	if (reference.symbol !== undefined) expectString(reference.symbol, `${label}.symbol`, errors);
	if (reference.testName !== undefined)
		expectString(reference.testName, `${label}.testName`, errors);
	if (reference.note !== undefined) expectString(reference.note, `${label}.note`, errors);
	if (reference.kind === 'test' && reference.testName === undefined)
		errors.push(`${label}.testName is required for a test reference.`);

	const absolute = resolveRepositoryFile(repoRoot, reference.file, `${label}.file`, errors);
	if (!absolute) return;
	const contents = readFileSync(absolute, 'utf8');
	if (reference.symbol && !contents.includes(reference.symbol))
		errors.push(`${label}.symbol was not found in ${reference.file}: ${reference.symbol}.`);
	if (
		reference.testName &&
		!hasExecutableTest(contents, reference.file, reference.testName, repoRoot)
	)
		errors.push(
			`${label}.testName is not an executable registered test in ${reference.file}: ${reference.testName}.`,
		);
}

function validateEvidence(evidenceValue, label, errors, repoRoot) {
	const evidence = expectRecord(evidenceValue, label, errors);
	if (!evidence) return;
	checkKeys(
		evidence,
		['kind', 'file', 'testName', 'script', 'modes', 'observables'],
		label,
		errors,
	);
	requireKeys(evidence, ['modes', 'observables'], label, errors);
	const kind = evidence.kind ?? 'test';
	expectEnum(kind, EVIDENCE_KINDS, `${label}.kind`, errors);
	expectEnumArray(evidence.modes, MODES, `${label}.modes`, errors);
	expectEnumArray(evidence.observables, OBSERVABLES, `${label}.observables`, errors);

	if (kind === 'command') {
		requireKeys(evidence, ['kind', 'script'], label, errors);
		expectString(evidence.script, `${label}.script`, errors);
		for (const key of ['file', 'testName']) {
			if (evidence[key] !== undefined)
				errors.push(`${label}.${key} is not valid for command evidence.`);
		}
		if (typeof evidence.script === 'string') {
			const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
			const command = manifest.scripts?.[evidence.script];
			if (typeof command !== 'string') {
				errors.push(`${label}.script is not registered in package.json: ${evidence.script}.`);
			} else {
				for (const match of command.matchAll(/(?:^|&&|\|\||;)\s*node\s+(['"]?)([^\s'";&|]+)\1/g)) {
					if (!existsSync(path.join(repoRoot, match[2])))
						errors.push(`${label}.script references a missing Node entry point: ${match[2]}.`);
				}
				const workflowsDirectory = path.join(repoRoot, '.github/workflows');
				const workflowSources = existsSync(workflowsDirectory)
					? readdirSync(workflowsDirectory)
							.filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
							.map((file) => readFileSync(path.join(workflowsDirectory, file), 'utf8'))
					: [];
				const invocation = new RegExp(
					`\\bpnpm\\s+${evidence.script.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`,
				);
				if (!workflowSources.some((source) => invocation.test(source)))
					errors.push(
						`${label}.script is not invoked by a checked-in workflow: ${evidence.script}.`,
					);
			}
		}
		return;
	}

	requireKeys(evidence, ['file', 'testName'], label, errors);
	if (evidence.script !== undefined) errors.push(`${label}.script is not valid for test evidence.`);
	expectString(evidence.testName, `${label}.testName`, errors);
	const absolute = resolveRepositoryFile(repoRoot, evidence.file, `${label}.file`, errors);
	if (!absolute || typeof evidence.testName !== 'string') return;
	if (
		!hasExecutableTest(readFileSync(absolute, 'utf8'), evidence.file, evidence.testName, repoRoot)
	)
		errors.push(
			`${label}.testName is not an executable registered test in ${evidence.file}: ${evidence.testName}.`,
		);
}

function validateNextAction(actionValue, label, errors) {
	const action = expectRecord(actionValue, label, errors);
	if (!action) return;
	checkKeys(action, ['kind', 'targets', 'acceptance'], label, errors);
	requireKeys(action, ['kind', 'targets', 'acceptance'], label, errors);
	expectEnum(action.kind, ACTION_KINDS, `${label}.kind`, errors);
	const targets = expectUniqueArray(action.targets, `${label}.targets`, errors);
	if (targets) {
		for (const [index, target] of targets.entries())
			expectString(target, `${label}.targets[${index}]`, errors);
	}
	expectString(action.acceptance, `${label}.acceptance`, errors);
}

function validateEntry(entryValue, index, errors, repoRoot, observedSources, snapshotCommit) {
	const label = `entries[${index}]`;
	const entry = expectRecord(entryValue, label, errors);
	if (!entry) return null;
	const allowed = [
		'id',
		'area',
		'title',
		'sources',
		'symptom',
		'octaneContract',
		'classification',
		'status',
		'risk',
		'owner',
		'applicableModes',
		'observables',
		'octaneReferences',
		'evidence',
		'nextAction',
		'rationale',
	];
	const required = [
		'id',
		'area',
		'title',
		'sources',
		'symptom',
		'octaneContract',
		'classification',
		'status',
		'risk',
		'owner',
		'applicableModes',
		'observables',
	];
	checkKeys(entry, allowed, label, errors);
	requireKeys(entry, required, label, errors);
	expectString(entry.id, `${label}.id`, errors, ID_PATTERN);
	expectString(entry.area, `${label}.area`, errors, AREA_PATTERN);
	for (const key of ['title', 'symptom', 'octaneContract', 'owner'])
		expectString(entry[key], `${label}.${key}`, errors);
	expectEnum(entry.classification, CLASSIFICATIONS, `${label}.classification`, errors);
	expectEnum(entry.status, STATUSES, `${label}.status`, errors);
	expectEnum(entry.risk, RISKS, `${label}.risk`, errors);
	expectEnumArray(entry.applicableModes, MODES, `${label}.applicableModes`, errors);
	expectEnumArray(entry.observables, OBSERVABLES, `${label}.observables`, errors);
	if (entry.rationale !== undefined) expectString(entry.rationale, `${label}.rationale`, errors);

	const sources = expectUniqueArray(entry.sources, `${label}.sources`, errors);
	if (sources) {
		const identities = new Set();
		for (const [sourceIndex, sourceValue] of sources.entries()) {
			const source = validateSource(
				sourceValue,
				`${label}.sources[${sourceIndex}]`,
				errors,
				observedSources,
				snapshotCommit,
			);
			if (!source) continue;
			const identity = `${source.kind}:${source.url}`;
			if (identities.has(identity)) errors.push(`${label}.sources repeats ${identity}.`);
			identities.add(identity);
		}
	}

	if (entry.octaneReferences !== undefined) {
		if (!Array.isArray(entry.octaneReferences))
			errors.push(`${label}.octaneReferences must be an array.`);
		else
			for (const [referenceIndex, reference] of entry.octaneReferences.entries())
				validateOctaneReference(
					reference,
					`${label}.octaneReferences[${referenceIndex}]`,
					errors,
					repoRoot,
				);
	}

	if (entry.evidence !== undefined) {
		const evidence = expectUniqueArray(entry.evidence, `${label}.evidence`, errors);
		if (evidence) {
			const declaredModes = new Set(
				Array.isArray(entry.applicableModes) ? entry.applicableModes : [],
			);
			const declaredObservables = new Set(
				Array.isArray(entry.observables) ? entry.observables : [],
			);
			for (const [evidenceIndex, item] of evidence.entries()) {
				validateEvidence(item, `${label}.evidence[${evidenceIndex}]`, errors, repoRoot);
				for (const mode of Array.isArray(item?.modes) ? item.modes : []) {
					if (!declaredModes.has(mode))
						errors.push(
							`${label}.evidence[${evidenceIndex}] claims mode ${mode} outside the entry contract.`,
						);
				}
				for (const observable of Array.isArray(item?.observables) ? item.observables : []) {
					if (!declaredObservables.has(observable))
						errors.push(
							`${label}.evidence[${evidenceIndex}] claims observable ${observable} outside the entry contract.`,
						);
				}
			}
		}
	}
	if (entry.nextAction !== undefined)
		validateNextAction(entry.nextAction, `${label}.nextAction`, errors);

	if (entry.status === 'covered' && (!Array.isArray(entry.evidence) || entry.evidence.length === 0))
		errors.push(`${label} is covered but has no executable evidence.`);
	if (entry.status === 'covered' && Array.isArray(entry.evidence)) {
		const evidenceModes = new Set(
			entry.evidence.flatMap((item) => (Array.isArray(item?.modes) ? item.modes : [])),
		);
		const evidenceObservables = new Set(
			entry.evidence.flatMap((item) => (Array.isArray(item?.observables) ? item.observables : [])),
		);
		for (const mode of Array.isArray(entry.applicableModes) ? entry.applicableModes : []) {
			if (!evidenceModes.has(mode))
				errors.push(`${label} is covered but has no executable evidence for mode ${mode}.`);
		}
		for (const observable of Array.isArray(entry.observables) ? entry.observables : []) {
			if (!evidenceObservables.has(observable))
				errors.push(
					`${label} is covered but has no executable evidence for observable ${observable}.`,
				);
		}
	}
	if ((entry.status === 'planned' || entry.status === 'in_progress') && !isRecord(entry.nextAction))
		errors.push(`${label} has status ${entry.status} but no nextAction.`);
	if (entry.status === 'decision_required') {
		if (!isRecord(entry.nextAction) || entry.nextAction.kind !== 'decision')
			errors.push(`${label} requires a nextAction with kind "decision".`);
		if (typeof entry.rationale !== 'string' || entry.rationale.trim() === '')
			errors.push(`${label} requires rationale for the pending decision.`);
	}
	if (entry.status === 'documented') {
		if (typeof entry.rationale !== 'string' || entry.rationale.trim() === '')
			errors.push(`${label} is documented but has no rationale.`);
		if (entry.nextAction !== undefined)
			errors.push(`${label} is documented but still has a nextAction.`);
		if (entry.classification !== 'divergence' && entry.classification !== 'non_goal') {
			if (!Array.isArray(entry.octaneReferences) || entry.octaneReferences.length === 0) {
				errors.push(`${label} is a documented portable policy but has no references.`);
			} else if (
				entry.octaneReferences.some(
					(reference) => reference?.kind !== 'documentation' && reference?.kind !== 'benchmark',
				)
			) {
				errors.push(
					`${label} may use documented for a portable policy only when every reference is documentation or a benchmark.`,
				);
			}
		}
	}
	if (
		(entry.classification === 'divergence' || entry.classification === 'non_goal') &&
		(typeof entry.rationale !== 'string' || entry.rationale.trim() === '')
	)
		errors.push(`${label} requires rationale for classification ${entry.classification}.`);
	if (
		entry.status === 'blocked' &&
		(typeof entry.rationale !== 'string' || entry.rationale.trim() === '')
	)
		errors.push(`${label} is blocked but has no rationale.`);
	return entry;
}

function validateScope(scopeValue, errors) {
	const scope = expectRecord(scopeValue, 'upstream.scope', errors);
	if (!scope) return { issueNumbers: [], pullRequestNumbers: [], paths: [], artifacts: [] };
	checkKeys(
		scope,
		['issueNumbers', 'pullRequestNumbers', 'paths', 'artifacts'],
		'upstream.scope',
		errors,
	);
	requireKeys(
		scope,
		['issueNumbers', 'pullRequestNumbers', 'paths', 'artifacts'],
		'upstream.scope',
		errors,
	);
	const issueNumbers = expectPositiveIntegerArray(
		scope.issueNumbers,
		'upstream.scope.issueNumbers',
		errors,
	);
	const pullRequestNumbers = expectPositiveIntegerArray(
		scope.pullRequestNumbers,
		'upstream.scope.pullRequestNumbers',
		errors,
	);
	const paths = expectUniqueArray(scope.paths, 'upstream.scope.paths', errors) ?? [];
	const validPathOrder = [];
	for (const [index, value] of paths.entries()) {
		if (expectRepositoryPath(value, `upstream.scope.paths[${index}]`, errors))
			validPathOrder.push(value);
	}
	const sortedPaths = [...validPathOrder].sort((a, b) => a.localeCompare(b));
	if (validPathOrder.some((value, index) => value !== sortedPaths[index]))
		errors.push('upstream.scope.paths must be sorted.');
	const artifacts = expectUniqueArray(scope.artifacts, 'upstream.scope.artifacts', errors) ?? [];
	const artifactPaths = new Set();
	const artifactPathOrder = [];
	for (const [index, value] of artifacts.entries()) {
		const label = `upstream.scope.artifacts[${index}]`;
		const artifact = expectRecord(value, label, errors);
		if (!artifact) continue;
		checkKeys(artifact, ['path', 'disposition', 'entryIds', 'note'], label, errors);
		requireKeys(artifact, ['path', 'disposition', 'entryIds'], label, errors);
		if (expectRepositoryPath(artifact.path, `${label}.path`, errors)) {
			if (artifactPaths.has(artifact.path))
				errors.push(`upstream.scope.artifacts repeats ${artifact.path}.`);
			artifactPaths.add(artifact.path);
			artifactPathOrder.push(artifact.path);
		}
		expectEnum(
			artifact.disposition,
			['mapped', 'folded', 'non_goal'],
			`${label}.disposition`,
			errors,
		);
		const entryIds = expectUniqueArray(artifact.entryIds, `${label}.entryIds`, errors);
		const validEntryIdOrder = [];
		if (entryIds)
			for (const [entryIndex, id] of entryIds.entries()) {
				if (expectString(id, `${label}.entryIds[${entryIndex}]`, errors, ID_PATTERN))
					validEntryIdOrder.push(id);
			}
		if (entryIds) {
			const sortedEntryIds = [...validEntryIdOrder].sort((a, b) => a.localeCompare(b));
			if (validEntryIdOrder.some((id, entryIndex) => id !== sortedEntryIds[entryIndex]))
				errors.push(`${label}.entryIds must be sorted by permanent ID.`);
		}
		if (artifact.note !== undefined) expectString(artifact.note, `${label}.note`, errors);
		if (
			(artifact.disposition === 'folded' || artifact.disposition === 'non_goal') &&
			(typeof artifact.note !== 'string' || !artifact.note.trim())
		)
			errors.push(`${label} requires a note for disposition ${artifact.disposition}.`);
	}
	const sortedArtifactPaths = [...artifactPathOrder].sort((a, b) => a.localeCompare(b));
	if (artifactPathOrder.some((value, index) => value !== sortedArtifactPaths[index]))
		errors.push('upstream.scope.artifacts must be sorted by path.');
	return { issueNumbers, pullRequestNumbers, paths, artifacts };
}

function validateUpstream(upstreamValue, errors) {
	const upstream = expectRecord(upstreamValue, 'upstream', errors);
	if (!upstream)
		return { scope: { issueNumbers: [], pullRequestNumbers: [], paths: [], artifacts: [] } };
	checkKeys(upstream, ['repository', 'commit', 'capturedOn', 'scope'], 'upstream', errors);
	requireKeys(upstream, ['repository', 'commit', 'capturedOn', 'scope'], 'upstream', errors);
	if (upstream.repository !== REDACT_REPOSITORY)
		errors.push(`upstream.repository must be ${JSON.stringify(REDACT_REPOSITORY)}.`);
	expectString(upstream.commit, 'upstream.commit', errors, COMMIT_PATTERN);
	if (expectString(upstream.capturedOn, 'upstream.capturedOn', errors, /^\d{4}-\d{2}-\d{2}$/)) {
		const captured = new Date(`${upstream.capturedOn}T00:00:00.000Z`);
		if (
			Number.isNaN(captured.getTime()) ||
			captured.toISOString().slice(0, 10) !== upstream.capturedOn
		)
			errors.push('upstream.capturedOn must be a valid YYYY-MM-DD date.');
	}
	return { ...upstream, scope: validateScope(upstream.scope, errors) };
}

function compareArtifacts(scope, observedSources, entries, errors) {
	const entryById = new Map(entries.map((entry) => [entry.id, entry]));
	const sourceEntryIdsByPath = new Map();
	for (const entry of entries) {
		for (const source of Array.isArray(entry.sources) ? entry.sources : []) {
			if (source?.kind !== 'test' || typeof source.path !== 'string') continue;
			const ids = sourceEntryIdsByPath.get(source.path) ?? new Set();
			ids.add(entry.id);
			sourceEntryIdsByPath.set(source.path, ids);
		}
	}
	const artifactsByPath = new Map(
		scope.artifacts
			.filter((artifact) => isRecord(artifact) && typeof artifact.path === 'string')
			.map((artifact) => [artifact.path, artifact]),
	);
	for (const sourcePath of observedSources.tests) {
		if (!artifactsByPath.has(sourcePath))
			errors.push(`Referenced upstream test ${sourcePath} has no audited artifact disposition.`);
	}
	for (const [index, artifact] of scope.artifacts.entries()) {
		if (!isRecord(artifact)) continue;
		const artifactEntryIds = Array.isArray(artifact.entryIds) ? artifact.entryIds : [];
		for (const id of artifactEntryIds) {
			const entry = entryById.get(id);
			if (!entry) {
				errors.push(`upstream.scope.artifacts[${index}] references unknown ledger ID ${id}.`);
			} else if (
				artifact.disposition === 'mapped' &&
				!entry.sources?.some((source) => source.kind === 'test' && source.path === artifact.path)
			) {
				errors.push(
					`Mapped upstream artifact ${artifact.path} assigns ${id}, but that entry has no exact test source for the artifact.`,
				);
			}
		}
		if (artifact.disposition === 'mapped' && !observedSources.tests.has(artifact.path)) {
			errors.push(
				`Mapped upstream artifact ${artifact.path} has no exact test source in the ledger; use folded or add a source.`,
			);
		}
		if (artifact.disposition === 'mapped') {
			const assignedIds = new Set(artifactEntryIds);
			for (const id of sourceEntryIdsByPath.get(artifact.path) ?? []) {
				if (!assignedIds.has(id))
					errors.push(`Mapped upstream artifact ${artifact.path} omits source entry ${id}.`);
			}
		}
		if (artifact.disposition === 'non_goal') {
			for (const id of artifactEntryIds) {
				const classification = entryById.get(id)?.classification;
				if (classification !== 'non_goal' && classification !== 'divergence')
					errors.push(
						`Non-goal artifact ${artifact.path} points to ${id}, which is not a divergence or non-goal.`,
					);
			}
		}
	}
}

function compareScope(scope, observedSources, errors) {
	const expectedIssues = new Set(scope.issueNumbers);
	const expectedPullRequests = new Set(scope.pullRequestNumbers);
	for (const number of expectedIssues) {
		if (!observedSources.issues.has(number))
			errors.push(`Audited issue #${number} has no source reference in the ledger.`);
	}
	for (const number of observedSources.issues) {
		if (!expectedIssues.has(number))
			errors.push(`Ledger references issue #${number}, which is absent from upstream.scope.`);
	}
	for (const number of expectedPullRequests) {
		if (!observedSources.pullRequests.has(number))
			errors.push(`Audited pull request #${number} has no source reference in the ledger.`);
	}
	for (const number of observedSources.pullRequests) {
		if (!expectedPullRequests.has(number))
			errors.push(
				`Ledger references pull request #${number}, which is absent from upstream.scope.`,
			);
	}
}

export function validateLedger(ledgerValue, repoRoot) {
	const errors = [];
	const ledger = expectRecord(ledgerValue, 'ledger', errors);
	if (!ledger) return errors;
	checkKeys(
		ledger,
		['$schema', 'schemaVersion', 'upstream', 'idRegistry', 'entries'],
		'ledger',
		errors,
	);
	requireKeys(
		ledger,
		['$schema', 'schemaVersion', 'upstream', 'idRegistry', 'entries'],
		'ledger',
		errors,
	);
	if (ledger.$schema !== LEDGER_SCHEMA)
		errors.push(`ledger.$schema must be ${JSON.stringify(LEDGER_SCHEMA)}.`);
	if (ledger.schemaVersion !== 1) errors.push('ledger.schemaVersion must be 1.');
	const upstream = validateUpstream(ledger.upstream, errors);

	if (!Array.isArray(ledger.entries) || ledger.entries.length === 0) {
		errors.push('ledger.entries must be a non-empty array.');
		return errors;
	}
	const observedSources = {
		issues: new Set(),
		pullRequests: new Set(),
		tests: new Set(),
		titles: new Map(),
	};
	const ids = new Set();
	const validIds = [];
	const entries = [];
	for (const [index, value] of ledger.entries.entries()) {
		const entry = validateEntry(value, index, errors, repoRoot, observedSources, upstream.commit);
		if (!entry) continue;
		entries.push(entry);
		if (typeof entry.id === 'string') {
			if (ids.has(entry.id)) errors.push(`Duplicate ledger ID ${entry.id}.`);
			ids.add(entry.id);
			validIds.push(entry.id);
		}
	}
	const sortedIds = [...validIds].sort((a, b) => a.localeCompare(b));
	if (validIds.some((id, index) => id !== sortedIds[index]))
		errors.push('ledger.entries must be sorted by permanent ID.');
	const registry = expectUniqueArray(ledger.idRegistry, 'ledger.idRegistry', errors);
	if (registry) {
		const registryIds = [];
		const seenRegistryIds = new Set();
		const activeIds = new Set();
		for (const [index, value] of registry.entries()) {
			const label = `ledger.idRegistry[${index}]`;
			const record = expectRecord(value, label, errors);
			if (!record) continue;
			checkKeys(record, ['id', 'status', 'introducedOn', 'rationale'], label, errors);
			requireKeys(record, ['id', 'status', 'introducedOn'], label, errors);
			expectString(record.id, `${label}.id`, errors, ID_PATTERN);
			expectEnum(record.status, ['active', 'retired'], `${label}.status`, errors);
			if (
				expectString(record.introducedOn, `${label}.introducedOn`, errors, /^\d{4}-\d{2}-\d{2}$/)
			) {
				const introduced = new Date(`${record.introducedOn}T00:00:00.000Z`);
				if (
					Number.isNaN(introduced.getTime()) ||
					introduced.toISOString().slice(0, 10) !== record.introducedOn
				)
					errors.push(`${label}.introducedOn must be a valid YYYY-MM-DD date.`);
			}
			if (record.rationale !== undefined)
				expectString(record.rationale, `${label}.rationale`, errors);
			if (
				record.status === 'retired' &&
				(typeof record.rationale !== 'string' || !record.rationale.trim())
			)
				errors.push(`${label} is retired but has no rationale.`);
			if (typeof record.id === 'string') {
				if (seenRegistryIds.has(record.id))
					errors.push(`ledger.idRegistry repeats permanent ID ${record.id}.`);
				seenRegistryIds.add(record.id);
				registryIds.push(record.id);
				if (record.status === 'active') activeIds.add(record.id);
				else if (ids.has(record.id)) errors.push(`${label} is retired but still has an entry.`);
			}
		}
		const sortedRegistryIds = [...registryIds].sort((a, b) => a.localeCompare(b));
		if (registryIds.some((id, index) => id !== sortedRegistryIds[index]))
			errors.push('ledger.idRegistry must be sorted by permanent ID.');
		for (const id of ids) {
			if (!activeIds.has(id))
				errors.push(`Ledger entry ${id} is absent from the active ID registry.`);
		}
		for (const id of activeIds) {
			if (!ids.has(id)) errors.push(`Active ID registry entry ${id} has no ledger entry.`);
		}
	}
	compareScope(upstream.scope, observedSources, errors);
	compareArtifacts(upstream.scope, observedSources, entries, errors);
	return errors;
}

export function validateIdRegistryCompatibility(previousLedger, currentLedger) {
	const errors = [];
	const previousRecords = Array.isArray(previousLedger?.idRegistry)
		? previousLedger.idRegistry
		: [];
	const currentRecords = Array.isArray(currentLedger?.idRegistry) ? currentLedger.idRegistry : [];
	const previousRegistry = new Map(
		previousRecords
			.filter((record) => isRecord(record) && typeof record.id === 'string')
			.map((record) => [record.id, record]),
	);
	const currentRegistry = new Map(
		currentRecords
			.filter((record) => isRecord(record) && typeof record.id === 'string')
			.map((record) => [record.id, record]),
	);
	for (const [id, previous] of previousRegistry) {
		const current = currentRegistry.get(id);
		if (!current) {
			errors.push(`Previously registered permanent ID ${id} was removed.`);
			continue;
		}
		if (current.introducedOn !== previous.introducedOn) {
			errors.push(`Permanent ID ${id} changed its introducedOn date.`);
		}
		if (previous.status === 'retired' && current.status !== 'retired') {
			errors.push(`Retired permanent ID ${id} was reactivated.`);
		}
	}
	return errors;
}

function normalizedProse(value) {
	return value.trim().replace(/\s+/g, ' ');
}

function prose(value) {
	return normalizedProse(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}

function label(value) {
	return prose(value).replaceAll('[', '\\[').replaceAll(']', '\\]');
}

function cell(value) {
	return prose(value).replaceAll('|', '\\|');
}

function displayEnum(value) {
	return value.replaceAll('_', ' ').replaceAll('-', ' ');
}

function inlineCode(value) {
	const contents = normalizedProse(value);
	const longestRun = Math.max(0, ...(contents.match(/`+/g) ?? []).map((run) => run.length));
	const fence = '`'.repeat(longestRun + 1);
	const padding = longestRun > 0 ? ' ' : '';
	return `${fence}${padding}${contents}${padding}${fence}`;
}

function sourceMarkdown(source) {
	let sourceLabel;
	if (source.kind === 'issue') sourceLabel = `issue #${source.number}`;
	else if (source.kind === 'pull_request') sourceLabel = `pull request #${source.number}`;
	else if (source.kind === 'commit') sourceLabel = `commit ${source.commit.slice(0, 12)}`;
	else sourceLabel = `test: ${source.testName}`;
	const suffix = source.title ? ` — ${prose(source.title)}` : '';
	const pathSuffix = source.kind === 'test' ? ` (\`${source.path}\`)` : '';
	return `[${label(sourceLabel)}](${source.url})${pathSuffix}${suffix}`;
}

function localFileMarkdown(file, text = file) {
	return `[${label(text)}](../${encodeURI(file)})`;
}

function referenceMarkdown(reference) {
	let suffix = '';
	if (reference.symbol) suffix += ` — ${inlineCode(reference.symbol)}`;
	if (reference.testName) suffix += ` — “${prose(reference.testName)}”`;
	if (reference.note) suffix += ` — ${prose(reference.note)}`;
	return `${localFileMarkdown(reference.file)}${suffix}`;
}

function evidenceMarkdown(evidence) {
	const executable =
		evidence.kind === 'command'
			? `command: \`pnpm ${evidence.script}\``
			: localFileMarkdown(evidence.file, evidence.testName);
	return `${executable} — modes: ${evidence.modes
		.map((mode) => `\`${mode}\``)
		.join(', ')}; observables: ${evidence.observables
		.map((observable) => `\`${observable}\``)
		.join(', ')}`;
}

function countBy(entries, key, values) {
	return values.map((value) => ({
		value,
		count: entries.filter((entry) => entry[key] === value).length,
	}));
}

function renderSummary(entries) {
	let result = `## Summary\n\n`;
	result += `| Status | Entries |\n| --- | ---: |\n`;
	for (const { value, count } of countBy(entries, 'status', STATUSES))
		result += `| ${displayEnum(value)} | ${count} |\n`;
	result += `\n| Classification | Entries |\n| --- | ---: |\n`;
	for (const { value, count } of countBy(entries, 'classification', CLASSIFICATIONS))
		result += `| ${displayEnum(value)} | ${count} |\n`;
	return result;
}

function renderPriorityQueue(entries) {
	const riskOrder = new Map(RISKS.map((risk, index) => [risk, index]));
	const open = entries
		.filter((entry) => OPEN_STATUSES.has(entry.status))
		.sort((a, b) => riskOrder.get(a.risk) - riskOrder.get(b.risk) || a.id.localeCompare(b.id));
	let result = `## Open priority queue\n\n`;
	if (open.length === 0) return `${result}_No open entries._\n`;
	result += `| ID | Risk | Area | Contract | Status | Owner |\n`;
	result += `| --- | --- | --- | --- | --- | --- |\n`;
	for (const entry of open) {
		result += `| [\`${entry.id}\`](#${entry.id.toLowerCase()}) | ${entry.risk} | ${cell(
			entry.area,
		)} | ${cell(entry.title)} | ${displayEnum(entry.status)} | ${cell(entry.owner)} |\n`;
	}
	return result;
}

function renderEntry(entry) {
	let result = `<a id="${entry.id.toLowerCase()}"></a>\n\n#### ${entry.id} — ${entry.title}\n\n`;
	result += `**Disposition:** ${entry.risk} risk; ${displayEnum(entry.classification)}; ${displayEnum(
		entry.status,
	)}; owner: ${entry.owner}.\n\n`;
	result += `**Upstream evidence**\n\n`;
	for (const source of entry.sources) result += `- ${sourceMarkdown(source)}\n`;
	result += `\n**Consumer-visible symptom.** ${prose(entry.symptom)}\n\n`;
	result += `**Octane contract.** ${prose(entry.octaneContract)}\n\n`;
	result += `**Applicable modes:** ${entry.applicableModes
		.map((mode) => `\`${mode}\``)
		.join(', ')}. **Observables:** ${entry.observables
		.map((observable) => `\`${observable}\``)
		.join(', ')}.\n`;
	if (entry.octaneReferences?.length) {
		result += `\n**Octane references**\n\n`;
		for (const reference of entry.octaneReferences) result += `- ${referenceMarkdown(reference)}\n`;
	}
	if (entry.evidence?.length) {
		result += `\n**Executable evidence**\n\n`;
		for (const evidence of entry.evidence) result += `- ${evidenceMarkdown(evidence)}\n`;
	}
	if (entry.nextAction) {
		result += `\n**Next action (${displayEnum(entry.nextAction.kind)}).** ${prose(
			entry.nextAction.acceptance,
		)}\n\n`;
		result += `Targets: ${entry.nextAction.targets.map((target) => `\`${target}\``).join(', ')}.\n`;
	}
	if (entry.rationale) result += `\n**Rationale.** ${prose(entry.rationale)}\n`;
	return result;
}

export function renderReport(ledger) {
	const entries = [...ledger.entries].sort((a, b) => a.id.localeCompare(b.id));
	const { upstream } = ledger;
	let report = `# Redact-derived adversarial contract audit (generated)\n\n`;
	report += `<!-- GENERATED FILE — do not edit. Regenerate with \`pnpm redact-audit:generate\`. -->\n\n`;
	report += `This is a source-backed extraction ledger for consumer-observable failure modes found in [TanStack Redact](${upstream.repository}). Redact is an adversity source, not an implementation target or a blanket compatibility promise. Classifications describe whether each contract transfers to Octane; statuses describe the current Octane evidence or follow-up.\n\n`;
	report += `The authored source is [\`packages/octane/audit/redact-adversarial-ledger.json\`](../packages/octane/audit/redact-adversarial-ledger.json). Permanent IDs must not be renamed or reused.\n\n`;
	report += `## Upstream snapshot\n\n`;
	report += `- Repository: [\`${upstream.repository}\`](${upstream.repository})\n`;
	report += `- Commit: [\`${upstream.commit}\`](${upstream.repository}/commit/${upstream.commit})\n`;
	report += `- Captured: ${upstream.capturedOn}\n`;
	report += `- Issues reviewed: ${upstream.scope.issueNumbers.map((number) => `#${number}`).join(', ')}\n`;
	report += `- Pull requests reviewed: ${upstream.scope.pullRequestNumbers
		.map((number) => `#${number}`)
		.join(', ')}\n`;
	report += `- Repository paths reviewed: ${upstream.scope.paths
		.map((item) => `\`${item}\``)
		.join(', ')}\n\n`;
	report += `### Audited artifact dispositions\n\n`;
	report += `This is the explicit artifact sample reviewed at the pinned snapshot; broad source paths above do not imply that every file was mined. \`mapped\` artifacts have an exact upstream test source, while \`folded\` artifacts were inspected and assigned to an existing contract without duplicating every case.\n\n`;
	report += `| Artifact | Disposition | Ledger IDs | Note |\n`;
	report += `| --- | --- | --- | --- |\n`;
	for (const artifact of upstream.scope.artifacts) {
		report += `| \`${cell(artifact.path)}\` | ${displayEnum(artifact.disposition)} | ${artifact.entryIds
			.map((id) => `[\`${id}\`](#${id.toLowerCase()})`)
			.join(', ')} | ${cell(artifact.note ?? 'Exact source mapping.')} |\n`;
	}
	report += `\n`;
	report += `## Entry contract\n\n`;
	report += `- Keep one consumer-observable owning contract per permanent ID; split an upstream issue or pull request when it exposes independent contracts.\n`;
	report += `- The append-only \`idRegistry\` retains retired IDs as tombstones. Never rename, remove, or reuse a registered ID; retire it with rationale and mint a new ID when the owning contract changes.\n`;
	report += `- A \`covered\` entry cites an exact executable Octane test. A \`planned\` entry carries a bounded next action. A \`decision required\` entry records the decision owner and acceptance boundary.\n`;
	report += `- A \`documented\` entry is terminal only for an explained divergence/non-goal or a portable process policy backed exclusively by documentation/benchmark references.\n`;
	report += `- Keep resolved, divergent, and non-goal entries in the ledger so future audits do not rediscover them or silently import Redact-specific behavior.\n`;
	report += `- Choose tests by observable. Final markup alone cannot prove identity, focus, selection, scroll, live properties, lifecycle ordering, or global error behavior.\n`;
	report += `- Update the authored JSON, then run \`pnpm redact-audit:generate\`; never hand-edit this report.\n\n`;
	report += `${renderSummary(entries)}\n`;
	report += `${renderPriorityQueue(entries)}\n`;
	report += `## Contract ledger\n`;
	const areas = [...new Set(entries.map((entry) => entry.area))].sort((a, b) => a.localeCompare(b));
	for (const area of areas) {
		report += `\n### ${area}\n\n`;
		for (const entry of entries.filter((item) => item.area === area))
			report += `${renderEntry(entry)}\n`;
	}
	return `${report.trimEnd()}\n`;
}
