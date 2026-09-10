import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { getBindingPackages } from './workspace-packages.mjs';
import { readBindingSurfacePolicy } from './binding-surface-policy.mjs';
import { manifestExports, readRepositoryCapabilityInventory } from './react-port/graph-lib.mjs';
import { parseGitHubUrl, parseInput } from './react-port/input-lib.mjs';
import { acquireUpstreamBaseline, storageIsInRepository } from './react-port/upstream-baseline.mjs';
import { fingerprint, stableStringify, sanitizeForReport } from './react-port/report-lib.mjs';
import {
	compareVersions,
	selectHighestSatisfyingVersion,
	satisfiesRange,
} from './react-port/version-lib.mjs';

export const FINDING_CATEGORIES = Object.freeze([
	'functional-gap',
	'compatibility-defect',
	'dependency-update',
	'metadata-drift',
	'convenience-import',
	'unverified-compatibility',
	'reduction-candidate',
]);
export const DEFAULT_REPOSITORY = 'https://github.com/octanejs/octane.git';

const now = () => new Date().toISOString();
const sorted = (values) => [...new Set(values)].sort();
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const fullSha = (value) =>
	typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
const record = (value) => value && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const equal = (left, right) => stableStringify(left) === stableStringify(right);
const current = (baseline) =>
	baseline.receipts.find((receipt) => receipt.id === baseline.currentReceiptId);
const requireValue = (condition, message) => {
	if (!condition) throw new Error(message);
};

function git(root, ...args) {
	const env = Object.fromEntries(
		Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
	);
	return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-C', root, ...args], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		timeout: 30_000,
		maxBuffer: 32 * 1024 * 1024,
		env: { ...env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
	});
}

/** Outputs must not create state in any source checkout, including via symlinks. */
export function assertExternalReportPath(file) {
	requireValue(nonempty(file), 'Expected a report path');
	requireValue(!storageIsInRepository(file), 'Report paths must be outside Git source trees');
}

function confined(root, relative) {
	requireValue(
		typeof relative === 'string' &&
			!path.isAbsolute(relative) &&
			!relative.split(/[\\/]/).includes('..'),
		'Invalid repository-relative path',
	);
	const resolved = realpathSync(path.join(root, relative));
	const suffix = path.relative(realpathSync(root), resolved);
	requireValue(
		!suffix.startsWith('..') && !path.isAbsolute(suffix),
		'Path escapes fetched checkout',
	);
	return resolved;
}

function repositoryIdentity(input) {
	let url = typeof input === 'string' ? input : input?.url;
	requireValue(nonempty(url), 'No repository identity is available');
	url = url.replace(/^git\+/, '').replace(/^github:/, 'https://github.com/');
	let directory = typeof input === 'object' ? (input.directory ?? input.subdirectory) : null;
	if (url.startsWith('https://github.com/')) {
		const parsed = parseGitHubUrl(new URL(url));
		url = `https://github.com/${parsed.owner}/${parsed.repo}.git`;
		directory ??= parsed.subdirectory;
	} else if (URL.canParse(url)) {
		const parsed = new URL(url);
		requireValue(
			['https:', 'ssh:', 'git:', 'file:'].includes(parsed.protocol) &&
				!parsed.password &&
				!parsed.search &&
				!parsed.hash &&
				(parsed.protocol !== 'https:' || !parsed.username),
			'Invalid repository URL',
		);
	} else {
		requireValue(path.isAbsolute(url), 'Repository identity must be a URL or absolute local path');
		url = path.resolve(url);
	}
	if (directory)
		requireValue(
			!path.isAbsolute(directory) && !directory.split(/[\\/]/).includes('..'),
			'Invalid package repository directory',
		);
	return { repositoryUrl: url, packageDirectory: directory || null };
}

function acquire(report, repositoryUrl, options, role = 'library') {
	let baseline = report.baselines.find((item) => item.repositoryUrl === repositoryUrl);
	if (!baseline) {
		baseline = {
			id: `repo-${fingerprint(repositoryUrl).slice(0, 16)}`,
			repositoryUrl,
			role,
			receipts: [],
		};
		report.baselines.push(baseline);
	}
	const receipt = acquireUpstreamBaseline({
		repositoryUrl,
		checkoutParent: options.checkoutParent,
		timeoutMs: options.timeoutMs,
		now: options.now,
	});
	receipt.id = `${baseline.id}-${baseline.receipts.length + 1}`;
	baseline.receipts.push(receipt);
	baseline.currentReceiptId = receipt.id;
	return baseline;
}

