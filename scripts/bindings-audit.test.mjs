import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { repositoryIdentity, validateAuditReport } from './bindings-audit-lib.mjs';

const cli = new URL('./bindings-audit.mjs', import.meta.url).href;

function git(root, ...args) {
	return execFileSync('git', ['-C', root, ...args], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	}).trim();
}

function fixture(t) {
	const root = mkdtempSync(path.join(tmpdir(), 'bindings-audit-test-'));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const write = (directory, name, value) => {
		const file = path.join(directory, name);
		mkdirSync(path.dirname(file), { recursive: true });
		writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
	};
	const repo = (name) => {
		const directory = path.join(root, name);
		mkdirSync(directory);
		git(directory, 'init', '--quiet', '--initial-branch=main');
		git(directory, 'config', 'user.email', 'fixture@example.test');
		git(directory, 'config', 'user.name', 'Fixture');
		return directory;
	};
	const commit = (directory) => {
		git(directory, 'add', '.');
		git(directory, 'commit', '--quiet', '-m', 'Fixture change');
		return git(directory, 'rev-parse', 'HEAD');
	};
	const library = repo('library');
	for (const name of ['engine', 'other-engine']) {
		write(library, `packages/${name}/package.json`, {
			name,
			version: '2.1.0-dev.1',
			exports: { '.': './index.js', './vanilla': './vanilla.js' },
			types: './index.d.ts',
			license: 'MIT',
		});
		write(library, `packages/${name}/index.js`, 'export const value = 1;');
	}
	commit(library);
	const source = repo('octane');
	write(source, 'package.json', { name: 'octane-fixture', private: true });
	write(source, 'packages/octane/package.json', { name: 'octane', version: '0.2.0' });
	write(source, 'packages/octane/src/index.ts', 'export const runtime = true;');
	write(source, 'docs/differences-from-react.md', 'Native events.');
	write(source, 'packages/octane-mcp-server/package.json', {
		name: '@octanejs/mcp-server',
		version: '1.0.0',
	});
	write(
		source,
		'packages/octane-mcp-server/src/bridge.js',
		'export const KNOWN_BINDINGS = {}; export const KNOWN_NATIVE_BINDINGS = new Set([]); export const KNOWN_VANILLA_CORES = {}; export const REACT_API_MAP = {};',
	);
	const addBinding = (name, upstream = 'engine') => {
		write(source, `packages/${name}/package.json`, {
			name: `@octanejs/${name}`,
			version: '0.1.0',
			exports: { '.': './src/index.ts' },
			types: './src/index.ts',
			license: 'MIT',
			dependencies: { [upstream]: '1.0.0' },
			peerDependencies: { octane: '*' },
			scripts: { test: 'exit 99' },
		});
		write(source, `packages/${name}/src/index.ts`, `export * from '${upstream}';`);
		write(source, `packages/${name}/status.json`, {
			upstream: { package: upstream, version: '1.0.0' },
			verified: '2020-01-01',
		});
	};
	addBinding('alpha');
	addBinding('beta', 'other-engine');
	write(source, 'packages/alpha/upstream/source/engine.js', 'export const value = 1;');
	write(source, 'packages/alpha/upstream/bundle/engine.js', 'export const value=1;');
	write(source, 'packages/alpha/upstream/test/engine.test.js', 'test("engine", () => {});');
	write(source, 'packages/alpha/audit/evidence-matrix.json', { preserve: true });
	write(source, 'scripts/verify-alpha.mjs', "const source = 'packages/alpha/upstream/source';");
	write(source, 'docs/react-port/campaigns/paused.json', { paused: true });
	commit(source);
	const registry = Object.fromEntries(
		['engine', 'other-engine'].map((name) => [
			name,
			{
				name,
				'dist-tags': { latest: '2.0.0' },
				versions: Object.fromEntries(
					['1.0.0', '2.0.0'].map((version) => [
						version,
						{
							name,
							version,
							repository: { url: library, directory: `packages/${name}` },
							exports: { '.': './index.js', './vanilla': './vanilla.js' },
							types: './index.d.ts',
							license: 'MIT',
						},
					]),
				),
			},
		]),
	);
	const output = path.join(root, 'report.json');
	const invoke = (args, metadata = registry) =>
		spawnSync(
			process.execPath,
			[
				'--input-type=module',
				'-e',
				`import { runCli } from ${JSON.stringify(cli)};
		 const metadata = ${JSON.stringify(metadata)};
		 process.exitCode = await runCli(${JSON.stringify(args)}, {
		   checkoutParent: ${JSON.stringify(path.join(root, 'checkouts'))},
		   fetchImpl: async (url) => { const data = metadata[decodeURIComponent(new URL(url).pathname.slice(1))];
		     return new Response(JSON.stringify(data ?? {}), {status: data ? 200 : 404}); }
		 });`,
			],
			{ encoding: 'utf8', cwd: source },
		);
	const audit = (args = ['--all'], metadata) =>
		invoke(['audit', '--repository', source, ...args, '--output', output], metadata);
	return { root, source, library, write, commit, addBinding, registry, output, invoke, audit };
}

