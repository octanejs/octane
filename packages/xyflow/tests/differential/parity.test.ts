/**
 * Differential parity for @octanejs/xyflow vs @xyflow/react.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';
import {
	mountDifferential,
	preloadDifferentialFixture,
} from '../../../octane/tests/differential/_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/xyflow-diff.tsrx');
const CACHE = resolve(__dirname, '.react-cache');

await Promise.all([preloadDifferentialFixture(FIXTURE, CACHE)]);

// @xyflow/react constructs ResizeObserver unguarded (jsdom has none).
beforeAll(function stubResizeObserver() {
	if (!('ResizeObserver' in globalThis)) {
		(globalThis as any).ResizeObserver = class {
			observe(): void {}
			unobserve(): void {}
			disconnect(): void {}
		};
		(globalThis as any).__xyflowStubbedRO = true;
	}
});

afterAll(function restoreResizeObserver() {
	if ((globalThis as any).__xyflowStubbedRO) {
		delete (globalThis as any).ResizeObserver;
		delete (globalThis as any).__xyflowStubbedRO;
	}
});

describe('differential: @octanejs/xyflow vs @xyflow/react', () => {
	// @parity-case differential:initial-mount
	it('matches initial flow mount markup', async () => {
		const differential = await mountDifferential(FIXTURE, 'XyflowDiff', { prefix: 'xy' }, CACHE);
		await differential.step('initial mount', function step() {});
		expect(differential.octane.find('.react-flow')).not.toBeNull();
		differential.unmount();
	});
});