function packageAt(receipt, packageName, directory) {
	const paths = directory
		? [`${directory}/package.json`]
		: git(receipt.checkoutPath, 'ls-files', '-z')
				.split('\0')
				.filter((file) => file === 'package.json' || file.endsWith('/package.json'));
	const matches = paths.flatMap((file) => {
		const manifest = readJson(confined(receipt.checkoutPath, file));
		return manifest.name === packageName ? [{ manifest, directory: path.posix.dirname(file) }] : [];
	});
	requireValue(
		matches.length === 1,
		`Expected one fetched manifest named ${packageName}; found ${matches.length}`,
	);
	return matches[0];
}

async function registryPackage(packageName, options, cache) {
	const parsed = parseInput(packageName);
	requireValue(
		parsed.kind === 'npm' && parsed.packageName === packageName && parsed.selector === null,
		'Expected an exact npm package name',
	);
	if (!cache.has(packageName)) {
		cache.set(
			packageName,
			(async () => {
				const { fetchJson } = await import('./react-port/preflight-lib.mjs');
				const data = await fetchJson(
					`https://registry.npmjs.org/${encodeURIComponent(packageName)}`,
					{
						fetchImpl: options.fetchImpl ?? globalThis.fetch,
						allowedHosts: new Set(['registry.npmjs.org']),
						maxBytes: 32 * 1024 * 1024,
						requestTimeoutMs: options.timeoutMs ?? 30_000,
					},
				);
				requireValue(
					data.name === packageName && record(data.versions),
					`Invalid npm metadata for ${packageName}`,
				);
				return { data, fetchedAt: (options.now ?? now)() };
			})(),
		);
	}
	return cache.get(packageName);
}

async function releaseIdentity(dependency, options, cache) {
	const { data, fetchedAt } = await registryPackage(dependency.package, options, cache);
	requireValue(nonempty(dependency.version), `Missing pinned version for ${dependency.package}`);
	compareVersions(dependency.version, dependency.version);
	const pinned = data.versions[dependency.version];
	requireValue(
		pinned?.name === dependency.package && pinned.version === dependency.version,
		`Published identity not found for ${dependency.package}@${dependency.version}`,
	);
	const latestStableVersion = selectHighestSatisfyingVersion(Object.keys(data.versions), '*');
	requireValue(latestStableVersion, `No stable release found for ${dependency.package}`);
	const latest = data.versions[latestStableVersion];
	requireValue(
		latest?.name === dependency.package && latest.version === latestStableVersion,
		'Invalid latest stable release identity',
	);
	return {
		package: dependency.package,
		pinnedVersion: dependency.version,
		latestStableVersion,
		registryUrl: `https://registry.npmjs.org/${encodeURIComponent(dependency.package)}`,
		registryFetchedAt: fetchedAt,
		repository: pinned.repository ?? null,
		publishedExports: manifestExports(pinned),
		publishedTypes: pinned.types ?? pinned.typings ?? null,
		publishedLicense: pinned.license ?? null,
	};
}

function releaseKey(releases) {
	return fingerprint(releases.map(({ registryFetchedAt, ...release }) => release));
}

function dependenciesFor(binding, status, policy) {
	const dependencies = [];
	if (nonempty(status?.upstream?.package)) dependencies.push({ ...status.upstream });
	for (const surface of policy.surfaces ?? []) {
		const dependency = surface?.dependency;
		if (
			!nonempty(dependency?.package) ||
			dependencies.some((item) => item.package === dependency.package)
		)
			continue;
		dependencies.push({ ...dependency });
	}
	const lockFile = path.join(binding.directory, 'audit/upstream.lock.json');
	if (existsSync(lockFile)) {
		const identity = readJson(confined(binding.directory, 'audit/upstream.lock.json')).identity;
		if (nonempty(identity?.packageName)) {
			let dependency = dependencies.find((item) => item.package === identity.packageName);
			if (!dependency) {
				dependency = { package: identity.packageName };
				dependencies.push(dependency);
			}
			if (!dependency.version || satisfiesRange(identity.version, dependency.version))
				dependency.version = identity.version;
			if (identity.repository?.owner && identity.repository?.repo)
				dependency.repository = {
					url: `https://github.com/${identity.repository.owner}/${identity.repository.repo}.git`,
					directory: identity.repository.subdirectory,
				};
		}
	}
	return dependencies;
}

