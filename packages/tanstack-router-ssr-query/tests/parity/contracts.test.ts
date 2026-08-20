import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../../..');
const manifest = JSON.parse(
	readFileSync(resolve(root, 'packages/tanstack-router-ssr-query/audit/react-parity.json'), 'utf8'),
);
const crosswalk = JSON.parse(
	readFileSync(
		resolve(root, 'packages/tanstack-router-ssr-query/audit/upstream-crosswalk.json'),
		'utf8',
	),
);

describe('@octanejs/tanstack-router-ssr-query parity audit contracts', () => {
	// @parity-case adapted:tanstack-router-ssr-query-upstream-ledger
	it('authenticates the complete adapter and absent runtime suite', () => {
		expect(manifest.provenance).toMatchObject({
			version: '1.167.1',
			commit: '8b3659143f634542c455a9d7915a8c7e8fabb65d',
			verification: 'recorded-unverified',
		});
		// The committed upstream tree verifies offline against
		// audit/upstream.lock.json (upstream git blob shas at the pinned commit).
		expect(function runLockCheck() {
			execFileSync(
				process.execPath,
				[
					'scripts/react-port/materialize.mjs',
					'run',
					'--check',
					'--package-dir',
					'packages/tanstack-router-ssr-query',
				],
				{ cwd: root, stdio: 'pipe' },
			);
		}).not.toThrow();
	});

	// @parity-case adapted:tanstack-router-ssr-query-core-version
	it('records the core version published by the pinned adapter', () => {
		expect(crosswalk.coreDependency).toEqual({
			package: '@tanstack/router-ssr-query-core',
			version: '1.169.1',
			disposition: 'published-adapter-version-reused',
		});
	});

	it('records export-by-export crosswalk rows and present type compile lanes', () => {
		const runtime = crosswalk.publicEntrypoints.find(function findRuntime(entry) {
			return entry.path === '.';
		});
		const metadata = crosswalk.publicEntrypoints.find(function findMetadata(entry) {
			return entry.path === './package.json';
		});
		expect(
			runtime?.exports?.map(function name(entry) {
				return entry.name;
			}),
		).toEqual(['Options', 'setupRouterSsrQueryIntegration']);
		expect(metadata).toMatchObject({
			disposition: 'intentionally-omitted',
		});
		expect(crosswalk.typeSuite).toMatchObject({
			disposition: 'present',
			pristineProject:
				'packages/tanstack-router-ssr-query/audit/type-probes/tsconfig.pristine.json',
			adaptedCompiler: 'tsrx-tsc',
		});
		expect(crosswalk.typeSuite.pristineCompilers).toEqual([
			'typescript55',
			'typescript56',
			'typescript57',
			'typescript58',
			'typescript59',
			'typescript60',
		]);
		expect(crosswalk.typeSuite.adaptedIncompatibleCompilers).toEqual([
			'typescript55',
			'typescript56',
			'typescript57',
			'typescript58',
			'typescript60',
		]);
		expect(manifest.upstreamSuites.types).toBe('present');
		const pristine = manifest.lanes.find(function findPristine(lane) {
			return lane.id === 'tanstack-router-ssr-query-pristine-types';
		});
		expect(pristine?.execution?.compilerBins).toHaveLength(6);
		expect(pristine?.execution?.project).toBe(
			'packages/tanstack-router-ssr-query/audit/type-probes/tsconfig.pristine.json',
		);
		expect(
			manifest.lanes.some(function hasPristine(lane) {
				return lane.id === 'tanstack-router-ssr-query-pristine-types';
			}),
		).toBe(true);
		expect(
			manifest.lanes.some(function hasAdapted(lane) {
				return lane.id === 'tanstack-router-ssr-query-adapted-types';
			}),
		).toBe(true);
		expect(
			manifest.lanes.some(function hasParityAudit(lane) {
				return lane.id === 'tanstack-router-ssr-query-parity-audit';
			}),
		).toBe(false);
	});
});