test('CLI selects the exact fetched binding set and emits parseable facts without mutating sources', (t) => {
	const f = fixture(t);
	f.write(f.source, 'packages/alpha/status.json', { dirty: 'preserve' });
	f.write(f.source, 'untracked.txt', 'preserve');
	const before = git(f.source, 'status', '--porcelain');
	const result = f.audit([
		'--binding',
		'alpha',
		'--binding',
		'@octanejs/alpha',
		'--binding',
		'beta',
	]);
	assert.equal(result.status, 0, result.stderr);
	const report = JSON.parse(result.stdout);
	assert.deepEqual(report.selection.bindings, ['@octanejs/alpha', '@octanejs/beta']);
	assert.equal(report.bindings[0].facts.verified, '2020-01-01');
	assert.equal(report.baselines.length, 2, 'same library repository is acquired once');
	assert.deepEqual(
		report.bindings.map((binding) => binding.releases[0].package),
		['engine', 'other-engine'],
	);
	assert.equal(report.bindings[0].releases[0].latestStableVersion, '2.0.0');
	assert.equal(report.bindings[0].releases[0].defaultBranchVersion, '2.1.0-dev.1');
	assert.ok(
		report.bindings[0].facts.files.some((file) => file.path === 'src/index.ts' && file.fingerprint),
	);
	assert.deepEqual(report.bindings[0].facts.reduction.trees.map((tree) => tree.kind).sort(), [
		'bundle',
		'source',
		'test',
	]);
	assert.ok(
		report.bindings[0].facts.reduction.referencesToMigrate.includes('scripts/verify-alpha.mjs'),
	);
	assert.equal(report.bindings[1].facts.reduction.trees.length, 0);
	assert.ok(report.findings.some((finding) => finding.category === 'convenience-import'));
	assert.ok(!report.findings.some((finding) => finding.category === 'functional-gap'));
	assert.equal(git(f.source, 'status', '--porcelain'), before);
	assert.equal(
		readFileSync(path.join(f.source, 'packages/alpha/status.json'), 'utf8'),
		'{"dirty":"preserve"}',
	);
	assert.deepEqual(JSON.parse(readFileSync(f.output, 'utf8')), report);
});

test('one selector and all-selection are exact; unknown or conflicting selectors fail explicitly', (t) => {
	const f = fixture(t);
	const single = f.audit(['--binding', 'beta']);
	assert.equal(single.status, 0, single.stderr);
	assert.deepEqual(JSON.parse(single.stdout).selection.bindings, ['@octanejs/beta']);
	const all = f.audit();
	assert.equal(all.status, 0, all.stderr);
	assert.deepEqual(JSON.parse(all.stdout).selection.bindings, [
		'@octanejs/alpha',
		'@octanejs/beta',
	]);
	for (const args of [['--binding', 'unknown'], ['--all', '--binding', 'alpha'], []]) {
		const result = f.audit(args);
		assert.equal(result.status, 1);
		assert.equal(result.stdout, '');
		assert.match(result.stderr, /selector|--binding/);
	}
});

test('partial library and malformed-status results keep successful independent bindings and parseable JSON', (t) => {
	const f = fixture(t);
	const registry = structuredClone(f.registry);
	registry['other-engine'].versions['1.0.0'].repository.url = path.join(f.root, 'missing.git');
	const partial = f.audit(undefined, registry);
	assert.equal(partial.status, 2, partial.stderr);
	const report = JSON.parse(partial.stdout);
	assert.equal(report.bindings[0].collection, 'complete');
	assert.equal(report.bindings[1].collection, 'incomplete');
	assert.ok(report.bindings[1].failures.some((failure) => failure.code === 'library-unavailable'));
	assert.match(partial.stderr, /partial/);
	f.write(f.source, 'packages/beta/status.json', '{bad json');
	f.commit(f.source);
	const broken = f.audit();
	assert.equal(broken.status, 2, broken.stderr);
	const brokenReport = JSON.parse(broken.stdout);
	assert.equal(brokenReport.bindings[0].collection, 'complete');
	assert.ok(brokenReport.bindings[1].failures.some((failure) => failure.code === 'invalid-status'));
	assert.ok(brokenReport.bindings.every((binding) => binding.facts.reduction.assessment));
});