function bindingFacts(root, binding, status, policy) {
	const relative = path.relative(root, binding.directory).split(path.sep).join('/');
	const files = git(root, 'ls-files', '-z', '--', relative)
		.split('\0')
		.filter(Boolean)
		.map((file) => {
			const absolute = path.join(root, file);
			requireValue(
				!lstatSync(absolute).isSymbolicLink(),
				`Symlink requires manual inspection: ${file}`,
			);
			const bytes = readFileSync(confined(root, file));
			return {
				path: path.posix.relative(relative, file),
				bytes: bytes.length,
				fingerprint: fingerprint(bytes.toString('base64')),
			};
		});
	const trees = new Map();
	for (const file of files) {
		const match =
			/^(upstream\/(?:source|src|bundle|dist|test|tests)|(?:tests|typetests)\/(?:pristine|upstream)|upstream)(?:\/|$)/.exec(
				file.path,
			);
		if (!match) continue;
		const treePath = match[1];
		const kind =
			treePath === 'upstream'
				? 'snapshot'
				: /(?:bundle|dist)$/.test(treePath)
					? 'bundle'
					: /(?:source|src)$/.test(treePath)
						? 'source'
						: 'test';
		const tree = trees.get(treePath) ?? { path: treePath, kind, files: 0, bytes: 0 };
		tree.files++;
		tree.bytes += file.bytes;
		trees.set(treePath, tree);
	}
	const references = new Set(
		files
			.filter((file) => /(?:lock|ledger|mapping|matrix|manifest|tsconfig|verif)/i.test(file.path))
			.map((file) => `${relative}/${file.path}`),
	);
	for (const tree of trees.values()) {
		try {
			git(root, 'grep', '-l', '-F', '--', `${relative}/${tree.path}`, '.', ':!**/upstream/**')
				.trim()
				.split('\n')
				.filter(Boolean)
				.forEach((file) => references.add(file));
		} catch (error) {
			if (error.status !== 1) throw error;
		}
	}
	return {
		exports: binding.manifest.exports ?? null,
		exportPaths: manifestExports(binding.manifest),
		dependencies: binding.manifest.dependencies ?? {},
		peerDependencies: binding.manifest.peerDependencies ?? {},
		types: binding.manifest.types ?? binding.manifest.typings ?? null,
		license: binding.manifest.license ?? null,
		verified: status?.verified ?? null,
		policy,
		files,
		reduction: {
			assessment: trees.size ? 'candidates-require-proof' : 'no-snapshot-candidate-observed',
			trees: [...trees.values()].sort((a, b) => a.path.localeCompare(b.path)),
			ownedAdaptersToRetain: sorted(
				(policy.surfaces ?? [])
					.filter((surface) => surface.ownership === 'adapter')
					.flatMap((surface) => surface.files ?? []),
			),
			copiedImplementationsToReview: sorted(
				(policy.surfaces ?? [])
					.filter((surface) => surface.ownership === 'copied')
					.flatMap((surface) => surface.files ?? []),
			),
			referencesToMigrate: sorted(references),
			referenceCoverage:
				'Binding metadata and tracked repository references to observed snapshot paths; inspect dynamic paths during updates.',
			requiredProof: [
				'Preserve supported exports, public types, package consumption, licenses and notices.',
				'Demonstrate framework-neutral behavior before replacing owned code with direct upstream imports.',
				'Retain focused lifecycle, cleanup and SSR evidence for adapters and provenance/parity for copied implementation.',
				'Migrate locks, mappings, verifiers and type programs before deleting inputs; invalidate affected pass results.',
			],
		},
	};
}

function baselineShas(report, ids) {
	return Object.fromEntries(
		ids.map((id) => [
			id,
			current(report.baselines.find((baseline) => baseline.id === id)).sha ?? null,
		]),
	);
}

function addFinding(report, binding, category, summary) {
	report.findings.push({
		id: `finding-${fingerprint([binding.name, category, summary]).slice(0, 20)}`,
		binding: binding.name,
		category,
		origin: 'collection',
		summary,
		evidenceIds: [`facts-${fingerprint(binding.name).slice(0, 16)}`],
		baselines: baselineShas(report, binding.baselineIds),
		releaseFingerprint: releaseKey(binding.releases),
		freshness: binding.collection === 'complete' ? 'current' : 'incomplete',
		invalidations: [],
	});
}

