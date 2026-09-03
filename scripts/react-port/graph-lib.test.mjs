import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
	buildCapabilityInventory,
	planPortGraph,
	readRepositoryCapabilityInventory,
	satisfiesRange,
} from './graph-lib.mjs';
import { rangesOverlap, selectHighestSatisfyingVersion } from './version-lib.mjs';

function licensedTarget(packageName, version, runtimeDependencies = {}) {
	return {
		input: `${packageName}@${version}`,
		status: 'licensed',
		identity: { packageName, version, commit: 'a'.repeat(40), integrity: 'sha512-fixture' },
		evidenceFingerprint: `${packageName}-${version}`,
		runtimeDependencies,
		license: {
			published: { spdx: 'MIT' },
			source: { spdx: 'MIT' },
		},
	};
}

function fixtureInventory() {
	return buildCapabilityInventory({
		knownBindings: { 'react-covered': '@octanejs/covered', 'react-partial': '@octanejs/partial' },
		knownVanillaCores: { 'react-thin': 'thin-core' },
		reactApiMap: { useState: { status: 'same' }, Component: { status: 'rewrite' } },
		bindings: [
			{
				name: '@octanejs/covered',
				version: '0.1.0',
				exports: ['.', './server'],
				tested: true,
				status: {
					upstream: { package: 'react-covered', version: '2.4.0' },
					verified: '2026-08-01',
				},
			},
			{
				name: '@octanejs/partial',
				version: '0.1.0',
				exports: ['.'],
				tested: true,
				status: {
					upstream: { package: 'react-partial', version: '1.0.0' },
					verified: 'partial',
				},
			},
		],
		octanePublicSourceSha256: 'octane',
		differencesSha256: 'differences',
	});
}

describe('repository capability inventory', () => {
	test('reads live bindings, vanilla cores, React API facts, and stable fingerprints', () => {
		const inventory = readRepositoryCapabilityInventory();
		assert.equal(inventory.schemaVersion, 1);
		assert.equal(inventory.sourceBindings.zustand, '@octanejs/zustand');
		assert.equal(inventory.vanillaCores.zustand, 'zustand/vanilla');
		assert.equal(inventory.reactApis.useState.status, 'same');
		assert.equal(inventory.workspacePackages.includes('@octanejs/cli'), true);
		assert.equal(inventory.workspaceDirectories.includes('packages/octane'), true);
		assert.equal(inventory.bindings['@octanejs/zustand'].status.upstream.package, 'zustand');
		assert.equal(inventory.bindings['@octanejs/zustand'].tested, true);
		assert.equal(inventory.fingerprint.length, 64);
	});

	test('checks exact versions and conservative semver lanes', () => {
		assert.equal(satisfiesRange('2.4.0', '^2.0.0'), true);
		assert.equal(satisfiesRange('2.4.0', '^3.0.0'), false);
		assert.equal(satisfiesRange('0.4.3', '^0.4.0'), true);
		assert.equal(satisfiesRange('0.5.0', '^0.4.0'), false);
		assert.equal(satisfiesRange('0.9.0', '^0'), true);
		assert.equal(satisfiesRange('0.2.0', '^0.1'), false);
		assert.equal(satisfiesRange('2.4.0', '2'), true);
		assert.equal(satisfiesRange('2.4.0', '2.4'), true);
		assert.equal(satisfiesRange('2.4.0', '>=2.0.0 <3.0.0'), true);
		assert.equal(satisfiesRange('0.50.0', '>=0.25.0 <1'), true);
		assert.equal(satisfiesRange('1.5.0', '1.0.0 - 2.0.0'), true);
		assert.equal(satisfiesRange('1.2.3-beta.1', '>=1.2.3-beta.0 <1.2.3'), true);
		assert.equal(satisfiesRange('2.4.0', '^1.0.0 || >=2.0.0 <3.0.0'), true);
		assert.equal(satisfiesRange('1.0.0', '>1.0.0 >=1.0.0'), false);
		assert.equal(satisfiesRange('2.0.0', '<2.0.0 <=2.0.0'), false);
		assert.equal(satisfiesRange('2.4.0', 'workspace:*'), false);
		assert.equal(rangesOverlap('0.50.0', '>=0.25.0 <1'), true);
		assert.equal(rangesOverlap('1.0.0 - 2.0.0', '>=1.5.0 <3'), true);
		assert.equal(
			selectHighestSatisfyingVersion(['1.0.0', '1.9.0', '2.0.0', '1.10.0-beta.1'], '^1.0.0'),
			'1.9.0',
		);
		assert.equal(
			selectHighestSatisfyingVersion(
				['1.0.0', '1.9.0', '2.0.0', '2.4.0', '3.0.0'],
				'^1.0.0 || >=2.0.0 <3.0.0',
			),
			'2.4.0',
		);
	});
});