test('shared repository advancement invalidates every dependent finding and repeated refresh stays stale', (t) => {
	const f = fixture(t);
	assert.equal(f.audit().status, 0);
	const initial = JSON.parse(readFileSync(f.output, 'utf8'));
	const oldSha = git(f.library, 'rev-parse', 'HEAD');
	f.write(f.library, 'changed.txt', 'new upstream source');
	const newSha = f.commit(f.library);
	const refresh = () => f.invoke(['revalidate', '--input', f.output]);
	const changed = refresh();
	assert.equal(changed.status, 2, changed.stderr);
	const first = JSON.parse(changed.stdout);
	assert.ok(first.findings.every((finding) => finding.freshness === 'stale'));
	assert.ok(
		first.findings.every((finding) =>
			finding.invalidations.some((entry) => entry.from === oldSha && entry.to === newSha),
		),
	);
	assert.deepEqual(
		first.findings.map((finding) => finding.id),
		initial.findings.map((finding) => finding.id),
	);
	const repeated = refresh();
	assert.equal(repeated.status, 2, repeated.stderr);
	const second = JSON.parse(repeated.stdout);
	assert.deepEqual(
		second.findings.map((finding) => finding.invalidations),
		first.findings.map((finding) => finding.invalidations),
	);
	assert.equal(second.baselines[1].receipts.length, 4);
	const human = f.invoke(['report', '--input', f.output]);
	assert.equal(human.status, 2, human.stderr);
	assert.match(human.stdout, /partial or stale/);
	assert.match(human.stdout, new RegExp(newSha));
	assert.equal(JSON.parse(readFileSync(f.output, 'utf8')).baselines[1].receipts.length, 5);
});

test('a new binding prevents an old all-selection claim even after repeated unchanged refresh', (t) => {
	const f = fixture(t);
	assert.equal(f.audit().status, 0);
	const originalSha = git(f.source, 'rev-parse', 'HEAD');
	f.addBinding('gamma');
	f.commit(f.source);
	for (let iteration = 0; iteration < 2; iteration++) {
		const result = f.invoke(['revalidate', '--input', f.output]);
		assert.equal(result.status, 2, result.stderr);
		const report = JSON.parse(result.stdout);
		assert.equal(report.selection.coverage, 'stale');
		assert.deepEqual(report.selection.bindings, ['@octanejs/alpha', '@octanejs/beta']);
		assert.ok(report.selection.latestInventoryNames.includes('@octanejs/gamma'));
	}
	git(f.source, 'reset', '--hard', originalSha);
	const restored = f.invoke(['revalidate', '--input', f.output]);
	assert.equal(restored.status, 2, restored.stderr);
	assert.equal(JSON.parse(restored.stdout).selection.coverage, 'stale');
});

test('saved reports refresh after their historical temporary checkouts expire', (t) => {
	const f = fixture(t);
	assert.equal(f.audit().status, 0);
	const original = JSON.parse(readFileSync(f.output, 'utf8'));
	const forged = structuredClone(original);
	forged.baselines[0].receipts.at(-1).sha = 'a'.repeat(40);
	assert.throws(() => validateAuditReport(forged), /differs from its SHA/);
	f.write(original.baselines[0].receipts.at(-1).checkoutPath, 'untracked.txt', 'modified cache');
	assert.throws(() => validateAuditReport(original), /checkout is dirty/);
	for (const baseline of original.baselines)
		for (const receipt of baseline.receipts)
			rmSync(receipt.checkoutPath, { recursive: true, force: true });
	const result = f.invoke(['revalidate', '--input', f.output]);
	assert.equal(result.status, 0, result.stderr);
	const refreshed = JSON.parse(result.stdout);
	for (const [index, baseline] of refreshed.baselines.entries()) {
		assert.deepEqual(baseline.receipts.slice(0, -1), original.baselines[index].receipts);
		const receipt = baseline.receipts.at(-1);
		assert.ok(existsSync(receipt.checkoutPath));
		assert.equal(git(receipt.checkoutPath, 'rev-parse', 'HEAD'), receipt.sha);
		assert.equal(git(receipt.checkoutPath, 'status', '--porcelain'), '');
	}
	assert.equal(f.invoke(['report', '--input', f.output]).status, 0);
});

test('failed refresh retains successful receipts without presenting their SHAs as current', (t) => {
	const f = fixture(t);
	assert.equal(f.audit().status, 0);
	rmSync(f.library, { recursive: true, force: true });
	const result = f.invoke(['revalidate', '--input', f.output]);
	assert.equal(result.status, 2, result.stderr);
	const report = JSON.parse(result.stdout);
	const library = report.baselines[1];
	assert.equal(library.receipts[0].status, 'complete');
	assert.equal(library.receipts.at(-1).status, 'incomplete');
	assert.equal(library.receipts.at(-1).sha, undefined);
	assert.ok(report.findings.every((finding) => finding.freshness === 'incomplete'));
});

function addAssessment(report) {
	const collected = report.findings.find((finding) => finding.binding === '@octanejs/alpha');
	const evidence = {
		id: 'consumer-reproduction',
		binding: collected.binding,
		origin: 'assessment',
		baselines: { ...collected.baselines },
		location: 'test receipt: fixture consumer',
		observation: 'The public cleanup scenario retained a listener after disposal.',
	};
	report.evidence.push(evidence);
	const finding = {
		id: 'alpha-consumer-cleanup',
		binding: collected.binding,
		category: 'compatibility-defect',
		origin: 'assessment',
		summary: 'Disposal retains a listener.',
		assessedAt: new Date().toISOString(),
		baselines: { ...collected.baselines },
		evidenceIds: [evidence.id],
		consumerFailure: {
			scenario: 'Subscribe, dispose, emit',
			expected: 'No listener callback',
			actual: 'Callback is invoked',
		},
	};
	report.findings.push(finding);
	return finding;
}