/** Deterministic collection only. No fetched JavaScript or package validators run. */
export async function auditBindings({
	repositoryUrl = DEFAULT_REPOSITORY,
	bindings = [],
	all = false,
	...options
} = {}) {
	requireValue(
		Array.isArray(bindings) &&
			bindings.every(nonempty) &&
			(all ? bindings.length === 0 : bindings.length > 0),
		'Choose repeated --binding selectors or exclusive --all',
	);
	const report = {
		schemaVersion: 1,
		createdAt: (options.now ?? now)(),
		checkedAt: null,
		selection: null,
		baselines: [],
		bindings: [],
		findings: [],
		evidence: [],
		failures: [],
	};
	const octane = acquire(
		report,
		repositoryIdentity(repositoryUrl).repositoryUrl,
		options,
		'octane',
	);
	requireValue(
		current(octane).status === 'complete',
		`Unusable Octane baseline: ${current(octane).failure?.message}`,
	);
	report.octaneBaselineId = octane.id;
	const root = current(octane).checkoutPath;
	const packages = getBindingPackages(root);
	const inventory = readRepositoryCapabilityInventory(root);
	const names = packages.map((binding) => binding.name).sort();
	const selected = all
		? names
		: sorted(
				bindings.map((selector) => {
					const match = packages.find(
						(binding) => binding.name === selector || binding.dir === selector,
					);
					requireValue(match, `Unknown binding selector: ${selector}`);
					return match.name;
				}),
			);
	report.selection = {
		mode: all ? 'all' : 'bindings',
		requested: sorted(bindings),
		bindings: selected,
		inventoryNames: names,
		inventoryFingerprint: inventory.fingerprint,
		coverage: 'current',
	};
	const cache = new Map();
	for (const name of selected) {
		const pkg = packages.find((binding) => binding.name === name);
		const metadata = inventory.bindings[name];
		const binding = {
			name,
			directory: `packages/${pkg.dir}`,
			collection: 'complete',
			baselineIds: [octane.id],
			releases: [],
			failures: [...(metadata.metadataErrors ?? [])],
			facts: null,
		};
		report.bindings.push(binding);
		try {
			let policy;
			try {
				policy = readBindingSurfacePolicy(pkg.directory);
			} catch (error) {
				policy = {
					mode: 'unverified',
					valid: false,
					issues: [error.message],
					surfaces: [],
					requiresCopiedEvidence: true,
					requiresLifecycleEvidence: true,
				};
			}
			binding.facts = bindingFacts(root, pkg, metadata.status, policy);
			if (!policy.valid)
				binding.failures.push({
					code: 'invalid-surface-policy',
					message: policy.issues.join('; '),
				});
			const dependencies = dependenciesFor(pkg, metadata.status, policy);
			if (!dependencies.length)
				binding.failures.push({
					code: 'missing-upstream-identity',
					message: 'No upstream package identity is recorded',
				});
			for (const dependency of dependencies) {
				let release = { package: dependency.package, pinnedVersion: dependency.version ?? null };
				try {
					release = await releaseIdentity(dependency, options, cache);
				} catch (error) {
					binding.failures.push({
						code: 'release-unavailable',
						package: dependency.package,
						message: error.message,
					});
				}
				binding.releases.push(release);
				try {
					const source = repositoryIdentity(
						release.repository ?? dependency.repository ?? dependency.source,
					);
					const baseline =
						report.baselines.find((item) => item.repositoryUrl === source.repositoryUrl) ??
						acquire(report, source.repositoryUrl, options);
					binding.baselineIds = sorted([...binding.baselineIds, baseline.id]);
					release.repositoryId = baseline.id;
					const receipt = current(baseline);
					requireValue(
						receipt.status === 'complete',
						receipt.failure?.message ?? 'Library baseline unavailable',
					);
					const upstream = packageAt(receipt, dependency.package, source.packageDirectory);
					release.packageDirectory = upstream.directory;
					release.defaultBranchVersion = upstream.manifest.version ?? null;
					release.defaultBranchExports = manifestExports(upstream.manifest);
				} catch (error) {
					binding.failures.push({
						code: 'library-unavailable',
						package: dependency.package,
						message: error.message,
					});
				}
			}
		} catch (error) {
			binding.failures.push({ code: 'collection-failed', message: error.message });
			// Even invalid ownership/metadata must not silently omit the reduction assessment.
			if (!binding.facts)
				binding.facts = { reduction: { assessment: 'incomplete', reason: error.message } };
		}
		binding.collection = binding.failures.length ? 'incomplete' : 'complete';
		report.evidence.push({
			id: `facts-${fingerprint(name).slice(0, 16)}`,
			binding: name,
			origin: 'collection',
			kind: 'binding-facts',
			baselines: baselineShas(report, binding.baselineIds),
			factsFingerprint: fingerprint(binding.facts),
		});
		addFinding(
			report,
			binding,
			'unverified-compatibility',
			'Compatibility requires focused consumer evidence; collection does not execute tests.',
		);
		if (binding.facts.policy?.mode === 'legacy' || binding.failures.length)
			addFinding(
				report,
				binding,
				'metadata-drift',
				binding.failures.length
					? 'Metadata or upstream collection is incomplete; inspect binding failures.'
					: 'Surface ownership is undeclared; existing strict evidence obligations remain.',
			);
		if (
			binding.facts.policy?.valid &&
			binding.facts.policy.surfaces?.some((surface) => surface.ownership === 'imported')
		)
			addFinding(
				report,
				binding,
				'convenience-import',
				'Declared direct dependency re-exports are observed. Prefer direct upstream imports for those unchanged surfaces; retain owned Octane adapters and confirm package/types/integration evidence.',
			);
		const reduction = binding.facts.reduction;
		if (reduction.trees?.length || reduction.copiedImplementationsToReview?.length)
			addFinding(
				report,
				binding,
				'reduction-candidate',
				'Inspect copied implementations and snapshots for redundancy; removal requires the recorded preservation proof.',
			);
		for (const release of binding.releases) {
			if (
				release.latestStableVersion &&
				compareVersions(release.latestStableVersion, release.pinnedVersion) > 0
			)
				addFinding(
					report,
					binding,
					'dependency-update',
					`${release.package}: pinned ${release.pinnedVersion}; latest stable published release ${release.latestStableVersion}. Default-branch changes are separate source facts.`,
				);
			const missing =
				release.publishedExports?.filter((entry) => !binding.facts.exportPaths?.includes(entry)) ??
				[];
			if (missing.length)
				addFinding(
					report,
					binding,
					'convenience-import',
					`${release.package}@${release.pinnedVersion} publishes ${missing.join(', ')} without matching binding convenience paths. Availability alone does not demonstrate a functional gap or framework neutrality.`,
				);
		}
	}
	return revalidateAudit(report, options);
}

