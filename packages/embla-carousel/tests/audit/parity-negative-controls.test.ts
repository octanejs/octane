import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	summarizeRuntimeInventories,
	verifyManifestFiles,
} from '../../../../scripts/react-parity/harness-lib.mjs';
import { verifyEmblaCarouselTestClassifications } from '../../../../scripts/react-parity/embla-carousel-classifications-lib.mjs';
import manifest from '../../audit/react-parity.json';
import pristineInventory from '../../audit/pristine-utils-runtime.json';
import ledger from '../../audit/type-parity.json';
import {
	verifyCommittedTypeParity,
	verifyTypeParity,
	verifyTypeProjectMembership,
} from '../../audit/type-parity.mjs';

const root = resolve(import.meta.dirname, '../../../..');

describe('@octanejs/embla-carousel parity negative controls', function emblaParityNegativeControls() {
	it('accepts the committed pristine/adapted type suite', async function acceptsCommittedTypeParity() {
		const summary = await verifyCommittedTypeParity();
		expect(summary.assertions).toBeGreaterThan(0);
		expect(summary.assertionGroups).toBe(summary.assertions);
	});

	// @parity-case embla:audit:stale-hash
	it('rejects a stale evidence hash', async function rejectsStaleHash() {
		const changed = structuredClone(manifest);
		changed.lanes[0].files[0].sha256 = '0'.repeat(64);
		await expect(verifyManifestFiles(changed, root)).rejects.toThrow('integrity mismatch');
	});

	// @parity-case embla:audit:differential-fixture-drift
	it('rejects differential Octane fixture support drift', async function rejectsDifferentialFixtureDrift() {
		const changed = structuredClone(manifest);
		const differential = changed.lanes.find(function findDifferential(lane) {
			return lane.id === 'embla-react-differential';
		});
		const fixture = differential.files.find(function findFixture(file) {
			return file.path === 'packages/embla-carousel/tests/_fixtures/carousel.tsrx';
		});
		expect(fixture).toBeDefined();
		fixture.sha256 = '0'.repeat(64);
		await expect(verifyManifestFiles(changed, root)).rejects.toThrow('integrity mismatch');
	});

	// @parity-case embla:audit:removed-runtime-case
	it('rejects a removed runtime inventory case', function rejectsRemovedRuntimeCase() {
		const baseline = summarizeRuntimeInventories([pristineInventory]);
		expect(baseline).toEqual({
			inventoryEntries: pristineInventory.tests.length,
			uniqueIdentities: pristineInventory.tests.length,
			duplicateEntriesWithinLanes: 0,
			identitiesSharedAcrossLanes: 0,
		});
		expect(baseline.inventoryEntries).toBeGreaterThan(0);

		const changed = structuredClone(pristineInventory);
		changed.tests.pop();
		expect(function assertDrift() {
			const summary = summarizeRuntimeInventories([changed]);
			if (JSON.stringify(summary) !== JSON.stringify(baseline)) {
				throw new Error('runtime inventory summary drifted');
			}
		}).toThrow('runtime inventory summary drifted');
	});

	// @parity-case embla:audit:skipped-type-file
	it('rejects a type-test file excluded from its compiler project', async function rejectsSkippedTypeFile() {
		const tempRoot = await mkdtemp(join(tmpdir(), 'embla-type-skip-'));
		try {
			const projectPath = join(tempRoot, 'tsconfig.json');
			await writeFile(
				projectPath,
				`${JSON.stringify(
					{
						compilerOptions: { strict: true, noEmit: true },
						include: [],
					},
					null,
					2,
				)}\n`,
			);
			const mutated = structuredClone(ledger);
			mutated.projects.adapted = projectPath;
			expect(function excludedFromProject() {
				verifyTypeProjectMembership(root, mutated);
			}).toThrow(/not included by compiler project/);
		} finally {
			await rm(tempRoot, { recursive: true, force: true });
		}
	});

	// @parity-case embla:audit:deleted-type-assertion
	it('rejects a deleted type assertion and removed expect-error directive', async function rejectsDeletedTypeAssertion() {
		const pristine = await readFile(resolve(root, ledger.pristine), 'utf8');
		const adapted = await readFile(resolve(root, ledger.adapted), 'utf8');
		expect(function deletedAssertion() {
			verifyTypeParity(ledger, pristine, adapted.replace('// @type-parity positive:tuple', ''));
		}).toThrow(/differs from pristine|assertion group/);
		expect(function deletedExpectError() {
			verifyTypeParity(ledger, pristine, adapted.replace(/^\/\/ @ts-expect-error .*$/m, ''));
		}).toThrow(/differs from pristine|lost an @ts-expect-error/);
	});

	// @parity-case embla:audit:mutated-assertion-body
	it('rejects a mutated assertion body that keeps the marker', async function rejectsMutatedAssertionBody() {
		const pristine = await readFile(resolve(root, ledger.pristine), 'utf8');
		const adapted = await readFile(resolve(root, ledger.adapted), 'utf8');
		expect(function mutatedBody() {
			verifyTypeParity(ledger, pristine, adapted.replace('{ loop: true }', '{ loop: false }'));
		}).toThrow(/differs from pristine|hashes differ|assertion group hashes drifted/);
	});

	it('keeps every port-authored test classified', function keepsTestsClassified() {
		expect(verifyEmblaCarouselTestClassifications(root).tests).toBeGreaterThan(0);
	});
});