test('successful inventory recovery clears refresh failures while preserving collection failures', (t) => {
	const f = fixture(t);
	assert.equal(f.audit(['--binding', 'alpha']).status, 0);
	const original = JSON.parse(readFileSync(f.output, 'utf8'));
	const finding = addAssessment(original);
	f.write(f.root, 'report.json', original);
	const originalSha = git(f.source, 'rev-parse', 'HEAD');
	f.write(f.source, 'packages/octane-mcp-server/src/bridge.js', 'invalid registration source');
	f.commit(f.source);
	const failed = f.invoke(['revalidate', '--input', f.output, '--finding', finding.id]);
	assert.equal(failed.status, 2, failed.stderr);
	const report = JSON.parse(failed.stdout);
	assert.ok(report.failures.some((failure) => failure.code === 'inventory-unavailable'));
	git(f.source, 'reset', '--hard', originalSha);
	report.findings.find((item) => item.id === finding.id).assessedAt = new Date().toISOString();
	report.evidence.find((evidence) => evidence.id === finding.evidenceIds[0]).observation =
		'Reran the disposal scenario on the restored source; the listener still fires.';
	f.write(f.root, 'report.json', report);
	const recovered = f.invoke(['revalidate', '--input', f.output, '--finding', finding.id]);
	assert.equal(recovered.status, 0, recovered.stderr);
	const fresh = JSON.parse(recovered.stdout);
	assert.deepEqual(fresh.failures, []);
	assert.equal(fresh.findings.find((item) => item.id === finding.id).freshness, 'current');
	fresh.failures.push({
		code: 'collection-incomplete',
		message: 'Collection evidence is missing.',
	});
	fresh.bindings[0].failures.push({
		code: 'collection-failed',
		message: 'Missing source evidence.',
	});
	fresh.bindings[0].collection = 'incomplete';
	f.write(f.root, 'report.json', fresh);
	const incomplete = f.invoke(['revalidate', '--input', f.output, '--finding', finding.id]);
	assert.equal(incomplete.status, 2, incomplete.stderr);
	const retained = JSON.parse(incomplete.stdout);
	assert.deepEqual(retained.failures, fresh.failures);
	assert.deepEqual(retained.bindings[0].failures, fresh.bindings[0].failures);
});

test('same-report consumer assessments render with evidence and require explicit reassessment after changes', (t) => {
	const f = fixture(t);
	assert.equal(f.audit(['--binding', 'alpha']).status, 0);
	const report = JSON.parse(readFileSync(f.output, 'utf8'));
	const finding = addAssessment(report);
	f.write(f.root, 'report.json', report);
	const human = f.invoke(['report', '--input', f.output, '--finding', finding.id]);
	assert.equal(human.status, 0, human.stderr);
	assert.match(human.stdout, /compatibility-defect \/ assessment \/ current/);
	assert.match(human.stdout, /Subscribe, dispose, emit/);
	assert.match(human.stdout, /retained a listener/);
	f.write(f.library, 'changed.txt', 'new source');
	f.commit(f.library);
	const refresh = () => f.invoke(['revalidate', '--input', f.output, '--finding', finding.id]);
	assert.equal(refresh().status, 2);
	assert.equal(refresh().status, 2);
	const stale = JSON.parse(readFileSync(f.output, 'utf8'));
	const assessment = stale.findings.find((item) => item.id === finding.id);
	const evidence = stale.evidence.find((item) => item.id === assessment.evidenceIds[0]);
	for (const baseline of stale.baselines) {
		assessment.baselines[baseline.id] = baseline.receipts.at(-1).sha;
	}
	assessment.assessedAt = new Date().toISOString();
	evidence.baselines = { ...assessment.baselines };
	evidence.observation = 'Reproduced the cleanup failure again against the replacement source.';
	f.write(f.root, 'report.json', stale);
	const reassessed = refresh();
	assert.equal(reassessed.status, 0, reassessed.stderr);
	assert.equal(
		JSON.parse(reassessed.stdout).findings.find((item) => item.id === finding.id).freshness,
		'current',
	);
});