function validateBaselineMap(report, binding, baselines) {
	requireValue(
		record(baselines) && equal(Object.keys(baselines).sort(), [...binding.baselineIds].sort()),
		'Finding/evidence must include every binding repository dependency',
	);
	for (const [id, sha] of Object.entries(baselines)) {
		const baseline = report.baselines.find((item) => item.id === id);
		requireValue(
			baseline &&
				(sha === null ||
					baseline.receipts.some(
						(receipt) => receipt.status === 'complete' && receipt.sha === sha,
					)),
			'Unknown baseline SHA reference',
		);
	}
}

/** Skill findings belong in this artifact. Their evidence and baseline bindings are checked like collected findings. */
export function validateAuditReport(report, { findingIds = [], verifyCheckouts = true } = {}) {
	requireValue(
		record(report) && report.schemaVersion === 1,
		'Unsupported audit report schemaVersion',
	);
	for (const key of ['baselines', 'bindings', 'findings', 'evidence', 'failures'])
		requireValue(Array.isArray(report[key]), `Invalid report ${key}`);
	const selection = report.selection;
	requireValue(
		record(selection) &&
			['all', 'bindings'].includes(selection.mode) &&
			Array.isArray(selection.bindings) &&
			Array.isArray(selection.inventoryNames) &&
			selection.bindings.every(nonempty) &&
			equal(selection.bindings, sorted(selection.bindings)) &&
			selection.bindings.every((name) => selection.inventoryNames.includes(name)),
		'Invalid report selection',
	);
	requireValue(
		equal(report.bindings.map((binding) => binding.name).sort(), selection.bindings),
		'Report binding set differs from exact selection',
	);
	requireValue(
		selection.mode !== 'all' || equal(selection.bindings, selection.inventoryNames),
		'All-selection does not match the original inventory',
	);
	for (const key of ['baselines', 'evidence', 'findings']) {
		requireValue(
			report[key].every((item) => record(item) && nonempty(item.id)) &&
				new Set(report[key].map((item) => item.id)).size === report[key].length,
			`Invalid or duplicate ${key} IDs`,
		);
	}
	requireValue(
		report.baselines.filter((item) => item.role === 'octane').length === 1 &&
			report.baselines.some(
				(item) => item.id === report.octaneBaselineId && item.role === 'octane',
			),
		'Invalid Octane baseline',
	);
	for (const baseline of report.baselines) {
		requireValue(
			repositoryIdentity(baseline.repositoryUrl).repositoryUrl === baseline.repositoryUrl &&
				Array.isArray(baseline.receipts) &&
				baseline.receipts.length &&
				current(baseline),
			'Invalid baseline receipt history',
		);
		requireValue(
			new Set(baseline.receipts.map((receipt) => receipt.id)).size === baseline.receipts.length,
			'Duplicate receipt IDs',
		);
		for (const receipt of baseline.receipts) {
			requireValue(
				receipt.repositoryUrl === baseline.repositoryUrl &&
					['complete', 'incomplete'].includes(receipt.status),
				'Invalid receipt identity',
			);
			if (receipt.status !== 'complete') {
				requireValue(
					!receipt.sha && !receipt.checkoutPath && record(receipt.failure),
					'Incomplete receipt contains a successful identity',
				);
				continue;
			}
			requireValue(
				fullSha(receipt.sha) &&
					nonempty(receipt.defaultBranch) &&
					Number.isFinite(Date.parse(receipt.fetchedAt)) &&
					receipt.checkoutStatus === 'clean' &&
					path.isAbsolute(receipt.checkoutPath),
				'Invalid successful baseline receipt',
			);
			if (verifyCheckouts) {
				requireValue(
					realpathSync(receipt.checkoutPath) ===
						realpathSync(git(receipt.checkoutPath, 'rev-parse', '--show-toplevel').trim()),
					'Receipt path is not a repository root',
				);
				requireValue(
					git(receipt.checkoutPath, 'rev-parse', 'HEAD').trim() === receipt.sha &&
						!git(receipt.checkoutPath, 'status', '--porcelain=v1', '--untracked-files=all').trim(),
					'Receipt checkout is dirty or differs from its SHA',
				);
			}
		}
	}
	for (const binding of report.bindings) {
		requireValue(
			['complete', 'incomplete'].includes(binding.collection) &&
				record(binding.facts) &&
				Array.isArray(binding.failures) &&
				Array.isArray(binding.releases) &&
				Array.isArray(binding.baselineIds) &&
				binding.baselineIds.includes(report.octaneBaselineId) &&
				binding.baselineIds.every((id) => report.baselines.some((baseline) => baseline.id === id)),
			'Invalid binding collection',
		);
	}
	for (const evidence of report.evidence) {
		const binding = report.bindings.find((item) => item.name === evidence.binding);
		requireValue(
			binding && ['collection', 'assessment'].includes(evidence.origin),
			'Unknown evidence binding/origin',
		);
		validateBaselineMap(report, binding, evidence.baselines);
		if (evidence.origin === 'collection')
			requireValue(
				evidence.factsFingerprint === fingerprint(binding.facts),
				'Collected facts fingerprint mismatch',
			);
		else
			requireValue(
				nonempty(evidence.location) &&
					nonempty(evidence.observation) &&
					Object.values(evidence.baselines).every(fullSha),
				'Assessment evidence requires a location, observation and successful SHA baselines',
			);
	}
	for (const finding of report.findings) {
		const binding = report.bindings.find((item) => item.name === finding.binding);
		requireValue(
			binding &&
				FINDING_CATEGORIES.includes(finding.category) &&
				['collection', 'assessment'].includes(finding.origin) &&
				nonempty(finding.summary),
			'Invalid finding binding/category/origin/summary',
		);
		validateBaselineMap(report, binding, finding.baselines);
		requireValue(
			Array.isArray(finding.evidenceIds) &&
				finding.evidenceIds.length &&
				finding.evidenceIds.every((id) =>
					report.evidence.some(
						(evidence) =>
							evidence.id === id &&
							evidence.binding === finding.binding &&
							equal(evidence.baselines, finding.baselines),
					),
				),
			'Unresolved evidence reference or mismatched evidence baselines',
		);
		if (finding.origin === 'assessment') {
			requireValue(
				Number.isFinite(Date.parse(finding.assessedAt)) &&
					Object.values(finding.baselines).every(fullSha) &&
					finding.evidenceIds.some((id) =>
						report.evidence.some(
							(evidence) => evidence.id === id && evidence.origin === 'assessment',
						),
					),
				'Assessment requires dated consumer evidence at successful baselines',
			);
			for (const [id, sha] of Object.entries(finding.baselines)) {
				const firstReceipt = report.baselines
					.find((baseline) => baseline.id === id)
					.receipts.find((receipt) => receipt.sha === sha);
				requireValue(
					Date.parse(finding.assessedAt) >= Date.parse(firstReceipt.fetchedAt),
					'Assessment predates acquisition of its source baseline',
				);
			}
		}
		if (['functional-gap', 'compatibility-defect'].includes(finding.category))
			requireValue(
				finding.origin === 'assessment' &&
					nonempty(finding.consumerFailure?.scenario) &&
					nonempty(finding.consumerFailure?.expected) &&
					nonempty(finding.consumerFailure?.actual),
				'Functional/compatibility finding requires a concrete consumer failure',
			);
		requireValue(
			Array.isArray(finding.invalidations ?? []) &&
				(finding.invalidations ?? []).every((item) => record(item) && nonempty(item.id)),
			'Invalid finding invalidation history',
		);
	}
	for (const id of findingIds)
		requireValue(
			report.findings.some((finding) => finding.id === id),
			`Unknown finding ID: ${id}`,
		);
	return report;
}

