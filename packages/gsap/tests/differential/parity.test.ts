/**
 * Differential parity: the same `.tsrx` fixture runs through @octanejs/gsap
 * (Octane) and the pinned @gsap/react 2.1.2 binding (React). After mount and
 * each dependency update the rendered DOM — including the effect/cleanup log
 * the fixture exposes — must be byte-identical. Deferred cleanup on unmount is
 * compared via a teardown-surviving side channel, because `DiffPair.unmount()`
 * removes both containers.
 */
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import {
	mountDifferential,
	preloadDifferentialFixture,
} from '../../../octane/tests/differential/_rig.js';
import {
	readGsapLifecycleLog,
	resetGsapLifecycleLog,
} from '../_fixtures/differential/lifecycle-diff.tsrx';

const FIXTURE = resolve(__dirname, '../_fixtures/differential/lifecycle-diff.tsrx');
const CACHE = resolve(__dirname, '.react-cache');

function assertCleanupParity(expected: string[]): void {
	const log = readGsapLifecycleLog();
	const octaneCleanup = log.octane.filter(function isCleanup(entry) {
		return entry.startsWith('cleanup:');
	});
	const reactCleanup = log.react.filter(function isCleanup(entry) {
		return entry.startsWith('cleanup:');
	});
	expect(octaneCleanup).toEqual(expected);
	expect(reactCleanup).toEqual(expected);
}

await Promise.all([preloadDifferentialFixture(FIXTURE, CACHE)]);

describe('differential: @octanejs/gsap vs @gsap/react 2.1.2', function differentialSuite() {
	// @parity-case differential:revert-on-update
	it('revertOnUpdate: effect, contextSafe, and cleanup stay byte-identical across updates', async function revertOnUpdateCase() {
		resetGsapLifecycleLog();
		const differential = await mountDifferential(
			FIXTURE,
			'GSAPLifecycleDiff',
			{ revertOnUpdate: true },
			CACHE,
		);
		await differential.step('mount', function mountStep() {});
		await differential.step('bump dependency', async function bumpStep(octane, react) {
			await octane.click('#bump');
			await react.click('#bump');
		});
		differential.unmount();
		assertCleanupParity(['cleanup:one', 'cleanup:two']);
	});

	// @parity-case differential:deferred-cleanup
	it('deferred cleanup: effects accumulate until unmount the same way as upstream', async function deferredCleanupCase() {
		resetGsapLifecycleLog();
		const differential = await mountDifferential(FIXTURE, 'GSAPLifecycleDiff', {}, CACHE);
		await differential.step('mount', function mountStep() {});
		await differential.step('bump dependency', async function bumpStep(octane, react) {
			await octane.click('#bump');
			await react.click('#bump');
		});
		differential.unmount();
		assertCleanupParity(['cleanup:one', 'cleanup:two']);
	});

	// @parity-case differential:static-contract
	it('static register/headless contract matches the published binding', async function staticContractCase() {
		const { useGSAP: octaneUseGSAP } = await import('@octanejs/gsap');
		const { useGSAP: reactUseGSAP } = await import('@gsap/react');
		if (octaneUseGSAP.headless !== true || reactUseGSAP.headless !== true) {
			throw new Error('useGSAP.headless must be true on both bindings');
		}
		if (
			typeof octaneUseGSAP.register !== 'function' ||
			typeof reactUseGSAP.register !== 'function'
		) {
			throw new Error('useGSAP.register must be a function on both bindings');
		}
	});
});