test('invalid report versions, selections, evidence, checkout SHAs and finding IDs fail before handoff', (t) => {
	const f = fixture(t);
	assert.equal(f.audit(['--binding', 'alpha']).status, 0);
	const original = JSON.parse(readFileSync(f.output, 'utf8'));
	for (const mutate of [
		(report) => {
			report.schemaVersion = 200;
		},
		(report) => {
			report.selection.bindings.push('unknown');
		},
		(report) => {
			report.findings[0].evidenceIds = ['absent'];
		},
		(report) => {
			report.findings[0].baselines = {};
		},
		(report) => {
			report.baselines[0].receipts[0].sha = 'invalid-sha';
		},
		(report) => {
			addAssessment(report).consumerFailure = {};
		},
		(report) => {
			addAssessment(report).category = 'imaginary';
		},
		(report) => {
			addAssessment(report).assessedAt = '2000-01-01T00:00:00.000Z';
		},
	]) {
		const report = structuredClone(original);
		mutate(report);
		f.write(f.root, 'report.json', report);
		const result = f.invoke(['report', '--input', f.output]);
		assert.equal(result.status, 1, result.stdout);
		assert.equal(result.stdout, '');
		assert.ok(result.stderr.length > 0);
		assert.deepEqual(
			JSON.parse(readFileSync(f.output, 'utf8')),
			report,
			'invalid handoff does not update artifact',
		);
	}
	f.write(f.root, 'report.json', original);
	const result = f.invoke(['revalidate', '--input', f.output, '--finding', 'unknown']);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /Unknown finding ID/);
});

test('published release refresh can invalidate a finding without a Git change', (t) => {
	const f = fixture(t);
	assert.equal(f.audit(['--binding', 'alpha']).status, 0);
	const registry = structuredClone(f.registry);
	registry.engine.versions['3.0.0'] = { ...registry.engine.versions['2.0.0'], version: '3.0.0' };
	const changed = f.invoke(['revalidate', '--input', f.output], registry);
	assert.equal(changed.status, 2, changed.stderr);
	const report = JSON.parse(changed.stdout);
	assert.ok(
		report.findings.every((finding) =>
			finding.invalidations.some((entry) => entry.code === 'release-changed'),
		),
	);
	assert.equal(report.bindings[0].releases[0].latestStableVersion, '2.0.0');
	assert.equal(report.bindings[0].releaseCheck.releases[0].latestStableVersion, '3.0.0');
	const human = f.invoke(['report', '--input', f.output], registry);
	assert.equal(human.status, 2, human.stderr);
	assert.match(human.stdout, /current registry latest stable 3\.0\.0/);
	assert.match(human.stdout, /Collected source: default-branch package version 2\.1\.0-dev\.1/);
	const unavailable = f.invoke(['report', '--input', f.output], {});
	assert.equal(unavailable.status, 2, unavailable.stderr);
	assert.match(unavailable.stdout, /current registry latest stable unverified/);
});

test('a changed or missing release repository requires re-audit, even if an assessment adopts its release fingerprint', (t) => {
	const f = fixture(t);
	assert.equal(f.audit(['--binding', 'alpha']).status, 0);
	const original = JSON.parse(readFileSync(f.output, 'utf8'));
	const finding = addAssessment(original);
	for (const repository of [
		null,
		{ url: path.join(f.root, 'different.git'), directory: 'packages/engine' },
	]) {
		f.write(f.root, 'report.json', original);
		const registry = structuredClone(f.registry);
		registry.engine.versions['1.0.0'].repository = repository;
		assert.equal(f.invoke(['revalidate', '--input', f.output], registry).status, 2);
		const stale = JSON.parse(readFileSync(f.output, 'utf8'));
		stale.findings.find((item) => item.id === finding.id).releaseFingerprint =
			stale.bindings[0].releaseCheck.fingerprint;
		f.write(f.root, 'report.json', stale);
		const result = f.invoke(['revalidate', '--input', f.output, '--finding', finding.id], registry);
		assert.equal(
			result.status,
			2,
			'Changing only a release fingerprint cannot approve another repository',
		);
		assert.ok(
			JSON.parse(result.stdout).bindings[0].releaseCheck.failures.some(
				(failure) => failure.code === 'repository-identity-changed',
			),
		);
	}
});