function assessmentFingerprint(finding) {
	return fingerprint({
		baselines: finding.baselines,
		assessedAt: finding.assessedAt ?? null,
		releaseFingerprint: finding.releaseFingerprint ?? null,
		evidenceIds: finding.evidenceIds,
	});
}

function invalidate(finding, reasons, checkedAt) {
	finding.invalidations ??= [];
	for (const reason of reasons) {
		const revision = assessmentFingerprint(finding);
		const id = fingerprint({ reason, revision });
		if (!finding.invalidations.some((item) => item.id === id))
			finding.invalidations.push({
				id,
				assessmentFingerprint: revision,
				observedAt: checkedAt,
				...reason,
			});
	}
}

/** Refresh receipts, never rewrite an old finding's assessment baseline to the replacement SHA. */
export async function revalidateAudit(input, options = {}) {
	validateAuditReport(input, { findingIds: options.findingIds });
	const report = structuredClone(input);
	report.checkedAt = (options.now ?? now)();
	for (const baseline of report.baselines)
		acquire(report, baseline.repositoryUrl, options, baseline.role);
	const octane = current(
		report.baselines.find((baseline) => baseline.id === report.octaneBaselineId),
	);
	if (octane.status === 'complete') {
		try {
			const inventory = readRepositoryCapabilityInventory(octane.checkoutPath);
			report.selection.latestInventoryNames = Object.keys(inventory.bindings).sort();
			report.selection.latestInventoryFingerprint = inventory.fingerprint;
			if (
				report.selection.mode === 'all' &&
				!equal(report.selection.inventoryNames, report.selection.latestInventoryNames)
			)
				report.selection.coverage = 'stale';
		} catch (error) {
			report.failures.push({ code: 'inventory-unavailable', message: error.message });
		}
	}
	const cache = new Map();
	for (const binding of report.bindings) {
		const releases = [];
		const failures = [];
		for (const release of binding.releases) {
			try {
				const next = await releaseIdentity(
					{ package: release.package, version: release.pinnedVersion },
					options,
					cache,
				);
				const priorRepository = release.repository ? repositoryIdentity(release.repository) : null;
				const nextRepository = next.repository ? repositoryIdentity(next.repository) : null;
				if (!equal(priorRepository, nextRepository))
					failures.push({
						code: 'repository-identity-changed',
						package: release.package,
						message:
							'Published repository identity changed or disappeared; run a new audit to acquire and bind the intended source.',
					});
				// Keep source facts anchored to the collection receipt. Fresh Git SHAs are checked separately.
				releases.push({ ...release, ...next });
			} catch (error) {
				failures.push({
					code: 'release-refresh-unavailable',
					package: release.package,
					message: error.message,
				});
			}
		}
		binding.releaseCheck = {
			checkedAt: report.checkedAt,
			failures,
			fingerprint: releaseKey(releases),
			releases,
		};
		for (const finding of report.findings.filter((item) => item.binding === binding.name)) {
			const reasons = [];
			let incomplete = binding.collection !== 'complete' || failures.length > 0;
			for (const id of binding.baselineIds) {
				const receipt = current(report.baselines.find((baseline) => baseline.id === id));
				if (receipt.status !== 'complete') {
					incomplete = true;
					reasons.push({ code: 'fetch-failed', repositoryId: id });
				} else if (finding.baselines[id] !== receipt.sha)
					reasons.push({
						code: 'upstream-changed',
						repositoryId: id,
						from: finding.baselines[id],
						to: receipt.sha,
					});
			}
			if (failures.length) reasons.push({ code: 'release-refresh-failed' });
			else if (
				(finding.releaseFingerprint ?? releaseKey(binding.releases)) !==
				binding.releaseCheck.fingerprint
			)
				reasons.push({ code: 'release-changed', to: binding.releaseCheck.fingerprint });
			invalidate(finding, reasons, report.checkedAt);
			const priorChange = finding.invalidations.some(
				(item) =>
					['upstream-changed', 'release-changed'].includes(item.code) &&
					item.assessmentFingerprint === assessmentFingerprint(finding),
			);
			finding.freshness = incomplete
				? 'incomplete'
				: reasons.length || priorChange
					? 'stale'
					: 'current';
		}
	}
	return report;
}

