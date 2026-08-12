/**
 * Differential divergence evidence: Octane ReactMarkView.destroy tears down the
 * portal (effect cleanup runs). Upstream @tiptap/react 3.28.0 leaves the React
 * mark-view tree mounted after ProseMirror detaches the host, so cleanup does
 * not run. Side binding uses fixture `paritySide`, rewritten to "react" by the
 * differential fixture compiler.
 */
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
	mountDifferential,
	preloadDifferentialFixture,
} from '../../../octane/tests/differential/_rig.js';
import { flushEffects } from '../_helpers';

const customViewsFixture = resolve(__dirname, '../_fixtures/custom-views-parity.tsrx');
const cache = resolve(__dirname, '.react-cache');

await Promise.all([preloadDifferentialFixture(customViewsFixture, cache)]);

describe('differential: @octanejs/tiptap vs @tiptap/react', function () {
	// @parity-case differential:tiptap-mark-view-portal-cleanup
	it('runs mark-view portal teardown on Octane while React retains the tree', async function () {
		const octaneLifecycle: string[] = [];
		const reactLifecycle: string[] = [];
		const differential = await mountDifferential(
			customViewsFixture,
			'CustomViewsParity',
			{
				onLifecycle: function onLifecycle() {},
				onMarkLifecycle: function onMarkLifecycle(side: string, phase: string) {
					if (side === 'octane') {
						octaneLifecycle.push(phase);
						return;
					}
					if (side === 'react') {
						reactLifecycle.push(phase);
					}
				},
			},
			cache,
		);

		await differential.observe('mount mark portals with lifecycle probes', function () {});
		flushEffects();
		expect(
			octaneLifecycle.filter(function isMount(phase) {
				return phase === 'mark:mount';
			}).length,
		).toBeGreaterThanOrEqual(1);
		expect(
			reactLifecycle.filter(function isMount(phase) {
				return phase === 'mark:mount';
			}).length,
		).toBeGreaterThanOrEqual(1);

		await differential.observe(
			'remove the mark and compare destroy-driven teardown',
			async function (octane, react) {
				await octane.click('[data-parity-mark-remove]');
				await react.click('[data-parity-mark-remove]');
			},
		);
		flushEffects();

		expect(
			octaneLifecycle.filter(function isCleanup(phase) {
				return phase === 'mark:cleanup';
			}),
		).toEqual(['mark:cleanup']);
		expect(
			reactLifecycle.filter(function isCleanup(phase) {
				return phase === 'mark:cleanup';
			}),
		).toEqual([]);
		expect(differential.octane.container.querySelector('[data-parity-mark-view]')).toBe(null);
		expect(differential.react.container.querySelector('[data-parity-mark-view]')).toBe(null);

		differential.unmount();
	});
});