test('declared dependency ranges resolve published releases and refresh when the matching release changes', (t) => {
	const f = fixture(t);
	const manifest = JSON.parse(
		readFileSync(path.join(f.source, 'packages/alpha/package.json'), 'utf8'),
	);
	f.write(f.source, 'packages/alpha/tests/consumer.test.ts', 'test("consumer", () => {});');
	for (const version of ['^1.0.0', '~1.0.0', '>=1.0.0 <2.0.0']) {
		manifest.dependencies.engine = version;
		f.write(f.source, 'packages/alpha/package.json', manifest);
		f.write(f.source, 'packages/alpha/status.json', {
			surfaces: [
				{
					entrypoint: '.',
					exports: ['*'],
					ownership: 'imported',
					files: ['src/index.ts'],
					dependency: { package: 'engine', version },
					evidence: ['tests/consumer.test.ts'],
				},
			],
		});
		f.commit(f.source);
		const result = f.audit(['--binding', 'alpha']);
		assert.equal(result.status, 0, result.stdout + result.stderr);
		const report = JSON.parse(result.stdout);
		const release = report.bindings[0].releases[0];
		assert.equal(release.versionSpec, version);
		assert.equal(release.pinnedVersion, '1.0.0');
		assert.equal(release.latestStableVersion, '2.0.0');
		assert.ok(report.findings.some((finding) => finding.category === 'dependency-update'));
		const human = f.invoke(['report', '--input', f.output]);
		assert.match(human.stdout, /highest matching published release 1\.0\.0/);
		assert.ok(human.stdout.includes(`declared ${version}`));
		const registry = structuredClone(f.registry);
		registry.engine.versions['1.0.1'] = { ...registry.engine.versions['1.0.0'], version: '1.0.1' };
		const changed = f.invoke(['revalidate', '--input', f.output], registry);
		assert.equal(changed.status, 2, changed.stderr);
		const refreshed = JSON.parse(changed.stdout);
		assert.equal(refreshed.bindings[0].releaseCheck.releases[0].pinnedVersion, '1.0.1');
		assert.ok(
			refreshed.findings.every((finding) =>
				finding.invalidations.some((item) => item.code === 'release-changed'),
			),
		);
	}
});

test('catalog dependencies use an exact status pin; extra unpinned policy dependencies remain explicitly incomplete', (t) => {
	const f = fixture(t);
	const manifest = JSON.parse(
		readFileSync(path.join(f.source, 'packages/alpha/package.json'), 'utf8'),
	);
	manifest.dependencies.engine = 'catalog:default';
	f.write(f.source, 'packages/alpha/package.json', manifest);
	const status = {
		upstream: { package: 'engine', version: '1.0.0' },
		surfaces: [
			{
				entrypoint: '.',
				exports: ['*'],
				ownership: 'imported',
				files: ['src/index.ts'],
				dependency: { package: 'engine', version: 'catalog:default' },
				evidence: ['tests/consumer.test.ts'],
			},
		],
	};
	f.write(f.source, 'packages/alpha/status.json', status);
	f.write(
		f.source,
		'packages/alpha/tests/consumer.test.ts',
		'test("exports are consumable", () => {});',
	);
	f.commit(f.source);
	const pinned = f.audit(['--binding', 'alpha']);
	assert.equal(pinned.status, 0, pinned.stderr);
	assert.equal(JSON.parse(pinned.stdout).bindings[0].releases[0].pinnedVersion, '1.0.0');
	manifest.dependencies['other-engine'] = 'catalog:default';
	status.surfaces.push({
		entrypoint: '.',
		exports: ['otherValue'],
		ownership: 'imported',
		files: ['src/index.ts'],
		dependency: { package: 'other-engine', version: 'catalog:default' },
		evidence: ['tests/consumer.test.ts'],
	});
	f.write(f.source, 'packages/alpha/package.json', manifest);
	f.write(f.source, 'packages/alpha/status.json', status);
	f.write(
		f.source,
		'packages/alpha/src/index.ts',
		"export * from 'engine'; export { otherValue } from 'other-engine';",
	);
	f.commit(f.source);
	const unresolved = f.audit(['--binding', 'alpha']);
	assert.equal(unresolved.status, 2, unresolved.stderr);
	assert.ok(
		JSON.parse(unresolved.stdout).bindings[0].failures.some(
			(failure) => failure.package === 'other-engine' && failure.code === 'release-unavailable',
		),
	);
});

test('a remote returning to an earlier SHA does not resurrect invalidated assessments without reassessment', (t) => {
	const f = fixture(t);
	assert.equal(f.audit(['--binding', 'alpha']).status, 0);
	const report = JSON.parse(readFileSync(f.output, 'utf8'));
	const finding = addAssessment(report);
	f.write(f.root, 'report.json', report);
	const originalSha = git(f.library, 'rev-parse', 'HEAD');
	f.write(f.library, 'changed.txt', 'new source');
	f.commit(f.library);
	assert.equal(f.invoke(['revalidate', '--input', f.output]).status, 2);
	git(f.library, 'reset', '--hard', originalSha);
	const result = f.invoke(['revalidate', '--input', f.output, '--finding', finding.id]);
	assert.equal(result.status, 2);
	assert.equal(
		JSON.parse(result.stdout).findings.find((item) => item.id === finding.id).freshness,
		'stale',
	);
	const stale = JSON.parse(result.stdout);
	const assessment = stale.findings.find((item) => item.id === finding.id);
	assessment.assessedAt = new Date(Date.parse(assessment.assessedAt) + 1_000).toISOString();
	f.write(f.root, 'report.json', stale);
	const redated = f.invoke(['revalidate', '--input', f.output, '--finding', finding.id]);
	assert.equal(redated.status, 2, redated.stderr);
	assert.equal(
		JSON.parse(redated.stdout).findings.find((item) => item.id === finding.id).freshness,
		'stale',
	);
	stale.evidence.find((item) => item.id === assessment.evidenceIds[0]).observation =
		'Repeated subscribe, dispose and emit on the restored source; callback still runs.';
	f.write(f.root, 'report.json', stale);
	const reassessed = f.invoke(['revalidate', '--input', f.output, '--finding', finding.id]);
	assert.equal(reassessed.status, 0, reassessed.stderr);
	assert.equal(
		JSON.parse(reassessed.stdout).findings.find((item) => item.id === finding.id).freshness,
		'current',
	);
});