export function auditExitCode(report, findingIds = []) {
	const findings = findingIds.length
		? report.findings.filter((finding) => findingIds.includes(finding.id))
		: report.findings;
	return report.failures.length ||
		report.selection.coverage !== 'current' ||
		report.baselines.some((baseline) => current(baseline).status !== 'complete') ||
		findings.some((finding) => finding.freshness !== 'current')
		? 2
		: 0;
}

export function renderAuditReport(report, findingIds = []) {
	validateAuditReport(report, { findingIds, verifyCheckouts: false });
	const lines = [
		`Binding audit: ${auditExitCode(report, findingIds) ? 'partial or stale' : 'collection and freshness complete'}`,
		`Selected (${report.selection.mode}): ${report.selection.bindings.join(', ') || '(none)'}`,
		`Checked: ${report.checkedAt}; selection coverage: ${report.selection.coverage}`,
		'Compatibility is unverified unless an identified assessment provides consumer evidence.',
		'',
	];
	for (const baseline of report.baselines) {
		const receipt = current(baseline);
		lines.push(
			`${baseline.role}: ${baseline.repositoryUrl} — ${receipt.status === 'complete' ? `${receipt.defaultBranch} ${receipt.sha} fetched ${receipt.fetchedAt}` : `INCOMPLETE: ${receipt.failure.message}`}`,
		);
	}
	for (const binding of report.bindings) {
		lines.push('', `${binding.name}: ${binding.collection}`);
		for (const failure of [...binding.failures, ...(binding.releaseCheck?.failures ?? [])])
			lines.push(`  ${failure.code}: ${failure.message}`);
		for (const release of binding.releases)
			lines.push(
				`  ${release.package}: pinned ${release.pinnedVersion ?? 'unknown'}, latest stable ${release.latestStableVersion ?? 'unverified'}, default-branch package version ${release.defaultBranchVersion ?? 'unknown'}`,
			);
		lines.push(`  Reduction: ${binding.facts.reduction.assessment}`);
		for (const tree of binding.facts.reduction.trees ?? [])
			lines.push(
				`  ${tree.path}: ${tree.files} files, ${tree.bytes} bytes (candidate; preservation proof required)`,
			);
		for (const finding of report.findings.filter(
			(item) =>
				item.binding === binding.name && (!findingIds.length || findingIds.includes(item.id)),
		)) {
			lines.push(
				`  [${finding.id}] ${finding.category} / ${finding.origin} / ${finding.freshness}: ${finding.summary}`,
			);
			if (finding.consumerFailure)
				lines.push(
					`    Scenario: ${finding.consumerFailure.scenario}; expected: ${finding.consumerFailure.expected}; actual: ${finding.consumerFailure.actual}`,
				);
			for (const id of finding.evidenceIds) {
				const evidence = report.evidence.find((item) => item.id === id);
				lines.push(
					`    Evidence ${id}: ${evidence.origin === 'assessment' ? `${evidence.location}: ${evidence.observation}` : 'collected binding facts and file fingerprints'}`,
				);
			}
		}
	}
	return `${sanitizeForReport(lines.join('\n'))}\n`;
}