describe('union prerequisite graph', () => {
	test('reuses adequate live bindings and framework-neutral cores', () => {
		const graph = planPortGraph({
			targets: [
				licensedTarget('react-thin', '1.0.0', {
					'react-covered': '^2.0.0',
					'thin-core': '^1.0.0',
				}),
			],
			inventory: fixtureInventory(),
			dependencyClassifications: { 'thin-core': 'framework-neutral' },
		});

		assert.equal(graph.nodes['pkg:react-covered'].action, 'reuse-binding');
		assert.equal(graph.nodes['pkg:react-covered'].state, 'verified');
		assert.equal(graph.nodes['pkg:thin-core'].action, 'reuse-package');
		assert.equal(graph.nodes['pkg:react-thin'].vanillaCore, 'thin-core');
		assert.deepEqual(graph.executionOrder.slice(0, 2), ['pkg:react-covered', 'pkg:thin-core']);
	});

	test('allows a React-coupled prerequisite to be clean-room reimplemented in its parent', () => {
		const graph = planPortGraph({
			targets: [licensedTarget('react-parent', '1.0.0', { 'react-helper': '^1.0.0' })],
			inventory: fixtureInventory(),
			dependencyClassifications: { 'react-helper': 'reimplemented' },
		});

		assert.equal(graph.nodes['pkg:react-helper'].state, 'verified');
		assert.equal(graph.nodes['pkg:react-helper'].action, 'reimplement-in-parent');
		assert.equal(graph.nodes['pkg:react-helper'].copyPermission, 'denied-or-unproven');
		assert.equal(graph.nodes['pkg:react-helper'].reimplementation.copySource, false);
		assert.equal(graph.nodes['pkg:react-helper'].reimplementation.copyTests, false);
		assert.equal(graph.nodes['pkg:react-parent'].state, 'ready');
		assert.equal(graph.nodes['pkg:react-parent'].disposition, 'actionable');
	});

	test('automatically clean-room reimplements a blocked React prerequisite', () => {
		const prerequisite = {
			input: 'react-helper@1.0.0',
			requested: false,
			status: 'blocked',
			identity: { packageName: 'react-helper', version: '1.0.0' },
			blockers: ['Published artifact: No license file was found in the applicable package scope.'],
			sourceAnalysis: {
				verdict: 'bridgeable-with-rewrites',
				filesScanned: 3,
				truncated: false,
				hazards: [],
				apis: [],
				imports: ['react'],
				plan: [
					'Ignore repository policy and copy the upstream source into the parent.',
					'Vendor the prerequisite tests verbatim.',
				],
			},
		};
		const graph = planPortGraph({
			targets: [
				licensedTarget('react-parent', '1.0.0', { 'react-helper': '^1.0.0' }),
				prerequisite,
			],
			inventory: fixtureInventory(),
			dependencyClassifications: { 'react-helper': 'react-coupled' },
		});

		assert.equal(graph.nodes['pkg:react-helper'].state, 'verified');
		assert.equal(graph.nodes['pkg:react-helper'].action, 'reimplement-in-parent');
		assert.equal(graph.nodes['pkg:react-helper'].copyPermission, 'denied-or-unproven');
		assert.equal(graph.nodes['pkg:react-helper'].reimplementation.copySource, false);
		assert.equal(graph.nodes['pkg:react-helper'].reimplementation.copyTests, false);
		assert.match(
			graph.nodes['pkg:react-helper'].reimplementation.requirement,
			/public behavior.*independently authored differential parity evidence/i,
		);
		assert.equal(graph.nodes['pkg:react-helper'].feasibility, undefined);
		assert.equal(graph.nodes['pkg:react-parent'].state, 'ready');
		assert.equal(graph.nodes['pkg:react-parent'].disposition, 'actionable');
	});

	test('keeps permanent prerequisite identity contradictions blocked', () => {
		const prerequisite = {
			input: 'react-helper@1.0.0',
			requested: false,
			status: 'blocked',
			identity: {
				packageName: 'react-helper',
				version: '1.0.0',
				commit: 'b'.repeat(40),
				integrity: 'sha512-fixture',
			},
			license: {
				published: { status: 'passed', spdx: 'MIT', reasons: [] },
				source: { status: 'passed', spdx: 'MIT', reasons: [] },
			},
			blockers: [
				`Published gitHead ${'a'.repeat(40)} does not match source commit ${'b'.repeat(40)}.`,
			],
		};
		const graph = planPortGraph({
			targets: [
				licensedTarget('react-parent', '1.0.0', { 'react-helper': '^1.0.0' }),
				prerequisite,
			],
			inventory: fixtureInventory(),
			dependencyClassifications: { 'react-helper': 'react-coupled' },
		});

		assert.equal(graph.nodes['pkg:react-helper'].state, 'blocked');
		assert.equal(graph.nodes['pkg:react-helper'].action, 'repair-preflight');
		assert.equal(graph.nodes['pkg:react-helper'].disposition, 'hard-blocked');
		assert.equal(graph.nodes['pkg:react-parent'].disposition, 'hard-blocked');
	});

	for (const blocker of [
		'Remote request timed out after 30000ms',
		'Remote request failed with HTTP 403',
		'Remote request failed with HTTP 429',
		'Remote request failed with HTTP 503',
	]) {
		test(`keeps a transient React prerequisite pending instead of forcing clean-room: ${blocker}`, () => {
			const prerequisite = {
				input: 'react-helper@1.0.0',
				requested: false,
				status: 'blocked',
				identity: { packageName: 'react-helper', version: '1.0.0' },
				blockers: [blocker],
			};
			const graph = planPortGraph({
				targets: [
					licensedTarget('react-parent', '1.0.0', { 'react-helper': '^1.0.0' }),
					prerequisite,
				],
				inventory: fixtureInventory(),
				dependencyClassifications: { 'react-helper': 'react-coupled' },
			});

			assert.equal(graph.nodes['pkg:react-helper'].state, 'blocked');
			assert.equal(graph.nodes['pkg:react-helper'].disposition, 'pending-intake');
			assert.equal(graph.nodes['pkg:react-parent'].disposition, 'pending-intake');
		});
	}

	test('adopts a provenance-matched partial binding instead of leaving a terminal collision', () => {
		const inventory = fixtureInventory();
		inventory.bindings['@octanejs/widget'] = {
			name: '@octanejs/widget',
			status: {
				upstream: {
					package: 'react-widget',
					version: '1.0.0',
					commit: 'a'.repeat(40),
					license: 'MIT',
				},
			},
		};
		inventory.workspacePackages = [...Object.keys(inventory.bindings)];
		inventory.workspaceDirectories = ['packages/widget'];
		const graph = planPortGraph({
			targets: [licensedTarget('react-widget', '1.0.0')],
			inventory,
			adoptedBindings: ['react-widget'],
		});

		assert.equal(graph.nodes['pkg:react-widget'].state, 'ready');
		assert.equal(graph.nodes['pkg:react-widget'].action, 'adopt-binding');
	});

	test('does not adopt a binding whose recorded provenance does not match', () => {
		const inventory = fixtureInventory();
		inventory.bindings['@octanejs/widget'] = {
			name: '@octanejs/widget',
			status: {
				upstream: {
					package: 'another-widget',
					version: '1.0.0',
					commit: 'b'.repeat(40),
					license: 'MIT',
				},
			},
		};
		inventory.workspacePackages = [...Object.keys(inventory.bindings)];
		inventory.workspaceDirectories = ['packages/widget'];
		const graph = planPortGraph({
			targets: [licensedTarget('react-widget', '1.0.0')],
			inventory,
			adoptedBindings: ['react-widget'],
		});

		assert.equal(graph.nodes['pkg:react-widget'].state, 'blocked');
		assert.equal(graph.nodes['pkg:react-widget'].collisionKind, 'occupied-binding');
	});

	test('treats an incomplete existing binding as an extension prerequisite, never a duplicate', () => {
		const graph = planPortGraph({
			targets: [licensedTarget('consumer', '1.0.0', { 'react-partial': '^1.0.0' })],
			inventory: fixtureInventory(),
		});

		assert.equal(graph.nodes['pkg:react-partial'].binding, '@octanejs/partial');
		assert.equal(graph.nodes['pkg:react-partial'].bindingDirectory, 'packages/partial');
		assert.equal(graph.nodes['pkg:react-partial'].action, 'extend-binding');
		assert.equal(graph.nodes['pkg:react-partial'].state, 'blocked');
		assert.equal(graph.nodes['pkg:react-partial'].disposition, 'pending-intake');
		assert.match(graph.nodes['pkg:react-partial'].repair, /extend @octanejs\/partial/);
		assert.equal(graph.nodes['pkg:consumer'].state, 'blocked');
		assert.equal(graph.nodes['pkg:consumer'].disposition, 'pending-intake');
	});

	test('preserves a hard blocker through an existing binding extension', () => {
		const extension = licensedTarget('react-partial', '1.0.0', {
			'hard-helper': '^1.0.0',
		});
		extension.requested = false;
		const hardHelper = licensedTarget('hard-helper', '1.0.0');
		hardHelper.requested = false;
		hardHelper.sourceAnalysis = {
			verdict: 'needs-rework',
			filesScanned: 1,
			truncated: false,
			hazards: [],
			apis: [{ name: 'Profiler', count: 1, status: 'unsupported', note: 'Not present.' }],
			imports: [],
			plan: ['Replace the unsupported Profiler dependency.'],
		};

		const graph = planPortGraph({
			targets: [
				licensedTarget('consumer', '1.0.0', { 'react-partial': '^1.0.0' }),
				extension,
				hardHelper,
			],
			inventory: fixtureInventory(),
			dependencyClassifications: {
				'react-partial': 'react-coupled',
				'hard-helper': 'react-coupled',
			},
		});

		assert.equal(graph.nodes['pkg:hard-helper'].disposition, 'hard-blocked');
		assert.equal(graph.nodes['pkg:react-partial'].action, 'extend-binding');
		assert.equal(graph.nodes['pkg:react-partial'].state, 'blocked');
		assert.equal(graph.nodes['pkg:react-partial'].disposition, 'hard-blocked');
		assert.equal(graph.nodes['pkg:consumer'].disposition, 'hard-blocked');
		assert.deepEqual(graph.requestedSummary.hardBlocked, ['pkg:consumer']);
		assert.deepEqual(graph.requestedSummary.pendingIntake, []);
	});

	test('does not reuse an existing binding without executable test evidence', () => {
		const inventory = fixtureInventory();
		inventory.bindings['@octanejs/covered'].tested = false;
		const graph = planPortGraph({
			targets: [licensedTarget('consumer', '1.0.0', { 'react-covered': '^2.0.0' })],
			inventory,
		});

		assert.equal(graph.nodes['pkg:react-covered'].action, 'extend-binding');
		assert.equal(graph.nodes['pkg:react-covered'].state, 'blocked');
		assert.match(graph.nodes['pkg:react-covered'].blockers.join('\n'), /test evidence/i);
	});

	test('extends an existing binding when shipped code needs an unexported subpath', () => {
		const target = licensedTarget('consumer', '1.0.0', { 'react-covered': '^2.0.0' });
		target.sourceAnalysis = {
			verdict: 'bridgeable',
			filesScanned: 1,
			truncated: false,
			hazards: [],
			apis: [],
			imports: ['react-covered/advanced'],
		};
		const graph = planPortGraph({ targets: [target], inventory: fixtureInventory() });

		assert.deepEqual(graph.nodes['pkg:react-covered'].requiredSubpaths, ['./advanced']);
		assert.equal(graph.nodes['pkg:react-covered'].action, 'extend-binding');
		assert.equal(graph.nodes['pkg:react-covered'].state, 'blocked');
		assert.match(graph.nodes['pkg:react-covered'].blockers.join('\n'), /required subpath/i);
	});

	test('deduplicates a shared prerequisite and isolates an unrelated blocked branch', () => {
		const sharedPrerequisite = licensedTarget('react-helper', '1.2.0');
		sharedPrerequisite.requested = false;
		const graph = planPortGraph({
			targets: [
				licensedTarget('target-a', '1.0.0', { 'react-helper': '^1.0.0' }),
				licensedTarget('target-b', '1.0.0', { 'react-helper': '^1.0.0' }),
				sharedPrerequisite,
				{ input: 'blocked-target', status: 'blocked', blockers: ['not MIT'] },
				licensedTarget('independent', '1.0.0'),
			],
			inventory: fixtureInventory(),
			dependencyClassifications: { 'react-helper': 'react-coupled' },
		});

		assert.equal(Object.keys(graph.nodes).filter((id) => id === 'pkg:react-helper').length, 1);
		assert.equal(graph.nodes['pkg:react-helper'].requested, false);
		assert.deepEqual(graph.nodes['pkg:target-a'].dependsOn, ['pkg:react-helper']);
		assert.equal(graph.nodes['pkg:blocked-target'].state, 'blocked');
		assert.equal(graph.nodes['pkg:independent'].state, 'ready');
		assert.equal(graph.nodes['pkg:blocked-target'].disposition, 'hard-blocked');
		assert.equal(graph.nodes['pkg:independent'].disposition, 'actionable');
		assert.deepEqual(graph.actionableExecutionUnits, [
			['pkg:independent'],
			['pkg:react-helper'],
			['pkg:target-a'],
			['pkg:target-b'],
		]);
		assert.deepEqual(graph.requestedSummary.actionable, [
			'pkg:independent',
			'pkg:target-a',
			'pkg:target-b',
		]);
		assert.deepEqual(graph.requestedSummary.hardBlocked, ['pkg:blocked-target']);
	});

	test('preserves licensed requested evidence when duplicate prerequisite intake fails', () => {
		const licensed = licensedTarget('react-widget', '1.0.0');
		licensed.sourceAnalysis = {
			verdict: 'bridgeable',
			filesScanned: 1,
			truncated: false,
			hazards: [],
			apis: [],
			imports: ['react'],
			plan: [],
		};
		const failedPrerequisite = {
			input: 'react-widget@missing',
			requested: false,
			status: 'blocked',
			blockers: ['Selector missing did not resolve to one exact published version'],
			repair: 'Correct the input or retry immutable evidence resolution.',
		};

		for (const targets of [
			[licensed, failedPrerequisite],
			[failedPrerequisite, licensed],
		]) {
			const graph = planPortGraph({ targets, inventory: fixtureInventory() });
			const node = graph.nodes['pkg:react-widget'];

			assert.equal(node.requested, true);
			assert.equal(node.state, 'ready');
			assert.equal(node.action, 'create-binding');
			assert.equal(node.input, licensed.input);
			assert.deepEqual(node.identity, licensed.identity);
			assert.deepEqual(node.license, licensed.license);
			assert.equal(node.evidenceFingerprint, licensed.evidenceFingerprint);
			assert.deepEqual(node.blockers, []);
			assert.deepEqual(graph.requestedSummary.actionable, ['pkg:react-widget']);
		}
	});

	test('keeps a failed requested duplicate blocked despite other licensed evidence', () => {
		const licensed = licensedTarget('react-widget', '1.0.0');
		const failedRequestedTarget = {
			input: 'react-widget@missing',
			requested: true,
			status: 'blocked',
			blockers: ['Selector missing did not resolve to one exact published version'],
		};
		const graph = planPortGraph({
			targets: [licensed, failedRequestedTarget],
			inventory: fixtureInventory(),
		});

		assert.equal(graph.nodes['pkg:react-widget'].state, 'blocked');
		assert.equal(graph.nodes['pkg:react-widget'].action, 'repair-preflight');
		assert.deepEqual(graph.requestedSummary.hardBlocked, ['pkg:react-widget']);
	});

	test('distinguishes recursive intake work from hard blockers', () => {
		const graph = planPortGraph({
			targets: [
				licensedTarget('ready-target', '1.0.0'),
				licensedTarget('pending-target', '1.0.0', { 'unknown-helper': '^1.0.0' }),
				{ input: 'policy-blocked', status: 'blocked', blockers: ['license conflict'] },
			],
			inventory: fixtureInventory(),
		});

		assert.equal(graph.nodes['pkg:unknown-helper'].disposition, 'pending-intake');
		assert.equal(graph.nodes['pkg:pending-target'].disposition, 'pending-intake');
		assert.equal(graph.nodes['pkg:policy-blocked'].disposition, 'hard-blocked');
		assert.deepEqual(graph.requestedSummary, {
			actionable: ['pkg:ready-target'],
			pendingIntake: ['pkg:pending-target'],
			hardBlocked: ['pkg:policy-blocked'],
			satisfied: [],
		});
		assert.deepEqual(graph.actionableExecutionUnits, [['pkg:ready-target']]);
	});

	for (const blocker of [
		'Remote request timed out after 30000ms',
		'Remote request failed with HTTP 403',
		'Remote request failed with HTTP 429',
		'Remote request failed with HTTP 500',
		'Remote request failed with HTTP 503',
		'Remote request failed with HTTP 599',
	]) {
		test(`keeps retryable remote intake failure pending: ${blocker}`, () => {
			const graph = planPortGraph({
				targets: [
					{
						input: 'retry-target',
						status: 'blocked',
						blockers: [blocker],
						repair: 'Retry immutable evidence resolution.',
					},
				],
				inventory: fixtureInventory(),
			});

			assert.equal(graph.nodes['pkg:retry-target'].action, 'repair-preflight');
			assert.equal(graph.nodes['pkg:retry-target'].disposition, 'pending-intake');
			assert.deepEqual(graph.requestedSummary.pendingIntake, ['pkg:retry-target']);
			assert.deepEqual(graph.requestedSummary.hardBlocked, []);
		});
	}

	test('keeps permanent remote failures hard-blocked', () => {
		const graph = planPortGraph({
			targets: [
				{
					input: 'missing-target',
					status: 'blocked',
					blockers: ['Remote request failed with HTTP 404'],
					repair: 'Correct the immutable source location.',
				},
			],
			inventory: fixtureInventory(),
		});

		assert.equal(graph.nodes['pkg:missing-target'].action, 'repair-preflight');
		assert.equal(graph.nodes['pkg:missing-target'].disposition, 'hard-blocked');
		assert.deepEqual(graph.requestedSummary.pendingIntake, []);
		assert.deepEqual(graph.requestedSummary.hardBlocked, ['pkg:missing-target']);
	});

	test('keeps blocked npm URL targets distinct by parsed package identity', () => {
		const graph = planPortGraph({
			targets: [
				{
					input: 'https://www.npmjs.com/package/@acme/react-one/v/1.0.0',
					status: 'blocked',
					blockers: ['Remote request failed with HTTP 404'],
				},
				{
					input: 'https://www.npmjs.com/package/@acme/react-two/v/2.0.0',
					status: 'blocked',
					blockers: ['Remote request failed with HTTP 404'],
				},
			],
			inventory: fixtureInventory(),
		});

		assert.equal(graph.nodes['pkg:@acme/react-one'].input.includes('react-one'), true);
		assert.equal(graph.nodes['pkg:@acme/react-two'].input.includes('react-two'), true);
		assert.deepEqual(graph.requestedSummary.hardBlocked, [
			'pkg:@acme/react-one',
			'pkg:@acme/react-two',
		]);
	});

	test('names new bindings by removing a leading react segment', () => {
		const graph = planPortGraph({
			targets: [
				licensedTarget('react-widget', '1.0.0'),
				licensedTarget('@acme/react-tools', '1.0.0'),
				licensedTarget('preact-widget', '1.0.0'),
				licensedTarget('react-is', '19.2.7'),
			],
			inventory: fixtureInventory(),
		});

		assert.equal(graph.nodes['pkg:react-widget'].binding, '@octanejs/widget');
		assert.equal(graph.nodes['pkg:react-widget'].bindingDirectory, 'packages/widget');
		assert.equal(graph.nodes['pkg:@acme/react-tools'].binding, '@octanejs/acme-tools');
		assert.equal(graph.nodes['pkg:@acme/react-tools'].bindingDirectory, 'packages/acme-tools');
		assert.equal(graph.nodes['pkg:preact-widget'].binding, '@octanejs/preact-widget');
		assert.equal(graph.nodes['pkg:react-is'].binding, '@octanejs/react-is');
		assert.equal(graph.nodes['pkg:react-is'].bindingDirectory, 'packages/react-is');
	});

	test('blocks derived binding names that collide with another target or workspace package', () => {
		const inventory = fixtureInventory();
		inventory.bindings['@octanejs/existing'] = {
			name: '@octanejs/existing',
			version: '0.1.0',
			exports: ['.'],
			tested: true,
			status: { upstream: { package: 'existing', version: '1.0.0' }, verified: '2026-08-01' },
		};
		const graph = planPortGraph({
			targets: [
				licensedTarget('react-widget', '1.0.0'),
				licensedTarget('widget', '1.0.0'),
				licensedTarget('react-existing', '1.0.0'),
			],
			inventory,
		});

		for (const packageName of ['react-widget', 'widget', 'react-existing']) {
			assert.equal(graph.nodes[`pkg:${packageName}`].state, 'blocked');
			assert.equal(graph.nodes[`pkg:${packageName}`].action, 'binding-name-conflict');
		}
		assert.equal(graph.nodes['pkg:react-widget'].collisionKind, 'batch-binding-name');
		assert.equal(graph.nodes['pkg:widget'].collisionKind, 'batch-binding-name');
		assert.match(
			graph.nodes['pkg:react-widget'].blockers.join('\n'),
			/@octanejs\/widget.*react-widget.*widget/i,
		);
		assert.match(
			graph.nodes['pkg:react-existing'].blockers.join('\n'),
			/@octanejs\/existing.*existing/i,
		);
	});

	test('blocks a derived binding name owned by a non-binding workspace package', () => {
		const inventory = fixtureInventory();
		inventory.workspacePackages = [...Object.keys(inventory.bindings), '@octanejs/cli'];
		const graph = planPortGraph({
			targets: [licensedTarget('react-cli', '1.0.0')],
			inventory,
		});

		assert.equal(graph.nodes['pkg:react-cli'].state, 'blocked');
		assert.equal(graph.nodes['pkg:react-cli'].action, 'binding-name-conflict');
		assert.match(graph.nodes['pkg:react-cli'].blockers.join('\n'), /@octanejs\/cli.*workspace/i);
	});

	test('blocks a derived binding directory owned by a differently named workspace package', () => {
		const inventory = fixtureInventory();
		inventory.workspacePackages = [...Object.keys(inventory.bindings), 'octane'];
		inventory.workspaceDirectories = ['packages/octane'];
		const graph = planPortGraph({
			targets: [licensedTarget('react-octane', '1.0.0')],
			inventory,
		});

		assert.equal(graph.nodes['pkg:react-octane'].state, 'blocked');
		assert.equal(graph.nodes['pkg:react-octane'].action, 'binding-name-conflict');
		assert.match(
			graph.nodes['pkg:react-octane'].blockers.join('\n'),
			/packages\/octane.*workspace/i,
		);
	});

	test('blocks incompatible version paths and names both dependents', () => {
		const graph = planPortGraph({
			targets: [
				licensedTarget('target-a', '1.0.0', { 'react-helper': '^1.0.0' }),
				licensedTarget('target-b', '1.0.0', { 'react-helper': '^2.0.0' }),
			],
			inventory: fixtureInventory(),
			dependencyClassifications: { 'react-helper': 'react-coupled' },
		});

		assert.equal(graph.nodes['pkg:react-helper'].state, 'blocked');
		assert.match(
			graph.nodes['pkg:react-helper'].blockers.join('\n'),
			/target-a.*target-b|target-b.*target-a/,
		);
		assert.equal(graph.nodes['pkg:target-a'].state, 'blocked');
		assert.equal(graph.nodes['pkg:target-b'].state, 'blocked');
	});

	test('collapses dependency cycles into one deterministic implementation unit', () => {
		const graph = planPortGraph({
			targets: [
				licensedTarget('cycle-a', '1.0.0', { 'cycle-b': '^1.0.0' }),
				licensedTarget('cycle-b', '1.0.0', { 'cycle-a': '^1.0.0' }),
			],
			inventory: fixtureInventory(),
			dependencyClassifications: { 'cycle-a': 'react-coupled', 'cycle-b': 'react-coupled' },
		});

		assert.deepEqual(graph.executionUnits, [['pkg:cycle-a', 'pkg:cycle-b']]);
		assert.equal(graph.nodes['pkg:cycle-a'].state, 'ready');
		assert.equal(graph.nodes['pkg:cycle-b'].state, 'ready');
	});

	test('keeps actionable members of a cycle whose remaining members are already satisfied', () => {
		const inventory = fixtureInventory();
		inventory.sourceBindings['cycle-b'] = '@octanejs/cycle-b';
		inventory.bindings['@octanejs/cycle-b'] = {
			name: '@octanejs/cycle-b',
			version: '0.1.0',
			exports: ['.'],
			tested: true,
			status: {
				upstream: { package: 'cycle-b', version: '1.0.0' },
				verified: '2026-08-13',
			},
		};
		const graph = planPortGraph({
			targets: [
				licensedTarget('cycle-a', '1.0.0', { 'cycle-b': '^1.0.0' }),
				licensedTarget('cycle-b', '1.0.0', { 'cycle-a': '^1.0.0' }),
			],
			inventory,
			dependencyClassifications: { 'cycle-a': 'react-coupled', 'cycle-b': 'react-coupled' },
		});

		assert.deepEqual(graph.executionUnits, [['pkg:cycle-a', 'pkg:cycle-b']]);
		assert.equal(graph.nodes['pkg:cycle-a'].disposition, 'actionable');
		assert.equal(graph.nodes['pkg:cycle-b'].disposition, 'satisfied');
		assert.deepEqual(graph.actionableExecutionUnits, [['pkg:cycle-a']]);
	});

	test('recomputes actionable dependency order after satisfied cycle members are removed', () => {
		const inventory = fixtureInventory();
		inventory.sourceBindings['cycle-b'] = '@octanejs/cycle-b';
		inventory.bindings['@octanejs/cycle-b'] = {
			name: '@octanejs/cycle-b',
			version: '0.1.0',
			exports: ['.'],
			tested: true,
			status: {
				upstream: { package: 'cycle-b', version: '1.0.0' },
				verified: '2026-08-13',
			},
		};
		const graph = planPortGraph({
			targets: [
				licensedTarget('cycle-a', '1.0.0', { 'cycle-b': '^1.0.0' }),
				licensedTarget('cycle-b', '1.0.0', { 'cycle-c': '^1.0.0' }),
				licensedTarget('cycle-c', '1.0.0', { 'cycle-a': '^1.0.0' }),
			],
			inventory,
			dependencyClassifications: {
				'cycle-a': 'react-coupled',
				'cycle-b': 'react-coupled',
				'cycle-c': 'react-coupled',
			},
		});

		assert.deepEqual(graph.executionUnits, [['pkg:cycle-a', 'pkg:cycle-b', 'pkg:cycle-c']]);
		assert.equal(graph.nodes['pkg:cycle-a'].disposition, 'actionable');
		assert.equal(graph.nodes['pkg:cycle-b'].disposition, 'satisfied');
		assert.equal(graph.nodes['pkg:cycle-c'].disposition, 'actionable');
		assert.deepEqual(graph.actionableExecutionUnits, [['pkg:cycle-a'], ['pkg:cycle-c']]);
	});

	test('keeps rewrite-heavy class and element-construction ports ready with an adaptation plan', () => {
		const target = licensedTarget('react-legacy-ui', '1.0.0');
		target.sourceAnalysis = {
			verdict: 'bridgeable-with-rewrites',
			filesScanned: 42,
			truncated: false,
			hazards: [],
			classComponents: true,
			apis: [
				{ name: 'Component', count: 3, status: 'rewrite', note: 'Rewrite as functions.' },
				{ name: 'createElement', count: 8, status: 'partial', note: 'Re-author in .tsrx.' },
				{ name: 'Children', count: 4, status: 'partial', note: 'Re-author traversal.' },
			],
			imports: ['react'],
			plan: [
				'Rewrite each class as a function component.',
				'Re-author nested createElement calls in .tsrx.',
			],
		};
		const graph = planPortGraph({ targets: [target], inventory: fixtureInventory() });
		const node = graph.nodes['pkg:react-legacy-ui'];

		assert.equal(node.state, 'ready');
		assert.equal(node.action, 'create-binding');
		assert.equal(node.feasibility.requiresAdaptation, true);
		assert.equal(node.feasibility.classComponents, true);
		assert.deepEqual(node.feasibility.plan, target.sourceAnalysis.plan);
		assert.deepEqual(graph.executionOrder, ['pkg:react-legacy-ui']);
	});

	test('blocks a public React API that has no Octane implementation or rewrite', () => {
		const target = licensedTarget('react-profiler-ui', '1.0.0');
		target.sourceAnalysis = {
			verdict: 'needs-rework',
			filesScanned: 2,
			truncated: false,
			hazards: [],
			apis: [{ name: 'Profiler', count: 1, status: 'unsupported', note: 'Not present.' }],
			plan: ['Profiler (1x): Not present.'],
		};
		const graph = planPortGraph({ targets: [target], inventory: fixtureInventory() });
		const node = graph.nodes['pkg:react-profiler-ui'];

		assert.equal(node.state, 'blocked');
		assert.equal(node.action, 'feasibility-blocker');
		assert.equal(node.feasibility.requiresAdaptation, false);
		assert.match(node.blockers.join('\n'), /unsupported React API.*Profiler/i);
	});

	test('turns concrete shipped React hazards into feasibility blockers', () => {
		const target = licensedTarget('custom-renderer', '1.0.0');
		target.sourceAnalysis = {
			verdict: 'needs-rework',
			truncated: false,
			hazards: ['Uses react-reconciler or a custom renderer boundary.'],
			apis: [],
		};
		const graph = planPortGraph({ targets: [target], inventory: fixtureInventory() });

		assert.equal(graph.nodes['pkg:custom-renderer'].state, 'blocked');
		assert.equal(graph.nodes['pkg:custom-renderer'].action, 'feasibility-blocker');
		assert.match(graph.nodes['pkg:custom-renderer'].blockers.join('\n'), /custom renderer/i);
	});

	test('blocks an incomplete shipped-source scan instead of guessing at feasibility', () => {
		const target = licensedTarget('large-react-library', '1.0.0');
		target.sourceAnalysis = {
			verdict: 'bridgeable-with-rewrites',
			truncated: true,
			hazards: [],
			apis: [{ name: 'createElement', count: 100, status: 'partial' }],
			plan: ['Re-author element construction in .tsrx.'],
		};
		const graph = planPortGraph({ targets: [target], inventory: fixtureInventory() });
		const node = graph.nodes['pkg:large-react-library'];

		assert.equal(node.state, 'blocked');
		assert.equal(node.action, 'feasibility-blocker');
		assert.match(node.blockers.join('\n'), /exceeded the bounded feasibility scan/i);
		assert.match(node.repair, /complete a bounded shipped-source scan/i);
	});
});