test('timestamps cannot clear release invalidation after the registry returns to its prior identity', (t) => {
	const f = fixture(t);
	assert.equal(f.audit(['--binding', 'alpha']).status, 0);
	const original = JSON.parse(readFileSync(f.output, 'utf8'));
	const finding = addAssessment(original);
	f.write(f.root, 'report.json', original);
	const registry = structuredClone(f.registry);
	registry.engine.versions['3.0.0'] = { ...registry.engine.versions['2.0.0'], version: '3.0.0' };
	assert.equal(f.invoke(['revalidate', '--input', f.output], registry).status, 2);
	const stale = JSON.parse(readFileSync(f.output, 'utf8'));
	const assessment = stale.findings.find((item) => item.id === finding.id);
	assessment.assessedAt = new Date(Date.parse(assessment.assessedAt) + 1_000).toISOString();
	f.write(f.root, 'report.json', stale);
	const redated = f.invoke(['revalidate', '--input', f.output, '--finding', finding.id]);
	assert.equal(redated.status, 2, redated.stderr);
	assert.equal(
		JSON.parse(redated.stdout).findings.find((item) => item.id === finding.id).freshness,
		'stale',
	);
	stale.evidence.find((item) => item.id === assessment.evidenceIds[0]).observation =
		'Reran the package consumer after registry recovery and reproduced the disposal defect.';
	f.write(f.root, 'report.json', stale);
	const reassessed = f.invoke(['revalidate', '--input', f.output, '--finding', finding.id]);
	assert.equal(reassessed.status, 0, reassessed.stderr);
});

test('counts unfamiliar upstream layouts as snapshots requiring inspection', (t) => {
	const f = fixture(t);
	rmSync(path.join(f.source, 'packages/alpha/upstream'), { recursive: true });
	const layouts = [
		'packages/core/src/index.ts',
		'lib/index.js',
		'npm/package/index.js',
		'canonical/index.ts',
	];
	const contents = 'export const vanilla = true;';
	for (const file of layouts) f.write(f.source, `packages/alpha/upstream/${file}`, contents);
	f.commit(f.source);
	const result = f.audit(['--binding', 'alpha']);
	assert.equal(result.status, 0, result.stderr);
	const report = JSON.parse(result.stdout);
	const reduction = report.bindings[0].facts.reduction;
	assert.equal(reduction.assessment, 'candidates-require-proof');
	assert.equal(
		reduction.trees.reduce((sum, tree) => sum + tree.files, 0),
		layouts.length,
	);
	assert.equal(
		reduction.trees.reduce((sum, tree) => sum + tree.bytes, 0),
		Buffer.byteLength(contents) * layouts.length,
	);
	assert.ok(report.findings.some((finding) => finding.category === 'reduction-candidate'));
});

test('outputs inside repositories are refused and unusable Octane roots exit one', (t) => {
	const f = fixture(t);
	const result = f.invoke([
		'audit',
		'--repository',
		f.source,
		'--all',
		'--output',
		path.join(f.source, 'audit.json'),
	]);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /outside Git/);
	const missing = f.invoke(['audit', '--repository', path.join(f.root, 'missing'), '--all']);
	assert.equal(missing.status, 1);
	assert.match(missing.stderr, /Unusable Octane baseline/);
	const help = spawnSync(
		process.execPath,
		[new URL('./bindings-audit.mjs', import.meta.url).pathname, '--help'],
		{ encoding: 'utf8' },
	);
	assert.equal(help.status, 0);
	assert.match(help.stdout, /origin:"assessment"/);
});

test('public GitHub SSH metadata uses the same repository identity over HTTPS', () => {
	for (const url of [
		'ssh://git@github.com/portabletext/react-portabletext.git',
		'git+ssh://git@github.com/portabletext/react-portabletext.git',
		'git@github.com:portabletext/react-portabletext.git',
	]) {
		assert.deepEqual(repositoryIdentity({ url, directory: 'packages/react' }), {
			repositoryUrl: 'https://github.com/portabletext/react-portabletext.git',
			packageDirectory: 'packages/react',
		});
	}
	const external = 'ssh://git@gitlab.com/group/repo.git';
	assert.equal(repositoryIdentity(external).repositoryUrl, external);
	const port = 'ssh://git@github.com:2222/owner/repo.git';
	assert.equal(repositoryIdentity(port).repositoryUrl, port);
	assert.throws(
		() => repositoryIdentity('ssh://git:secret@github.com/owner/repo.git'),
		/Invalid repository URL/,
	);
	assert.throws(
		() => repositoryIdentity('ssh://git@github.com/owner/repo.git?redirect=other'),
		/Invalid repository URL/,
	);
});

test('the repository root package disambiguates a same-named demo manifest', (t) => {
	const f = fixture(t);
	f.write(f.library, 'package.json', { name: 'engine', version: '2.1.0-dev.1', main: 'index.js' });
	f.write(f.library, 'index.js', 'export const value = 1;');
	f.commit(f.library);
	const metadata = structuredClone(f.registry);
	for (const version of Object.values(metadata.engine.versions))
		delete version.repository.directory;
	const result = f.audit(['--binding', 'alpha'], metadata);
	assert.equal(result.status, 0, result.stderr);
	assert.equal(JSON.parse(result.stdout).bindings[0].releases[0].packageDirectory, '.');
});

test('a declared source workspace disambiguates vendored release manifests', (t) => {
	const f = fixture(t);
	f.write(f.library, 'package.json', { private: true, workspaces: ['packages/*'] });
	f.write(f.library, 'website/vendor/engine/package.json', { name: 'engine', version: '1.0.0' });
	f.commit(f.library);
	const metadata = structuredClone(f.registry);
	for (const version of Object.values(metadata.engine.versions))
		delete version.repository.directory;
	const result = f.audit(['--binding', 'alpha'], metadata);
	assert.equal(result.status, 0, result.stderr);
	const release = JSON.parse(result.stdout).bindings[0].releases[0];
	assert.equal(release.packageDirectory, 'packages/engine');
	assert.equal(release.defaultBranchVersion, '2.1.0-dev.1');

	f.write(f.library, 'packages/duplicate/package.json', { name: 'engine', version: '3.0.0' });
	f.commit(f.library);
	const ambiguous = f.audit(['--binding', 'alpha'], metadata);
	assert.equal(ambiguous.status, 2);
	assert.match(JSON.parse(ambiguous.stdout).bindings[0].failures[0].message, /found 3/);
});

test('release checks retain source annotations while resolving their exact published version', (t) => {
	const f = fixture(t);
	for (const version of ['1.0.0 (abcdef12)', '1.0.0 + master@abcdef12']) {
		f.write(f.source, 'packages/alpha/status.json', { upstream: { package: 'engine', version } });
		f.commit(f.source);
		const result = f.audit(['--binding', 'alpha']);
		assert.equal(result.status, 0, result.stderr);
		const release = JSON.parse(result.stdout).bindings[0].releases[0];
		assert.equal(release.pinnedVersion, '1.0.0');
		assert.equal(release.versionSpec, version);
	}
	f.write(f.source, 'packages/alpha/status.json', {
		upstream: { package: 'engine', version: '1.0.0 or maybe 2.0.0' },
	});
	f.commit(f.source);
	assert.equal(f.audit(['--binding', 'alpha']).status, 2);
});

test('fingerprints package-internal fixture symlinks and rejects targets outside the binding', (t) => {
	const f = fixture(t);
	f.write(f.source, 'packages/alpha/upstream/__mocks__/fixture.js', 'export const mocked = true;');
	const link = path.join(f.source, 'packages/alpha/__mocks__');
	symlinkSync('upstream/__mocks__', link);
	f.commit(f.source);
	const result = f.audit(['--binding', 'alpha']);
	assert.equal(result.status, 0, result.stderr);
	const files = JSON.parse(result.stdout).bindings[0].facts.files;
	assert.equal(files.find((file) => file.path === '__mocks__').symlinkTarget, 'upstream/__mocks__');
	assert.ok(files.find((file) => file.path === 'upstream/__mocks__/fixture.js').fingerprint);

	rmSync(link);
	symlinkSync('../beta/src', link);
	f.commit(f.source);
	const escaped = f.audit(['--binding', 'alpha']);
	assert.equal(escaped.status, 2);
	assert.match(
		JSON.parse(escaped.stdout).bindings[0].failures[0].message,
		/Symlink target escapes the binding/,
	);
});

test('composite upstream labels retain both independently published release checks', (t) => {
	const f = fixture(t);
	f.write(f.source, 'packages/alpha/status.json', {
		upstream: { package: 'engine + other-engine', version: '1.0.0 / 2.0.0' },
	});
	f.commit(f.source);
	const result = f.audit(['--binding', 'alpha']);
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(
		JSON.parse(result.stdout).bindings[0].releases.map((release) => [
			release.package,
			release.pinnedVersion,
		]),
		[
			['engine', '1.0.0'],
			['other-engine', '2.0.0'],
		],
	);
	f.write(f.source, 'packages/alpha/status.json', {
		upstream: { package: 'engine + other-engine', version: '1.0.0' },
	});
	f.commit(f.source);
	assert.equal(
		f.audit(['--binding', 'alpha']).status,
		2,
		'A missing component version is not inferred',
	);
});
